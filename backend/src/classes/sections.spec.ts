import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { UsersModule } from '../users/users.module.js';
import { ClassesModule } from './classes.module.js';

// Real Postgres (DATABASE_URL from backend/.env), real signed JWTs, real guards.
// Everything created here carries a unique per-run prefix so cleanup never touches other data.
const PREFIX = `t015-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;
const EMPTY = 'Please enter a section name.';
const DUPLICATE = 'This section already exists.';

function messageOf(body: { message?: string | string[] }): string {
  return Array.isArray(body.message) ? body.message.join(' | ') : String(body.message);
}

describe('Sections API (T-015)', () => {
  let ctx: DbTestApp;
  let http: DbTestApp['http'];
  let tokenFor: DbTestApp['tokenFor'];
  let adminAuth: DbTestApp['adminAuth'];
  let jwt: DbTestApp['jwt'];
  let prisma: DbTestApp['prisma'];
  let seq = 0;

  const label = (l = 'x') => `${l}-${++seq}`;

  const makeClass = async (l = 'c') => {
    const res = await http()
      .post('/api/classes')
      .set('Authorization', adminAuth())
      .send({ name: `${PREFIX}${label(l)}` })
      .expect(201);
    return res.body as { id: string; name: string };
  };
  const createSection = (classId: string, n: string, auth = adminAuth()) =>
    http().post(`/api/classes/${classId}/sections`).set('Authorization', auth).send({ name: n });
  const makeSection = async (classId: string, n = label('S')) => {
    const res = await createSection(classId, n).expect(201);
    return res.body as { id: string; name: string };
  };
  const makeUser = async (role: 'teacher' | 'student' | 'admin') =>
    prisma.user.create({
      data: {
        name: `${PREFIX}${role}`,
        email: `${role}-${++seq}${EMAIL_SUFFIX}`,
        passwordHash: 'not-a-real-hash',
        role,
      },
    });
  const setTeacher = (classId: string, sectionId: string, teacherId: string | null) =>
    http()
      .patch(`/api/classes/${classId}/sections/${sectionId}/class-teacher`)
      .set('Authorization', adminAuth())
      .send({ teacherId });
  const dbSections = (classId: string) => prisma.section.findMany({ where: { classId } });

  beforeAll(async () => {
    ctx = await createTestApp({ imports: [UsersModule, ClassesModule] });
    ({ http, tokenFor, adminAuth, jwt, prisma } = ctx);
  });

  afterEach(async () => {
    // Deleting classes cascades to their sections; then remove the test users.
    await prisma.class.deleteMany({
      where: { name: { startsWith: PREFIX, mode: 'insensitive' } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('UC-06 create section', () => {
    it('AC-06.2 a created section responds 201 with id and name and persists when fetched again', async () => {
      const c = await makeClass();
      const res = await createSection(c.id, 'A').expect(201);
      expect(res.body).toMatchObject({ name: 'A' });
      expect(typeof res.body.id).toBe('string');
      const rows = await dbSections(c.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: res.body.id, name: 'A', classId: c.id });
    });

    it('AC-06.3 empty name responds 400 "Please enter a section name." and creates nothing', async () => {
      const c = await makeClass();
      const res = await createSection(c.id, '').expect(400);
      expect(messageOf(res.body)).toContain(EMPTY);
      expect(await dbSections(c.id)).toHaveLength(0);
    });

    it('AC-06.3 a missing name field is also rejected with 400 and the same message', async () => {
      const c = await makeClass();
      const res = await http()
        .post(`/api/classes/${c.id}/sections`)
        .set('Authorization', adminAuth())
        .send({})
        .expect(400);
      expect(messageOf(res.body)).toContain(EMPTY);
      expect(await dbSections(c.id)).toHaveLength(0);
    });

    it('AC-06.4 duplicate name in the same class (case-insensitive) responds 400 "This section already exists." and creates nothing', async () => {
      const c = await makeClass();
      await makeSection(c.id, 'Alpha');
      for (const dup of ['Alpha', 'ALPHA', 'alpha']) {
        const res = await createSection(c.id, dup).expect(400);
        expect(messageOf(res.body)).toContain(DUPLICATE);
      }
      expect(await dbSections(c.id)).toHaveLength(1);
    });

    it('UC-06-E1 the same section name in a different class is allowed', async () => {
      const c1 = await makeClass('one');
      const c2 = await makeClass('two');
      await makeSection(c1.id, 'A');
      await createSection(c2.id, 'A').expect(201);
      expect(await dbSections(c1.id)).toHaveLength(1);
      expect(await dbSections(c2.id)).toHaveLength(1);
    });

    it('UC-06-E2 whitespace-only name is rejected like an empty name', async () => {
      const c = await makeClass();
      const res = await createSection(c.id, '     ').expect(400);
      expect(messageOf(res.body)).toContain(EMPTY);
      expect(await dbSections(c.id)).toHaveLength(0);
    });

    it('UC-06-E3 two concurrent creates with the same name create exactly one section; the other gets the duplicate error', async () => {
      const c = await makeClass();
      const results = await Promise.all([createSection(c.id, 'Race'), createSection(c.id, 'Race')]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
      const loser = results.find((r) => r.status === 400)!;
      expect(messageOf(loser.body)).toContain(DUPLICATE);
      expect(await dbSections(c.id)).toHaveLength(1);
    });

    it('UC-06-E3 two concurrent creates with names differing only by case create exactly one section', async () => {
      const c = await makeClass();
      const results = await Promise.all([createSection(c.id, 'Race'), createSection(c.id, 'race')]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
      const loser = results.find((r) => r.status === 400)!;
      expect(messageOf(loser.body)).toContain(DUPLICATE);
      expect(await dbSections(c.id)).toHaveLength(1);
    });

    it('UC-06-E3 the database itself enforces uniqueness on [classId, name]', async () => {
      const c = await makeClass();
      await prisma.section.create({ data: { classId: c.id, name: 'Z' } });
      await expect(prisma.section.create({ data: { classId: c.id, name: 'Z' } })).rejects.toMatchObject({
        code: 'P2002',
      });
    });

    it('UC-06 creating a section under an unknown class responds 404 and creates nothing', async () => {
      await createSection('no-such-class-id', 'A').expect(404);
      expect(await prisma.section.count({ where: { classId: 'no-such-class-id' } })).toBe(0);
    });
  });

  describe('UC-06/UC-02 rename section', () => {
    it('a renamed section has the new name when fetched again', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id, 'Old');
      await http()
        .patch(`/api/classes/${c.id}/sections/${s.id}`)
        .set('Authorization', adminAuth())
        .send({ name: 'New' })
        .expect(200);
      expect((await prisma.section.findUnique({ where: { id: s.id } }))?.name).toBe('New');
    });

    it('rename to empty or whitespace responds 400 with the empty message and keeps the name', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id, 'Keep');
      for (const bad of ['', '   ']) {
        const res = await http()
          .patch(`/api/classes/${c.id}/sections/${s.id}`)
          .set('Authorization', adminAuth())
          .send({ name: bad })
          .expect(400);
        expect(messageOf(res.body)).toContain(EMPTY);
      }
      expect((await prisma.section.findUnique({ where: { id: s.id } }))?.name).toBe('Keep');
    });

    it('rename to a sibling section name (case-insensitive) responds 400 with the duplicate message', async () => {
      const c = await makeClass();
      await makeSection(c.id, 'A');
      const b = await makeSection(c.id, 'B');
      const res = await http()
        .patch(`/api/classes/${c.id}/sections/${b.id}`)
        .set('Authorization', adminAuth())
        .send({ name: 'a' })
        .expect(400);
      expect(messageOf(res.body)).toContain(DUPLICATE);
      expect((await prisma.section.findUnique({ where: { id: b.id } }))?.name).toBe('B');
    });

    it('renaming to its own current name succeeds', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id, 'Same');
      await http()
        .patch(`/api/classes/${c.id}/sections/${s.id}`)
        .set('Authorization', adminAuth())
        .send({ name: 'Same' })
        .expect(200);
    });

    it('unknown section id responds 404', async () => {
      const c = await makeClass();
      await http()
        .patch(`/api/classes/${c.id}/sections/no-such-section`)
        .set('Authorization', adminAuth())
        .send({ name: 'X' })
        .expect(404);
    });

    it('a section addressed through the wrong class responds 404 and is unchanged', async () => {
      const c1 = await makeClass('one');
      const c2 = await makeClass('two');
      const s = await makeSection(c1.id, 'Mine');
      await http()
        .patch(`/api/classes/${c2.id}/sections/${s.id}`)
        .set('Authorization', adminAuth())
        .send({ name: 'Hijack' })
        .expect(404);
      expect((await prisma.section.findUnique({ where: { id: s.id } }))?.name).toBe('Mine');
    });
  });

  describe('UC-07 delete section', () => {
    it('AC-07.1 a deleted section is gone when fetched again and other sections remain', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id, 'Del');
      const keep = await makeSection(c.id, 'Keep');
      await http()
        .delete(`/api/classes/${c.id}/sections/${s.id}`)
        .set('Authorization', adminAuth())
        .expect((r) => expect([200, 204]).toContain(r.status));
      const rows = await dbSections(c.id);
      expect(rows.map((r) => r.id)).toEqual([keep.id]);
      expect(await prisma.section.findUnique({ where: { id: s.id } })).toBeNull();
    });

    it('AC-07.1 deleting an unknown section responds 404', async () => {
      const c = await makeClass();
      await http()
        .delete(`/api/classes/${c.id}/sections/no-such-section`)
        .set('Authorization', adminAuth())
        .expect(404);
    });

    it('AC-07.1 deleting a section through the wrong class responds 404 and the section remains', async () => {
      const c1 = await makeClass('one');
      const c2 = await makeClass('two');
      const s = await makeSection(c1.id, 'Stay');
      await http()
        .delete(`/api/classes/${c2.id}/sections/${s.id}`)
        .set('Authorization', adminAuth())
        .expect(404);
      expect(await prisma.section.findUnique({ where: { id: s.id } })).not.toBeNull();
    });
  });

  describe('UC-08 class teacher', () => {
    it('AC-08.1 an assigned class teacher persists when fetched again', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id);
      const t = await makeUser('teacher');
      await setTeacher(c.id, s.id, t.id).expect(200);
      expect((await prisma.section.findUnique({ where: { id: s.id } }))?.classTeacherId).toBe(t.id);
    });

    it('AC-08.3 clearing the class teacher (null) removes the assignment', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id);
      const t = await makeUser('teacher');
      await setTeacher(c.id, s.id, t.id).expect(200);
      await setTeacher(c.id, s.id, null).expect(200);
      expect((await prisma.section.findUnique({ where: { id: s.id } }))?.classTeacherId).toBeNull();
      // The teacher user itself is untouched.
      expect(await prisma.user.findUnique({ where: { id: t.id } })).not.toBeNull();
    });

    it('UC-08-E2 the same teacher can be class teacher of two different sections', async () => {
      const c = await makeClass();
      const s1 = await makeSection(c.id, 'A');
      const s2 = await makeSection(c.id, 'B');
      const t = await makeUser('teacher');
      await setTeacher(c.id, s1.id, t.id).expect(200);
      await setTeacher(c.id, s2.id, t.id).expect(200);
      const rows = await prisma.section.findMany({ where: { id: { in: [s1.id, s2.id] } } });
      expect(rows.map((r) => r.classTeacherId)).toEqual([t.id, t.id]);
    });

    it('AC-08 assigning a student as class teacher is rejected with 400 and nothing changes', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id);
      const u = await makeUser('student');
      await setTeacher(c.id, s.id, u.id).expect(400);
      expect((await prisma.section.findUnique({ where: { id: s.id } }))?.classTeacherId).toBeNull();
    });

    it('AC-08 assigning an admin as class teacher is rejected with 400 and nothing changes', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id);
      const u = await makeUser('admin');
      await setTeacher(c.id, s.id, u.id).expect(400);
      expect((await prisma.section.findUnique({ where: { id: s.id } }))?.classTeacherId).toBeNull();
    });

    it('AC-08 unknown section id responds 404 on class-teacher assignment', async () => {
      const c = await makeClass();
      const t = await makeUser('teacher');
      await setTeacher(c.id, 'no-such-section', t.id).expect(404);
    });

    it('AC-08 unknown class id responds 404 on class-teacher assignment', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id);
      const t = await makeUser('teacher');
      await setTeacher('no-such-class', s.id, t.id).expect(404);
      expect((await prisma.section.findUnique({ where: { id: s.id } }))?.classTeacherId).toBeNull();
    });
  });

  describe('AC-12.1 role enforcement', () => {
    for (const role of ['teacher', 'student'] as const) {
      it(`AC-12.1 ${role} gets 403 on every section write endpoint and no data changes`, async () => {
        const c = await makeClass();
        const s = await makeSection(c.id, 'Orig');
        const t = await makeUser('teacher');
        const auth = `Bearer ${tokenFor(role)}`;

        await createSection(c.id, 'Sneaky', auth).expect(403);
        await http()
          .patch(`/api/classes/${c.id}/sections/${s.id}`)
          .set('Authorization', auth)
          .send({ name: 'Renamed' })
          .expect(403);
        await http()
          .patch(`/api/classes/${c.id}/sections/${s.id}/class-teacher`)
          .set('Authorization', auth)
          .send({ teacherId: t.id })
          .expect(403);
        await http()
          .delete(`/api/classes/${c.id}/sections/${s.id}`)
          .set('Authorization', auth)
          .expect(403);

        const rows = await dbSections(c.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: s.id, name: 'Orig', classTeacherId: null });
      });
    }
  });

  describe('T-018 list sections (GET /classes/:classId/sections)', () => {
    const listSections = (classId: string, auth?: string) => {
      const req = http().get(`/api/classes/${classId}/sections`);
      return auth ? req.set('Authorization', auth) : req;
    };

    it('AC-06.1 returns [{id, name, classTeacher}] ordered by name, with null when unassigned', async () => {
      const c = await makeClass();
      const b = await makeSection(c.id, 'B');
      const a = await makeSection(c.id, 'A');
      const cc = await makeSection(c.id, 'C');
      const res = await listSections(c.id, adminAuth()).expect(200);
      expect(res.body).toEqual([
        { id: a.id, name: 'A', classTeacher: null },
        { id: b.id, name: 'B', classTeacher: null },
        { id: cc.id, name: 'C', classTeacher: null },
      ]);
    });

    it('AC-08.1 includes the class teacher as {id, name} once assigned', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id, 'A');
      const t = await makeUser('teacher');
      await setTeacher(c.id, s.id, t.id).expect(200);
      const res = await listSections(c.id, adminAuth()).expect(200);
      expect(res.body).toEqual([{ id: s.id, name: 'A', classTeacher: { id: t.id, name: t.name } }]);
    });

    it('AC-06.1 returns only the sections of the requested class', async () => {
      const c1 = await makeClass('one');
      const c2 = await makeClass('two');
      const mine = await makeSection(c1.id, 'Mine');
      await makeSection(c2.id, 'Other');
      const res = await listSections(c1.id, adminAuth()).expect(200);
      expect(res.body.map((s: { id: string }) => s.id)).toEqual([mine.id]);
    });

    it('UC-07-E2 a class with no sections returns an empty array', async () => {
      const c = await makeClass();
      const res = await listSections(c.id, adminAuth()).expect(200);
      expect(res.body).toEqual([]);
    });

    for (const role of ['admin', 'teacher', 'student'] as const) {
      it(`AC-12.2 ${role} can read the section list`, async () => {
        const c = await makeClass();
        const s = await makeSection(c.id, 'A');
        const res = await listSections(c.id, `Bearer ${tokenFor(role)}`).expect(200);
        expect(res.body.map((x: { id: string }) => x.id)).toEqual([s.id]);
      });
    }

    it('never exposes passwordHash or other user fields on the class teacher', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id, 'A');
      const t = await makeUser('teacher');
      await setTeacher(c.id, s.id, t.id).expect(200);
      const res = await listSections(c.id, adminAuth()).expect(200);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('passwordHash');
      expect(raw).not.toContain('not-a-real-hash');
      expect(Object.keys(res.body[0].classTeacher).sort()).toEqual(['id', 'name']);
      expect(Object.keys(res.body[0]).sort()).toEqual(['classTeacher', 'id', 'name']);
    });

    it('an unknown class responds 404 "This class no longer exists."', async () => {
      const res = await listSections('no-such-class-id', adminAuth()).expect(404);
      expect(messageOf(res.body)).toContain('This class no longer exists.');
    });

    it('no token gives 401', async () => {
      const c = await makeClass();
      await listSections(c.id).expect(401);
    });
  });

  describe('UC-12-E1 authentication', () => {
    it('no token gives 401 on every section endpoint and no data changes', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id, 'Orig');
      const base = `/api/classes/${c.id}/sections`;
      await http().post(base).send({ name: 'Anon' }).expect(401);
      await http().patch(`${base}/${s.id}`).send({ name: 'Anon' }).expect(401);
      await http().patch(`${base}/${s.id}/class-teacher`).send({ teacherId: null }).expect(401);
      await http().delete(`${base}/${s.id}`).expect(401);
      const rows = await dbSections(c.id);
      expect(rows.map((r) => r.name)).toEqual(['Orig']);
    });

    it('an expired token gives 401 on every section endpoint and no data changes', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id, 'Orig');
      const expired = `Bearer ${jwt.sign(
        { sub: 'u', email: 'u@example.com', role: 'admin' },
        { expiresIn: '-1h' },
      )}`;
      const base = `/api/classes/${c.id}/sections`;
      await createSection(c.id, 'Late', expired).expect(401);
      await http().patch(`${base}/${s.id}`).set('Authorization', expired).send({ name: 'Late' }).expect(401);
      await http()
        .patch(`${base}/${s.id}/class-teacher`)
        .set('Authorization', expired)
        .send({ teacherId: null })
        .expect(401);
      await http().delete(`${base}/${s.id}`).set('Authorization', expired).expect(401);
      const rows = await dbSections(c.id);
      expect(rows.map((r) => r.name)).toEqual(['Orig']);
    });
  });

  it('GET /api/sections lists every section with its class name, admin only', async () => {
    const cls = await makeClass('all');
    const sec = await makeSection(cls.id, 'Z');
    const res = await http().get('/api/sections').set('Authorization', adminAuth()).expect(200);
    expect(res.body).toContainEqual({ id: sec.id, name: 'Z', classId: cls.id, className: cls.name });
    await http().get('/api/sections').set('Authorization', `Bearer ${tokenFor('teacher')}`).expect(403);
    await http().get('/api/sections').expect(401);
  });
});

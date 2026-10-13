import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { ClassesModule } from '../classes/classes.module.js';
import { UsersModule } from '../users/users.module.js';
import { SubjectsModule } from './subjects.module.js';

// Real Postgres, real signed JWTs, real guards. Everything carries a per-run prefix.
const PREFIX = `t016s-${Date.now().toString(36)}-`;
const EMPTY = 'Please enter a subject name.';
const DUPLICATE = 'This subject already exists.';
const IN_USE = "This subject is in use and can't be deleted.";

function messageOf(body: { message?: string | string[] }): string {
  return Array.isArray(body.message) ? body.message.join(' | ') : String(body.message);
}

describe('Subjects catalog API (T-016)', () => {
  let ctx: DbTestApp;
  let http: DbTestApp['http'];
  let tokenFor: DbTestApp['tokenFor'];
  let adminAuth: DbTestApp['adminAuth'];
  let jwt: DbTestApp['jwt'];
  let prisma: DbTestApp['prisma'];
  let seq = 0;

  const label = (l = 's') => `${PREFIX}${l}-${++seq}`;

  const createSubject = (name: string, auth = adminAuth()) =>
    http().post('/api/subjects').set('Authorization', auth).send({ name });
  const makeSubject = async (name = label()) => {
    const res = await createSubject(name).expect(201);
    return res.body as { id: string; name: string };
  };
  const dbSubjects = () =>
    prisma.subject.findMany({
      where: { name: { startsWith: PREFIX, mode: 'insensitive' } },
    });

  beforeAll(async () => {
    ctx = await createTestApp({ imports: [UsersModule, ClassesModule, SubjectsModule] });
    ({ http, tokenFor, adminAuth, jwt, prisma } = ctx);
  });

  afterEach(async () => {
    // ClassSubject rows (Restrict on subject) must go first; classes cascade to them.
    await prisma.class.deleteMany({
      where: { name: { startsWith: PREFIX, mode: 'insensitive' } },
    });
    await prisma.subject.deleteMany({
      where: { name: { startsWith: PREFIX, mode: 'insensitive' } },
    });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('UC-09 create subject', () => {
    it('AC-09.1 a created subject responds 201 with id and name and appears in the catalog list', async () => {
      const name = label('Math');
      const res = await createSubject(name).expect(201);
      expect(res.body).toMatchObject({ name });
      expect(typeof res.body.id).toBe('string');
      const list = await http().get('/api/subjects').set('Authorization', adminAuth()).expect(200);
      expect(list.body).toContainEqual({ id: res.body.id, name });
      expect(await dbSubjects()).toHaveLength(1);
    });

    it('AC-09.1 a created subject can subsequently be assigned to any class', async () => {
      const s = await makeSubject();
      const c = await http()
        .post('/api/classes')
        .set('Authorization', adminAuth())
        .send({ name: label('c') })
        .expect(201);
      await http()
        .post(`/api/classes/${c.body.id}/subjects`)
        .set('Authorization', adminAuth())
        .send({ subjectId: s.id })
        .expect(201);
    });

    it('AC-09.1 GET /subjects is readable by teacher and student roles too', async () => {
      const s = await makeSubject();
      for (const role of ['teacher', 'student']) {
        const res = await http()
          .get('/api/subjects')
          .set('Authorization', `Bearer ${tokenFor(role)}`)
          .expect(200);
        expect(res.body).toContainEqual({ id: s.id, name: s.name });
      }
    });

    it('AC-09.2 empty name responds 400 "Please enter a subject name." and creates nothing', async () => {
      const res = await createSubject('').expect(400);
      expect(messageOf(res.body)).toContain(EMPTY);
      expect(await dbSubjects()).toHaveLength(0);
    });

    it('AC-09.2 a missing name field is rejected with 400 and the same message', async () => {
      const res = await http()
        .post('/api/subjects')
        .set('Authorization', adminAuth())
        .send({})
        .expect(400);
      expect(messageOf(res.body)).toContain(EMPTY);
    });

    it('AC-09.2 a whitespace-only name is rejected like an empty name', async () => {
      const res = await createSubject('     ').expect(400);
      expect(messageOf(res.body)).toContain(EMPTY);
    });

    it('AC-09.2 a name longer than 100 characters is rejected with 400 and creates nothing', async () => {
      const long = PREFIX + 'x'.repeat(101);
      await createSubject(long).expect(400);
      expect(await dbSubjects()).toHaveLength(0);
    });

    it('AC-09.3 duplicate name (case-insensitive) responds 400 "This subject already exists." and creates nothing', async () => {
      const base = label('Physics');
      await makeSubject(base);
      for (const dup of [base, base.toUpperCase(), base.toLowerCase()]) {
        const res = await createSubject(dup).expect(400);
        expect(messageOf(res.body)).toContain(DUPLICATE);
      }
      expect(await dbSubjects()).toHaveLength(1);
    });

    it('AC-09.3 two concurrent creates with the same name create exactly one subject', async () => {
      const name = label('Race');
      const results = await Promise.all([createSubject(name), createSubject(name)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
      const loser = results.find((r) => r.status === 400)!;
      expect(messageOf(loser.body)).toContain(DUPLICATE);
      expect(await dbSubjects()).toHaveLength(1);
    });

    it('AC-09.3 two concurrent creates differing only by case create exactly one subject', async () => {
      const name = label('Race');
      const results = await Promise.all([createSubject(name), createSubject(name.toUpperCase())]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
      const loser = results.find((r) => r.status === 400)!;
      expect(messageOf(loser.body)).toContain(DUPLICATE);
      expect(await dbSubjects()).toHaveLength(1);
    });
  });

  describe('delete subject', () => {
    it('an unused subject is deleted (204) and is gone from the catalog', async () => {
      const s = await makeSubject();
      await http().delete(`/api/subjects/${s.id}`).set('Authorization', adminAuth()).expect(204);
      expect(await prisma.subject.findUnique({ where: { id: s.id } })).toBeNull();
    });

    it('deleting an unknown subject responds 404', async () => {
      await http()
        .delete('/api/subjects/no-such-subject')
        .set('Authorization', adminAuth())
        .expect(404);
    });

    it('UC-09-E1 a subject assigned to a class responds 400 "This subject is in use and can\'t be deleted." and nothing is deleted', async () => {
      const s = await makeSubject();
      const c = await prisma.class.create({ data: { name: label('c') } });
      await prisma.classSubject.create({
        data: { classId: c.id, subjectId: s.id },
      });
      const res = await http()
        .delete(`/api/subjects/${s.id}`)
        .set('Authorization', adminAuth())
        .expect(400);
      expect(messageOf(res.body)).toContain(IN_USE);
      expect(await prisma.subject.findUnique({ where: { id: s.id } })).not.toBeNull();
      expect(await prisma.classSubject.count({ where: { subjectId: s.id } })).toBe(1);
    });

    it('UC-09-E1 once the subject is removed from every class it can be deleted', async () => {
      const s = await makeSubject();
      const c = await prisma.class.create({ data: { name: label('c') } });
      const cs = await prisma.classSubject.create({
        data: { classId: c.id, subjectId: s.id },
      });
      await http()
        .delete(`/api/classes/${c.id}/subjects/${cs.id}`)
        .set('Authorization', adminAuth())
        .expect(204);
      await http().delete(`/api/subjects/${s.id}`).set('Authorization', adminAuth()).expect(204);
    });
  });

  describe('AC-12.1 role enforcement', () => {
    for (const role of ['teacher', 'student'] as const) {
      it(`AC-12.1 ${role} gets 403 on every subject write endpoint and no data changes`, async () => {
        const s = await makeSubject();
        const auth = `Bearer ${tokenFor(role)}`;
        await createSubject(label('Sneaky'), auth).expect(403);
        await http().delete(`/api/subjects/${s.id}`).set('Authorization', auth).expect(403);
        const rows = await dbSubjects();
        expect(rows.map((r) => r.id)).toEqual([s.id]);
      });
    }
  });

  describe('UC-12-E1 authentication', () => {
    it('no token gives 401 on every subject endpoint and no data changes', async () => {
      const s = await makeSubject();
      await http().get('/api/subjects').expect(401);
      await http()
        .post('/api/subjects')
        .send({ name: label('Anon') })
        .expect(401);
      await http().delete(`/api/subjects/${s.id}`).expect(401);
      expect(await dbSubjects()).toHaveLength(1);
    });

    it('an expired token gives 401 on every subject endpoint and no data changes', async () => {
      const s = await makeSubject();
      const expired = `Bearer ${jwt.sign(
        { sub: 'u', email: 'u@example.com', role: 'admin' },
        { expiresIn: '-1h' },
      )}`;
      await http().get('/api/subjects').set('Authorization', expired).expect(401);
      await createSubject(label('Late'), expired).expect(401);
      await http().delete(`/api/subjects/${s.id}`).set('Authorization', expired).expect(401);
      expect(await dbSubjects()).toHaveLength(1);
    });
  });
});

describe('T-026 subject rename + delete', () => {
  const PREFIX26 = `t026s-${Date.now().toString(36)}-`;
  const GONE = 'This subject no longer exists.';
  let ctx: DbTestApp;
  let http: DbTestApp['http'];
  let tokenFor: DbTestApp['tokenFor'];
  let adminAuth: DbTestApp['adminAuth'];
  let prisma: DbTestApp['prisma'];
  let seq = 0;

  const label = (l = 's') => `${PREFIX26}${l}-${++seq}`;

  const makeSubject = async (name = label()) => {
    const res = await http()
      .post('/api/subjects')
      .set('Authorization', adminAuth())
      .send({ name })
      .expect(201);
    return res.body as { id: string; name: string };
  };
  const rename = (id: string, name: unknown, auth = adminAuth()) =>
    http().patch(`/api/subjects/${id}`).set('Authorization', auth).send({ name });
  const del = (id: string) =>
    http().delete(`/api/subjects/${id}`).set('Authorization', adminAuth());
  const addToClass = (classId: string, subjectId: string) =>
    http()
      .post(`/api/classes/${classId}/subjects`)
      .set('Authorization', adminAuth())
      .send({ subjectId });
  const makeClass = () => prisma.class.create({ data: { name: label('c') } });
  const nameInDb = async (id: string) =>
    (await prisma.subject.findUnique({ where: { id } }))?.name;

  beforeAll(async () => {
    ctx = await createTestApp({ imports: [UsersModule, ClassesModule, SubjectsModule] });
    ({ http, tokenFor, adminAuth, prisma } = ctx);
  });

  afterEach(async () => {
    await prisma.class.deleteMany({
      where: { name: { startsWith: PREFIX26, mode: 'insensitive' } },
    });
    await prisma.subject.deleteMany({
      where: { name: { startsWith: PREFIX26, mode: 'insensitive' } },
    });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('AC-22.1 rename', () => {
    it('AC-22.1 PATCH responds 200 {id,name} and GET /subjects returns the new name', async () => {
      const s = await makeSubject();
      const newName = label('Renamed');
      const res = await rename(s.id, newName).expect(200);
      expect(res.body).toEqual({ id: s.id, name: newName });
      const list = await http().get('/api/subjects').set('Authorization', adminAuth()).expect(200);
      expect(list.body).toContainEqual({ id: s.id, name: newName });
      expect(list.body).not.toContainEqual({ id: s.id, name: s.name });
    });

    it('AC-22.1 GET /classes/:classId/subjects shows the new name for every class that has the subject', async () => {
      const s = await makeSubject();
      const classes = [await makeClass(), await makeClass()];
      for (const c of classes) await addToClass(c.id, s.id).expect(201);
      const newName = label('Renamed');
      await rename(s.id, newName).expect(200);
      for (const c of classes) {
        const res = await http()
          .get(`/api/classes/${c.id}/subjects`)
          .set('Authorization', adminAuth())
          .expect(200);
        const text = JSON.stringify(res.body);
        expect(text).toContain(newName);
        expect(text).not.toContain(s.name);
      }
    });

    it('AC-22.1 the new name is persisted', async () => {
      const s = await makeSubject();
      const newName = label('Persisted');
      await rename(s.id, newName).expect(200);
      expect(await nameInDb(s.id)).toBe(newName);
    });

    it('AC-22.1 the name is trimmed when renaming', async () => {
      const s = await makeSubject();
      const newName = label('Trim');
      const res = await rename(s.id, `  ${newName}  `).expect(200);
      expect(res.body.name).toBe(newName);
    });
  });

  describe('AC-22.2 empty name', () => {
    for (const [desc, value] of [
      ['empty', ''],
      ['whitespace-only', '    '],
    ] as const) {
      it(`AC-22.2 ${desc} name responds 400 "Please enter a subject name." and keeps the original`, async () => {
        const s = await makeSubject();
        const res = await rename(s.id, value).expect(400);
        expect(messageOf(res.body)).toContain(EMPTY);
        expect(await nameInDb(s.id)).toBe(s.name);
      });
    }

    it('AC-22.2 a missing name field responds 400 with the same message and keeps the original', async () => {
      const s = await makeSubject();
      const res = await http()
        .patch(`/api/subjects/${s.id}`)
        .set('Authorization', adminAuth())
        .send({})
        .expect(400);
      expect(messageOf(res.body)).toContain(EMPTY);
      expect(await nameInDb(s.id)).toBe(s.name);
    });
  });

  describe('AC-22.3 duplicate name', () => {
    it('AC-22.3 another subject\'s name in a different case responds 400 "This subject already exists." and is not applied', async () => {
      const other = await makeSubject(label('Physics'));
      const s = await makeSubject();
      for (const dup of [other.name, other.name.toUpperCase(), other.name.toLowerCase()]) {
        const res = await rename(s.id, dup).expect(400);
        expect(messageOf(res.body)).toContain(DUPLICATE);
      }
      expect(await nameInDb(s.id)).toBe(s.name);
      expect(await nameInDb(other.id)).toBe(other.name);
    });

    it('AC-22.3 two concurrent renames to case-variants of the same new name: exactly one wins', async () => {
      const a = await makeSubject();
      const b = await makeSubject();
      const target = label('Race');
      const results = await Promise.all([
        rename(a.id, target),
        rename(b.id, target.toUpperCase()),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
      const loser = results.find((r) => r.status === 400)!;
      expect(messageOf(loser.body)).toContain(DUPLICATE);
      const rows = await prisma.subject.findMany({
        where: { name: { equals: target, mode: 'insensitive' } },
      });
      expect(rows).toHaveLength(1);
    });
  });

  describe('AC-22.4 delete unused', () => {
    it('AC-22.4 an unused subject is deleted (204) and is gone from GET /subjects', async () => {
      const s = await makeSubject();
      await del(s.id).expect(204);
      const list = await http().get('/api/subjects').set('Authorization', adminAuth()).expect(200);
      expect(list.body.map((x: { id: string }) => x.id)).not.toContain(s.id);
      expect(await nameInDb(s.id)).toBeUndefined();
    });

    it('AC-22.4 deleting an unknown subject responds 404', async () => {
      await del('no-such-subject').expect(404);
    });
  });

  describe('AC-22.5 delete in use', () => {
    it('AC-22.5 an assigned subject responds 400 "This subject is in use and can\'t be deleted." and nothing is removed', async () => {
      const s = await makeSubject();
      const c = await makeClass();
      await addToClass(c.id, s.id).expect(201);
      const res = await del(s.id).expect(400);
      expect(messageOf(res.body)).toContain(IN_USE);
      expect(await nameInDb(s.id)).toBe(s.name);
      expect(await prisma.classSubject.count({ where: { subjectId: s.id } })).toBe(1);
    });
  });

  describe('UC-22-E1 case-only change', () => {
    it('UC-22-E1 "maths" to "Maths" succeeds and is not a duplicate', async () => {
      const lower = label('maths');
      const s = await makeSubject(lower);
      const upper = lower.replace(/maths/, 'Maths');
      const res = await rename(s.id, upper).expect(200);
      expect(res.body).toEqual({ id: s.id, name: upper });
      expect(await nameInDb(s.id)).toBe(upper);
    });

    it('UC-22-E1 renaming a subject to its own exact name succeeds', async () => {
      const s = await makeSubject();
      await rename(s.id, s.name).expect(200);
    });
  });

  describe('UC-22-E3 delete vs assign race', () => {
    it('UC-22-E3 concurrent delete + add-to-class never leaves a class pointing at a missing subject', async () => {
      for (let i = 0; i < 8; i++) {
        const s = await makeSubject();
        const c = await makeClass();
        const [d, a] = await Promise.all([del(s.id), addToClass(c.id, s.id)]);

        expect([204, 400]).toContain(d.status);
        expect([201, 404]).toContain(a.status);
        if (d.status === 400) expect(messageOf(d.body)).toContain(IN_USE);
        if (a.status === 404) expect(messageOf(a.body)).toContain(GONE);
        // consistency: exactly one of the two wins
        expect(d.status === 204).toBe(a.status === 404);

        const rows = await prisma.classSubject.findMany({
          where: { classId: c.id },
          include: { subject: true },
        });
        for (const r of rows) expect(r.subject).not.toBeNull();
        if (d.status === 204) {
          expect(rows).toHaveLength(0);
          expect(await nameInDb(s.id)).toBeUndefined();
        } else {
          expect(rows).toHaveLength(1);
          expect(await nameInDb(s.id)).toBe(s.name);
        }
      }
    });

    it('UC-22-E3 adding a class subject for an already-deleted subject responds 404 "This subject no longer exists."', async () => {
      const s = await makeSubject();
      const c = await makeClass();
      await del(s.id).expect(204);
      const res = await addToClass(c.id, s.id).expect(404);
      expect(messageOf(res.body)).toContain(GONE);
    });
  });

  describe('rename edge cases', () => {
    it('an unknown subject id responds 404 on PATCH', async () => {
      await rename('no-such-subject', label('x')).expect(404);
    });

    it('a name longer than 100 characters responds 400 and keeps the original', async () => {
      const s = await makeSubject();
      await rename(s.id, PREFIX26 + 'x'.repeat(101)).expect(400);
      expect(await nameInDb(s.id)).toBe(s.name);
    });
  });

  describe('AC-12.1 role enforcement on rename', () => {
    for (const role of ['teacher', 'student'] as const) {
      it(`AC-12.1 ${role} gets 403 on PATCH /subjects/:id and the name is unchanged`, async () => {
        const s = await makeSubject();
        await rename(s.id, label('Sneaky'), `Bearer ${tokenFor(role)}`).expect(403);
        expect(await nameInDb(s.id)).toBe(s.name);
      });
    }

    it('AC-12.1 no token gives 401 on PATCH /subjects/:id and the name is unchanged', async () => {
      const s = await makeSubject();
      await http()
        .patch(`/api/subjects/${s.id}`)
        .send({ name: label('Anon') })
        .expect(401);
      expect(await nameInDb(s.id)).toBe(s.name);
    });
  });
});

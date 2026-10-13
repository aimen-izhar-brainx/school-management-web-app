import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { SubjectsModule } from '../subjects/subjects.module.js';
import { UsersModule } from '../users/users.module.js';
import { ClassesModule } from './classes.module.js';

// Real Postgres, real signed JWTs, real guards. Everything carries a per-run prefix.
const PREFIX = `t016c-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;

type ClassSubjectBody = {
  id: string;
  subject: { id: string; name: string };
  teacher: { id: string; name: string } | null;
};

describe('Class subjects API (T-016)', () => {
  let ctx: DbTestApp;
  let http: DbTestApp['http'];
  let tokenFor: DbTestApp['tokenFor'];
  let adminAuth: DbTestApp['adminAuth'];
  let jwt: DbTestApp['jwt'];
  let prisma: DbTestApp['prisma'];
  let seq = 0;

  const label = (l = 'x') => `${PREFIX}${l}-${++seq}`;

  const makeClass = async () => prisma.class.create({ data: { name: label('c') } });
  const makeSubject = async () => prisma.subject.create({ data: { name: label('subj') } });
  const makeUser = async (role: 'teacher' | 'student' | 'admin') =>
    prisma.user.create({
      data: {
        name: `${PREFIX}${role}`,
        email: `${role}-${++seq}${EMAIL_SUFFIX}`,
        passwordHash: 'not-a-real-hash',
        role,
      },
    });
  const addSubject = (classId: string, subjectId: string, auth = adminAuth()) =>
    http().post(`/api/classes/${classId}/subjects`).set('Authorization', auth).send({ subjectId });
  const setTeacher = (classId: string, id: string, teacherId: string | null, auth = adminAuth()) =>
    http()
      .patch(`/api/classes/${classId}/subjects/${id}/teacher`)
      .set('Authorization', auth)
      .send({ teacherId });
  const listFor = async (classId: string) => {
    const res = await http()
      .get(`/api/classes/${classId}/subjects`)
      .set('Authorization', adminAuth())
      .expect(200);
    return res.body as ClassSubjectBody[];
  };
  const makeAssignment = async (classId: string, subjectId: string) => {
    const res = await addSubject(classId, subjectId).expect(201);
    return res.body as { id: string };
  };
  const dbRows = (classId: string) => prisma.classSubject.findMany({ where: { classId } });

  beforeAll(async () => {
    ctx = await createTestApp({ imports: [UsersModule, ClassesModule, SubjectsModule] });
    ({ http, tokenFor, adminAuth, jwt, prisma } = ctx);
  });

  afterEach(async () => {
    // Classes cascade to ClassSubject; subjects are Restrict so they go after; then users.
    await prisma.class.deleteMany({
      where: { name: { startsWith: PREFIX, mode: 'insensitive' } },
    });
    await prisma.subject.deleteMany({
      where: { name: { startsWith: PREFIX, mode: 'insensitive' } },
    });
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_SUFFIX } },
    });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('UC-10 add subject to class', () => {
    it('AC-10.1 an added subject responds 201 and appears in the class subject list when fetched again', async () => {
      const c = await makeClass();
      const s = await makeSubject();
      const res = await addSubject(c.id, s.id).expect(201);
      expect(typeof res.body.id).toBe('string');
      const list = await listFor(c.id);
      expect(list).toEqual([
        { id: res.body.id, subject: { id: s.id, name: s.name }, teacher: null },
      ]);
      const rows = await dbRows(c.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ subjectId: s.id, teacherId: null });
    });

    it('AC-10.1 a subject added to one class does not appear on another class', async () => {
      const c1 = await makeClass();
      const c2 = await makeClass();
      const s = await makeSubject();
      await addSubject(c1.id, s.id).expect(201);
      expect(await listFor(c2.id)).toEqual([]);
    });

    it('AC-09.1 the same subject can be assigned to several classes', async () => {
      const c1 = await makeClass();
      const c2 = await makeClass();
      const s = await makeSubject();
      await addSubject(c1.id, s.id).expect(201);
      await addSubject(c2.id, s.id).expect(201);
    });

    it('AC-10.4 adding the same subject twice responds 400 and leaves exactly one row', async () => {
      const c = await makeClass();
      const s = await makeSubject();
      await addSubject(c.id, s.id).expect(201);
      await addSubject(c.id, s.id).expect(400);
      expect(await dbRows(c.id)).toHaveLength(1);
      expect(await listFor(c.id)).toHaveLength(1);
    });

    it('AC-10.4 two concurrent adds of the same subject create exactly one row', async () => {
      const c = await makeClass();
      const s = await makeSubject();
      const results = await Promise.all([addSubject(c.id, s.id), addSubject(c.id, s.id)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
      expect(await dbRows(c.id)).toHaveLength(1);
    });

    it('UC-10 adding an unknown subject responds 404 and creates nothing', async () => {
      const c = await makeClass();
      await addSubject(c.id, 'no-such-subject').expect(404);
      expect(await dbRows(c.id)).toHaveLength(0);
    });

    it('UC-10 adding a subject to an unknown class responds 404', async () => {
      const s = await makeSubject();
      await addSubject('no-such-class', s.id).expect(404);
      expect(await prisma.classSubject.count({ where: { subjectId: s.id } })).toBe(0);
    });

    it('UC-10 listing subjects of an unknown class responds 404', async () => {
      await http()
        .get('/api/classes/no-such-class/subjects')
        .set('Authorization', adminAuth())
        .expect(404);
    });
  });

  describe('UC-10 assign teacher', () => {
    it('AC-10.2 an assigned teacher persists and is returned in the class subject list', async () => {
      const c = await makeClass();
      const s = await makeSubject();
      const t = await makeUser('teacher');
      const cs = await makeAssignment(c.id, s.id);
      await setTeacher(c.id, cs.id, t.id).expect(200);
      expect((await dbRows(c.id))[0].teacherId).toBe(t.id);
      const list = await listFor(c.id);
      expect(list[0].teacher).toEqual({ id: t.id, name: t.name });
    });

    it('AC-10.2 assigning a different teacher replaces the first (exactly one teacher, one row)', async () => {
      const c = await makeClass();
      const s = await makeSubject();
      const t1 = await makeUser('teacher');
      const t2 = await makeUser('teacher');
      const cs = await makeAssignment(c.id, s.id);
      await setTeacher(c.id, cs.id, t1.id).expect(200);
      await setTeacher(c.id, cs.id, t2.id).expect(200);
      const rows = await dbRows(c.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].teacherId).toBe(t2.id);
      const list = await listFor(c.id);
      expect(list).toHaveLength(1);
      expect(list[0].teacher?.id).toBe(t2.id);
    });

    it('AC-10.3 assigning a student as teacher responds 400 and nothing changes', async () => {
      const c = await makeClass();
      const s = await makeSubject();
      const t = await makeUser('teacher');
      const u = await makeUser('student');
      const cs = await makeAssignment(c.id, s.id);
      await setTeacher(c.id, cs.id, t.id).expect(200);
      await setTeacher(c.id, cs.id, u.id).expect(400);
      expect((await dbRows(c.id))[0].teacherId).toBe(t.id);
    });

    it('AC-10.3 assigning an admin as teacher responds 400 and nothing changes', async () => {
      const c = await makeClass();
      const s = await makeSubject();
      const u = await makeUser('admin');
      const cs = await makeAssignment(c.id, s.id);
      await setTeacher(c.id, cs.id, u.id).expect(400);
      expect((await dbRows(c.id))[0].teacherId).toBeNull();
    });

    it('UC-10-E1 clearing the teacher (null) is a valid persisted state and the subject stays on the class', async () => {
      const c = await makeClass();
      const s = await makeSubject();
      const t = await makeUser('teacher');
      const cs = await makeAssignment(c.id, s.id);
      await setTeacher(c.id, cs.id, t.id).expect(200);
      await setTeacher(c.id, cs.id, null).expect(200);
      const rows = await dbRows(c.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].teacherId).toBeNull();
      const list = await listFor(c.id);
      expect(list[0]).toMatchObject({ id: cs.id, teacher: null });
      expect(await prisma.user.findUnique({ where: { id: t.id } })).not.toBeNull();
    });

    it('UC-10-E1 a newly added subject has no teacher (null) when fetched', async () => {
      const c = await makeClass();
      const s = await makeSubject();
      await makeAssignment(c.id, s.id);
      expect((await listFor(c.id))[0].teacher).toBeNull();
    });

    it('UC-10 the same teacher can teach several class-subjects', async () => {
      const c = await makeClass();
      const s1 = await makeSubject();
      const s2 = await makeSubject();
      const t = await makeUser('teacher');
      const a = await makeAssignment(c.id, s1.id);
      const b = await makeAssignment(c.id, s2.id);
      await setTeacher(c.id, a.id, t.id).expect(200);
      await setTeacher(c.id, b.id, t.id).expect(200);
      expect((await dbRows(c.id)).map((r) => r.teacherId)).toEqual([t.id, t.id]);
    });

    it('UC-10 an unknown teacher id responds 4xx and nothing changes', async () => {
      const c = await makeClass();
      const s = await makeSubject();
      const cs = await makeAssignment(c.id, s.id);
      const res = await setTeacher(c.id, cs.id, 'no-such-user');
      expect([400, 404]).toContain(res.status);
      expect((await dbRows(c.id))[0].teacherId).toBeNull();
    });

    it('UC-10 an unknown class-subject id responds 404', async () => {
      const c = await makeClass();
      const t = await makeUser('teacher');
      await setTeacher(c.id, 'no-such-class-subject', t.id).expect(404);
    });

    it('UC-10 an unknown class id responds 404 and the assignment is unchanged', async () => {
      const c = await makeClass();
      const s = await makeSubject();
      const t = await makeUser('teacher');
      const cs = await makeAssignment(c.id, s.id);
      await setTeacher('no-such-class', cs.id, t.id).expect(404);
      expect((await dbRows(c.id))[0].teacherId).toBeNull();
    });

    it('UC-10 a class-subject addressed through the wrong class responds 404 and is unchanged', async () => {
      const c1 = await makeClass();
      const c2 = await makeClass();
      const s = await makeSubject();
      const t = await makeUser('teacher');
      const cs = await makeAssignment(c1.id, s.id);
      await setTeacher(c2.id, cs.id, t.id).expect(404);
      expect((await dbRows(c1.id))[0].teacherId).toBeNull();
    });
  });

  describe('UC-10 remove subject from class', () => {
    it('a removed subject responds 204 and is gone from the list, while the catalog entry remains', async () => {
      const c = await makeClass();
      const s = await makeSubject();
      const keep = await makeSubject();
      const cs = await makeAssignment(c.id, s.id);
      await makeAssignment(c.id, keep.id);
      await http()
        .delete(`/api/classes/${c.id}/subjects/${cs.id}`)
        .set('Authorization', adminAuth())
        .expect(204);
      expect((await listFor(c.id)).map((r) => r.subject.id)).toEqual([keep.id]);
      expect(await prisma.subject.findUnique({ where: { id: s.id } })).not.toBeNull();
    });

    it('removing an unknown class-subject responds 404', async () => {
      const c = await makeClass();
      await http()
        .delete(`/api/classes/${c.id}/subjects/no-such-class-subject`)
        .set('Authorization', adminAuth())
        .expect(404);
    });

    it('removing a class-subject through the wrong class responds 404 and the row remains', async () => {
      const c1 = await makeClass();
      const c2 = await makeClass();
      const s = await makeSubject();
      const cs = await makeAssignment(c1.id, s.id);
      await http()
        .delete(`/api/classes/${c2.id}/subjects/${cs.id}`)
        .set('Authorization', adminAuth())
        .expect(404);
      expect(await dbRows(c1.id)).toHaveLength(1);
    });
  });

  describe('AC-12.1 role enforcement', () => {
    for (const role of ['teacher', 'student'] as const) {
      it(`AC-12.1 ${role} gets 403 on every class-subject write endpoint and no data changes`, async () => {
        const c = await makeClass();
        const s = await makeSubject();
        const other = await makeSubject();
        const t = await makeUser('teacher');
        const cs = await makeAssignment(c.id, s.id);
        const auth = `Bearer ${tokenFor(role)}`;

        await addSubject(c.id, other.id, auth).expect(403);
        await setTeacher(c.id, cs.id, t.id, auth).expect(403);
        await http()
          .delete(`/api/classes/${c.id}/subjects/${cs.id}`)
          .set('Authorization', auth)
          .expect(403);

        const rows = await dbRows(c.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          id: cs.id,
          subjectId: s.id,
          teacherId: null,
        });
      });
    }
  });

  describe('UC-12-E1 authentication', () => {
    it('no token gives 401 on every class-subject endpoint and no data changes', async () => {
      const c = await makeClass();
      const s = await makeSubject();
      const cs = await makeAssignment(c.id, s.id);
      const base = `/api/classes/${c.id}/subjects`;
      await http().get(base).expect(401);
      await http().post(base).send({ subjectId: s.id }).expect(401);
      await http().patch(`${base}/${cs.id}/teacher`).send({ teacherId: null }).expect(401);
      await http().delete(`${base}/${cs.id}`).expect(401);
      expect(await dbRows(c.id)).toHaveLength(1);
    });

    it('an expired token gives 401 on every class-subject endpoint and no data changes', async () => {
      const c = await makeClass();
      const s = await makeSubject();
      const cs = await makeAssignment(c.id, s.id);
      const expired = `Bearer ${jwt.sign(
        { sub: 'u', email: 'u@example.com', role: 'admin' },
        { expiresIn: '-1h' },
      )}`;
      const base = `/api/classes/${c.id}/subjects`;
      await http().get(base).set('Authorization', expired).expect(401);
      await addSubject(c.id, s.id, expired).expect(401);
      await setTeacher(c.id, cs.id, null, expired).expect(401);
      await http().delete(`${base}/${cs.id}`).set('Authorization', expired).expect(401);
      expect(await dbRows(c.id)).toHaveLength(1);
    });
  });
});

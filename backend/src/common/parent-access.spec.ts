import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { ClassesModule } from '../classes/classes.module.js';
import { PeriodsModule } from '../periods/periods.module.js';
import { SubjectsModule } from '../subjects/subjects.module.js';
import { TimetableModule } from '../timetable/timetable.module.js';
import { UsersModule } from '../users/users.module.js';

// T-031 / UC-25: the Parent role is locked out of Academic Management.
// Real Postgres, real signed JWTs, real guards. Everything carries a per-run prefix.
const PREFIX = `t031-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;

describe('Parent access to Academic Management (T-031)', () => {
  let ctx: DbTestApp;
  let http: DbTestApp['http'];
  let tokenFor: DbTestApp['tokenFor'];
  let adminAuth: DbTestApp['adminAuth'];
  let prisma: DbTestApp['prisma'];
  let seq = 0;

  const label = (l = 'x') => `${PREFIX}${l}-${++seq}`;
  const parentAuth = () => `Bearer ${tokenFor('parent')}`;

  const makeUser = (role: 'teacher' | 'student') =>
    prisma.user.create({
      data: {
        name: `${PREFIX}${role}-${++seq}`,
        email: `${role}-${seq}${EMAIL_SUFFIX}`,
        passwordHash: 'not-a-real-hash',
        role,
      },
    });

  /** Real ids for everything a write endpoint addresses, built through the admin API. */
  const setup = async () => {
    const klass = await prisma.class.create({ data: { name: label('c') } });
    const section = await prisma.section.create({ data: { name: label('s'), classId: klass.id } });
    const subject = await prisma.subject.create({ data: { name: label('subj') } });
    const extraSubject = await prisma.subject.create({ data: { name: label('subj') } });
    const teacher = await makeUser('teacher');
    const student = await makeUser('student');
    const csRes = await http()
      .post(`/api/classes/${klass.id}/subjects`)
      .set('Authorization', adminAuth())
      .send({ subjectId: subject.id })
      .expect(201);
    const classSubjectId = csRes.body.id as string;
    await http()
      .patch(`/api/classes/${klass.id}/subjects/${classSubjectId}/teacher`)
      .set('Authorization', adminAuth())
      .send({ teacherId: teacher.id })
      .expect(200);
    await http()
      .put(`/api/sections/${section.id}/timetable/period-1/mon`)
      .set('Authorization', adminAuth())
      .send({ subjectId: subject.id })
      .expect(200);
    return { klass, section, subject, extraSubject, teacher, student, classSubjectId };
  };

  const snapshot = async (ids: {
    klass: { id: string };
    section: { id: string };
    subject: { id: string };
    student: { id: string };
  }) => ({
    classes: await prisma.class.findMany({
      where: { name: { startsWith: PREFIX } },
      orderBy: { id: 'asc' },
    }),
    sections: await prisma.section.findMany({
      where: { classId: ids.klass.id },
      orderBy: { id: 'asc' },
    }),
    subjects: await prisma.subject.findMany({
      where: { name: { startsWith: PREFIX } },
      orderBy: { id: 'asc' },
    }),
    classSubjects: await prisma.classSubject.findMany({
      where: { classId: ids.klass.id },
      orderBy: { id: 'asc' },
    }),
    entries: await prisma.timetableEntry.findMany({
      where: { sectionId: ids.section.id },
      orderBy: { id: 'asc' },
    }),
    student: await prisma.user.findUnique({ where: { id: ids.student.id } }),
  });

  beforeAll(async () => {
    ctx = await createTestApp({
      imports: [UsersModule, ClassesModule, SubjectsModule, PeriodsModule, TimetableModule],
    });
    ({ http, tokenFor, adminAuth, prisma } = ctx);
  });

  afterEach(async () => {
    await prisma.class.deleteMany({
      where: { name: { startsWith: PREFIX, mode: 'insensitive' } },
    });
    await prisma.subject.deleteMany({
      where: { name: { startsWith: PREFIX, mode: 'insensitive' } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('AC-25.1 parent gets 403 on every write endpoint and no data changes', () => {
    type Ids = Awaited<ReturnType<typeof setup>>;
    type Call = (ids: Ids, auth: string) => ReturnType<ReturnType<DbTestApp['http']>['get']>;

    const cases: [string, Call][] = [
      [
        'POST /api/classes',
        (_i, a) => http().post('/api/classes').set('Authorization', a).send({ name: label('new') }),
      ],
      [
        'PATCH /api/classes/:id',
        (i, a) =>
          http()
            .patch(`/api/classes/${i.klass.id}`)
            .set('Authorization', a)
            .send({ name: label('renamed') }),
      ],
      [
        'GET /api/classes/:id/delete-impact',
        (i, a) => http().get(`/api/classes/${i.klass.id}/delete-impact`).set('Authorization', a),
      ],
      [
        'DELETE /api/classes/:id',
        (i, a) => http().delete(`/api/classes/${i.klass.id}`).set('Authorization', a),
      ],
      [
        'POST /api/classes/:id/sections',
        (i, a) =>
          http()
            .post(`/api/classes/${i.klass.id}/sections`)
            .set('Authorization', a)
            .send({ name: label('sec') }),
      ],
      [
        'PATCH /api/classes/:id/sections/:sectionId',
        (i, a) =>
          http()
            .patch(`/api/classes/${i.klass.id}/sections/${i.section.id}`)
            .set('Authorization', a)
            .send({ name: label('sec-renamed') }),
      ],
      [
        'PATCH /api/classes/:id/sections/:sectionId/class-teacher',
        (i, a) =>
          http()
            .patch(`/api/classes/${i.klass.id}/sections/${i.section.id}/class-teacher`)
            .set('Authorization', a)
            .send({ teacherId: i.teacher.id }),
      ],
      [
        'DELETE /api/classes/:id/sections/:sectionId',
        (i, a) =>
          http()
            .delete(`/api/classes/${i.klass.id}/sections/${i.section.id}`)
            .set('Authorization', a),
      ],
      [
        'POST /api/subjects',
        (_i, a) => http().post('/api/subjects').set('Authorization', a).send({ name: label('ns') }),
      ],
      [
        'PATCH /api/subjects/:id',
        (i, a) =>
          http()
            .patch(`/api/subjects/${i.subject.id}`)
            .set('Authorization', a)
            .send({ name: label('sr') }),
      ],
      [
        'DELETE /api/subjects/:id',
        (i, a) => http().delete(`/api/subjects/${i.extraSubject.id}`).set('Authorization', a),
      ],
      [
        'POST /api/classes/:id/subjects',
        (i, a) =>
          http()
            .post(`/api/classes/${i.klass.id}/subjects`)
            .set('Authorization', a)
            .send({ subjectId: i.extraSubject.id }),
      ],
      [
        'PATCH /api/classes/:id/subjects/:csId/teacher',
        (i, a) =>
          http()
            .patch(`/api/classes/${i.klass.id}/subjects/${i.classSubjectId}/teacher`)
            .set('Authorization', a)
            .send({ teacherId: null }),
      ],
      [
        'DELETE /api/classes/:id/subjects/:csId',
        (i, a) =>
          http()
            .delete(`/api/classes/${i.klass.id}/subjects/${i.classSubjectId}`)
            .set('Authorization', a),
      ],
      [
        'PATCH /api/users/:id/section',
        (i, a) =>
          http()
            .patch(`/api/users/${i.student.id}/section`)
            .set('Authorization', a)
            .send({ sectionId: i.section.id }),
      ],
      [
        'GET /api/users?role=teacher',
        (_i, a) => http().get('/api/users?role=teacher').set('Authorization', a),
      ],
      [
        'PUT /api/sections/:id/timetable/:period/:day',
        (i, a) =>
          http()
            .put(`/api/sections/${i.section.id}/timetable/period-2/tue`)
            .set('Authorization', a)
            .send({ subjectId: i.subject.id }),
      ],
      [
        'DELETE /api/sections/:id/timetable/:period/:day',
        (i, a) =>
          http()
            .delete(`/api/sections/${i.section.id}/timetable/period-1/mon`)
            .set('Authorization', a),
      ],
    ];

    it.each(cases)('AC-25.1 %s responds 403 and changes nothing', async (_name, call) => {
      const ids = await setup();
      // Positive control: the same ids are valid, so a 403 is not hiding a 404.
      const before = await snapshot(ids);
      expect(before.entries).toHaveLength(1);
      expect(before.classSubjects).toHaveLength(1);

      await call(ids, parentAuth()).expect(403);

      expect(await snapshot(ids)).toEqual(before);
    });

    it('AC-25.1 the same ids are accepted for an admin (so the 403s above are about the role)', async () => {
      const ids = await setup();
      await http()
        .patch(`/api/classes/${ids.klass.id}`)
        .set('Authorization', adminAuth())
        .send({ name: label('admin-renamed') })
        .expect(200);
      await http()
        .get(`/api/classes/${ids.klass.id}/delete-impact`)
        .set('Authorization', adminAuth())
        .expect(200);
    });
  });

  describe('AC-25.2 GET /api/timetable/me by role', () => {
    const me = (auth: string) => http().get('/api/timetable/me').set('Authorization', auth);

    it('AC-25.2 parent gets 403', async () => {
      await me(parentAuth()).expect(403);
    });

    it('AC-25.2 admin gets 403 (not a teaching role, UC-21 "Not included")', async () => {
      await me(adminAuth()).expect(403);
    });

    it('AC-25.2 teacher and student still get 200', async () => {
      const teacher = await makeUser('teacher');
      const student = await makeUser('student');
      await me(`Bearer ${tokenFor('teacher', teacher.id)}`).expect(200);
      await me(`Bearer ${tokenFor('student', student.id)}`).expect(200);
    });
  });

  describe('UC-25-E1 unauthenticated requests', () => {
    const expiredAuth = () =>
      `Bearer ${ctx.jwt.sign(
        { sub: 'x', email: 'u@example.com', role: 'parent' },
        { expiresIn: -10 },
      )}`;

    it('UC-25-E1 no token responds 401 on GET /timetable/me and on a write endpoint', async () => {
      await http().get('/api/timetable/me').expect(401);
      await http().post('/api/classes').send({ name: label('nt') }).expect(401);
      expect(await prisma.class.count({ where: { name: { startsWith: PREFIX } } })).toBe(0);
    });

    it('UC-25-E1 an expired token responds 401 on GET /timetable/me and on a write endpoint', async () => {
      await http().get('/api/timetable/me').set('Authorization', expiredAuth()).expect(401);
      await http()
        .post('/api/classes')
        .set('Authorization', expiredAuth())
        .send({ name: label('et') })
        .expect(401);
      expect(await prisma.class.count({ where: { name: { startsWith: PREFIX } } })).toBe(0);
    });
  });
});

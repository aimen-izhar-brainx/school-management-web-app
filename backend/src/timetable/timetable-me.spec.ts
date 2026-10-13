import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { ClassesModule } from '../classes/classes.module.js';
import { PeriodsModule } from '../periods/periods.module.js';
import { SubjectsModule } from '../subjects/subjects.module.js';
import { UsersModule } from '../users/users.module.js';
import { TimetableModule } from './timetable.module.js';

// Real Postgres, real signed JWTs, real guards. Admin/parent behaviour on /timetable/me is T-031's.
const PREFIX = `t024-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;

type Named = { id: string; name: string };
type TeacherEntry = {
  id: string;
  periodId: string;
  dayOfWeek: string;
  subject: Named;
  section: Named;
  class: Named;
};
type StudentEntry = {
  id: string;
  periodId: string;
  dayOfWeek: string;
  subject: Named;
  teacher: Named;
};
type Period = { id: string; isBreak: boolean };

describe('GET /api/timetable/me (T-024)', () => {
  let ctx: DbTestApp;
  let http: DbTestApp['http'];
  let tokenFor: DbTestApp['tokenFor'];
  let adminAuth: DbTestApp['adminAuth'];
  let prisma: DbTestApp['prisma'];
  let seq = 0;

  const label = (l = 'x') => `${PREFIX}${l}-${++seq}`;

  const makeClass = () => prisma.class.create({ data: { name: label('c') } });
  const makeSection = (classId: string) =>
    prisma.section.create({ data: { name: label('s'), classId } });
  const makeSubject = () => prisma.subject.create({ data: { name: label('subj') } });
  const makeUser = (role: 'teacher' | 'student', sectionId?: string) =>
    prisma.user.create({
      data: {
        name: `${PREFIX}${role}-${++seq}`,
        email: `${role}-${seq}${EMAIL_SUFFIX}`,
        passwordHash: 'not-a-real-hash',
        role,
        ...(sectionId ? { sectionId } : {}),
      },
    });
  const authFor = (user: { id: string; role: string }) =>
    `Bearer ${tokenFor(user.role, user.id)}`;

  const assign = async (classId: string, subjectId: string, teacherId: string) => {
    const res = await http()
      .post(`/api/classes/${classId}/subjects`)
      .set('Authorization', adminAuth())
      .send({ subjectId })
      .expect(201);
    await http()
      .patch(`/api/classes/${classId}/subjects/${res.body.id}/teacher`)
      .set('Authorization', adminAuth())
      .send({ teacherId })
      .expect(200);
  };

  const slot = (sectionId: string, periodId: string, day: string) =>
    `/api/sections/${sectionId}/timetable/${periodId}/${day}`;
  const place = (sectionId: string, subjectId: string, periodId = 'period-1', day = 'mon') =>
    http()
      .put(slot(sectionId, periodId, day))
      .set('Authorization', adminAuth())
      .send({ subjectId });

  const me = (auth: string) => http().get('/api/timetable/me').set('Authorization', auth);

  /** A class with one section; a fresh subject taught by `teacher` (or a new teacher). */
  const setupClass = async (teacher?: { id: string }) => {
    const klass = await makeClass();
    const section = await makeSection(klass.id);
    const subject = await makeSubject();
    const t = teacher ?? (await makeUser('teacher'));
    await assign(klass.id, subject.id, t.id);
    return { klass, section, subject, teacher: t };
  };

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

  describe('UC-18 teacher timetable', () => {
    it('AC-18.1 a teacher with entries in two sections of two classes gets both, with subject, section and class names', async () => {
      const a = await setupClass();
      const b = await setupClass(a.teacher);
      await place(a.section.id, a.subject.id, 'period-1', 'mon').expect(200);
      await place(b.section.id, b.subject.id, 'period-2', 'tue').expect(200);

      const res = await me(authFor({ id: a.teacher.id, role: 'teacher' })).expect(200);
      expect(res.body.kind).toBe('teacher');
      expect(res.body.periods.map((p: Period) => p.id)).toEqual([
        'period-1',
        'period-2',
        'period-3',
        'recess',
        'period-4',
        'period-5',
        'period-6',
      ]);
      const entries = res.body.entries as TeacherEntry[];
      expect(entries).toHaveLength(2);

      const first = entries.find((e) => e.periodId === 'period-1' && e.dayOfWeek === 'mon');
      const second = entries.find((e) => e.periodId === 'period-2' && e.dayOfWeek === 'tue');
      expect(first).toMatchObject({
        subject: { id: a.subject.id, name: a.subject.name },
        section: { id: a.section.id, name: a.section.name },
        class: { id: a.klass.id, name: a.klass.name },
      });
      expect(second).toMatchObject({
        subject: { id: b.subject.id, name: b.subject.name },
        section: { id: b.section.id, name: b.section.name },
        class: { id: b.klass.id, name: b.klass.name },
      });
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('AC-18.2 a teacher with no entries gets 200 and an empty entries list', async () => {
      const teacher = await makeUser('teacher');
      const res = await me(authFor(teacher)).expect(200);
      expect(res.body.kind).toBe('teacher');
      expect(res.body.entries).toEqual([]);
      expect(res.body.periods).toHaveLength(7);
    });

    it('UC-18-E1 the response never has two entries at the same period and day', async () => {
      const a = await setupClass();
      const b = await setupClass(a.teacher);
      await place(a.section.id, a.subject.id, 'period-1', 'mon').expect(200);
      await place(a.section.id, a.subject.id, 'period-2', 'mon').expect(200);
      await place(b.section.id, b.subject.id, 'period-1', 'tue').expect(200);
      // Double-booking attempt is rejected by T-022, so it can never reach the response.
      const clash = await place(b.section.id, b.subject.id, 'period-1', 'mon');
      expect(clash.status).toBeGreaterThanOrEqual(400);

      const res = await me(authFor({ id: a.teacher.id, role: 'teacher' })).expect(200);
      const entries = res.body.entries as TeacherEntry[];
      expect(entries).toHaveLength(3);
      const keys = entries.map((e) => `${e.periodId}|${e.dayOfWeek}`);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("AC-21.1 teacher A never sees teacher B's slots", async () => {
      const a = await setupClass();
      const b = await setupClass(); // different teacher
      await place(a.section.id, a.subject.id, 'period-1', 'mon').expect(200);
      await place(b.section.id, b.subject.id, 'period-1', 'mon').expect(200);
      await place(b.section.id, b.subject.id, 'period-3', 'fri').expect(200);

      const resA = await me(authFor({ id: a.teacher.id, role: 'teacher' })).expect(200);
      const entriesA = resA.body.entries as TeacherEntry[];
      expect(entriesA).toHaveLength(1);
      expect(entriesA[0].section.id).toBe(a.section.id);
      expect(entriesA.some((e) => e.section.id === b.section.id)).toBe(false);

      const resB = await me(authFor({ id: b.teacher.id, role: 'teacher' })).expect(200);
      const entriesB = resB.body.entries as TeacherEntry[];
      expect(entriesB).toHaveLength(2);
      expect(entriesB.every((e) => e.section.id === b.section.id)).toBe(true);
    });
  });

  describe('UC-19 student timetable', () => {
    it("AC-19.1 a student's entries exactly match the section grid", async () => {
      const { section, subject } = await setupClass();
      const subject2 = await makeSubject();
      const teacher2 = await makeUser('teacher');
      const klassId = section.classId;
      await assign(klassId, subject2.id, teacher2.id);
      await place(section.id, subject.id, 'period-1', 'mon').expect(200);
      await place(section.id, subject2.id, 'period-4', 'wed').expect(200);
      const student = await makeUser('student', section.id);

      const grid = await http()
        .get(`/api/sections/${section.id}/timetable`)
        .set('Authorization', adminAuth())
        .expect(200);
      const res = await me(authFor(student)).expect(200);

      expect(res.body.kind).toBe('student');
      expect(res.body.section).toMatchObject({ id: section.id, name: section.name });
      expect(res.body.periods).toEqual(grid.body.periods);
      expect(res.body.entries).toHaveLength(2);
      const sortKey = (e: StudentEntry) => `${e.periodId}|${e.dayOfWeek}`;
      const sorted = (list: StudentEntry[]) =>
        [...list].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
      expect(sorted(res.body.entries)).toEqual(sorted(grid.body.entries));
      expect(res.body.entries[0]).toHaveProperty('subject.name');
      expect(res.body.entries[0]).toHaveProperty('teacher.name');
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('UC-19-E1 a student in an empty section gets 200, section set, and no entries', async () => {
      const { section } = await setupClass();
      const student = await makeUser('student', section.id);
      const res = await me(authFor(student)).expect(200);
      expect(res.body.kind).toBe('student');
      expect(res.body.section).not.toBeNull();
      expect(res.body.section.id).toBe(section.id);
      expect(res.body.entries).toEqual([]);
    });

    it('AC-21.2 student A never sees another section\'s entries', async () => {
      const a = await setupClass();
      const b = await setupClass();
      await place(a.section.id, a.subject.id, 'period-1', 'mon').expect(200);
      await place(b.section.id, b.subject.id, 'period-2', 'tue').expect(200);
      await place(b.section.id, b.subject.id, 'period-5', 'thu').expect(200);
      const studentA = await makeUser('student', a.section.id);

      const res = await me(authFor(studentA)).expect(200);
      expect(res.body.section.id).toBe(a.section.id);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0].subject.id).toBe(a.subject.id);
      expect(res.body.entries[0].teacher.id).toBe(a.teacher.id);
    });
  });

  describe('UC-20 student without a section', () => {
    it('AC-20.1 a student with no section gets 200, section null and no entries', async () => {
      const student = await makeUser('student');
      const res = await me(authFor(student)).expect(200);
      expect(res.body.kind).toBe('student');
      expect(res.body.section).toBeNull();
      expect(res.body.entries).toEqual([]);
    });

    it('AC-23.3 a student whose class was deleted keeps the account and gets section null', async () => {
      const { klass, section, subject } = await setupClass();
      await place(section.id, subject.id).expect(200);
      const student = await makeUser('student', section.id);

      const before = await me(authFor(student)).expect(200);
      expect(before.body.section).not.toBeNull();

      await http()
        .delete(`/api/classes/${klass.id}`)
        .set('Authorization', adminAuth())
        .expect(204);

      expect(await prisma.user.findUnique({ where: { id: student.id } })).not.toBeNull();
      const res = await me(authFor(student)).expect(200);
      expect(res.body.kind).toBe('student');
      expect(res.body.section).toBeNull();
      expect(res.body.entries).toEqual([]);
    });
  });

  describe('UC-21 access control', () => {
    it.each(['teacher', 'student'])(
      'AC-21.3 %s gets 403 on PUT and DELETE timetable-entry endpoints and no data changes',
      async (role) => {
        const { section, subject } = await setupClass();
        const user = await makeUser(role as 'teacher' | 'student');
        const auth = authFor(user);

        await http()
          .put(slot(section.id, 'period-1', 'mon'))
          .set('Authorization', auth)
          .send({ subjectId: subject.id })
          .expect(403);
        expect(await prisma.timetableEntry.count({ where: { sectionId: section.id } })).toBe(0);

        await place(section.id, subject.id).expect(200);
        await http()
          .delete(slot(section.id, 'period-1', 'mon'))
          .set('Authorization', auth)
          .expect(403);
        expect(await prisma.timetableEntry.count({ where: { sectionId: section.id } })).toBe(1);
      },
    );

    it('UC-21-E1 no token responds 401', async () => {
      await http().get('/api/timetable/me').expect(401);
    });

    it('UC-21-E1 an expired token responds 401', async () => {
      const teacher = await makeUser('teacher');
      const expired = ctx.jwt.sign(
        { sub: teacher.id, email: 'u@example.com', role: 'teacher' },
        { expiresIn: -10 },
      );
      await me(`Bearer ${expired}`).expect(401);
    });
  });
});

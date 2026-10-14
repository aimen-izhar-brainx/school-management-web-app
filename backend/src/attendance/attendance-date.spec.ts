import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { ClassesModule } from '../classes/classes.module.js';
import { UsersModule } from '../users/users.module.js';
import { AttendanceModule } from './attendance.module.js';

// Real Postgres, real signed JWTs, real guards. Everything carries a per-run prefix.
const PREFIX = `t032d-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;

type Student = { id: string; name: string };
type EntryStatus = 'present' | 'absent' | 'leave';

const dayOffset = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const todayStr = () => dayOffset(0);
const yesterdayStr = () => dayOffset(-1);
const tomorrowStr = () => dayOffset(1);

describe('PUT /api/attendance/sections/:sectionId/days/:date — today-only rule (T-032, UC-04)', () => {
  let ctx: DbTestApp;
  let http: DbTestApp['http'];
  let tokenFor: DbTestApp['tokenFor'];
  let prisma: DbTestApp['prisma'];
  let seq = 0;

  const label = (l = 'x') => `${PREFIX}${l}-${++seq}`;
  const makeClass = () => prisma.class.create({ data: { name: label('c') } });
  const makeSection = (classId: string, classTeacherId?: string) =>
    prisma.section.create({ data: { name: label('s'), classId, classTeacherId } });
  const makeTeacher = () =>
    prisma.user.create({
      data: {
        name: label('teacher'),
        email: `teacher-${++seq}${EMAIL_SUFFIX}`,
        passwordHash: 'not-a-real-hash',
        role: 'teacher',
      },
    });
  const makeStudent = (sectionId: string) =>
    prisma.user.create({
      data: {
        name: label('student'),
        email: `student-${++seq}${EMAIL_SUFFIX}`,
        passwordHash: 'not-a-real-hash',
        role: 'student',
        sectionId,
      },
    });
  const makeStudents = async (sectionId: string, n: number) => {
    const students: Student[] = [];
    for (let i = 0; i < n; i++) students.push(await makeStudent(sectionId));
    return students;
  };

  /** Class + section owned by a fresh class teacher, with `n` enrolled students. */
  const setupOwned = async (n = 2) => {
    const klass = await makeClass();
    const teacher = await makeTeacher();
    const section = await makeSection(klass.id, teacher.id);
    const students = await makeStudents(section.id, n);
    return { klass, section, teacher, students };
  };

  const authFor = (user: { id: string; role: string }) => `Bearer ${tokenFor(user.role, user.id)}`;
  const rosterEntries = (students: Student[], overrides: Record<string, EntryStatus> = {}) =>
    students.map((s) => ({ studentId: s.id, status: overrides[s.id] ?? 'present' }));

  const putAttendance = (sectionId: string, date: string, body: unknown, auth: string) =>
    http()
      .put(`/api/attendance/sections/${sectionId}/days/${date}`)
      .set('Authorization', auth)
      .send(body as object);
  const getAttendance = (sectionId: string, date: string, auth: string) =>
    http().get(`/api/attendance/sections/${sectionId}/days/${date}`).set('Authorization', auth);

  beforeAll(async () => {
    ctx = await createTestApp({ imports: [UsersModule, ClassesModule, AttendanceModule] });
    ({ http, tokenFor, prisma } = ctx);
  });

  afterEach(async () => {
    await prisma.class.deleteMany({
      where: { name: { startsWith: PREFIX, mode: 'insensitive' } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
    vi.useRealTimers();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('UC-04 teacher cannot mark attendance for a non-today date', () => {
    it('AC-04.1 a date in the past responds with an error and creates/modifies nothing for that date', async () => {
      const { section, teacher, students } = await setupOwned(2);
      const auth = authFor(teacher);

      const res = await putAttendance(
        section.id,
        yesterdayStr(),
        { entries: rosterEntries(students) },
        auth,
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);

      await getAttendance(section.id, yesterdayStr(), auth).expect(404);
      expect(await prisma.attendanceSession.count({ where: { sectionId: section.id } })).toBe(0);
    });

    it('AC-04.2 a date in the future responds with the same error and creates/modifies nothing for that date', async () => {
      const { section, teacher, students } = await setupOwned(2);
      const auth = authFor(teacher);

      const res = await putAttendance(
        section.id,
        tomorrowStr(),
        { entries: rosterEntries(students) },
        auth,
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);

      await getAttendance(section.id, tomorrowStr(), auth).expect(404);
      expect(await prisma.attendanceSession.count({ where: { sectionId: section.id } })).toBe(0);
    });

    it('UC-04-E1 a malformed date string ("2026-13-40") is a validation error, not a server crash', async () => {
      const { section, teacher, students } = await setupOwned(2);
      const auth = authFor(teacher);

      const res = await putAttendance(
        section.id,
        '2026-13-40',
        { entries: rosterEntries(students) },
        auth,
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(await prisma.attendanceSession.count({ where: { sectionId: section.id } })).toBe(0);
    });

    it("UC-04-E2 at the midnight boundary, the server's current date is authoritative over a date string prepared just before midnight", async () => {
      const { section, teacher, students } = await setupOwned(2);
      const auth = authFor(teacher);

      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(new Date('2026-06-15T23:59:58.000Z'));
        const dateJustBeforeMidnight = todayStr();
        expect(dateJustBeforeMidnight).toBe('2026-06-15');
        await putAttendance(
          section.id,
          dateJustBeforeMidnight,
          { entries: rosterEntries(students) },
          auth,
        ).expect(200);

        // Four seconds later it's a new server day; the same date string is now "yesterday".
        vi.setSystemTime(new Date('2026-06-16T00:00:02.000Z'));
        await putAttendance(
          section.id,
          dateJustBeforeMidnight,
          { entries: rosterEntries(students, { [students[0].id]: 'absent' }) },
          auth,
        ).expect(400);

        // The new server-side "today" is accepted.
        await putAttendance(section.id, todayStr(), { entries: rosterEntries(students) }, auth).expect(200);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

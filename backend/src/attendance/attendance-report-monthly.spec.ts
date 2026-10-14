import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { ClassesModule } from '../classes/classes.module.js';
import { UsersModule } from '../users/users.module.js';
import { AttendanceModule } from './attendance.module.js';

// Real Postgres, real signed JWTs, real guards. Everything carries a per-run prefix.
const PREFIX = `t036b-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;

type Student = { id: string; name: string };
type EntryStatus = 'present' | 'absent' | 'leave';
type MonthlyRow = {
  student: { id: string; name?: string };
  present: number;
  absent: number;
  leave: number;
  markedDays: number;
  percentage: number | null;
};

describe('GET /api/attendance/reports/monthly — admin monthly percentage report (T-036, UC-09)', () => {
  let ctx: DbTestApp;
  let http: DbTestApp['http'];
  let tokenFor: DbTestApp['tokenFor'];
  let prisma: DbTestApp['prisma'];
  let seq = 0;

  const label = (l = 'x') => `${PREFIX}${l}-${++seq}`;
  const makeClass = () => prisma.class.create({ data: { name: label('c') } });
  const makeSection = (classId: string, classTeacherId?: string | null) =>
    prisma.section.create({ data: { name: label('s'), classId, classTeacherId } });
  const makeUser = (role: 'teacher' | 'student' | 'admin', sectionId?: string) =>
    prisma.user.create({
      data: {
        name: label(role),
        email: `${role}-${++seq}${EMAIL_SUFFIX}`,
        passwordHash: 'not-a-real-hash',
        role,
        ...(sectionId ? { sectionId } : {}),
      },
    });
  const makeStudents = async (sectionId: string, n: number) => {
    const students: Student[] = [];
    for (let i = 0; i < n; i++) students.push(await makeUser('student', sectionId));
    return students;
  };

  /** Class + section owned by a fresh class teacher. */
  const setupSection = async () => {
    const klass = await makeClass();
    const teacher = await makeUser('teacher');
    const section = await makeSection(klass.id, teacher.id);
    return { klass, section, teacher };
  };

  const authFor = (user: { id: string; role: string }) => `Bearer ${tokenFor(user.role, user.id)}`;

  /** Seeds a session directly in the DB, with exactly the given per-student entries (not necessarily the full roster — used to simulate a student who joined partway through the month, or a session that pre-dates them). */
  const seedSession = (
    sectionId: string,
    dateStr: string,
    submittedById: string,
    entries: Array<{ studentId: string; status: EntryStatus }>,
  ) =>
    prisma.attendanceSession.create({
      data: {
        sectionId,
        date: new Date(`${dateStr}T00:00:00.000Z`),
        submittedById,
        entries: { create: entries },
      },
    });

  const getMonthly = (sectionId: string, month: string, auth: string) =>
    http()
      .get(`/api/attendance/reports/monthly?sectionId=${sectionId}&month=${month}`)
      .set('Authorization', auth);

  beforeAll(async () => {
    ctx = await createTestApp({ imports: [UsersModule, ClassesModule, AttendanceModule] });
    ({ http, tokenFor, prisma } = ctx);
  });

  afterEach(async () => {
    await prisma.class.deleteMany({
      where: { name: { startsWith: PREFIX, mode: 'insensitive' } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('UC-09 admin views monthly attendance percentage per student', () => {
    it('AC-09.1 a student with 4 marked days in the month (3 present, 1 absent) has percentage = round(3/4 x 100) = 75', async () => {
      const { section, teacher } = await setupSection();
      const [student] = await makeStudents(section.id, 1);
      const month = '2024-02';
      await seedSession(section.id, '2024-02-01', teacher.id, [{ studentId: student.id, status: 'present' }]);
      await seedSession(section.id, '2024-02-02', teacher.id, [{ studentId: student.id, status: 'present' }]);
      await seedSession(section.id, '2024-02-03', teacher.id, [{ studentId: student.id, status: 'present' }]);
      await seedSession(section.id, '2024-02-04', teacher.id, [{ studentId: student.id, status: 'absent' }]);
      const admin = await makeUser('admin');

      const res = await getMonthly(section.id, month, authFor(admin)).expect(200);
      const body = res.body as MonthlyRow[];
      const row = body.find((r) => r.student?.id === student.id);

      expect(row).toMatchObject({
        student: { id: student.id },
        present: 3,
        absent: 1,
        leave: 0,
        markedDays: 4,
        percentage: 75,
      });
    });

    it('AC-09.1 rounds a non-integer ratio correctly: 2 present out of 3 marked days = round(66.67) = 67, not floor(66)', async () => {
      const { section, teacher } = await setupSection();
      const [student] = await makeStudents(section.id, 1);
      const month = '2024-03';
      await seedSession(section.id, '2024-03-01', teacher.id, [{ studentId: student.id, status: 'present' }]);
      await seedSession(section.id, '2024-03-02', teacher.id, [{ studentId: student.id, status: 'present' }]);
      await seedSession(section.id, '2024-03-03', teacher.id, [{ studentId: student.id, status: 'leave' }]);
      const admin = await makeUser('admin');

      const res = await getMonthly(section.id, month, authFor(admin)).expect(200);
      const body = res.body as MonthlyRow[];
      const row = body.find((r) => r.student?.id === student.id);

      expect(row).toMatchObject({ present: 2, leave: 1, markedDays: 3, percentage: 67 });
    });

    it.each(['teacher', 'student'] as const)(
      'AC-09.1 a %s gets 403 on the monthly report endpoint (admin-only)',
      async (role) => {
        const { section } = await setupSection();
        const caller = await makeUser(role);

        await getMonthly(section.id, '2024-02', authFor(caller)).expect(403);
      },
    );

    it('AC-09.3 a student added to the section partway through the month is only counted for days with an actual recorded entry for them', async () => {
      const { section, teacher } = await setupSection();
      const [early1, early2] = await makeStudents(section.id, 2);
      const month = '2024-04';

      // Days before the late student joined: sessions exist for the section, but no entry was
      // ever recorded for them (the roster didn't include them yet at submission time).
      await seedSession(section.id, '2024-04-01', teacher.id, [
        { studentId: early1.id, status: 'present' },
        { studentId: early2.id, status: 'present' },
      ]);
      await seedSession(section.id, '2024-04-02', teacher.id, [
        { studentId: early1.id, status: 'present' },
        { studentId: early2.id, status: 'present' },
      ]);
      await seedSession(section.id, '2024-04-03', teacher.id, [
        { studentId: early1.id, status: 'present' },
        { studentId: early2.id, status: 'present' },
      ]);

      // Student joins the section partway through the month.
      const [late] = await makeStudents(section.id, 1);

      // Days after the late student joined: they now have real entries.
      await seedSession(section.id, '2024-04-04', teacher.id, [
        { studentId: early1.id, status: 'present' },
        { studentId: early2.id, status: 'present' },
        { studentId: late.id, status: 'present' },
      ]);
      await seedSession(section.id, '2024-04-05', teacher.id, [
        { studentId: early1.id, status: 'present' },
        { studentId: early2.id, status: 'present' },
        { studentId: late.id, status: 'absent' },
      ]);
      const admin = await makeUser('admin');

      const res = await getMonthly(section.id, month, authFor(admin)).expect(200);
      const body = res.body as MonthlyRow[];
      const lateRow = body.find((r) => r.student?.id === late.id);

      // Only the 2 days with a real entry for the late student are counted — not all 5 sessions
      // that exist in the section for the month.
      expect(lateRow).toMatchObject({
        present: 1,
        absent: 1,
        leave: 0,
        markedDays: 2,
        percentage: 50,
      });

      // The early students, who had entries on all 5 days, are unaffected by the late joiner.
      const early1Row = body.find((r) => r.student?.id === early1.id);
      expect(early1Row).toMatchObject({ present: 5, markedDays: 5, percentage: 100 });
    });
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { ClassesModule } from '../classes/classes.module.js';
import { UsersModule } from '../users/users.module.js';
import { AttendanceModule } from './attendance.module.js';

// Real Postgres, real signed JWTs, real guards. Everything carries a per-run prefix.
const PREFIX = `t036a-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;

type Student = { id: string; name: string };
type EntryStatus = 'present' | 'absent' | 'leave';

const todayStr = () => new Date().toISOString().slice(0, 10);

describe('GET /api/attendance/reports/daily — admin daily summary report (T-036, UC-08)', () => {
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

  /** Class + section owned by a fresh class teacher, with `n` enrolled students. */
  const setupOwned = async (n = 3) => {
    const klass = await makeClass();
    const teacher = await makeUser('teacher');
    const section = await makeSection(klass.id, teacher.id);
    const students = await makeStudents(section.id, n);
    return { klass, section, teacher, students };
  };

  const authFor = (user: { id: string; role: string }) => `Bearer ${tokenFor(user.role, user.id)}`;

  /** Seeds a session directly in the DB (bypasses the today-only teacher PUT). */
  const seedSession = (
    sectionId: string,
    dateStr: string,
    submittedById: string,
    students: Student[],
    overrides: Record<string, EntryStatus> = {},
  ) =>
    prisma.attendanceSession.create({
      data: {
        sectionId,
        date: new Date(`${dateStr}T00:00:00.000Z`),
        submittedById,
        entries: {
          create: students.map((s) => ({ studentId: s.id, status: overrides[s.id] ?? 'present' })),
        },
      },
    });

  const getDaily = (dateStr: string, auth: string) =>
    http().get(`/api/attendance/reports/daily?date=${dateStr}`).set('Authorization', auth);

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

  describe('UC-08 admin views daily attendance summary per class', () => {
    it('AC-08.1 a section with a recorded session for the selected date shows correct present/absent/leave counts', async () => {
      const { section, teacher, students } = await setupOwned(4);
      const date = todayStr();
      // 2 present, 1 absent, 1 leave.
      await seedSession(section.id, date, teacher.id, students, {
        [students[0].id]: 'present',
        [students[1].id]: 'present',
        [students[2].id]: 'absent',
        [students[3].id]: 'leave',
      });
      const admin = await makeUser('admin');

      const res = await getDaily(date, authFor(admin)).expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const row = (res.body as Array<{ section: { id: string } }>).find(
        (r) => r.section?.id === section.id,
      );
      expect(row).toBeDefined();
      expect(row).toMatchObject({
        section: { id: section.id },
        summary: { present: 2, absent: 1, leave: 1 },
      });
    });

    it('AC-08.1 two sections recorded on the same date each show their own counts, with no cross-contamination', async () => {
      const { section: sectionA, teacher: teacherA, students: studentsA } = await setupOwned(2);
      const { section: sectionB, teacher: teacherB, students: studentsB } = await setupOwned(3);
      const date = todayStr();
      // Section A: 1 present, 1 absent.
      await seedSession(sectionA.id, date, teacherA.id, studentsA, {
        [studentsA[0].id]: 'present',
        [studentsA[1].id]: 'absent',
      });
      // Section B: 3 present, 0 absent, 0 leave.
      await seedSession(sectionB.id, date, teacherB.id, studentsB, {
        [studentsB[0].id]: 'present',
        [studentsB[1].id]: 'present',
        [studentsB[2].id]: 'present',
      });
      const admin = await makeUser('admin');

      const res = await getDaily(date, authFor(admin)).expect(200);
      const body = res.body as Array<{ section: { id: string }; summary: unknown }>;

      const rowA = body.find((r) => r.section?.id === sectionA.id);
      const rowB = body.find((r) => r.section?.id === sectionB.id);
      expect(rowA).toMatchObject({ summary: { present: 1, absent: 1, leave: 0 } });
      expect(rowB).toMatchObject({ summary: { present: 3, absent: 0, leave: 0 } });
    });

    it.each(['teacher', 'student'] as const)(
      'AC-08.1 a %s gets 403 on the daily report endpoint (admin-only)',
      async (role) => {
        const caller = await makeUser(role);

        await getDaily(todayStr(), authFor(caller)).expect(403);
      },
    );

    it('UC-08-E2 with zero sections in the school, the daily report is an empty array and the endpoint does not crash', async () => {
      const admin = await makeUser('admin');
      // This edge case is about the whole school having zero sections (the endpoint summarizes
      // "every Section", not one scoped to this file's PREFIX). Every attendance spec file in this
      // suite cleans up its own PREFIX-scoped Class (which cascades to Section) in its own
      // afterEach, and backend/vitest.config.ts disables file parallelism specifically because
      // these specs share one real Postgres DB — so no other suite is concurrently creating
      // sections while this test runs. The explicit deleteMany makes that invariant exact
      // regardless of any stray leftovers from a prior failed run.
      //
      // Defense-in-depth: this deleteMany has no `where`, so it deletes every Section (and
      // cascading dependents) in whatever database `DATABASE_URL` points at. Refuse to proceed
      // unless the connected database's name looks like a test database (matches the `_test`
      // suffix convention in backend/.env, e.g. `school_management_test`), so a misconfigured
      // `DATABASE_URL` pointed at a shared/dev database fails loudly instead of being wiped.
      const dbName = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
      if (!/test/i.test(dbName)) {
        throw new Error(
          `Refusing to run UC-08-E2 (which deletes every Section in the database): ` +
            `DATABASE_URL's database name "${dbName}" does not look like a test database ` +
            `(expected it to contain "test", e.g. "school_management_test").`,
        );
      }
      await prisma.section.deleteMany({});

      const res = await getDaily(todayStr(), authFor(admin)).expect(200);

      expect(res.body).toEqual([]);
    });
  });
});

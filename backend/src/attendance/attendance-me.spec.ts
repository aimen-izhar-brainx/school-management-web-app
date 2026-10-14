import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { ClassesModule } from '../classes/classes.module.js';
import { UsersModule } from '../users/users.module.js';
import { AttendanceModule } from './attendance.module.js';

// Real Postgres, real signed JWTs, real guards.
//
// T-038: `GET /attendance/me?month=YYYY-MM` — a logged-in student's own monthly attendance
// (UC-10, UC-11). The route takes no student/section id parameter at all: the student id and
// section come only from `req.user.sub` (the JWT), so there is nothing for a client to override.
const PREFIX = `t038-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;

type EntryStatus = 'present' | 'absent' | 'leave';
type MeResponse = {
  section: { id: string; name: string } | null;
  entries: Array<{ date: string; status: EntryStatus }>;
  present: number;
  absent: number;
  leave: number;
  percentage: number | null;
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const dateKey = (iso: string) => iso.slice(0, 10);

describe('GET /api/attendance/me (T-038, UC-10 / UC-11)', () => {
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

  /** Class + section owned by a fresh class teacher. */
  const setupSection = async () => {
    const klass = await makeClass();
    const teacher = await makeUser('teacher');
    const section = await makeSection(klass.id, teacher.id);
    return { klass, section, teacher };
  };

  const authFor = (user: { id: string; role: string }) => `Bearer ${tokenFor(user.role, user.id)}`;

  /** Seeds a session directly in the DB, with exactly the given per-student entries (not
   * necessarily the full roster — used to simulate a day where a given student has no entry). */
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

  const getMe = (auth: string, month: string, extraQuery = '') =>
    http()
      .get(`/api/attendance/me?month=${month}${extraQuery}`)
      .set('Authorization', auth);

  const putAttendance = (sectionId: string, date: string, body: unknown, auth: string) =>
    http()
      .put(`/api/attendance/sections/${sectionId}/days/${date}`)
      .set('Authorization', auth)
      .send(body as object);
  const getAttendance = (sectionId: string, date: string, auth: string) =>
    http().get(`/api/attendance/sections/${sectionId}/days/${date}`).set('Authorization', auth);
  const patchAdmin = (sectionId: string, date: string, body: unknown, auth: string) =>
    http()
      .patch(`/api/attendance/admin/sections/${sectionId}/days/${date}`)
      .set('Authorization', auth)
      .send(body as object);
  const getAdmin = (sectionId: string, date: string, auth: string) =>
    http().get(`/api/attendance/admin/sections/${sectionId}/days/${date}`).set('Authorization', auth);
  const getDailyReport = (date: string, auth: string) =>
    http().get(`/api/attendance/reports/daily?date=${date}`).set('Authorization', auth);
  const getMonthlyReport = (sectionId: string, month: string, auth: string) =>
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

  describe('UC-10 student views own monthly attendance', () => {
    it('AC-10.1 given the student has marked days in the selected month, counts and percentage reflect only their own entries (not another student in the same section)', async () => {
      const { section, teacher } = await setupSection();
      const studentA = await makeUser('student', section.id);
      const studentB = await makeUser('student', section.id);
      const month = '2024-02';

      // Student A: 3 present, 1 absent -> 4 marked days, 75%.
      // Student B: the opposite, on the same days, to prove isolation.
      await seedSession(section.id, '2024-02-01', teacher.id, [
        { studentId: studentA.id, status: 'present' },
        { studentId: studentB.id, status: 'absent' },
      ]);
      await seedSession(section.id, '2024-02-02', teacher.id, [
        { studentId: studentA.id, status: 'present' },
        { studentId: studentB.id, status: 'absent' },
      ]);
      await seedSession(section.id, '2024-02-03', teacher.id, [
        { studentId: studentA.id, status: 'present' },
        { studentId: studentB.id, status: 'absent' },
      ]);
      await seedSession(section.id, '2024-02-04', teacher.id, [
        { studentId: studentA.id, status: 'absent' },
        { studentId: studentB.id, status: 'present' },
      ]);

      const res = await getMe(authFor(studentA), month).expect(200);
      const body = res.body as MeResponse;

      expect(body).toMatchObject({ present: 3, absent: 1, leave: 0, percentage: 75 });
      expect(body.entries).toHaveLength(4);
      const statusByDate = new Map(body.entries.map((e) => [dateKey(e.date), e.status]));
      expect(statusByDate.get('2024-02-01')).toBe('present');
      expect(statusByDate.get('2024-02-04')).toBe('absent');
    });

    it('AC-10.1 rounds a non-integer ratio correctly: 2 present out of 3 marked days = round(66.67) = 67, not floor(66)', async () => {
      const { section, teacher } = await setupSection();
      const student = await makeUser('student', section.id);
      const month = '2024-03';
      await seedSession(section.id, '2024-03-01', teacher.id, [{ studentId: student.id, status: 'present' }]);
      await seedSession(section.id, '2024-03-02', teacher.id, [{ studentId: student.id, status: 'present' }]);
      await seedSession(section.id, '2024-03-03', teacher.id, [{ studentId: student.id, status: 'leave' }]);

      const res = await getMe(authFor(student), month).expect(200);
      const body = res.body as MeResponse;
      expect(body).toMatchObject({ present: 2, leave: 1, percentage: 67 });
    });

    it('AC-10.3 given a day has no entry yet for the student, it is simply omitted from the list (not shown as a blank/incorrect status)', async () => {
      const { section, teacher } = await setupSection();
      const studentA = await makeUser('student', section.id);
      const studentB = await makeUser('student', section.id);
      const month = '2024-05';

      // Day 1: both students have entries.
      await seedSession(section.id, '2024-05-01', teacher.id, [
        { studentId: studentA.id, status: 'present' },
        { studentId: studentB.id, status: 'present' },
      ]);
      // Day 2: a session exists for the section, but studentA has no recorded entry on it
      // (e.g. joined after this session was submitted) — only studentB does.
      await seedSession(section.id, '2024-05-02', teacher.id, [
        { studentId: studentB.id, status: 'absent' },
      ]);

      const res = await getMe(authFor(studentA), month).expect(200);
      const body = res.body as MeResponse;

      expect(body.entries).toHaveLength(1);
      expect(dateKey(body.entries[0].date)).toBe('2024-05-01');
      expect(body.entries.some((e) => dateKey(e.date) === '2024-05-02')).toBe(false);
      // The day with no entry is not counted in the stats at all.
      expect(body).toMatchObject({ present: 1, absent: 0, leave: 0, percentage: 100 });
    });

    it('a student moved to a different section mid-month still sees their earlier entries recorded under the previous section', async () => {
      const { section: oldSection, teacher: oldTeacher } = await setupSection();
      const { section: newSection, teacher: newTeacher } = await setupSection();
      const student = await makeUser('student', oldSection.id);
      const month = '2024-04';

      // Entries recorded while the student was still in the old section.
      await seedSession(oldSection.id, '2024-04-01', oldTeacher.id, [
        { studentId: student.id, status: 'present' },
      ]);
      await seedSession(oldSection.id, '2024-04-02', oldTeacher.id, [
        { studentId: student.id, status: 'absent' },
      ]);

      // Student moves to a new section partway through the month.
      await prisma.user.update({ where: { id: student.id }, data: { sectionId: newSection.id } });

      // An entry recorded after the move, under the new section.
      await seedSession(newSection.id, '2024-04-15', newTeacher.id, [
        { studentId: student.id, status: 'present' },
      ]);

      const res = await getMe(authFor(student), month).expect(200);
      const body = res.body as MeResponse;

      // Current section reflects the move, but entries/counts still include the earlier
      // entries recorded under the previous section for this month.
      expect(body.section).toMatchObject({ id: newSection.id });
      expect(body.entries).toHaveLength(3);
      const statusByDate = new Map(body.entries.map((e) => [dateKey(e.date), e.status]));
      expect(statusByDate.get('2024-04-01')).toBe('present');
      expect(statusByDate.get('2024-04-02')).toBe('absent');
      expect(statusByDate.get('2024-04-15')).toBe('present');
      expect(body).toMatchObject({ present: 2, absent: 1, leave: 0, percentage: 67 });
    });
  });

  describe('UC-11 student cannot view another student\'s attendance', () => {
    it('AC-11.1 given Student A is logged in, only Student A\'s own entries are returned, with no parameter able to target another student', async () => {
      const { section, teacher } = await setupSection();
      const studentA = await makeUser('student', section.id);
      const studentB = await makeUser('student', section.id);
      const month = '2024-06';

      await seedSession(section.id, '2024-06-01', teacher.id, [
        { studentId: studentA.id, status: 'present' },
        { studentId: studentB.id, status: 'absent' },
      ]);
      await seedSession(section.id, '2024-06-02', teacher.id, [
        { studentId: studentA.id, status: 'absent' },
        { studentId: studentB.id, status: 'present' },
      ]);

      const baseline = await getMe(authFor(studentA), month).expect(200);
      // Attempt to override the target student via every plausible query-param name — the
      // endpoint has no such parameter, so these must be silently ignored.
      const withOverride = await getMe(
        authFor(studentA),
        month,
        `&studentId=${studentB.id}&userId=${studentB.id}&id=${studentB.id}&targetStudentId=${studentB.id}`,
      ).expect(200);

      expect(withOverride.body).toEqual(baseline.body);
      const body = withOverride.body as MeResponse;
      expect(body).toMatchObject({ present: 1, absent: 1 });
      // Never contains studentB's stats (which would be present:1,absent:1 too by symmetry here,
      // so assert directly against studentB's own call instead to prove no cross-contamination).
      const studentBRes = await getMe(authFor(studentB), month).expect(200);
      expect(studentBRes.body).not.toEqual(body);
    });

    it('AC-11.2 given Student A attempts to call the teacher-only or admin-only section/day endpoints directly, they receive 403', async () => {
      const { section } = await setupSection();
      const student = await makeUser('student', section.id);
      const auth = authFor(student);
      const date = todayStr();

      await putAttendance(section.id, date, { entries: [] }, auth).expect(403);
      await getAttendance(section.id, date, auth).expect(403);
      await patchAdmin(section.id, date, { entries: [] }, auth).expect(403);
      await getAdmin(section.id, date, auth).expect(403);
      await getDailyReport(date, auth).expect(403);
      await getMonthlyReport(section.id, '2024-01', auth).expect(403);
    });

    it('UC-11-E1 a newly created student account with no attendance entries yet gets 200 with an empty list, not an error', async () => {
      const { section } = await setupSection();
      const student = await makeUser('student', section.id);

      const res = await getMe(authFor(student), '2024-07').expect(200);
      const body = res.body as MeResponse;

      expect(body.section).toMatchObject({ id: section.id });
      expect(body.entries).toEqual([]);
      expect(body).toMatchObject({ present: 0, absent: 0, leave: 0, percentage: null });
    });
  });

  // Not a numbered AC in T-038's Definition of Done bullet list, but explicitly required by the
  // ticket's own Technical notes: a student with no section assigned must get 200 (not an error),
  // mirroring GET /timetable/me's AC-20.1 shape (`{ section: null, entries: [], ... }`).
  describe('student with no section assigned (ticket Technical notes; see timetable-me.spec.ts AC-20.1)', () => {
    it('a student with User.sectionId null gets 200 with section null, empty entries, zero counts and null percentage', async () => {
      const student = await makeUser('student'); // no sectionId

      const res = await getMe(authFor(student), '2024-08').expect(200);
      const body = res.body as MeResponse;

      expect(res.status).toBe(200);
      expect(body).toEqual({
        section: null,
        entries: [],
        present: 0,
        absent: 0,
        leave: 0,
        percentage: null,
      });
    });
  });

  describe('access control', () => {
    it('no token responds 401', async () => {
      await http().get('/api/attendance/me?month=2024-01').expect(401);
    });

    it.each(['teacher', 'admin'] as const)(
      'a %s (non-student role) gets 403, not the student response',
      async (role) => {
        const user = await makeUser(role);
        await getMe(authFor(user), '2024-01').expect(403);
      },
    );
  });
});

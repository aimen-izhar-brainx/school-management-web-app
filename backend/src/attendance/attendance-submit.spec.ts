import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { ClassesModule } from '../classes/classes.module.js';
import { UsersModule } from '../users/users.module.js';
import { AttendanceModule } from './attendance.module.js';

// Real Postgres, real signed JWTs, real guards. Everything carries a per-run prefix.
const PREFIX = `t032a-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;

type Student = { id: string; name: string };
type EntryStatus = 'present' | 'absent' | 'leave';

const todayStr = () => new Date().toISOString().slice(0, 10);

describe('PUT/GET /api/attendance/sections/:sectionId/days/:date — first submission (T-032, UC-01)', () => {
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
  const setupOwned = async (n = 3) => {
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
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe("UC-01 class teacher marks attendance for today", () => {
    it('AC-01.2 the saved statuses are shown when the teacher reloads (GET) after submitting', async () => {
      const { section, teacher, students } = await setupOwned(3);
      const auth = authFor(teacher);
      const overrides: Record<string, EntryStatus> = {
        [students[0].id]: 'absent',
        [students[1].id]: 'leave',
      };
      await putAttendance(
        section.id,
        todayStr(),
        { entries: rosterEntries(students, overrides) },
        auth,
      ).expect(200);

      const res = await getAttendance(section.id, todayStr(), auth).expect(200);
      const byId = new Map(
        (res.body.entries as { student: { id: string }; status: string }[]).map((e) => [
          e.student.id,
          e.status,
        ]),
      );
      expect(byId.get(students[0].id)).toBe('absent');
      expect(byId.get(students[1].id)).toBe('leave');
      expect(byId.get(students[2].id)).toBe('present');
    });

    it("AC-01.3 the stored session's submittedBy is the teacher and submittedAt is the current time", async () => {
      const { section, teacher, students } = await setupOwned(2);
      const auth = authFor(teacher);
      const before = Date.now();
      await putAttendance(section.id, todayStr(), { entries: rosterEntries(students) }, auth).expect(200);

      const res = await getAttendance(section.id, todayStr(), auth).expect(200);
      expect(res.body.submittedBy).toMatchObject({ id: teacher.id });
      const submittedAt = new Date(res.body.submittedAt).getTime();
      expect(submittedAt).toBeGreaterThanOrEqual(before - 1000);
      expect(submittedAt).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('UC-01-E2 double-clicking submit (two concurrent identical PUTs) creates exactly one session, no duplicate rows or error', async () => {
      const { section, teacher, students } = await setupOwned(4);
      const auth = authFor(teacher);
      const body = { entries: rosterEntries(students) };
      const results = await Promise.all([
        putAttendance(section.id, todayStr(), body, auth),
        putAttendance(section.id, todayStr(), body, auth),
      ]);
      for (const r of results) expect(r.status).toBeLessThan(300);

      const sessions = await prisma.attendanceSession.findMany({ where: { sectionId: section.id } });
      expect(sessions).toHaveLength(1);
      const entries = await prisma.attendanceEntry.findMany({ where: { sessionId: sessions[0].id } });
      expect(entries).toHaveLength(students.length);
    });

    it('UC-01-E4 no token responds 401 and creates nothing', async () => {
      const { section, students } = await setupOwned(2);
      await http()
        .put(`/api/attendance/sections/${section.id}/days/${todayStr()}`)
        .send({ entries: rosterEntries(students) })
        .expect(401);
      expect(await prisma.attendanceSession.count({ where: { sectionId: section.id } })).toBe(0);
    });

    it('UC-01-E4 an expired token responds 401 and creates nothing', async () => {
      const { section, teacher, students } = await setupOwned(2);
      const expired = ctx.jwt.sign(
        { sub: teacher.id, email: 'u@example.com', role: 'teacher' },
        { expiresIn: -10 },
      );
      await putAttendance(
        section.id,
        todayStr(),
        { entries: rosterEntries(students) },
        `Bearer ${expired}`,
      ).expect(401);
      expect(await prisma.attendanceSession.count({ where: { sectionId: section.id } })).toBe(0);
    });
  });
});

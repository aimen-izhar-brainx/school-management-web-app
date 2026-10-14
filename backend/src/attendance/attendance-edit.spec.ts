import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { ClassesModule } from '../classes/classes.module.js';
import { UsersModule } from '../users/users.module.js';
import { AttendanceModule } from './attendance.module.js';

// Real Postgres, real signed JWTs, real guards. Everything carries a per-run prefix.
const PREFIX = `t032b-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;

type Student = { id: string; name: string };
type EntryStatus = 'present' | 'absent' | 'leave';

function messageOf(body: { message?: string | string[] }): string {
  return Array.isArray(body.message) ? body.message.join(' | ') : String(body.message ?? '');
}

const dayOffset = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const todayStr = () => dayOffset(0);
const yesterdayStr = () => dayOffset(-1);

describe("PUT /api/attendance/sections/:sectionId/days/:date — same-day edit (T-032, UC-02)", () => {
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

  describe("UC-02 class teacher edits today's attendance before midnight", () => {
    it("AC-02.2 the teacher's same-day edit creates no audit log entry and GET exposes no audit/edit data", async () => {
      const { section, teacher, students } = await setupOwned(3);
      const auth = authFor(teacher);
      await putAttendance(section.id, todayStr(), { entries: rosterEntries(students) }, auth).expect(200);
      await putAttendance(
        section.id,
        todayStr(),
        { entries: rosterEntries(students, { [students[0].id]: 'absent' }) },
        auth,
      ).expect(200);

      const res = await getAttendance(section.id, todayStr(), auth).expect(200);
      // Ticket's documented M1 response shape — `edits` is always present but stays empty here;
      // the real audit log (populated by admin PATCH edits) lands in T-034.
      expect(Object.keys(res.body).sort()).toEqual([
        'edits',
        'entries',
        'locked',
        'submitted',
        'submittedAt',
        'submittedBy',
      ]);
      expect(res.body.edits).toEqual([]);

      // AttendanceEdit doesn't exist until T-034 (so there's nowhere to log to yet); once it
      // does exist, this asserts zero rows were written for the teacher's own same-day edit.
      const auditModel = (
        prisma as unknown as { attendanceEdit?: { findMany: (args: unknown) => Promise<unknown[]> } }
      ).attendanceEdit;
      if (auditModel) {
        const rows = await auditModel.findMany({ where: { session: { sectionId: section.id } } });
        expect(rows).toHaveLength(0);
      }
    });

    it("AC-02.3 the session's updatedAt reflects the latest save, not the first", async () => {
      const { section, teacher, students } = await setupOwned(2);
      const auth = authFor(teacher);
      await putAttendance(section.id, todayStr(), { entries: rosterEntries(students) }, auth).expect(200);
      const first = await prisma.attendanceSession.findUniqueOrThrow({
        where: { sectionId_date: { sectionId: section.id, date: new Date(todayStr()) } },
      });

      await new Promise((r) => setTimeout(r, 20));
      await putAttendance(
        section.id,
        todayStr(),
        { entries: rosterEntries(students, { [students[0].id]: 'leave' }) },
        auth,
      ).expect(200);
      const second = await prisma.attendanceSession.findUniqueOrThrow({ where: { id: first.id } });

      expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
    });

    it('UC-02-E1 editing a date that is no longer today is rejected with a clear "locked" error', async () => {
      const { section, teacher, students } = await setupOwned(2);
      const auth = authFor(teacher);
      // Seeded directly: the API itself can never create a non-today session.
      await prisma.attendanceSession.create({
        data: {
          sectionId: section.id,
          date: new Date(yesterdayStr()),
          submittedById: teacher.id,
          entries: { create: students.map((s) => ({ studentId: s.id, status: 'present' as const })) },
        },
      });

      const res = await putAttendance(
        section.id,
        yesterdayStr(),
        { entries: rosterEntries(students, { [students[0].id]: 'absent' }) },
        auth,
      ).expect(400);
      expect(messageOf(res.body).toLowerCase()).toContain('lock');

      // Nothing changed on the seeded yesterday session.
      const stillYesterday = await prisma.attendanceEntry.findMany({
        where: { session: { sectionId: section.id, date: new Date(yesterdayStr()) } },
      });
      expect(stillYesterday.every((e) => e.status === 'present')).toBe(true);
    });

    it('UC-02-E2 two near-simultaneous edits from the same teacher: last write wins, no crash, no duplicate rows', async () => {
      const { section, teacher, students } = await setupOwned(4);
      const auth = authFor(teacher);
      await putAttendance(section.id, todayStr(), { entries: rosterEntries(students) }, auth).expect(200);

      const allAbsent = {
        entries: rosterEntries(
          students,
          Object.fromEntries(students.map((s) => [s.id, 'absent' as EntryStatus])),
        ),
      };
      const allLeave = {
        entries: rosterEntries(
          students,
          Object.fromEntries(students.map((s) => [s.id, 'leave' as EntryStatus])),
        ),
      };
      const results = await Promise.all([
        putAttendance(section.id, todayStr(), allAbsent, auth),
        putAttendance(section.id, todayStr(), allLeave, auth),
      ]);
      for (const r of results) expect(r.status).toBeLessThan(300);

      const sessions = await prisma.attendanceSession.findMany({ where: { sectionId: section.id } });
      expect(sessions).toHaveLength(1);
      const entries = await prisma.attendanceEntry.findMany({ where: { sessionId: sessions[0].id } });
      expect(entries).toHaveLength(students.length);
      // Whole-request atomicity: final state matches exactly ONE of the two submissions, not a mix.
      const statuses = new Set(entries.map((e) => e.status));
      expect(statuses.size).toBe(1);
      expect(['absent', 'leave']).toContain([...statuses][0]);
    });

    it("UC-02-E3 an edit payload missing one student's status is rejected with a validation error naming that student", async () => {
      const { section, teacher, students } = await setupOwned(3);
      const auth = authFor(teacher);
      await putAttendance(section.id, todayStr(), { entries: rosterEntries(students) }, auth).expect(200);

      const missing = students[0];
      const incomplete = rosterEntries(students).filter((e) => e.studentId !== missing.id);
      const res = await putAttendance(section.id, todayStr(), { entries: incomplete }, auth).expect(400);
      const msg = messageOf(res.body);
      expect(msg.includes(missing.id) || msg.includes(missing.name)).toBe(true);

      // Rejected — the previous (complete) submission is untouched.
      const getRes = await getAttendance(section.id, todayStr(), auth).expect(200);
      expect(getRes.body.entries).toHaveLength(students.length);
    });

    it('a payload listing the same studentId twice is rejected with a 400 naming the duplicate, not a 500', async () => {
      const { section, teacher, students } = await setupOwned(3);
      const auth = authFor(teacher);
      await putAttendance(section.id, todayStr(), { entries: rosterEntries(students) }, auth).expect(200);

      const duplicated = students[0];
      const withDuplicate = [
        ...rosterEntries(students),
        { studentId: duplicated.id, status: 'absent' as EntryStatus },
      ];
      const res = await putAttendance(section.id, todayStr(), { entries: withDuplicate }, auth).expect(400);
      const msg = messageOf(res.body);
      expect(msg.includes(duplicated.id)).toBe(true);

      // Rejected — the previous (complete) submission is untouched.
      const getRes = await getAttendance(section.id, todayStr(), auth).expect(200);
      expect(getRes.body.entries).toHaveLength(students.length);
    });
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { ClassesModule } from '../classes/classes.module.js';
import { UsersModule } from '../users/users.module.js';
import { AttendanceModule } from './attendance.module.js';

// Real Postgres, real signed JWTs, real guards. Everything carries a per-run prefix.
const PREFIX = `t034a-${Date.now().toString(36)}-`;
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

describe('PATCH /api/attendance/admin/sections/:sectionId/days/:date — admin edit with audit log (T-034, UC-05)', () => {
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
  const rosterEntries = (students: Student[], overrides: Record<string, EntryStatus> = {}) =>
    students.map((s) => ({ studentId: s.id, status: overrides[s.id] ?? 'present' }));

  const putAttendance = (sectionId: string, date: string, body: unknown, auth: string) =>
    http()
      .put(`/api/attendance/sections/${sectionId}/days/${date}`)
      .set('Authorization', auth)
      .send(body as object);
  const patchAdmin = (sectionId: string, date: string, body: unknown, auth: string) =>
    http()
      .patch(`/api/attendance/admin/sections/${sectionId}/days/${date}`)
      .set('Authorization', auth)
      .send(body as object);
  const getAdmin = (sectionId: string, date: string, auth: string) =>
    http().get(`/api/attendance/admin/sections/${sectionId}/days/${date}`).set('Authorization', auth);

  /** Seeds a session directly in the DB (bypasses the today-only teacher PUT), for past-day tests. */
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
        date: new Date(dateStr),
        submittedById,
        entries: {
          create: students.map((s) => ({ studentId: s.id, status: overrides[s.id] ?? 'present' })),
        },
      },
    });

  const entriesFor = (sectionId: string, dateStr: string) =>
    prisma.attendanceEntry.findMany({ where: { session: { sectionId, date: new Date(dateStr) } } });

  /**
   * Reads audit rows for a section if the `AttendanceEdit` model exists yet (it doesn't, pre-T-034 —
   * this cast keeps the spec compiling today and lets it assert real rows once the model lands).
   */
  const auditRowsFor = async (sectionId: string) => {
    const model = (
      prisma as unknown as {
        attendanceEdit?: { findMany: (args: unknown) => Promise<Record<string, unknown>[]> };
      }
    ).attendanceEdit;
    if (!model) return undefined;
    return model.findMany({ where: { session: { sectionId } } });
  };

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

  describe('UC-05 admin edits attendance for any day, with audit log', () => {
    it('AC-05.1 admin changes a student status on a locked (past) day: new status persists and an audit entry is created', async () => {
      const { section, teacher, students } = await setupOwned(3);
      await seedSession(section.id, yesterdayStr(), teacher.id, students);
      const admin = await makeUser('admin');
      const changedStudent = students[0];

      await patchAdmin(
        section.id,
        yesterdayStr(),
        { entries: [{ studentId: changedStudent.id, status: 'absent' }] },
        authFor(admin),
      ).expect(200);

      const entries = await entriesFor(section.id, yesterdayStr());
      expect(entries.find((e) => e.studentId === changedStudent.id)?.status).toBe('absent');

      const rows = await auditRowsFor(section.id);
      expect(rows).toHaveLength(1);
      expect(rows?.[0]).toMatchObject({
        studentId: changedStudent.id,
        fromStatus: 'present',
        toStatus: 'absent',
        editedById: admin.id,
      });
    });

    it("AC-05.2 admin changes a status on today's attendance (already submitted by the class teacher): saved and an audit entry is created, unlike the teacher's own same-day edits", async () => {
      const { section, teacher, students } = await setupOwned(3);
      await putAttendance(
        section.id,
        todayStr(),
        { entries: rosterEntries(students) },
        authFor(teacher),
      ).expect(200);
      const admin = await makeUser('admin');
      const changedStudent = students[1];

      await patchAdmin(
        section.id,
        todayStr(),
        { entries: [{ studentId: changedStudent.id, status: 'leave' }] },
        authFor(admin),
      ).expect(200);

      const entries = await entriesFor(section.id, todayStr());
      expect(entries.find((e) => e.studentId === changedStudent.id)?.status).toBe('leave');

      const rows = await auditRowsFor(section.id);
      expect(rows).toHaveLength(1);
      expect(rows?.[0]).toMatchObject({
        fromStatus: 'present',
        toStatus: 'leave',
        editedById: admin.id,
      });
    });

    it('UC-05-E1 admin "edits" a student to the same status it already had: no audit entry is created', async () => {
      const { section, teacher, students } = await setupOwned(2);
      await seedSession(section.id, yesterdayStr(), teacher.id, students);
      const admin = await makeUser('admin');

      await patchAdmin(
        section.id,
        yesterdayStr(),
        { entries: [{ studentId: students[0].id, status: 'present' }] }, // unchanged — already 'present'
        authFor(admin),
      ).expect(200);

      const entries = await entriesFor(section.id, yesterdayStr());
      expect(entries.find((e) => e.studentId === students[0].id)?.status).toBe('present');

      const rows = await auditRowsFor(section.id);
      expect(rows).toHaveLength(0);
    });

    it('UC-05-E2 admin attempts to edit a section/date with no existing session: rejected with "not marked yet", nothing created', async () => {
      const { section, students } = await setupOwned(2);
      const admin = await makeUser('admin');

      const res = await patchAdmin(
        section.id,
        yesterdayStr(),
        { entries: [{ studentId: students[0].id, status: 'absent' }] },
        authFor(admin),
      );
      expect(res.status).toBe(404);
      expect(messageOf(res.body).toLowerCase()).toContain('not marked yet');
      expect(await prisma.attendanceSession.count({ where: { sectionId: section.id } })).toBe(0);
    });

    it('UC-05-E3 two admins editing the same day around the same time both apply, each creating its own audit row — no silently lost update', async () => {
      const { section, teacher, students } = await setupOwned(3);
      await seedSession(section.id, yesterdayStr(), teacher.id, students);
      const admin1 = await makeUser('admin');
      const admin2 = await makeUser('admin');
      const [studentA, studentB] = students;

      const results = await Promise.all([
        patchAdmin(
          section.id,
          yesterdayStr(),
          { entries: [{ studentId: studentA.id, status: 'absent' }] },
          authFor(admin1),
        ),
        patchAdmin(
          section.id,
          yesterdayStr(),
          { entries: [{ studentId: studentB.id, status: 'leave' }] },
          authFor(admin2),
        ),
      ]);
      for (const r of results) expect(r.status).toBe(200);

      // Neither admin's write silently clobbered the other's — both final statuses stick.
      const entries = await entriesFor(section.id, yesterdayStr());
      expect(entries.find((e) => e.studentId === studentA.id)?.status).toBe('absent');
      expect(entries.find((e) => e.studentId === studentB.id)?.status).toBe('leave');

      // Each admin's change produced its own audit row.
      const rows = await auditRowsFor(section.id);
      expect(rows).toHaveLength(2);
      const editors = new Set((rows ?? []).map((r) => r.editedById));
      expect(editors).toEqual(new Set([admin1.id, admin2.id]));
    });

    it('UC-05-E3 (same student) two admins editing the SAME student concurrently produce an accurate, sequential audit chain — not both claiming to start from the stale original read', async () => {
      const { section, teacher, students } = await setupOwned(2);
      await seedSession(section.id, yesterdayStr(), teacher.id, students);
      const admin1 = await makeUser('admin');
      const admin2 = await makeUser('admin');
      const [studentA] = students;

      // Both requests read `present` and race to update the SAME row to two different target
      // statuses. Whichever write lands second must be blocked by Postgres's row lock until the
      // first commits, then must re-read the row's now-current status rather than trusting its
      // stale pre-transaction read — otherwise its audit row would (incorrectly) claim
      // `fromStatus: present` too, even though the row was no longer `present` by the time its
      // write actually happened.
      const results = await Promise.all([
        patchAdmin(
          section.id,
          yesterdayStr(),
          { entries: [{ studentId: studentA.id, status: 'absent' }] },
          authFor(admin1),
        ),
        patchAdmin(
          section.id,
          yesterdayStr(),
          { entries: [{ studentId: studentA.id, status: 'leave' }] },
          authFor(admin2),
        ),
      ]);
      for (const r of results) expect(r.status).toBe(200);

      // The final persisted status is whichever write landed last — both outcomes are valid since
      // the two requests race; what matters is that exactly one of them "won" and the audit trail
      // accurately explains how we got there.
      const entries = await entriesFor(section.id, yesterdayStr());
      const finalStatus = entries.find((e) => e.studentId === studentA.id)?.status;
      expect(['absent', 'leave']).toContain(finalStatus);

      // Exactly 2 audit rows were written — no lost/merged update.
      const allRows = await auditRowsFor(section.id);
      const rows = (allRows ?? [])
        .filter((r) => r.studentId === studentA.id)
        .sort((a, b) => new Date(a.editedAt as string).getTime() - new Date(b.editedAt as string).getTime());
      expect(rows).toHaveLength(2);

      // The sequential chain is accurate regardless of which request's write landed first: the
      // first edit started from the true original value, and the second edit's `fromStatus`
      // equals the first edit's `toStatus` — never both showing `fromStatus: present`.
      const [first, second] = rows;
      expect(first.fromStatus).toBe('present');
      expect(second.fromStatus).toBe(first.toStatus);
      expect(second.toStatus).toBe(finalStatus);
      expect(new Set([first.toStatus, second.toStatus])).toEqual(new Set(['absent', 'leave']));

      // Both admins are represented, one per audit row.
      const editors = new Set(rows.map((r) => r.editedById));
      expect(editors).toEqual(new Set([admin1.id, admin2.id]));
    });

    it('GET /attendance/admin/.../days/:date returns the edit in `body.edits` with the expected shape, after a PATCH', async () => {
      const { section, teacher, students } = await setupOwned(2);
      await seedSession(section.id, yesterdayStr(), teacher.id, students);
      const admin = await makeUser('admin');
      const changedStudent = students[0];

      await patchAdmin(
        section.id,
        yesterdayStr(),
        { entries: [{ studentId: changedStudent.id, status: 'absent' }] },
        authFor(admin),
      ).expect(200);

      const res = await getAdmin(section.id, yesterdayStr(), authFor(admin)).expect(200);
      expect(res.body.edits).toHaveLength(1);
      expect(res.body.edits[0]).toMatchObject({
        studentId: changedStudent.id,
        fromStatus: 'present',
        toStatus: 'absent',
        editedById: admin.id,
      });
      expect(res.body.edits[0]).toHaveProperty('editedAt');
    });

    it('PATCH with a studentId not on this session\'s roster is rejected with a 400 naming it, and nothing changes', async () => {
      const { section, teacher, students } = await setupOwned(2);
      await seedSession(section.id, yesterdayStr(), teacher.id, students);
      const admin = await makeUser('admin');
      const outsider = await makeUser('student'); // not enrolled in this section at all

      const res = await patchAdmin(
        section.id,
        yesterdayStr(),
        { entries: [{ studentId: outsider.id, status: 'absent' }] },
        authFor(admin),
      );
      expect(res.status).toBe(400);
      expect(messageOf(res.body)).toContain(outsider.id);

      // Nothing changed and no audit row was written.
      const entries = await entriesFor(section.id, yesterdayStr());
      expect(entries.every((e) => e.status === 'present')).toBe(true);
      const rows = await auditRowsFor(section.id);
      expect(rows).toHaveLength(0);
    });

    it('a PATCH mixing a valid studentId with an unmatched one is rejected wholesale, so the valid change is not partially applied', async () => {
      const { section, teacher, students } = await setupOwned(2);
      await seedSession(section.id, yesterdayStr(), teacher.id, students);
      const admin = await makeUser('admin');
      const outsider = await makeUser('student');

      const res = await patchAdmin(
        section.id,
        yesterdayStr(),
        {
          entries: [
            { studentId: students[0].id, status: 'absent' },
            { studentId: outsider.id, status: 'absent' },
          ],
        },
        authFor(admin),
      );
      expect(res.status).toBe(400);
      expect(messageOf(res.body)).toContain(outsider.id);

      const entries = await entriesFor(section.id, yesterdayStr());
      expect(entries.every((e) => e.status === 'present')).toBe(true);
      const rows = await auditRowsFor(section.id);
      expect(rows).toHaveLength(0);
    });
  });
});

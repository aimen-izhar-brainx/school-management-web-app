import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { ClassesModule } from '../classes/classes.module.js';
import { UsersModule } from '../users/users.module.js';
import { AttendanceModule } from './attendance.module.js';

// Real Postgres, real signed JWTs, real guards. Everything carries a per-run prefix.
const PREFIX = `t034b-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;

type Student = { id: string; name: string };
type EntryStatus = 'present' | 'absent' | 'leave';

const todayStr = () => new Date().toISOString().slice(0, 10);

describe('Admin-only attendance endpoints — role & ownership (T-034, UC-07)', () => {
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
  const setupOwned = async (n = 2) => {
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
  const getAttendance = (sectionId: string, date: string, auth: string) =>
    http().get(`/api/attendance/sections/${sectionId}/days/${date}`).set('Authorization', auth);
  const patchAdmin = (sectionId: string, date: string, body: unknown, auth: string) =>
    http()
      .patch(`/api/attendance/admin/sections/${sectionId}/days/${date}`)
      .set('Authorization', auth)
      .send(body as object);
  const getAdmin = (sectionId: string, date: string, auth: string) =>
    http().get(`/api/attendance/admin/sections/${sectionId}/days/${date}`).set('Authorization', auth);

  const entriesFor = (sectionId: string, dateStr: string) =>
    prisma.attendanceEntry.findMany({ where: { session: { sectionId, date: new Date(dateStr) } } });

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

  describe('UC-07 non-admin blocked from admin-only attendance endpoints', () => {
    it.each(['teacher', 'student'] as const)(
      'AC-07.1 an unrelated %s gets 403 on the admin edit endpoint for any section, and nothing changes',
      async (role) => {
        const { section, teacher, students } = await setupOwned(2);
        await putAttendance(
          section.id,
          todayStr(),
          { entries: rosterEntries(students) },
          authFor(teacher),
        ).expect(200);
        const caller = await makeUser(role);

        await patchAdmin(
          section.id,
          todayStr(),
          { entries: [{ studentId: students[0].id, status: 'absent' }] },
          authFor(caller),
        ).expect(403);

        const entries = await entriesFor(section.id, todayStr());
        expect(entries.every((e) => e.status === 'present')).toBe(true);
      },
    );

    it("AC-07.1 even the section's own class teacher gets 403 on the admin edit endpoint (admin-only, not ownership-based), and nothing changes", async () => {
      const { section, teacher, students } = await setupOwned(2);
      await putAttendance(
        section.id,
        todayStr(),
        { entries: rosterEntries(students) },
        authFor(teacher),
      ).expect(200);

      await patchAdmin(
        section.id,
        todayStr(),
        { entries: [{ studentId: students[0].id, status: 'absent' }] },
        authFor(teacher),
      ).expect(403);

      const entries = await entriesFor(section.id, todayStr());
      expect(entries.every((e) => e.status === 'present')).toBe(true);
    });

    it("AC-07.2 a teacher who is not that section's class teacher gets 403 on the admin browse endpoint", async () => {
      const { section } = await setupOwned(2);
      const nonOwningTeacher = await makeUser('teacher');

      await getAdmin(section.id, todayStr(), authFor(nonOwningTeacher)).expect(403);
    });

    it("AC-07.2 even the section's own class teacher gets 403 on the admin browse endpoint (admin-only, not ownership-based)", async () => {
      const { section, teacher } = await setupOwned(2);

      await getAdmin(section.id, todayStr(), authFor(teacher)).expect(403);
    });

    it("UC-07-E1 a class teacher's own (M1) endpoint is unaffected: still 403s a non-owning teacher and 200s the owning teacher", async () => {
      const { section, teacher, students } = await setupOwned(2);
      const otherTeacher = await makeUser('teacher');

      await putAttendance(
        section.id,
        todayStr(),
        { entries: rosterEntries(students) },
        authFor(otherTeacher),
      ).expect(403);
      await putAttendance(
        section.id,
        todayStr(),
        { entries: rosterEntries(students) },
        authFor(teacher),
      ).expect(200);
      await getAttendance(section.id, todayStr(), authFor(teacher)).expect(200);
    });
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { ClassesModule } from '../classes/classes.module.js';
import { UsersModule } from '../users/users.module.js';
import { AttendanceModule } from './attendance.module.js';

// Real Postgres, real signed JWTs, real guards. Everything carries a per-run prefix.
const PREFIX = `t032c-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;

type Student = { id: string; name: string };
type EntryStatus = 'present' | 'absent' | 'leave';

const todayStr = () => new Date().toISOString().slice(0, 10);

describe('PUT/GET /api/attendance/sections/:sectionId/days/:date — ownership & role (T-032, UC-03)', () => {
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

  describe("UC-03 teacher blocked from marking a section they don't own", () => {
    it('AC-03.1 a subject teacher for the section (not its class teacher) gets 403 and nothing changes', async () => {
      const { section, students } = await setupOwned(2);
      const subject = await prisma.subject.create({ data: { name: label('subj') } });
      const subjectTeacher = await makeUser('teacher');
      await prisma.classSubject.create({
        data: { classId: section.classId, subjectId: subject.id, teacherId: subjectTeacher.id },
      });

      await putAttendance(
        section.id,
        todayStr(),
        { entries: rosterEntries(students) },
        authFor(subjectTeacher),
      ).expect(403);
      expect(await prisma.attendanceSession.count({ where: { sectionId: section.id } })).toBe(0);
    });

    it('AC-03.1 an unrelated teacher (no relation to the section at all) gets 403 and nothing changes', async () => {
      const { section, students } = await setupOwned(2);
      const unrelated = await makeUser('teacher');

      await putAttendance(
        section.id,
        todayStr(),
        { entries: rosterEntries(students) },
        authFor(unrelated),
      ).expect(403);
      expect(await prisma.attendanceSession.count({ where: { sectionId: section.id } })).toBe(0);
    });

    it.each(['admin', 'student'] as const)(
      'AC-03.2 %s gets 403 on the teacher-only mark-attendance endpoint and nothing changes',
      async (role) => {
        const { section, students } = await setupOwned(2);
        const caller = await makeUser(role);

        await putAttendance(
          section.id,
          todayStr(),
          { entries: rosterEntries(students) },
          authFor(caller),
        ).expect(403);
        expect(await prisma.attendanceSession.count({ where: { sectionId: section.id } })).toBe(0);
      },
    );

    it('UC-03-E1 a non-existent sectionId responds 404, not 403', async () => {
      const teacher = await makeUser('teacher');
      await putAttendance(
        'does-not-exist',
        todayStr(),
        { entries: [] },
        authFor(teacher),
      ).expect(404);
    });

    it('UC-03-E2 a section with no classTeacherId assigned yet rejects any teacher', async () => {
      const klass = await makeClass();
      const section = await makeSection(klass.id, null);
      const students = await makeStudents(section.id, 2);
      const anyTeacher = await makeUser('teacher');

      await putAttendance(
        section.id,
        todayStr(),
        { entries: rosterEntries(students) },
        authFor(anyTeacher),
      ).expect(403);
      expect(await prisma.attendanceSession.count({ where: { sectionId: section.id } })).toBe(0);
    });
  });
});

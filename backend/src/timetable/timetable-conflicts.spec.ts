import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { ClassesModule } from '../classes/classes.module.js';
import { PeriodsModule } from '../periods/periods.module.js';
import { SubjectsModule } from '../subjects/subjects.module.js';
import { UsersModule } from '../users/users.module.js';
import { TimetableModule } from './timetable.module.js';

// Real Postgres, real signed JWTs, real guards. Everything carries a per-run prefix.
const PREFIX = `t022-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;

type Grid = { entries: { periodId: string; dayOfWeek: string; teacher: { id: string } }[] };

describe('Timetable teacher conflicts (T-022)', () => {
  let ctx: DbTestApp;
  let http: DbTestApp['http'];
  let adminAuth: DbTestApp['adminAuth'];
  let prisma: DbTestApp['prisma'];
  let seq = 0;

  const label = (l = 'x') => `${PREFIX}${l}-${++seq}`;
  const makeClass = (name = label('c')) => prisma.class.create({ data: { name } });
  const makeSection = (classId: string, name = label('s')) =>
    prisma.section.create({ data: { name, classId } });
  const makeSubject = () => prisma.subject.create({ data: { name: label('subj') } });
  const makeTeacher = () =>
    prisma.user.create({
      data: {
        name: `${PREFIX}teacher-${++seq}`,
        email: `teacher-${seq}${EMAIL_SUFFIX}`,
        passwordHash: 'not-a-real-hash',
        role: 'teacher',
      },
    });

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

  /** A class (optionally named) with one section (optionally named), a subject taught by `teacher`. */
  const setup = async (opts: { className?: string; sectionName?: string; teacherId?: string } = {}) => {
    const klass = await makeClass(opts.className);
    const section = await makeSection(klass.id, opts.sectionName);
    const subject = await makeSubject();
    const teacher = opts.teacherId ? { id: opts.teacherId } : await makeTeacher();
    await assign(klass.id, subject.id, teacher.id);
    return { klass, section, subject, teacherId: teacher.id };
  };

  const place = (sectionId: string, subjectId: string, periodId = 'period-1', day = 'mon') =>
    http()
      .put(`/api/sections/${sectionId}/timetable/${periodId}/${day}`)
      .set('Authorization', adminAuth())
      .send({ subjectId });
  const grid = async (sectionId: string) =>
    (
      await http()
        .get(`/api/sections/${sectionId}/timetable`)
        .set('Authorization', adminAuth())
        .expect(200)
    ).body as Grid;
  const conflictMsg = (l: string) => `Teacher is already scheduled for ${l} at this time.`;

  beforeAll(async () => {
    ctx = await createTestApp({
      imports: [UsersModule, ClassesModule, SubjectsModule, PeriodsModule, TimetableModule],
    });
    ({ http, adminAuth, prisma } = ctx);
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

  describe('UC-14 conflict detection', () => {
    it('AC-14.1 rejects with 400 and the exact "Grade 5-A" message, and does not save', async () => {
      const a = await setup({ className: `${PREFIX}Grade 5`, sectionName: 'A' });
      const b = await setup({
        className: `${PREFIX}Grade 6`,
        sectionName: 'A',
        teacherId: a.teacherId,
      });
      await place(a.section.id, a.subject.id).expect(200);

      const res = await place(b.section.id, b.subject.id).expect(400);
      expect(res.body.message).toBe(conflictMsg(`${PREFIX}Grade 5-A`));
      expect(res.body.conflict).toMatchObject({
        sectionId: a.section.id,
        sectionLabel: `${PREFIX}Grade 5-A`,
      });

      expect(await prisma.timetableEntry.findMany({ where: { sectionId: b.section.id } })).toHaveLength(0);
      expect((await grid(b.section.id)).entries).toHaveLength(0);
    });

    it('AC-14.2 Section A grid is unchanged after the rejection', async () => {
      const a = await setup({ className: `${PREFIX}Grade 5`, sectionName: 'A' });
      const b = await setup({
        className: `${PREFIX}Grade 6`,
        sectionName: 'A',
        teacherId: a.teacherId,
      });
      await place(a.section.id, a.subject.id).expect(200);
      const before = await grid(a.section.id);

      await place(b.section.id, b.subject.id).expect(400);

      const after = await grid(a.section.id);
      expect(after).toEqual(before);
      expect(after.entries).toHaveLength(1);
      expect(after.entries[0]).toMatchObject({
        periodId: 'period-1',
        dayOfWeek: 'mon',
        teacher: { id: a.teacherId },
      });
    });

    it('AC-14.3 two different teachers in different sections at the same slot both succeed', async () => {
      const a = await setup();
      const b = await setup();
      expect(a.teacherId).not.toBe(b.teacherId);
      await place(a.section.id, a.subject.id).expect(200);
      await place(b.section.id, b.subject.id).expect(200);
      expect((await grid(a.section.id)).entries).toHaveLength(1);
      expect((await grid(b.section.id)).entries).toHaveLength(1);
    });

    it('same teacher at a different period or day in another section is not a conflict', async () => {
      const a = await setup();
      const b = await setup({ teacherId: a.teacherId });
      await place(a.section.id, a.subject.id, 'period-1', 'mon').expect(200);
      await place(b.section.id, b.subject.id, 'period-2', 'mon').expect(200);
      await place(b.section.id, b.subject.id, 'period-1', 'tue').expect(200);
    });
  });

  describe('UC-14-E1 concurrent bookings', () => {
    it(
      'UC-14-E1 concurrent PUTs for the same teacher/slot: exactly one 200, one 400 conflict, never 500',
      async () => {
        for (let i = 0; i < 8; i++) {
          const a = await setup({ className: `${PREFIX}Grade 5-${i}`, sectionName: 'A' });
          const b = await setup({
            className: `${PREFIX}Grade 6-${i}`,
            sectionName: 'A',
            teacherId: a.teacherId,
          });

          const results = await Promise.all([
            place(a.section.id, a.subject.id, 'period-3', 'wed'),
            place(b.section.id, b.subject.id, 'period-3', 'wed'),
          ]);
          const tag = `iter ${i}: ${JSON.stringify(results.map((r) => [r.status, r.body]))}`;

          for (const r of results) expect(r.status, tag).toBeLessThan(500);
          const ok = results.filter((r) => r.status === 200);
          const bad = results.filter((r) => r.status === 400);
          expect(ok, tag).toHaveLength(1);
          expect(bad, tag).toHaveLength(1);

          const winnerLabel = ok[0] === results[0] ? `${PREFIX}Grade 5-${i}-A` : `${PREFIX}Grade 6-${i}-A`;
          expect(bad[0].body.message, tag).toBe(conflictMsg(winnerLabel));

          const rows = await prisma.timetableEntry.findMany({
            where: { teacherId: a.teacherId, periodId: 'period-3', dayOfWeek: 'wed' },
          });
          expect(rows, tag).toHaveLength(1);
        }
      },
      60_000,
    );

    it(
      'UC-14-E1 concurrent PUTs to the same section/period/day both return 200 and leave exactly one row',
      async () => {
        for (let i = 0; i < 8; i++) {
          const klass = await makeClass(`${PREFIX}Same-${i}`);
          const section = await makeSection(klass.id, 'A');
          const s1 = await makeSubject();
          const s2 = await makeSubject();
          const t1 = await makeTeacher();
          const t2 = await makeTeacher();
          await assign(klass.id, s1.id, t1.id);
          await assign(klass.id, s2.id, t2.id);

          const results = await Promise.all([
            place(section.id, s1.id, 'period-5', 'fri'),
            place(section.id, s2.id, 'period-5', 'fri'),
          ]);
          const tag = `iter ${i}: ${JSON.stringify(results.map((r) => [r.status, r.body]))}`;
          for (const r of results) expect(r.status, tag).toBe(200);

          const rows = await prisma.timetableEntry.findMany({
            where: { sectionId: section.id, periodId: 'period-5', dayOfWeek: 'fri' },
          });
          expect(rows, tag).toHaveLength(1);
          expect([s1.id, s2.id], tag).toContain(rows[0].subjectId);
        }
      },
      60_000,
    );

    it('UC-14-E1 the DB has a unique constraint on (teacherId, periodId, dayOfWeek): second create is P2002', async () => {
      const a = await setup();
      const b = await setup({ teacherId: a.teacherId });
      const data = { periodId: 'period-4', dayOfWeek: 'thu' as const, teacherId: a.teacherId };
      await prisma.timetableEntry.create({
        data: { ...data, sectionId: a.section.id, subjectId: a.subject.id },
      });
      await expect(
        prisma.timetableEntry.create({
          data: { ...data, sectionId: b.section.id, subjectId: b.subject.id },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('UC-14-E2 replacing an existing slot', () => {
    it('UC-14-E2 re-PUT on the same section/slot with the same teacher does not conflict with itself', async () => {
      const a = await setup();
      await place(a.section.id, a.subject.id).expect(200);
      await place(a.section.id, a.subject.id).expect(200);
      expect(await prisma.timetableEntry.findMany({ where: { sectionId: a.section.id } })).toHaveLength(1);
    });

    it('UC-14-E2 replacing with a different subject taught by the same teacher succeeds', async () => {
      const a = await setup();
      const second = await makeSubject();
      await assign(a.klass.id, second.id, a.teacherId);
      await place(a.section.id, a.subject.id).expect(200);

      const res = await place(a.section.id, second.id).expect(200);
      expect(res.body.subject.id).toBe(second.id);
      expect(res.body.teacher.id).toBe(a.teacherId);
      const rows = await prisma.timetableEntry.findMany({ where: { sectionId: a.section.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].subjectId).toBe(second.id);
    });
  });

  describe('UC-23 class deletion frees timetable', () => {
    const deleteClass = (id: string) =>
      http().delete(`/api/classes/${id}`).set('Authorization', adminAuth()).expect(204);

    it("AC-23.2 deleting a class removes its sections' timetable entries", async () => {
      const a = await setup();
      await place(a.section.id, a.subject.id, 'period-1', 'mon').expect(200);
      await place(a.section.id, a.subject.id, 'period-2', 'mon').expect(200);
      expect(await prisma.timetableEntry.count({ where: { sectionId: a.section.id } })).toBe(2);

      await deleteClass(a.klass.id);

      expect(await prisma.timetableEntry.count({ where: { sectionId: a.section.id } })).toBe(0);
      expect(await prisma.timetableEntry.count({ where: { teacherId: a.teacherId } })).toBe(0);
      expect(await prisma.section.findMany({ where: { classId: a.klass.id } })).toHaveLength(0);
      await http()
        .get(`/api/sections/${a.section.id}/timetable`)
        .set('Authorization', adminAuth())
        .expect(404);
    });

    it('AC-23.4 after deleting a class, its teacher can be booked at that slot in another class', async () => {
      const a = await setup();
      const b = await setup({ teacherId: a.teacherId });
      await place(a.section.id, a.subject.id).expect(200);
      // Sanity: slot is blocked while class A exists.
      await place(b.section.id, b.subject.id).expect(400);

      await deleteClass(a.klass.id);

      const res = await place(b.section.id, b.subject.id).expect(200);
      expect(res.body.teacher.id).toBe(a.teacherId);
      expect((await grid(b.section.id)).entries).toHaveLength(1);
    });
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { ClassesModule } from '../classes/classes.module.js';
import { PeriodsModule } from '../periods/periods.module.js';
import { SubjectsModule } from '../subjects/subjects.module.js';
import { UsersModule } from '../users/users.module.js';
import { TimetableModule } from './timetable.module.js';

// Real Postgres, real signed JWTs, real guards. Everything carries a per-run prefix.
// Periods are pre-seeded by migration (fixed ids) and are never created/deleted here.
const PREFIX = `t021-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;
const NO_TEACHER = 'Assign a teacher to this subject first.';
const HAS_ENTRIES = 'This subject has timetable entries for this class. Remove them first.';

type Entry = {
  id: string;
  periodId: string;
  dayOfWeek: string;
  subject: { id: string; name: string };
  teacher: { id: string; name: string };
};
type Grid = { periods: { id: string; isBreak: boolean }[]; entries: Entry[] };

describe('Timetable API (T-021)', () => {
  let ctx: DbTestApp;
  let http: DbTestApp['http'];
  let tokenFor: DbTestApp['tokenFor'];
  let adminAuth: DbTestApp['adminAuth'];
  let prisma: DbTestApp['prisma'];
  let seq = 0;

  const label = (l = 'x') => `${PREFIX}${l}-${++seq}`;

  const makeClass = () => prisma.class.create({ data: { name: label('c') } });
  const makeSection = (classId: string) =>
    prisma.section.create({ data: { name: label('s'), classId } });
  const makeSubject = () => prisma.subject.create({ data: { name: label('subj') } });
  const makeUser = (role: 'teacher' | 'student' | 'admin' = 'teacher') =>
    prisma.user.create({
      data: {
        name: `${PREFIX}${role}-${++seq}`,
        email: `${role}-${seq}${EMAIL_SUFFIX}`,
        passwordHash: 'not-a-real-hash',
        role,
      },
    });

  /** Assigns a catalog subject to a class via the API, optionally with a teacher. */
  const assign = async (classId: string, subjectId: string, teacherId?: string) => {
    const res = await http()
      .post(`/api/classes/${classId}/subjects`)
      .set('Authorization', adminAuth())
      .send({ subjectId })
      .expect(201);
    const id = res.body.id as string;
    if (teacherId) {
      await http()
        .patch(`/api/classes/${classId}/subjects/${id}/teacher`)
        .set('Authorization', adminAuth())
        .send({ teacherId })
        .expect(200);
    }
    return id;
  };

  /** A class with one section and one subject (with teacher) assigned. */
  const setup = async () => {
    const klass = await makeClass();
    const section = await makeSection(klass.id);
    const subject = await makeSubject();
    const teacher = await makeUser('teacher');
    const classSubjectId = await assign(klass.id, subject.id, teacher.id);
    return { klass, section, subject, teacher, classSubjectId };
  };

  const slot = (sectionId: string, periodId = 'period-1', day = 'mon') =>
    `/api/sections/${sectionId}/timetable/${periodId}/${day}`;
  const place = (
    sectionId: string,
    subjectId: string,
    periodId = 'period-1',
    day = 'mon',
    auth = adminAuth(),
  ) => http().put(slot(sectionId, periodId, day)).set('Authorization', auth).send({ subjectId });
  const clear = (sectionId: string, periodId = 'period-1', day = 'mon', auth = adminAuth()) =>
    http().delete(slot(sectionId, periodId, day)).set('Authorization', auth);
  const grid = async (sectionId: string) => {
    const res = await http()
      .get(`/api/sections/${sectionId}/timetable`)
      .set('Authorization', adminAuth())
      .expect(200);
    return res.body as Grid;
  };
  const dbEntries = (sectionId: string) => prisma.timetableEntry.findMany({ where: { sectionId } });

  beforeAll(async () => {
    ctx = await createTestApp({
      imports: [UsersModule, ClassesModule, SubjectsModule, PeriodsModule, TimetableModule],
    });
    ({ http, tokenFor, adminAuth, prisma } = ctx);
  });

  afterEach(async () => {
    // Classes cascade to sections and their entries; subjects/users go after.
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

  describe('UC-13 place a subject in a slot', () => {
    it('AC-13.1 persists the slot with subject and teacher, visible after reload', async () => {
      const { section, subject, teacher } = await setup();
      const res = await place(section.id, subject.id, 'period-2', 'tue').expect(200);
      expect(res.body.subject).toMatchObject({ id: subject.id, name: subject.name });
      expect(res.body.teacher).toMatchObject({ id: teacher.id, name: teacher.name });
      expect(res.body.periodId).toBe('period-2');
      expect(res.body.dayOfWeek).toBe('tue');

      const { entries } = await grid(section.id);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        periodId: 'period-2',
        dayOfWeek: 'tue',
        subject: { id: subject.id },
        teacher: { id: teacher.id },
      });
    });

    it('AC-13.2 valid-subject list for a slot is the class subjects only, not the catalog', async () => {
      const { klass, subject } = await setup();
      const other = await makeSubject();
      const list = await http()
        .get(`/api/classes/${klass.id}/subjects`)
        .set('Authorization', adminAuth())
        .expect(200);
      const ids = (list.body as { subject: { id: string } }[]).map((c) => c.subject.id);
      expect(ids).toContain(subject.id);
      expect(ids).not.toContain(other.id);
    });

    it('AC-13.2 placing a catalog subject that is not on the class is rejected with 400', async () => {
      const { section } = await setup();
      const other = await makeSubject();
      await place(section.id, other.id).expect(400);
      expect(await dbEntries(section.id)).toHaveLength(0);
    });

    it('AC-13.3 a class-subject with no teacher is rejected with 400 and nothing is saved', async () => {
      const klass = await makeClass();
      const section = await makeSection(klass.id);
      const subject = await makeSubject();
      await assign(klass.id, subject.id); // no teacher
      const res = await place(section.id, subject.id).expect(400);
      expect(JSON.stringify(res.body.message)).toContain(NO_TEACHER);
      expect(await dbEntries(section.id)).toHaveLength(0);
      expect((await grid(section.id)).entries).toHaveLength(0);
    });

    it('UC-13-E1 existing entries keep the original teacher after the class-subject teacher changes', async () => {
      const { klass, section, subject, teacher, classSubjectId } = await setup();
      const newTeacher = await makeUser('teacher');
      await place(section.id, subject.id).expect(200);

      await http()
        .patch(`/api/classes/${klass.id}/subjects/${classSubjectId}/teacher`)
        .set('Authorization', adminAuth())
        .send({ teacherId: newTeacher.id })
        .expect(200);

      const { entries } = await grid(section.id);
      expect(entries).toHaveLength(1);
      expect(entries[0].teacher.id).toBe(teacher.id);
      expect(entries[0].teacher.id).not.toBe(newTeacher.id);
    });

    it('UC-13-E2 the same subject can be placed in several slots of one section', async () => {
      const { section, subject } = await setup();
      await place(section.id, subject.id, 'period-1', 'mon').expect(200);
      await place(section.id, subject.id, 'period-2', 'mon').expect(200);
      await place(section.id, subject.id, 'period-1', 'wed').expect(200);
      expect((await grid(section.id)).entries).toHaveLength(3);
    });

    it('PUT on an existing slot replaces the subject and keeps one row per slot', async () => {
      const { klass, section, subject } = await setup();
      const second = await makeSubject();
      const teacher2 = await makeUser('teacher');
      await assign(klass.id, second.id, teacher2.id);

      await place(section.id, subject.id).expect(200);
      const res = await place(section.id, second.id).expect(200);
      expect(res.body.subject.id).toBe(second.id);
      expect(res.body.teacher.id).toBe(teacher2.id);

      const { entries } = await grid(section.id);
      expect(entries).toHaveLength(1);
      expect(entries[0].subject.id).toBe(second.id);
      expect(await dbEntries(section.id)).toHaveLength(1);
    });
  });

  describe('UC-15 clear a slot', () => {
    it('AC-15.1 clearing a filled slot removes it and the grid shows it empty', async () => {
      const { section, subject } = await setup();
      await place(section.id, subject.id).expect(200);
      await clear(section.id).expect(204);
      expect((await grid(section.id)).entries).toHaveLength(0);
      expect(await dbEntries(section.id)).toHaveLength(0);
    });

    it("AC-15.2 after clearing, the same teacher can be placed in another section's same slot", async () => {
      const { klass, section, subject, teacher } = await setup();
      const section2 = await makeSection(klass.id);
      await place(section.id, subject.id).expect(200);
      await clear(section.id).expect(204);

      const res = await place(section2.id, subject.id).expect(200);
      expect(res.body.teacher.id).toBe(teacher.id);
      expect((await grid(section2.id)).entries).toHaveLength(1);
    });

    it('UC-15-E1 clearing an already-empty slot is a no-op returning 204', async () => {
      const { section } = await setup();
      await clear(section.id, 'period-3', 'fri').expect(204);
      await clear(section.id, 'period-3', 'fri').expect(204);
    });
  });

  describe('UC-16 view the grid', () => {
    it('AC-16.1 a section with no entries returns all 7 periods in order and no entries', async () => {
      const { section } = await setup();
      const body = await grid(section.id);
      expect(body.periods.map((p) => p.id)).toEqual([
        'period-1',
        'period-2',
        'period-3',
        'recess',
        'period-4',
        'period-5',
        'period-6',
      ]);
      expect(body.periods.find((p) => p.id === 'recess')?.isBreak).toBe(true);
      expect(body.entries).toEqual([]);
    });

    it('AC-16.1 an unknown section responds 404', async () => {
      await http()
        .get('/api/sections/does-not-exist/timetable')
        .set('Authorization', adminAuth())
        .expect(404);
    });

    it('AC-16.2 each entry includes subject name and teacher name', async () => {
      const { section, subject, teacher } = await setup();
      await place(section.id, subject.id, 'period-4', 'thu').expect(200);
      const { entries } = await grid(section.id);
      expect(entries).toHaveLength(1);
      expect(entries[0].subject.name).toBe(subject.name);
      expect(entries[0].teacher.name).toBe(teacher.name);
    });

    it('AC-16.2 any authenticated role (teacher, student) can fetch the grid', async () => {
      const { section } = await setup();
      for (const role of ['teacher', 'student']) {
        await http()
          .get(`/api/sections/${section.id}/timetable`)
          .set('Authorization', `Bearer ${tokenFor(role)}`)
          .expect(200);
      }
    });
  });

  describe('UC-17 role enforcement', () => {
    it.each(['teacher', 'student'])(
      'AC-17.1 %s gets 403 on PUT and DELETE and no data changes',
      async (role) => {
        const { section, subject } = await setup();
        const auth = `Bearer ${tokenFor(role)}`;

        await place(section.id, subject.id, 'period-1', 'mon', auth).expect(403);
        expect(await dbEntries(section.id)).toHaveLength(0);

        await place(section.id, subject.id).expect(200);
        await clear(section.id, 'period-1', 'mon', auth).expect(403);
        expect(await dbEntries(section.id)).toHaveLength(1);
      },
    );

    it('UC-17-E1 no token responds 401 on GET, PUT and DELETE', async () => {
      const { section, subject } = await setup();
      await http().get(`/api/sections/${section.id}/timetable`).expect(401);
      await http().put(slot(section.id)).send({ subjectId: subject.id }).expect(401);
      await http().delete(slot(section.id)).expect(401);
      expect(await dbEntries(section.id)).toHaveLength(0);
    });

    it('UC-17-E1 an expired token responds 401 on GET, PUT and DELETE', async () => {
      const { section, subject } = await setup();
      const expired = ctx.jwt.sign(
        { sub: 'x', email: 'u@example.com', role: 'admin' },
        { expiresIn: -10 },
      );
      const auth = `Bearer ${expired}`;
      await http().get(`/api/sections/${section.id}/timetable`).set('Authorization', auth).expect(401);
      await place(section.id, subject.id, 'period-1', 'mon', auth).expect(401);
      await clear(section.id, 'period-1', 'mon', auth).expect(401);
    });
  });

  describe('cascade and removal guards', () => {
    it('AC-07.3 deleting the section deletes its timetable entries', async () => {
      const { klass, section, subject } = await setup();
      await place(section.id, subject.id, 'period-1', 'mon').expect(200);
      await place(section.id, subject.id, 'period-2', 'mon').expect(200);
      expect(await dbEntries(section.id)).toHaveLength(2);

      await http()
        .delete(`/api/classes/${klass.id}/sections/${section.id}`)
        .set('Authorization', adminAuth())
        .expect(204);

      expect(await dbEntries(section.id)).toHaveLength(0);
    });

    it('UC-10-E2 removing a class-subject used by timetable entries is blocked with 400, then allowed after clearing', async () => {
      const { klass, section, subject, classSubjectId } = await setup();
      await place(section.id, subject.id).expect(200);

      const res = await http()
        .delete(`/api/classes/${klass.id}/subjects/${classSubjectId}`)
        .set('Authorization', adminAuth())
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain(HAS_ENTRIES);
      expect(await prisma.classSubject.findMany({ where: { classId: klass.id } })).toHaveLength(1);
      expect(await dbEntries(section.id)).toHaveLength(1);

      await clear(section.id).expect(204);
      await http()
        .delete(`/api/classes/${klass.id}/subjects/${classSubjectId}`)
        .set('Authorization', adminAuth())
        .expect(204);
      expect(await prisma.classSubject.findMany({ where: { classId: klass.id } })).toHaveLength(0);
    });

    it(
      'UC-10-E2 concurrent PUT and class-subject DELETE never leave an entry without its class-subject',
      async () => {
        const ITERATIONS = 8;
        const outcomes = { placed: 0, removed: 0 };

        for (let i = 0; i < ITERATIONS; i++) {
          // Fresh class-subject WITH a teacher and no entries yet.
          const { klass, section, subject, classSubjectId } = await setup();

          const [putRes, delRes] = await Promise.all([
            place(section.id, subject.id),
            http()
              .delete(`/api/classes/${klass.id}/subjects/${classSubjectId}`)
              .set('Authorization', adminAuth()),
          ]);

          // No 500s, ever.
          expect(putRes.status, `iter ${i} PUT body: ${JSON.stringify(putRes.body)}`).toBeLessThan(500);
          expect(delRes.status, `iter ${i} DELETE body: ${JSON.stringify(delRes.body)}`).toBeLessThan(500);

          const entries = await dbEntries(section.id);
          const classSubjects = await prisma.classSubject.findMany({
            where: { classId: klass.id, subjectId: subject.id },
          });

          // Core invariant: never an entry for section+subject while the ClassSubject is gone.
          if (entries.length > 0) expect(classSubjects, `iter ${i} orphaned entry`).toHaveLength(1);

          if (putRes.status === 200) {
            // (a) PUT won: DELETE is blocked and both rows exist.
            expect(delRes.status, `iter ${i} (a)`).toBe(400);
            expect(JSON.stringify(delRes.body.message)).toContain(HAS_ENTRIES);
            expect(classSubjects).toHaveLength(1);
            expect(entries).toHaveLength(1);
            expect(entries[0].subjectId).toBe(subject.id);
            outcomes.placed++;
          } else {
            // (b) DELETE won: PUT rejected, class-subject removed, no entry.
            expect(delRes.status, `iter ${i} (b)`).toBe(204);
            expect(putRes.status, `iter ${i} (b)`).toBe(400);
            expect(classSubjects).toHaveLength(0);
            expect(entries).toHaveLength(0);
            outcomes.removed++;
          }
        }

        expect(outcomes.placed + outcomes.removed).toBe(ITERATIONS);
      },
      60_000,
    );
  });
});

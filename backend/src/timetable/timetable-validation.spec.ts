import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { ClassesModule } from '../classes/classes.module.js';
import { PeriodsModule } from '../periods/periods.module.js';
import { SubjectsModule } from '../subjects/subjects.module.js';
import { UsersModule } from '../users/users.module.js';
import { TimetableModule } from './timetable.module.js';

// Real Postgres, real signed JWTs, real guards. Everything carries a per-run prefix.
const PREFIX = `t030-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;
const BREAK_MSG = 'Cannot schedule a subject during a break.';
const NOT_ON_CLASS = 'This subject is not assigned to this class.';
const NO_TEACHER = 'Assign a teacher to this subject first.';

describe('Timetable entry validation (T-030, UC-24)', () => {
  let ctx: DbTestApp;
  let http: DbTestApp['http'];
  let adminAuth: DbTestApp['adminAuth'];
  let prisma: DbTestApp['prisma'];
  let seq = 0;

  const label = (l = 'x') => `${PREFIX}${l}-${++seq}`;
  const makeClass = () => prisma.class.create({ data: { name: label('c') } });
  const makeSection = (classId: string) =>
    prisma.section.create({ data: { name: label('s'), classId } });
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

  const setup = async () => {
    const klass = await makeClass();
    const section = await makeSection(klass.id);
    const subject = await makeSubject();
    const teacher = await makeTeacher();
    await assign(klass.id, subject.id, teacher.id);
    return { klass, section, subject, teacher };
  };

  const slot = (sectionId: string, periodId = 'period-1', day = 'mon') =>
    `/api/sections/${sectionId}/timetable/${periodId}/${day}`;
  const put = (sectionId: string, body: unknown, periodId = 'period-1', day = 'mon') =>
    http().put(slot(sectionId, periodId, day)).set('Authorization', adminAuth()).send(body as object);
  const noEntries = async (sectionId: string) =>
    expect(await prisma.timetableEntry.findMany({ where: { sectionId } })).toHaveLength(0);
  const msg = (res: { body: { message?: unknown } }) => JSON.stringify(res.body.message);

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

  it('AC-24.1 the break period (recess) responds 400 with the break message and creates no entry', async () => {
    const { section, subject } = await setup();
    const res = await put(section.id, { subjectId: subject.id }, 'recess').expect(400);
    expect(msg(res)).toContain(BREAK_MSG);
    await noEntries(section.id);
  });

  it('AC-24.2 a catalog subject not on the class responds 400 and creates no entry', async () => {
    const { section } = await setup();
    const other = await makeSubject();
    const res = await put(section.id, { subjectId: other.id }).expect(400);
    expect(msg(res)).toContain(NOT_ON_CLASS);
    await noEntries(section.id);
  });

  it('AC-24.3 a class subject with no teacher responds 400 and creates no entry', async () => {
    const klass = await makeClass();
    const section = await makeSection(klass.id);
    const subject = await makeSubject();
    await assign(klass.id, subject.id);
    const res = await put(section.id, { subjectId: subject.id }).expect(400);
    expect(msg(res)).toContain(NO_TEACHER);
    await noEntries(section.id);
  });

  describe('AC-24.4 unknown ids', () => {
    it('AC-24.4 an unknown sectionId responds 404 and creates no entry', async () => {
      const { section, subject } = await setup();
      await put('does-not-exist', { subjectId: subject.id }).expect(404);
      await noEntries(section.id);
      expect(await prisma.timetableEntry.count({ where: { sectionId: 'does-not-exist' } })).toBe(0);
    });

    it('AC-24.4 an unknown periodId responds 404 and creates no entry', async () => {
      const { section, subject } = await setup();
      await put(section.id, { subjectId: subject.id }, 'period-99').expect(404);
      await noEntries(section.id);
    });

    it('AC-24.4 an unknown subjectId responds 404 and creates no entry', async () => {
      const { section } = await setup();
      await put(section.id, { subjectId: 'does-not-exist' }).expect(404);
      await noEntries(section.id);
    });

    it('AC-24.4 an unknown section with a break period responds 404, not 400 (check order)', async () => {
      const { subject } = await setup();
      await put('does-not-exist', { subjectId: subject.id }, 'recess').expect(404);
    });
  });

  describe('AC-24.5 bad day', () => {
    it.each(['sat', 'MON'])('AC-24.5 dayOfWeek "%s" responds 400 and creates no entry', async (day) => {
      const { section, subject } = await setup();
      await put(section.id, { subjectId: subject.id }, 'period-1', day).expect(400);
      await noEntries(section.id);
    });
  });

  describe('UC-24-E1 missing required field', () => {
    it('UC-24-E1 a missing subjectId responds 400 with a message naming subjectId', async () => {
      const { section } = await setup();
      const res = await put(section.id, {}).expect(400);
      expect(msg(res)).toContain('subjectId');
      await noEntries(section.id);
    });

    it('UC-24-E1 an empty-string subjectId responds 400 and creates no entry', async () => {
      const { section } = await setup();
      await put(section.id, { subjectId: '' }).expect(400);
      await noEntries(section.id);
    });
  });

  it('UC-24-E2 a client-supplied teacherId is ignored; the class-subject teacher is saved', async () => {
    const { section, subject, teacher } = await setup();
    const other = await makeTeacher();
    const res = await put(section.id, { subjectId: subject.id, teacherId: other.id }).expect(200);
    expect(res.body.teacher.id).toBe(teacher.id);

    const rows = await prisma.timetableEntry.findMany({ where: { sectionId: section.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].teacherId).toBe(teacher.id);
    expect(rows[0].teacherId).not.toBe(other.id);
  });
});

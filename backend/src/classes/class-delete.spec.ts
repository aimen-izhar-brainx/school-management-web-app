import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { UsersModule } from '../users/users.module.js';
import { ClassesModule } from './classes.module.js';

// Real Postgres, real JWTs, real guards. Everything carries a unique per-run prefix.
const PREFIX = `t028-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;
const GONE = 'This class no longer exists.';

function messageOf(body: { message?: string | string[] }): string {
  return Array.isArray(body.message) ? body.message.join(' | ') : String(body.message);
}

describe('Delete class with sections, subjects, students (T-028)', () => {
  let ctx: DbTestApp;
  let http: DbTestApp['http'];
  let tokenFor: DbTestApp['tokenFor'];
  let adminAuth: DbTestApp['adminAuth'];
  let prisma: DbTestApp['prisma'];
  let seq = 0;

  const label = (l = 'x') => `${l}-${++seq}`;

  const makeClass = async (l = 'c') =>
    prisma.class.create({ data: { name: `${PREFIX}${label(l)}` } });
  const makeSection = (classId: string, name = label('S')) =>
    prisma.section.create({ data: { classId, name } });
  const makeSubject = (l = 'sub') => prisma.subject.create({ data: { name: `${PREFIX}${label(l)}` } });
  const assignSubject = (classId: string, subjectId: string) =>
    prisma.classSubject.create({ data: { classId, subjectId } });
  const makeUser = (role: 'teacher' | 'student', sectionId: string | null = null) =>
    prisma.user.create({
      data: {
        name: `${PREFIX}${role}`,
        email: `${role}-${++seq}${EMAIL_SUFFIX}`,
        passwordHash: 'not-a-real-hash',
        role,
        sectionId,
      },
    });

  const impact = (id: string, auth: string | null = adminAuth()) => {
    const r = http().get(`/api/classes/${id}/delete-impact`);
    return auth ? r.set('Authorization', auth) : r;
  };
  const del = (id: string, auth: string | null = adminAuth()) => {
    const r = http().delete(`/api/classes/${id}`);
    return auth ? r.set('Authorization', auth) : r;
  };
  const bearer = (role: string) => `Bearer ${tokenFor(role)}`;

  beforeAll(async () => {
    ctx = await createTestApp({ imports: [UsersModule, ClassesModule] });
    ({ http, tokenFor, adminAuth, prisma } = ctx);
  });

  afterEach(async () => {
    await prisma.class.deleteMany({
      where: { name: { startsWith: PREFIX, mode: 'insensitive' } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
    await prisma.subject.deleteMany({
      where: { name: { startsWith: PREFIX, mode: 'insensitive' } },
    });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  /** Class with 2 sections, 3 subject assignments, 4 students (3 + 1), plus a student elsewhere. */
  const seed = async () => {
    const cls = await makeClass('g5');
    const s1 = await makeSection(cls.id, 'A');
    const s2 = await makeSection(cls.id, 'B');
    const subjects = [await makeSubject(), await makeSubject(), await makeSubject()];
    for (const s of subjects) await assignSubject(cls.id, s.id);
    const students = [
      await makeUser('student', s1.id),
      await makeUser('student', s1.id),
      await makeUser('student', s1.id),
      await makeUser('student', s2.id),
    ];
    const other = await makeClass('other');
    const otherSection = await makeSection(other.id, 'A');
    const otherStudent = await makeUser('student', otherSection.id);
    return { cls, s1, s2, subjects, students, other, otherSection, otherStudent };
  };

  describe('AC-23.1 delete-impact counts', () => {
    it('AC-23.1 returns class name and correct counts of sections, subject assignments and students', async () => {
      const { cls } = await seed();
      const res = await impact(cls.id).expect(200);
      expect(res.body).toEqual({
        className: cls.name,
        sections: 2,
        subjectAssignments: 3,
        students: 4,
      });
    });

    it('AC-23.1 students in other classes are not counted', async () => {
      const { cls, other } = await seed();
      const res = await impact(other.id).expect(200);
      expect(res.body).toEqual({
        className: other.name,
        sections: 1,
        subjectAssignments: 0,
        students: 1,
      });
      const res2 = await impact(cls.id).expect(200);
      expect(res2.body.students).toBe(4);
    });

    it('AC-23.1 returns zero counts for an empty class (UC-23-E1)', async () => {
      const cls = await makeClass('empty');
      const res = await impact(cls.id).expect(200);
      expect(res.body).toEqual({
        className: cls.name,
        sections: 0,
        subjectAssignments: 0,
        students: 0,
      });
    });

    it('AC-23.1 does not change any data', async () => {
      const { cls } = await seed();
      await impact(cls.id).expect(200);
      expect(await prisma.class.findUnique({ where: { id: cls.id } })).not.toBeNull();
      expect(await prisma.section.count({ where: { classId: cls.id } })).toBe(2);
    });

    it('AC-23.1 unknown id responds 404 "This class no longer exists."', async () => {
      const res = await impact('does-not-exist').expect(404);
      expect(messageOf(res.body)).toBe(GONE);
    });
  });

  describe('AC-23.2 delete removes class, sections, subject assignments', () => {
    it('AC-23.2 responds 204 and the class, its sections and ClassSubject rows are gone', async () => {
      const { cls } = await seed();
      await del(cls.id).expect(204);
      expect(await prisma.class.findUnique({ where: { id: cls.id } })).toBeNull();
      expect(await prisma.section.count({ where: { classId: cls.id } })).toBe(0);
      expect(await prisma.classSubject.count({ where: { classId: cls.id } })).toBe(0);
      await impact(cls.id).expect(404);
    });

    it('AC-23.2 catalog subjects still exist after the class is deleted', async () => {
      const { cls, subjects } = await seed();
      await del(cls.id).expect(204);
      const left = await prisma.subject.findMany({
        where: { id: { in: subjects.map((s) => s.id) } },
      });
      expect(left).toHaveLength(3);
    });

    it('AC-23.2 other classes, their sections and students are untouched', async () => {
      const { cls, other, otherSection, otherStudent } = await seed();
      await del(cls.id).expect(204);
      expect(await prisma.class.findUnique({ where: { id: other.id } })).not.toBeNull();
      expect(await prisma.section.findUnique({ where: { id: otherSection.id } })).not.toBeNull();
      const u = await prisma.user.findUnique({ where: { id: otherStudent.id } });
      expect(u?.sectionId).toBe(otherSection.id);
    });

    it('AC-23.2 deleting an unknown id responds 404 "This class no longer exists."', async () => {
      const res = await del('does-not-exist').expect(404);
      expect(messageOf(res.body)).toBe(GONE);
    });

    it('AC-23.2 deleting an empty class still responds 204', async () => {
      const cls = await makeClass('empty');
      await del(cls.id).expect(204);
      expect(await prisma.class.findUnique({ where: { id: cls.id } })).toBeNull();
    });
  });

  describe('AC-23.3 students are unassigned, not deleted', () => {
    it('AC-23.3 student accounts still exist with sectionId null', async () => {
      const { cls, students } = await seed();
      await del(cls.id).expect(204);
      const rows = await prisma.user.findMany({ where: { id: { in: students.map((s) => s.id) } } });
      expect(rows).toHaveLength(4);
      for (const r of rows) {
        expect(r.sectionId).toBeNull();
        expect(r.role).toBe('student');
      }
    });
  });

  describe('UC-23-E2 student assigned after impact was fetched', () => {
    it('UC-23-E2 student assigned after fetching impact is also unassigned, not deleted', async () => {
      const { cls, s2 } = await seed();
      const before = await impact(cls.id).expect(200);
      expect(before.body.students).toBe(4);

      const late = await makeUser('student');
      await http()
        .patch(`/api/users/${late.id}/section`)
        .set('Authorization', adminAuth())
        .send({ sectionId: s2.id })
        .expect(200);

      await del(cls.id).expect(204);
      const row = await prisma.user.findUnique({ where: { id: late.id } });
      expect(row).not.toBeNull();
      expect(row?.sectionId).toBeNull();
      expect(await prisma.class.findUnique({ where: { id: cls.id } })).toBeNull();
    });

    it('UC-23-E2 concurrent DELETE class and PATCH student section never 500 and the student survives', async () => {
      for (let i = 0; i < 8; i++) {
        const cls = await makeClass('race');
        const sec = await makeSection(cls.id, 'A');
        const student = await makeUser('student');

        const [delRes, patchRes] = await Promise.all([
          del(cls.id),
          http()
            .patch(`/api/users/${student.id}/section`)
            .set('Authorization', adminAuth())
            .send({ sectionId: sec.id }),
        ]);

        expect(delRes.status).toBe(204);
        expect([200, 404]).toContain(patchRes.status);
        const row = await prisma.user.findUnique({ where: { id: student.id } });
        expect(row).not.toBeNull();
        expect(row?.sectionId).toBeNull();
        expect(await prisma.section.findUnique({ where: { id: sec.id } })).toBeNull();
        expect(await prisma.class.findUnique({ where: { id: cls.id } })).toBeNull();
      }
    });
  });

  describe.each([
    ['AC-04.1', 'teacher'],
    ['AC-04.2', 'student'],
  ])('%s %s is forbidden', (id, role) => {
    it(`${id} ${role} gets 403 on GET delete-impact`, async () => {
      const { cls } = await seed();
      await impact(cls.id, bearer(role)).expect(403);
    });

    it(`${id} ${role} gets 403 on DELETE and nothing changes`, async () => {
      const { cls, students } = await seed();
      await del(cls.id, bearer(role)).expect(403);
      expect(await prisma.class.findUnique({ where: { id: cls.id } })).not.toBeNull();
      expect(await prisma.section.count({ where: { classId: cls.id } })).toBe(2);
      expect(await prisma.classSubject.count({ where: { classId: cls.id } })).toBe(3);
      const assigned = await prisma.user.count({
        where: { id: { in: students.map((s) => s.id) }, sectionId: { not: null } },
      });
      expect(assigned).toBe(4);
    });
  });

  describe('UC-04-E2 no token', () => {
    it('UC-04-E2 GET delete-impact without a token responds 401', async () => {
      const cls = await makeClass();
      await impact(cls.id, null).expect(401);
    });

    it('UC-04-E2 DELETE without a token responds 401 and the class remains', async () => {
      const cls = await makeClass();
      await del(cls.id, null).expect(401);
      expect(await prisma.class.findUnique({ where: { id: cls.id } })).not.toBeNull();
    });
  });
});

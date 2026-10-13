import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { JwtStrategy } from '../auth/jwt.strategy.js';
import { ClassesModule } from '../classes/classes.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersModule } from './users.module.js';

// Real Postgres, real signed JWTs, real guards. Everything carries a per-run prefix.
const SECRET = 'test-access-secret';
const PREFIX = `t017-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;
const SECTION_GONE = 'This section no longer exists.';

interface StudentItem {
  id: string;
  email: string;
  role: string;
  sectionId?: string | null;
}

function messageOf(body: { message?: string | string[] }): string {
  return Array.isArray(body.message) ? body.message.join(' | ') : String(body.message);
}

describe('Student-section assignment (T-017)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let prisma: PrismaService;
  let seq = 0;

  const label = (l = 'x') => `${l}-${++seq}`;
  const tokenFor = (role: string) =>
    jwt.sign({ sub: 'user-does-not-exist-in-db', email: 'u@example.com', role });
  const adminAuth = () => `Bearer ${tokenFor('admin')}`;
  const http = () => request(app.getHttpServer());

  const makeClass = async () => {
    const res = await http()
      .post('/api/classes')
      .set('Authorization', adminAuth())
      .send({ name: `${PREFIX}${label('c')}` })
      .expect(201);
    return res.body as { id: string; name: string };
  };
  const makeSection = async (classId: string, name = label('S')) => {
    const res = await http()
      .post(`/api/classes/${classId}/sections`)
      .set('Authorization', adminAuth())
      .send({ name })
      .expect(201);
    return res.body as { id: string; name: string };
  };
  const makeUser = (role: 'teacher' | 'student' | 'admin') =>
    prisma.user.create({
      data: {
        name: `${PREFIX}${role}`,
        email: `${role}-${++seq}${EMAIL_SUFFIX}`,
        passwordHash: 'not-a-real-hash',
        role,
      },
    });
  const assign = (userId: string, sectionId: string | null, auth = adminAuth()) =>
    http().patch(`/api/users/${userId}/section`).set('Authorization', auth).send({ sectionId });
  const dbSectionOf = async (userId: string) =>
    (await prisma.user.findUnique({ where: { id: userId }, select: { sectionId: true } }))
      ?.sectionId;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        JwtModule.register({ secret: SECRET }),
        PrismaModule,
        UsersModule,
        ClassesModule,
      ],
      providers: [JwtStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = moduleRef.get(JwtService);
    prisma = moduleRef.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.class.deleteMany({
      where: { name: { startsWith: PREFIX, mode: 'insensitive' } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('UC-11 assign student to section', () => {
    it('AC-11.1 an assigned student keeps the section when fetched again', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id);
      const u = await makeUser('student');
      await assign(u.id, s.id).expect(200);
      expect(await dbSectionOf(u.id)).toBe(s.id);
    });

    it('AC-11.1 the assignment shows up in GET /users?role=student', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id);
      const u = await makeUser('student');
      await assign(u.id, s.id).expect(200);
      const res = await http()
        .get('/api/users')
        .query({ role: 'student' })
        .set('Authorization', adminAuth())
        .expect(200);
      const found = (res.body as StudentItem[]).find((x) => x.id === u.id);
      expect(found?.sectionId).toBe(s.id);
    });

    it('AC-11.2 reassigning moves the student to the new section only', async () => {
      const c = await makeClass();
      const a = await makeSection(c.id, 'A');
      const b = await makeSection(c.id, 'B');
      const u = await makeUser('student');
      await assign(u.id, a.id).expect(200);
      await assign(u.id, b.id).expect(200);
      expect(await dbSectionOf(u.id)).toBe(b.id);
      expect(await prisma.user.count({ where: { sectionId: a.id } })).toBe(0);
      expect(await prisma.user.count({ where: { sectionId: b.id } })).toBe(1);
    });

    it('AC-11.2 reassigning one student does not move other students', async () => {
      const c = await makeClass();
      const a = await makeSection(c.id, 'A');
      const b = await makeSection(c.id, 'B');
      const u1 = await makeUser('student');
      const u2 = await makeUser('student');
      await assign(u1.id, a.id).expect(200);
      await assign(u2.id, a.id).expect(200);
      await assign(u1.id, b.id).expect(200);
      expect(await dbSectionOf(u1.id)).toBe(b.id);
      expect(await dbSectionOf(u2.id)).toBe(a.id);
    });

    it('AC-11.3 a teacher target user is rejected with 400 and nothing changes', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id);
      const u = await makeUser('teacher');
      await assign(u.id, s.id).expect(400);
      expect(await dbSectionOf(u.id)).toBeNull();
    });

    it('AC-11.3 an admin target user is rejected with 400 and nothing changes', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id);
      const u = await makeUser('admin');
      await assign(u.id, s.id).expect(400);
      expect(await dbSectionOf(u.id)).toBeNull();
    });

    it('AC-11.3 a non-student is also rejected when clearing (null)', async () => {
      const u = await makeUser('teacher');
      await assign(u.id, null).expect(400);
    });

    it('AC-11.3 an unknown user id responds 404', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id);
      await assign('no-such-user', s.id).expect(404);
    });

    it('UC-11 an unknown sectionId responds 404 "This section no longer exists." and nothing changes', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id);
      const u = await makeUser('student');
      await assign(u.id, s.id).expect(200);
      const res = await assign(u.id, 'no-such-section').expect(404);
      expect(messageOf(res.body)).toContain(SECTION_GONE);
      expect(await dbSectionOf(u.id)).toBe(s.id);
    });

    it('UC-11 a body without sectionId is rejected with 400 and nothing changes', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id);
      const u = await makeUser('student');
      await assign(u.id, s.id).expect(200);
      await http()
        .patch(`/api/users/${u.id}/section`)
        .set('Authorization', adminAuth())
        .send({})
        .expect(400);
      expect(await dbSectionOf(u.id)).toBe(s.id);
    });

    it('UC-11 a non-string sectionId is rejected with 400', async () => {
      const u = await makeUser('student');
      await http()
        .patch(`/api/users/${u.id}/section`)
        .set('Authorization', adminAuth())
        .send({ sectionId: 123 })
        .expect(400);
      expect(await dbSectionOf(u.id)).toBeNull();
    });

    it('UC-11-E2 clearing the section (null) unassigns the student and keeps the user', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id);
      const u = await makeUser('student');
      await assign(u.id, s.id).expect(200);
      await assign(u.id, null).expect(200);
      expect(await dbSectionOf(u.id)).toBeNull();
      expect(await prisma.user.findUnique({ where: { id: u.id } })).not.toBeNull();
      expect(await prisma.section.findUnique({ where: { id: s.id } })).not.toBeNull();
    });

    it('UC-11-E2 clearing an already-unassigned student succeeds', async () => {
      const u = await makeUser('student');
      await assign(u.id, null).expect(200);
      expect(await dbSectionOf(u.id)).toBeNull();
    });
  });

  describe('UC-07 section/class deletion unassigns students', () => {
    it('AC-07.2 deleting a section clears sectionId for its students and the students still exist', async () => {
      const c = await makeClass();
      const doomed = await makeSection(c.id, 'Doomed');
      const other = await makeSection(c.id, 'Other');
      const u1 = await makeUser('student');
      const u2 = await makeUser('student');
      const u3 = await makeUser('student');
      await assign(u1.id, doomed.id).expect(200);
      await assign(u2.id, doomed.id).expect(200);
      await assign(u3.id, other.id).expect(200);

      await http()
        .delete(`/api/classes/${c.id}/sections/${doomed.id}`)
        .set('Authorization', adminAuth())
        .expect((r) => expect([200, 204]).toContain(r.status));

      expect(await prisma.section.findUnique({ where: { id: doomed.id } })).toBeNull();
      for (const u of [u1, u2]) {
        expect(await prisma.user.findUnique({ where: { id: u.id } })).not.toBeNull();
        expect(await dbSectionOf(u.id)).toBeNull();
      }
      expect(await dbSectionOf(u3.id)).toBe(other.id);
    });

    it('AC-07.2 deleting a whole class leaves its students existing with sectionId null', async () => {
      const c = await makeClass();
      const s1 = await makeSection(c.id, 'A');
      const s2 = await makeSection(c.id, 'B');
      const u1 = await makeUser('student');
      const u2 = await makeUser('student');
      await assign(u1.id, s1.id).expect(200);
      await assign(u2.id, s2.id).expect(200);

      await http()
        .delete(`/api/classes/${c.id}`)
        .set('Authorization', adminAuth())
        .expect((r) => expect([200, 204]).toContain(r.status));

      expect(await prisma.section.count({ where: { classId: c.id } })).toBe(0);
      for (const u of [u1, u2]) {
        expect(await prisma.user.findUnique({ where: { id: u.id } })).not.toBeNull();
        expect(await dbSectionOf(u.id)).toBeNull();
      }
    });
  });

  describe('GET /api/users?role=student exposes sectionId', () => {
    it('includes each student sectionId (null when unassigned) and still hides passwordHash', async () => {
      const c = await makeClass();
      const s = await makeSection(c.id);
      const assigned = await makeUser('student');
      const free = await makeUser('student');
      await assign(assigned.id, s.id).expect(200);
      const res = await http()
        .get('/api/users')
        .query({ role: 'student' })
        .set('Authorization', adminAuth())
        .expect(200);
      const items = res.body as StudentItem[];
      const a = items.find((x) => x.id === assigned.id);
      const f = items.find((x) => x.id === free.id);
      expect(a).toMatchObject({ id: assigned.id, role: 'student', sectionId: s.id });
      expect(f).toHaveProperty('sectionId', null);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|not-a-real-hash/);
    });
  });

  describe('AC-12.1 role enforcement', () => {
    for (const role of ['teacher', 'student'] as const) {
      it(`AC-12.1 ${role} gets 403 on PATCH /users/:id/section and no data changes`, async () => {
        const c = await makeClass();
        const a = await makeSection(c.id, 'A');
        const b = await makeSection(c.id, 'B');
        const u = await makeUser('student');
        await assign(u.id, a.id).expect(200);
        const auth = `Bearer ${tokenFor(role)}`;
        await assign(u.id, b.id, auth).expect(403);
        await assign(u.id, null, auth).expect(403);
        expect(await dbSectionOf(u.id)).toBe(a.id);
      });
    }
  });

  describe('UC-12-E1 authentication', () => {
    it('no token gives 401 and no data changes', async () => {
      const c = await makeClass();
      const a = await makeSection(c.id, 'A');
      const u = await makeUser('student');
      await assign(u.id, a.id).expect(200);
      await http().patch(`/api/users/${u.id}/section`).send({ sectionId: null }).expect(401);
      expect(await dbSectionOf(u.id)).toBe(a.id);
    });

    it('an expired token gives 401 and no data changes', async () => {
      const c = await makeClass();
      const a = await makeSection(c.id, 'A');
      const u = await makeUser('student');
      await assign(u.id, a.id).expect(200);
      const expired = `Bearer ${jwt.sign(
        { sub: 'u', email: 'u@example.com', role: 'admin' },
        { expiresIn: '-1h' },
      )}`;
      await assign(u.id, null, expired).expect(401);
      expect(await dbSectionOf(u.id)).toBe(a.id);
    });
  });
});

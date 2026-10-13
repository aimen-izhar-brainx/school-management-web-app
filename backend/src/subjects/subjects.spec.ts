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
import { UsersModule } from '../users/users.module.js';
import { SubjectsModule } from './subjects.module.js';

// Real Postgres, real signed JWTs, real guards. Everything carries a per-run prefix.
const SECRET = 'test-access-secret';
const PREFIX = `t016s-${Date.now().toString(36)}-`;
const EMPTY = 'Please enter a subject name.';
const DUPLICATE = 'This subject already exists.';
const IN_USE = "This subject is in use and can't be deleted.";

function messageOf(body: { message?: string | string[] }): string {
  return Array.isArray(body.message) ? body.message.join(' | ') : String(body.message);
}

describe('Subjects catalog API (T-016)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let prisma: PrismaService;
  let seq = 0;

  const label = (l = 's') => `${PREFIX}${l}-${++seq}`;
  const tokenFor = (role: string) =>
    jwt.sign({
      sub: 'user-does-not-exist-in-db',
      email: 'u@example.com',
      role,
    });
  const adminAuth = () => `Bearer ${tokenFor('admin')}`;
  const http = () => request(app.getHttpServer());

  const createSubject = (name: string, auth = adminAuth()) =>
    http().post('/api/subjects').set('Authorization', auth).send({ name });
  const makeSubject = async (name = label()) => {
    const res = await createSubject(name).expect(201);
    return res.body as { id: string; name: string };
  };
  const dbSubjects = () =>
    prisma.subject.findMany({
      where: { name: { startsWith: PREFIX, mode: 'insensitive' } },
    });

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
        SubjectsModule,
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
    // ClassSubject rows (Restrict on subject) must go first; classes cascade to them.
    await prisma.class.deleteMany({
      where: { name: { startsWith: PREFIX, mode: 'insensitive' } },
    });
    await prisma.subject.deleteMany({
      where: { name: { startsWith: PREFIX, mode: 'insensitive' } },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('UC-09 create subject', () => {
    it('AC-09.1 a created subject responds 201 with id and name and appears in the catalog list', async () => {
      const name = label('Math');
      const res = await createSubject(name).expect(201);
      expect(res.body).toMatchObject({ name });
      expect(typeof res.body.id).toBe('string');
      const list = await http().get('/api/subjects').set('Authorization', adminAuth()).expect(200);
      expect(list.body).toContainEqual({ id: res.body.id, name });
      expect(await dbSubjects()).toHaveLength(1);
    });

    it('AC-09.1 a created subject can subsequently be assigned to any class', async () => {
      const s = await makeSubject();
      const c = await http()
        .post('/api/classes')
        .set('Authorization', adminAuth())
        .send({ name: label('c') })
        .expect(201);
      await http()
        .post(`/api/classes/${c.body.id}/subjects`)
        .set('Authorization', adminAuth())
        .send({ subjectId: s.id })
        .expect(201);
    });

    it('AC-09.1 GET /subjects is readable by teacher and student roles too', async () => {
      const s = await makeSubject();
      for (const role of ['teacher', 'student']) {
        const res = await http()
          .get('/api/subjects')
          .set('Authorization', `Bearer ${tokenFor(role)}`)
          .expect(200);
        expect(res.body).toContainEqual({ id: s.id, name: s.name });
      }
    });

    it('AC-09.2 empty name responds 400 "Please enter a subject name." and creates nothing', async () => {
      const res = await createSubject('').expect(400);
      expect(messageOf(res.body)).toContain(EMPTY);
      expect(await dbSubjects()).toHaveLength(0);
    });

    it('AC-09.2 a missing name field is rejected with 400 and the same message', async () => {
      const res = await http()
        .post('/api/subjects')
        .set('Authorization', adminAuth())
        .send({})
        .expect(400);
      expect(messageOf(res.body)).toContain(EMPTY);
    });

    it('AC-09.2 a whitespace-only name is rejected like an empty name', async () => {
      const res = await createSubject('     ').expect(400);
      expect(messageOf(res.body)).toContain(EMPTY);
    });

    it('AC-09.2 a name longer than 100 characters is rejected with 400 and creates nothing', async () => {
      const long = PREFIX + 'x'.repeat(101);
      await createSubject(long).expect(400);
      expect(await dbSubjects()).toHaveLength(0);
    });

    it('AC-09.3 duplicate name (case-insensitive) responds 400 "This subject already exists." and creates nothing', async () => {
      const base = label('Physics');
      await makeSubject(base);
      for (const dup of [base, base.toUpperCase(), base.toLowerCase()]) {
        const res = await createSubject(dup).expect(400);
        expect(messageOf(res.body)).toContain(DUPLICATE);
      }
      expect(await dbSubjects()).toHaveLength(1);
    });

    it('AC-09.3 two concurrent creates with the same name create exactly one subject', async () => {
      const name = label('Race');
      const results = await Promise.all([createSubject(name), createSubject(name)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
      const loser = results.find((r) => r.status === 400)!;
      expect(messageOf(loser.body)).toContain(DUPLICATE);
      expect(await dbSubjects()).toHaveLength(1);
    });

    it('AC-09.3 two concurrent creates differing only by case create exactly one subject', async () => {
      const name = label('Race');
      const results = await Promise.all([createSubject(name), createSubject(name.toUpperCase())]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
      const loser = results.find((r) => r.status === 400)!;
      expect(messageOf(loser.body)).toContain(DUPLICATE);
      expect(await dbSubjects()).toHaveLength(1);
    });
  });

  describe('delete subject', () => {
    it('an unused subject is deleted (204) and is gone from the catalog', async () => {
      const s = await makeSubject();
      await http().delete(`/api/subjects/${s.id}`).set('Authorization', adminAuth()).expect(204);
      expect(await prisma.subject.findUnique({ where: { id: s.id } })).toBeNull();
    });

    it('deleting an unknown subject responds 404', async () => {
      await http()
        .delete('/api/subjects/no-such-subject')
        .set('Authorization', adminAuth())
        .expect(404);
    });

    it('UC-09-E1 a subject assigned to a class responds 400 "This subject is in use and can\'t be deleted." and nothing is deleted', async () => {
      const s = await makeSubject();
      const c = await prisma.class.create({ data: { name: label('c') } });
      await prisma.classSubject.create({
        data: { classId: c.id, subjectId: s.id },
      });
      const res = await http()
        .delete(`/api/subjects/${s.id}`)
        .set('Authorization', adminAuth())
        .expect(400);
      expect(messageOf(res.body)).toContain(IN_USE);
      expect(await prisma.subject.findUnique({ where: { id: s.id } })).not.toBeNull();
      expect(await prisma.classSubject.count({ where: { subjectId: s.id } })).toBe(1);
    });

    it('UC-09-E1 once the subject is removed from every class it can be deleted', async () => {
      const s = await makeSubject();
      const c = await prisma.class.create({ data: { name: label('c') } });
      const cs = await prisma.classSubject.create({
        data: { classId: c.id, subjectId: s.id },
      });
      await http()
        .delete(`/api/classes/${c.id}/subjects/${cs.id}`)
        .set('Authorization', adminAuth())
        .expect(204);
      await http().delete(`/api/subjects/${s.id}`).set('Authorization', adminAuth()).expect(204);
    });
  });

  describe('AC-12.1 role enforcement', () => {
    for (const role of ['teacher', 'student'] as const) {
      it(`AC-12.1 ${role} gets 403 on every subject write endpoint and no data changes`, async () => {
        const s = await makeSubject();
        const auth = `Bearer ${tokenFor(role)}`;
        await createSubject(label('Sneaky'), auth).expect(403);
        await http().delete(`/api/subjects/${s.id}`).set('Authorization', auth).expect(403);
        const rows = await dbSubjects();
        expect(rows.map((r) => r.id)).toEqual([s.id]);
      });
    }
  });

  describe('UC-12-E1 authentication', () => {
    it('no token gives 401 on every subject endpoint and no data changes', async () => {
      const s = await makeSubject();
      await http().get('/api/subjects').expect(401);
      await http()
        .post('/api/subjects')
        .send({ name: label('Anon') })
        .expect(401);
      await http().delete(`/api/subjects/${s.id}`).expect(401);
      expect(await dbSubjects()).toHaveLength(1);
    });

    it('an expired token gives 401 on every subject endpoint and no data changes', async () => {
      const s = await makeSubject();
      const expired = `Bearer ${jwt.sign(
        { sub: 'u', email: 'u@example.com', role: 'admin' },
        { expiresIn: '-1h' },
      )}`;
      await http().get('/api/subjects').set('Authorization', expired).expect(401);
      await createSubject(label('Late'), expired).expect(401);
      await http().delete(`/api/subjects/${s.id}`).set('Authorization', expired).expect(401);
      expect(await dbSubjects()).toHaveLength(1);
    });
  });
});

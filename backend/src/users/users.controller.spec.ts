import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { JwtStrategy } from '../auth/jwt.strategy.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersModule } from './users.module.js';

// Real Postgres, real signed JWTs, real guards. Test users carry a per-run email suffix.
const SECRET = 'test-access-secret';
const PREFIX = `t015u-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
}

describe('GET /api/users?role= (T-015)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let prisma: PrismaService;
  let seq = 0;

  const tokenFor = (role: string) =>
    jwt.sign({ sub: 'user-does-not-exist-in-db', email: 'u@example.com', role });
  const http = () => request(app.getHttpServer());
  const makeUser = (role: 'teacher' | 'student' | 'admin' | 'parent') =>
    prisma.user.create({
      data: {
        name: `${PREFIX}${role}`,
        email: `${role}-${++seq}${EMAIL_SUFFIX}`,
        passwordHash: 'not-a-real-hash',
        role,
      },
    });
  const mine = (items: UserItem[]) => items.filter((u) => u.email.endsWith(EMAIL_SUFFIX));

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        JwtModule.register({ secret: SECRET }),
        PrismaModule,
        UsersModule,
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
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC-08.2 role=teacher returns only users with role teacher', async () => {
    const t1 = await makeUser('teacher');
    const t2 = await makeUser('teacher');
    await makeUser('student');
    await makeUser('admin');
    await makeUser('parent');
    const res = await http()
      .get('/api/users')
      .query({ role: 'teacher' })
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .expect(200);
    const items = res.body as UserItem[];
    expect(items.every((u) => u.role === 'teacher')).toBe(true);
    expect(mine(items).map((u) => u.id).sort()).toEqual([t1.id, t2.id].sort());
  });

  it('AC-08.2 role=student returns only users with role student', async () => {
    const s = await makeUser('student');
    await makeUser('teacher');
    const res = await http()
      .get('/api/users')
      .query({ role: 'student' })
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .expect(200);
    const items = res.body as UserItem[];
    expect(items.every((u) => u.role === 'student')).toBe(true);
    expect(mine(items).map((u) => u.id)).toEqual([s.id]);
  });

  it('AC-08.2 the response never exposes password hashes', async () => {
    await makeUser('teacher');
    const res = await http()
      .get('/api/users')
      .query({ role: 'teacher' })
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .expect(200);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|not-a-real-hash/);
  });

  it('AC-08.2 an unsupported role value responds 400', async () => {
    await http()
      .get('/api/users')
      .query({ role: 'wizard' })
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .expect(400);
  });

  for (const role of ['teacher', 'student'] as const) {
    it(`AC-12.1 ${role} gets 403 on GET /users`, async () => {
      await http()
        .get('/api/users')
        .query({ role: 'teacher' })
        .set('Authorization', `Bearer ${tokenFor(role)}`)
        .expect(403);
    });
  }

  it('UC-12-E1 no token gives 401 on GET /users', async () => {
    await http().get('/api/users').query({ role: 'teacher' }).expect(401);
  });

  it('UC-12-E1 an expired token gives 401 on GET /users', async () => {
    const expired = jwt.sign(
      { sub: 'u', email: 'u@example.com', role: 'admin' },
      { expiresIn: '-1h' },
    );
    await http()
      .get('/api/users')
      .query({ role: 'teacher' })
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
  });
});

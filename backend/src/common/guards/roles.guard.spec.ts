import { Controller, Get, UseGuards, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { JwtStrategy } from '../../auth/jwt.strategy.js';
import { Roles } from '../decorators/roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

const SECRET = 'test-access-secret';

@Controller('throwaway')
@UseGuards(JwtAuthGuard, RolesGuard)
class ThrowawayController {
  @Get('admin-only')
  @Roles('admin')
  adminOnly() {
    return { ok: true };
  }

  @Get('admin-or-teacher')
  @Roles('admin', 'teacher')
  adminOrTeacher() {
    return { ok: true };
  }

  @Get('no-roles')
  noRoles() {
    return { ok: true };
  }
}

@Controller('throwaway-class')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
class ClassLevelAdminController {
  @Get()
  list() {
    return { ok: true };
  }
}

describe('RolesGuard + @Roles (T-012)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const tokenFor = (role: string) => jwt.sign({ sub: 'user-1', email: 'u@example.com', role });

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        PassportModule,
        JwtModule.register({ secret: SECRET }),
      ],
      controllers: [ThrowawayController, ClassLevelAdminController],
      providers: [JwtStrategy, RolesGuard],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('T-012.DoD1 allows a request whose role is listed in @Roles', async () => {
    await request(app.getHttpServer())
      .get('/throwaway/admin-only')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .expect(200, { ok: true });
  });

  it('T-012.DoD1 allows any of several roles listed in @Roles', async () => {
    await request(app.getHttpServer())
      .get('/throwaway/admin-or-teacher')
      .set('Authorization', `Bearer ${tokenFor('teacher')}`)
      .expect(200);
  });

  it('T-012.DoD2 rejects teacher with 403 on an admin-only route', async () => {
    await request(app.getHttpServer())
      .get('/throwaway/admin-only')
      .set('Authorization', `Bearer ${tokenFor('teacher')}`)
      .expect(403);
  });

  it('T-012.DoD2 rejects student with 403 on an admin-only route', async () => {
    await request(app.getHttpServer())
      .get('/throwaway/admin-only')
      .set('Authorization', `Bearer ${tokenFor('student')}`)
      .expect(403);
  });

  it('T-012.DoD2 rejects a role not listed in a multi-role @Roles with 403', async () => {
    await request(app.getHttpServer())
      .get('/throwaway/admin-or-teacher')
      .set('Authorization', `Bearer ${tokenFor('student')}`)
      .expect(403);
  });

  it('T-012.DoD3 rejects a request with no token with 401', async () => {
    await request(app.getHttpServer()).get('/throwaway/admin-only').expect(401);
  });

  it('T-012.DoD1 allows any authenticated role on a route with no @Roles', async () => {
    await request(app.getHttpServer())
      .get('/throwaway/no-roles')
      .set('Authorization', `Bearer ${tokenFor('student')}`)
      .expect(200, { ok: true });
  });

  it('T-012.DoD3 rejects a request with no token with 401 on a route with no @Roles', async () => {
    await request(app.getHttpServer()).get('/throwaway/no-roles').expect(401);
  });

  it('T-012.DoD1 allows admin on a controller with class-level @Roles("admin")', async () => {
    await request(app.getHttpServer())
      .get('/throwaway-class')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .expect(200, { ok: true });
  });

  it('T-012.DoD2 rejects teacher with 403 on a controller with class-level @Roles("admin")', async () => {
    await request(app.getHttpServer())
      .get('/throwaway-class')
      .set('Authorization', `Bearer ${tokenFor('teacher')}`)
      .expect(403);
  });

  it('T-012.DoD3 rejects an invalid JWT with 401', async () => {
    await request(app.getHttpServer())
      .get('/throwaway/admin-only')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('T-012.DoD3 rejects a token signed with the wrong secret with 401', async () => {
    const forged = new JwtService({ secret: 'wrong-secret' }).sign({
      sub: 'user-1',
      email: 'u@example.com',
      role: 'admin',
    });
    await request(app.getHttpServer())
      .get('/throwaway/admin-only')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });
});

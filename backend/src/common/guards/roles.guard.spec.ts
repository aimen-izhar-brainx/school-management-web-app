import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/helpers/test-app.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { Roles } from '../decorators/roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

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
  let ctx: TestApp;
  let http: TestApp['http'];
  let tokenFor: TestApp['tokenFor'];

  beforeAll(async () => {
    // No DB, no /api prefix, no ValidationPipe: just the guards on throwaway controllers.
    ctx = await createTestApp({
      prisma: false,
      mainLikeSetup: false,
      ignoreEnvFile: true,
      controllers: [ThrowawayController, ClassLevelAdminController],
      providers: [RolesGuard],
    });
    ({ http, tokenFor } = ctx);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('T-012.DoD1 allows a request whose role is listed in @Roles', async () => {
    await http()
      .get('/throwaway/admin-only')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .expect(200, { ok: true });
  });

  it('T-012.DoD1 allows any of several roles listed in @Roles', async () => {
    await http()
      .get('/throwaway/admin-or-teacher')
      .set('Authorization', `Bearer ${tokenFor('teacher')}`)
      .expect(200);
  });

  it('T-012.DoD2 rejects teacher with 403 on an admin-only route', async () => {
    await http()
      .get('/throwaway/admin-only')
      .set('Authorization', `Bearer ${tokenFor('teacher')}`)
      .expect(403);
  });

  it('T-012.DoD2 rejects student with 403 on an admin-only route', async () => {
    await http()
      .get('/throwaway/admin-only')
      .set('Authorization', `Bearer ${tokenFor('student')}`)
      .expect(403);
  });

  it('T-012.DoD2 rejects a role not listed in a multi-role @Roles with 403', async () => {
    await http()
      .get('/throwaway/admin-or-teacher')
      .set('Authorization', `Bearer ${tokenFor('student')}`)
      .expect(403);
  });

  it('T-012.DoD3 rejects a request with no token with 401', async () => {
    await http().get('/throwaway/admin-only').expect(401);
  });

  it('T-012.DoD1 allows any authenticated role on a route with no @Roles', async () => {
    await http()
      .get('/throwaway/no-roles')
      .set('Authorization', `Bearer ${tokenFor('student')}`)
      .expect(200, { ok: true });
  });

  it('T-012.DoD3 rejects a request with no token with 401 on a route with no @Roles', async () => {
    await http().get('/throwaway/no-roles').expect(401);
  });

  it('T-012.DoD1 allows admin on a controller with class-level @Roles("admin")', async () => {
    await http()
      .get('/throwaway-class')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .expect(200, { ok: true });
  });

  it('T-012.DoD2 rejects teacher with 403 on a controller with class-level @Roles("admin")', async () => {
    await http()
      .get('/throwaway-class')
      .set('Authorization', `Bearer ${tokenFor('teacher')}`)
      .expect(403);
  });

  it('T-012.DoD3 rejects an invalid JWT with 401', async () => {
    await http()
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
    await http()
      .get('/throwaway/admin-only')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });
});

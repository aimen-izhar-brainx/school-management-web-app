import {
  ValidationPipe,
  type DynamicModule,
  type ForwardReference,
  type INestApplication,
  type Provider,
  type Type,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { JwtStrategy } from '../../src/auth/jwt.strategy.js';
import { PrismaModule } from '../../src/prisma/prisma.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export const TEST_JWT_SECRET = 'test-access-secret';

type ModuleImport = Type | DynamicModule | Promise<DynamicModule> | ForwardReference;

export interface TestAppOptions {
  /** Feature modules under test (PrismaModule is added unless `prisma: false`). */
  imports?: ModuleImport[];
  controllers?: Type[];
  providers?: Provider[];
  /** Real DB-backed app (default true). Adds PrismaModule and exposes `prisma`. */
  prisma?: boolean;
  /** Mirror main.ts: `/api` prefix + ValidationPipe (default true). */
  mainLikeSetup?: boolean;
  /** Passed to ConfigModule.forRoot (e.g. to skip reading backend/.env). */
  ignoreEnvFile?: boolean;
}

/** App without a database (`createTestApp({ prisma: false })`). */
export interface TestApp {
  app: INestApplication;
  jwt: JwtService;
  /** A fresh supertest request bound to the already-listening server. */
  http: () => ReturnType<typeof request>;
  /** Signs a valid access token carrying only the given role claim. */
  tokenFor: (role: string, sub?: string) => string;
  /** `Bearer <admin token>`. */
  adminAuth: () => string;
  close: () => Promise<void>;
}

/** DB-backed app (the default): also exposes the app's PrismaService. */
export interface DbTestApp extends TestApp {
  prisma: PrismaService;
}

/**
 * Boots a Nest app for HTTP-level specs (real guards, real JWTs, real Postgres).
 *
 * The app LISTENS on an ephemeral 127.0.0.1 port once, and every request goes to
 * that URL. Do not pass `app.getHttpServer()` to supertest on a non-listening
 * server: supertest then calls `server.listen(0)` per request and `server.close()`
 * when that request ends, while other requests (Promise.all race tests, the global
 * keep-alive agent) are still using the same server. That close destroys sockets
 * other requests are on (ECONNRESET) and can leave the server stuck in a pending
 * close that never fires, so every later request times out.
 */
export function createTestApp(options: TestAppOptions & { prisma: false }): Promise<TestApp>;
export function createTestApp(options?: TestAppOptions & { prisma?: true }): Promise<DbTestApp>;
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp | DbTestApp> {
  const {
    imports = [],
    controllers = [],
    providers = [],
    prisma: withPrisma = true,
    mainLikeSetup = true,
    ignoreEnvFile = false,
  } = options;

  process.env.JWT_ACCESS_SECRET = TEST_JWT_SECRET;
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile }),
      PassportModule,
      JwtModule.register({ secret: TEST_JWT_SECRET }),
      ...(withPrisma ? [PrismaModule] : []),
      ...imports,
    ],
    controllers,
    providers: [JwtStrategy, ...providers],
  }).compile();

  // forceCloseConnections: app.close() destroys lingering keep-alive sockets instead of
  // waiting on them, so teardown never hangs.
  const app = moduleRef.createNestApplication({ forceCloseConnections: true });
  if (mainLikeSetup) {
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  }
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const jwt = moduleRef.get(JwtService);
  const tokenFor = (role: string, sub = 'user-does-not-exist-in-db') =>
    jwt.sign({ sub, email: 'u@example.com', role });

  const base: TestApp = {
    app,
    jwt,
    http: () => request(baseUrl),
    tokenFor,
    adminAuth: () => `Bearer ${tokenFor('admin')}`,
    // Closes the HTTP server and runs onModuleDestroy (PrismaService.$disconnect -> pg pool end).
    close: () => app.close(),
  };
  return withPrisma ? { ...base, prisma: moduleRef.get(PrismaService) } : base;
}

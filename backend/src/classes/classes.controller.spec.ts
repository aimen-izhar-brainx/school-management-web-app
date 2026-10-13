import { JwtService } from '@nestjs/jwt';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { ClassesModule } from './classes.module.js';

// Real Postgres (DATABASE_URL from backend/.env), real signed JWTs, real guards.
// Every class created here uses a unique per-run prefix so cleanup never touches other data.
const PREFIX = `t013-${Date.now().toString(36)}-`;
const DUPLICATE = 'A class with this name already exists.';
const EMPTY = 'Please enter a class name.';

function messageOf(body: { message?: string | string[] }): string {
  return Array.isArray(body.message) ? body.message.join(' | ') : String(body.message);
}

describe('Classes API (T-013)', () => {
  let ctx: DbTestApp;
  let http: DbTestApp['http'];
  let tokenFor: DbTestApp['tokenFor'];
  let adminAuth: DbTestApp['adminAuth'];
  let jwt: DbTestApp['jwt'];
  let prisma: DbTestApp['prisma'];
  let seq = 0;

  const name = (label = 'c') => `${PREFIX}${label}-${++seq}`;

  const createAs = (n: string) =>
    http().post('/api/classes').set('Authorization', adminAuth()).send({ name: n });
  const list = async () => {
    const res = await http().get('/api/classes').set('Authorization', adminAuth()).expect(200);
    return (res.body as Array<{ id: string; name: string }>).filter((c) =>
      c.name.toLowerCase().startsWith(PREFIX.toLowerCase()),
    );
  };
  const makeClass = async (label = 'c') => {
    const n = name(label);
    const res = await createAs(n).expect(201);
    return res.body as { id: string; name: string };
  };
  const dbCount = () =>
    prisma.class.count({ where: { name: { startsWith: PREFIX, mode: 'insensitive' } } });

  beforeAll(async () => {
    ctx = await createTestApp({ imports: [ClassesModule] });
    ({ http, tokenFor, adminAuth, jwt, prisma } = ctx);
  });

  afterEach(async () => {
    await prisma.class.deleteMany({
      where: { name: { startsWith: PREFIX, mode: 'insensitive' } },
    });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('UC-01 create', () => {
    it('AC-01.2 a created class is present when fetched again via the list endpoint', async () => {
      const n = name('persist');
      await createAs(n).expect(201);
      const found = (await list()).find((c) => c.name === n);
      expect(found).toBeDefined();
      expect(await dbCount()).toBe(1);
    });

    it('AC-01.3 empty name responds 400 "Please enter a class name." and creates nothing', async () => {
      const before = await dbCount();
      const res = await createAs('').expect(400);
      expect(messageOf(res.body)).toContain(EMPTY);
      expect(await dbCount()).toBe(before);
      const all = await http().get('/api/classes').set('Authorization', adminAuth()).expect(200);
      expect((all.body as Array<{ name: string }>).some((c) => c.name === '')).toBe(false);
    });

    it('AC-01.3 a missing name field is also rejected with 400 and the same message', async () => {
      const res = await http()
        .post('/api/classes')
        .set('Authorization', adminAuth())
        .send({})
        .expect(400);
      expect(messageOf(res.body)).toContain(EMPTY);
    });

    it('AC-01.4 duplicate name (case-insensitive) responds 400 with the duplicate message and creates nothing', async () => {
      const n = name('Dup');
      await createAs(n).expect(201);
      const res = await createAs(n.toUpperCase()).expect(400);
      expect(messageOf(res.body)).toContain(DUPLICATE);
      const res2 = await createAs(n.toLowerCase()).expect(400);
      expect(messageOf(res2.body)).toContain(DUPLICATE);
      expect(await dbCount()).toBe(1);
    });

    it('UC-01-E1 whitespace-only name is rejected with the same message as empty', async () => {
      const before = await dbCount();
      const res = await createAs('     ').expect(400);
      expect(messageOf(res.body)).toContain(EMPTY);
      expect(await dbCount()).toBe(before);
    });

    it('UC-01-E2 name longer than 100 characters is rejected with a length-limit error', async () => {
      const res = await createAs(PREFIX + 'x'.repeat(300)).expect(400);
      expect(messageOf(res.body)).toMatch(/100/);
      expect(await dbCount()).toBe(0);
    });

    it('UC-01-E2 a name of exactly 100 characters is accepted (boundary)', async () => {
      const n = (PREFIX + 'y'.repeat(100)).slice(0, 100);
      const res = await createAs(n).expect(201);
      expect(res.body.name).toBe(n);
    });

    it('UC-01-E4 two concurrent creates with the same name create exactly one class; the other gets the duplicate error', async () => {
      const n = name('race');
      const results = await Promise.all([createAs(n), createAs(n)]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 400]);
      const loser = results.find((r) => r.status === 400)!;
      expect(messageOf(loser.body)).toContain(DUPLICATE);
      expect(await dbCount()).toBe(1);
    });

    it('UC-01-E4 / AC-01.4 two concurrent creates with names differing only by case create exactly one class', async () => {
      const prefix = name('racecase');
      const results = await Promise.all([createAs(`${prefix} Math`), createAs(`${prefix} math`)]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 400]);
      const loser = results.find((r) => r.status === 400)!;
      expect(messageOf(loser.body)).toContain(DUPLICATE);
      const rows = await prisma.class.count({
        where: { name: { startsWith: prefix, mode: 'insensitive' } },
      });
      expect(rows).toBe(1);
    });

    it('UC-01-E4 the database itself enforces uniqueness on name (not just an application pre-check)', async () => {
      const n = name('constraint');
      await prisma.class.create({ data: { name: n } });
      await expect(prisma.class.create({ data: { name: n } })).rejects.toMatchObject({
        code: 'P2002',
      });
    });
  });

  describe('UC-02 rename', () => {
    it('AC-02.2 a renamed class has the new name when fetched again', async () => {
      const c = await makeClass('old');
      const newName = name('new');
      await http()
        .patch(`/api/classes/${c.id}`)
        .set('Authorization', adminAuth())
        .send({ name: newName })
        .expect(200);
      const items = await list();
      expect(items.find((x) => x.id === c.id)?.name).toBe(newName);
      expect(items.some((x) => x.name === c.name)).toBe(false);
    });

    it('AC-02.3 clearing the name responds 400 "Please enter a class name." and keeps the original', async () => {
      const c = await makeClass('keep');
      const res = await http()
        .patch(`/api/classes/${c.id}`)
        .set('Authorization', adminAuth())
        .send({ name: '' })
        .expect(400);
      expect(messageOf(res.body)).toContain(EMPTY);
      expect((await list()).find((x) => x.id === c.id)?.name).toBe(c.name);
    });

    it('AC-02.4 renaming to another class\'s name responds 400 with the duplicate message and is not applied', async () => {
      const a = await makeClass('a');
      const b = await makeClass('b');
      const res = await http()
        .patch(`/api/classes/${b.id}`)
        .set('Authorization', adminAuth())
        .send({ name: a.name.toUpperCase() })
        .expect(400);
      expect(messageOf(res.body)).toContain(DUPLICATE);
      expect((await list()).find((x) => x.id === b.id)?.name).toBe(b.name);
    });

    it('UC-02-E1 renaming to its own current name succeeds', async () => {
      const c = await makeClass('same');
      await http()
        .patch(`/api/classes/${c.id}`)
        .set('Authorization', adminAuth())
        .send({ name: c.name })
        .expect(200);
      expect((await list()).find((x) => x.id === c.id)?.name).toBe(c.name);
    });
  });

  describe('UC-03 delete', () => {
    it('AC-03.2 a deleted class is gone from the list and does not reappear', async () => {
      const c = await makeClass('del');
      await http()
        .delete(`/api/classes/${c.id}`)
        .set('Authorization', adminAuth())
        .expect((r) => expect([200, 204]).toContain(r.status));
      expect((await list()).some((x) => x.id === c.id)).toBe(false);
      expect((await list()).some((x) => x.id === c.id)).toBe(false);
      expect(await dbCount()).toBe(0);
    });
  });

  describe('UC-04 role enforcement', () => {
    for (const role of ['teacher', 'student'] as const) {
      const ac = role === 'teacher' ? 'AC-04.1' : 'AC-04.2';

      it(`${ac} ${role} gets 403 on create and nothing is created`, async () => {
        const n = name(`${role}-create`);
        await http()
          .post('/api/classes')
          .set('Authorization', `Bearer ${tokenFor(role)}`)
          .send({ name: n })
          .expect(403);
        expect(await dbCount()).toBe(0);
      });

      it(`${ac} ${role} gets 403 on rename and the name is unchanged`, async () => {
        const c = await makeClass(`${role}-rename`);
        await http()
          .patch(`/api/classes/${c.id}`)
          .set('Authorization', `Bearer ${tokenFor(role)}`)
          .send({ name: name('renamed') })
          .expect(403);
        expect((await list()).find((x) => x.id === c.id)?.name).toBe(c.name);
      });

      it(`${ac} ${role} gets 403 on delete and the class remains`, async () => {
        const c = await makeClass(`${role}-delete`);
        await http()
          .delete(`/api/classes/${c.id}`)
          .set('Authorization', `Bearer ${tokenFor(role)}`)
          .expect(403);
        expect((await list()).some((x) => x.id === c.id)).toBe(true);
      });
    }

    it('UC-04-E1 the decision uses only the signed JWT role claim, not client-supplied role data', async () => {
      const c = await makeClass('e1');
      const teacher = `Bearer ${tokenFor('teacher')}`;
      await http()
        .post('/api/classes')
        .query({ role: 'admin' })
        .set('Authorization', teacher)
        .set('x-role', 'admin')
        .send({ name: name('spoof'), role: 'admin' })
        .expect(403);
      await http()
        .delete(`/api/classes/${c.id}`)
        .query({ role: 'admin' })
        .set('Authorization', teacher)
        .set('x-role', 'admin')
        .expect(403);
      expect((await list()).some((x) => x.id === c.id)).toBe(true);
    });

    it('UC-04-E1 an admin-role token is honoured even when the user id does not exist in the DB', async () => {
      // tokenFor() uses a sub that is not in the users table.
      await createAs(name('claim-only')).expect(201);
    });

    it('UC-04-E1 a token signed with the wrong secret claiming admin is rejected with 401', async () => {
      const forged = new JwtService({ secret: 'wrong-secret' }).sign({
        sub: 'u',
        email: 'u@example.com',
        role: 'admin',
      });
      await http()
        .post('/api/classes')
        .set('Authorization', `Bearer ${forged}`)
        .send({ name: name('forged') })
        .expect(401);
      expect(await dbCount()).toBe(0);
    });

    it('UC-04-E2 no token gives 401 on every /classes endpoint', async () => {
      await http().get('/api/classes').expect(401);
      await http().post('/api/classes').send({ name: name('anon') }).expect(401);
      await http().patch('/api/classes/some-id').send({ name: 'x' }).expect(401);
      await http().delete('/api/classes/some-id').expect(401);
      expect(await dbCount()).toBe(0);
    });

    it('UC-04-E2 an expired token gives 401 on every /classes endpoint', async () => {
      const expired = jwt.sign(
        { sub: 'u', email: 'u@example.com', role: 'admin' },
        { expiresIn: '-1h' },
      );
      const auth = `Bearer ${expired}`;
      await http().get('/api/classes').set('Authorization', auth).expect(401);
      await http()
        .post('/api/classes')
        .set('Authorization', auth)
        .send({ name: name('expired') })
        .expect(401);
      await http()
        .patch('/api/classes/some-id')
        .set('Authorization', auth)
        .send({ name: 'x' })
        .expect(401);
      await http().delete('/api/classes/some-id').set('Authorization', auth).expect(401);
      expect(await dbCount()).toBe(0);
    });
  });

  describe('UC-05 list', () => {
    it('AC-05.2 returns all existing classes', async () => {
      const a = await makeClass('list-a');
      const b = await makeClass('list-b');
      const c = await makeClass('list-c');
      const ids = (await list()).map((x) => x.id);
      expect(ids).toEqual(expect.arrayContaining([a.id, b.id, c.id]));
      expect(ids).toHaveLength(3);
    });

    it('AC-05.2 any authenticated role (teacher, student) can read the list', async () => {
      const c = await makeClass('readable');
      for (const role of ['teacher', 'student']) {
        const res = await http()
          .get('/api/classes')
          .set('Authorization', `Bearer ${tokenFor(role)}`)
          .expect(200);
        expect((res.body as Array<{ id: string }>).some((x) => x.id === c.id)).toBe(true);
      }
    });

    it('AC-05.3 list items contain no section or subject fields', async () => {
      await makeClass('shape');
      const items = await list();
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        const keys = Object.keys(item);
        expect(keys).toEqual(expect.arrayContaining(['id', 'name']));
        expect(keys.some((k) => /section|subject/i.test(k))).toBe(false);
      }
    });
  });
});

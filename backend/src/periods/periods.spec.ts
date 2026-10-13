import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIXED_PERIODS } from '../../prisma/periods.js';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { PeriodsModule } from './periods.module.js';

type PeriodBody = {
  id: string;
  order: number;
  label: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
};

const FIXED = [
  { order: 1, label: 'Period 1', startTime: '08:00', endTime: '08:45', isBreak: false },
  { order: 2, label: 'Period 2', startTime: '08:45', endTime: '09:30', isBreak: false },
  { order: 3, label: 'Period 3', startTime: '09:30', endTime: '10:15', isBreak: false },
  { order: 4, label: 'Recess', startTime: '10:15', endTime: '10:45', isBreak: true },
  { order: 5, label: 'Period 4', startTime: '10:45', endTime: '11:30', isBreak: false },
  { order: 6, label: 'Period 5', startTime: '11:30', endTime: '12:15', isBreak: false },
  { order: 7, label: 'Period 6', startTime: '12:15', endTime: '13:00', isBreak: false },
];

describe('Periods API (T-020)', () => {
  let ctx: DbTestApp;
  let http: DbTestApp['http'];
  let tokenFor: DbTestApp['tokenFor'];
  let adminAuth: DbTestApp['adminAuth'];
  let prisma: DbTestApp['prisma'];

  const list = (auth: string) => http().get('/api/periods').set('Authorization', auth);

  beforeAll(async () => {
    ctx = await createTestApp({ imports: [PeriodsModule] });
    ({ http, tokenFor, adminAuth, prisma } = ctx);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('AC-16.3 GET /api/periods returns exactly the 7 fixed rows in order with exact values', async () => {
    const res = await list(adminAuth()).expect(200);
    const body = res.body as PeriodBody[];
    expect(body).toHaveLength(7);
    expect(body.map(({ id: _id, ...rest }) => rest)).toEqual(FIXED);
  });

  it('AC-16.3 each row exposes exactly {id, order, label, startTime, endTime, isBreak}', async () => {
    const res = await list(adminAuth()).expect(200);
    for (const row of res.body as PeriodBody[]) {
      expect(Object.keys(row).sort()).toEqual(
        ['endTime', 'id', 'isBreak', 'label', 'order', 'startTime'].sort(),
      );
      expect(typeof row.id).toBe('string');
      expect(row.id.length).toBeGreaterThan(0);
    }
  });

  it('AC-16.3 periods are contiguous, start at 08:00 and end at 13:00', async () => {
    const body = (await list(adminAuth()).expect(200)).body as PeriodBody[];
    expect(body[0].startTime).toBe('08:00');
    expect(body[body.length - 1].endTime).toBe('13:00');
    for (let i = 0; i < body.length - 1; i++) {
      expect(body[i].endTime).toBe(body[i + 1].startTime);
    }
  });

  it('AC-16.3 has exactly one break row, labelled Recess, 10:15 to 10:45', async () => {
    const body = (await list(adminAuth()).expect(200)).body as PeriodBody[];
    const breaks = body.filter((p) => p.isBreak);
    expect(breaks).toHaveLength(1);
    expect(breaks[0]).toMatchObject({ label: 'Recess', startTime: '10:15', endTime: '10:45' });
    expect(body.filter((p) => !p.isBreak)).toHaveLength(6);
  });

  it('AC-16.3 database holds exactly 7 Period rows and one isBreak row', async () => {
    const rows = await prisma.period.findMany({ orderBy: { order: 'asc' } });
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(rows.filter((r) => r.isBreak)).toHaveLength(1);
    expect(await prisma.period.count({ where: { isBreak: true } })).toBe(1);
  });

  it('T-020 drift guard: Period rows in the DB deep-equal FIXED_PERIODS', async () => {
    const rows = await prisma.period.findMany({ orderBy: { order: 'asc' } });
    expect(rows).toEqual(FIXED_PERIODS.map((p) => ({ ...p })));
  });

  it('T-020 drift guard: migration INSERT contains every FIXED_PERIODS row', () => {
    const migrationsDir = join(__dirname, '../../prisma/migrations');
    const files = readdirSync(migrationsDir)
      .filter((d) => /_add_period$/.test(d))
      .map((d) => join(migrationsDir, d, 'migration.sql'))
      .filter((f) => existsSync(f));
    expect(files).toHaveLength(1);
    const sql = readFileSync(files[0], 'utf8');
    const insert = sql.slice(sql.indexOf('INSERT INTO "Period"'));
    expect(insert.startsWith('INSERT INTO "Period"')).toBe(true);
    for (const p of FIXED_PERIODS) {
      const row = `('${p.id}', ${p.order}, '${p.label}', '${p.startTime}', '${p.endTime}', ${p.isBreak})`;
      expect(insert, `migration row for ${p.id}`).toContain(row);
    }
    expect((insert.match(/^\s*\('/gm) ?? []).length).toBe(FIXED_PERIODS.length);
  });

  it('T-020 teacher can read periods', async () => {
    const res = await list(`Bearer ${tokenFor('teacher')}`).expect(200);
    expect(res.body).toHaveLength(7);
  });

  it('T-020 student can read periods', async () => {
    const res = await list(`Bearer ${tokenFor('student')}`).expect(200);
    expect(res.body).toHaveLength(7);
  });

  it('T-020 admin can read periods', async () => {
    const res = await list(adminAuth()).expect(200);
    expect(res.body).toHaveLength(7);
  });

  it('T-020 no token returns 401', async () => {
    await http().get('/api/periods').expect(401);
  });

  it('T-020 POST /api/periods is not a route (404)', async () => {
    await http()
      .post('/api/periods')
      .set('Authorization', adminAuth())
      .send({ order: 8, label: 'X', startTime: '13:00', endTime: '13:45' })
      .expect(404);
  });

  it('T-020 PATCH /api/periods/:id is not a route (404)', async () => {
    const [first] = (await list(adminAuth()).expect(200)).body as PeriodBody[];
    await http()
      .patch(`/api/periods/${first.id}`)
      .set('Authorization', adminAuth())
      .send({ label: 'Changed' })
      .expect(404);
  });

  it('T-020 DELETE /api/periods/:id is not a route (404)', async () => {
    const [first] = (await list(adminAuth()).expect(200)).body as PeriodBody[];
    await http().delete(`/api/periods/${first.id}`).set('Authorization', adminAuth()).expect(404);
    expect(await prisma.period.count()).toBe(7);
  });
});

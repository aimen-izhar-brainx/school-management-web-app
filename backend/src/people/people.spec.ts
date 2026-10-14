import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { ClassesModule } from '../classes/classes.module.js';
import { MailService } from '../mail/mail.service.js';
import { PeopleModule } from './people.module.js';

const PREFIX = `people-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;

interface Person {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  employeeId: string | null;
  rollNumber: string | null;
  dateOfBirth: string | null;
  section: { id: string; name: string; className: string } | null;
  parent: { id: string; name: string } | null;
  children: { id: string; name: string }[];
  passwordHash?: string;
}

describe('People CRUD', () => {
  let ctx: DbTestApp;
  // Replaces the SMTP send on the real MailService (created by PeopleModule's own MailModule import).
  const sendInviteEmail = vi.spyOn(MailService.prototype, 'sendInviteEmail').mockResolvedValue(undefined);
  let seq = 0;
  const email = (l = 'p') => `${l}-${++seq}${EMAIL_SUFFIX}`;
  const auth = () => ctx.adminAuth();
  const create = (body: Record<string, unknown>) =>
    ctx.http().post('/api/people').set('Authorization', auth()).send(body);

  beforeAll(async () => {
    // MailService only builds a transport at construction (no connection), so dummy values suffice.
    process.env.SMTP_HOST ??= 'localhost';
    process.env.SMTP_USER ??= 'u';
    process.env.SMTP_PASS ??= 'p';
    ctx = await createTestApp({ imports: [PeopleModule, ClassesModule] });
  });

  afterEach(async () => {
    sendInviteEmail.mockClear();
    await ctx.prisma.class.deleteMany({ where: { name: { startsWith: PREFIX, mode: 'insensitive' } } });
    await ctx.prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('access', () => {
    it.each(['teacher', 'student', 'parent'])('%s tokens get 403 on every endpoint', async (role) => {
      const h = { Authorization: `Bearer ${ctx.tokenFor(role)}` };
      await ctx.http().get('/api/people?role=teacher').set(h).expect(403);
      await ctx.http().post('/api/people').set(h).send({}).expect(403);
      await ctx.http().patch('/api/people/x').set(h).send({}).expect(403);
      await ctx.http().delete('/api/people/x').set(h).expect(403);
    });

    it('requires authentication', async () => {
      await ctx.http().get('/api/people?role=teacher').expect(401);
    });
  });

  describe('create', () => {
    it('creates a teacher, lowercases the email, and sends an invite without leaking secrets', async () => {
      const addr = email('Teacher');
      const res = await create({
        role: 'teacher', name: '  Tara Teacher ', email: addr.toUpperCase(),
        phone: '555', employeeId: 'E-1', department: 'Maths', joiningDate: '2024-09-01',
      }).expect(201);
      const body = res.body as Person & Record<string, unknown>;
      expect(body).toMatchObject({
        name: 'Tara Teacher', email: addr.toLowerCase(), role: 'teacher',
        phone: '555', employeeId: 'E-1', department: 'Maths', joiningDate: '2024-09-01',
      });
      expect(body.passwordHash).toBeUndefined();
      expect(sendInviteEmail).toHaveBeenCalledWith(addr.toLowerCase(), 'Tara Teacher', expect.any(String));
      const tokens = await ctx.prisma.passwordResetToken.count({ where: { userId: body.id, usedAt: null } });
      expect(tokens).toBe(1);
    });

    it('creates a student placed in a section and linked to a parent', async () => {
      const cls = (await ctx.http().post('/api/classes').set('Authorization', auth())
        .send({ name: `${PREFIX}c` }).expect(201)).body as { id: string };
      const sec = (await ctx.http().post(`/api/classes/${cls.id}/sections`).set('Authorization', auth())
        .send({ name: 'A' }).expect(201)).body as { id: string };
      const parent = (await create({ role: 'parent', name: 'Pat', email: email() }).expect(201)).body as Person;

      const res = await create({
        role: 'student', name: 'Sam', email: email(), sectionId: sec.id, parentId: parent.id,
        dateOfBirth: '2015-05-04', rollNumber: '7',
      }).expect(201);
      const student = res.body as Person;
      expect(student.section).toEqual({ id: sec.id, name: 'A', className: `${PREFIX}c` });
      expect(student.parent).toEqual({ id: parent.id, name: 'Pat' });
      expect(student.dateOfBirth).toBe('2015-05-04');

      const list = (await ctx.http().get('/api/people?role=parent').set('Authorization', auth()).expect(200))
        .body as Person[];
      expect(list.find((p) => p.id === parent.id)?.children).toEqual([{ id: student.id, name: 'Sam' }]);
    });

    it('links students when creating a parent', async () => {
      const s = (await create({ role: 'student', name: 'S1', email: email() }).expect(201)).body as Person;
      const p = (await create({ role: 'parent', name: 'P1', email: email(), studentIds: [s.id] })
        .expect(201)).body as Person;
      expect(p.children).toEqual([{ id: s.id, name: 'S1' }]);
    });

    it('ignores fields that do not belong to the role', async () => {
      const res = await create({ role: 'parent', name: 'P', email: email(), employeeId: 'X', rollNumber: '9' })
        .expect(201);
      expect((res.body as Person).employeeId).toBeNull();
      expect((res.body as Person).rollNumber).toBeNull();
    });

    it('rejects a duplicate email (case-insensitively) with 409', async () => {
      const addr = email();
      await create({ role: 'teacher', name: 'A', email: addr }).expect(201);
      const res = await create({ role: 'parent', name: 'B', email: addr.toUpperCase() }).expect(409);
      expect((res.body as { message: string }).message).toMatch(/already exists/);
    });

    it('rejects a duplicate employee ID with 409', async () => {
      await create({ role: 'teacher', name: 'A', email: email(), employeeId: 'DUP-1' }).expect(201);
      const res = await create({ role: 'teacher', name: 'B', email: email(), employeeId: 'DUP-1' }).expect(409);
      expect((res.body as { message: string }).message).toMatch(/employee ID/);
    });

    it('allows the same roll number in different sections but not within one', async () => {
      const cls = (await ctx.http().post('/api/classes').set('Authorization', auth())
        .send({ name: `${PREFIX}roll` }).expect(201)).body as { id: string };
      const section = async (name: string) => (await ctx.http().post(`/api/classes/${cls.id}/sections`)
        .set('Authorization', auth()).send({ name }).expect(201)).body as { id: string };
      const [a, b] = [await section('A'), await section('B')];
      const student = (sectionId: string) =>
        create({ role: 'student', name: 'S', email: email(), sectionId, rollNumber: '9' });
      await student(a.id).expect(201);
      await student(b.id).expect(201);
      const res = await student(a.id).expect(409);
      expect((res.body as { message: string }).message).toMatch(/roll number/);
    });

    it.each([
      ['role admin', { role: 'admin', name: 'X', email: 'x@x.test' }],
      ['missing name', { role: 'teacher', email: 'x@x.test' }],
      ['blank name', { role: 'teacher', name: '   ', email: 'x@x.test' }],
      ['bad email', { role: 'teacher', name: 'X', email: 'nope' }],
      ['bad gender', { role: 'teacher', name: 'X', email: 'x@x.test', gender: 'robot' }],
      ['bad date', { role: 'teacher', name: 'X', email: 'x@x.test', joiningDate: 'tomorrow' }],
    ])('rejects %s with 400', async (_l, body) => {
      await create(body).expect(400);
    });

    it('rejects a missing section with 404 and a non-parent parentId with 400, creating nothing', async () => {
      const t = (await create({ role: 'teacher', name: 'T', email: email() }).expect(201)).body as Person;
      await create({ role: 'student', name: 'S', email: email(), sectionId: 'nope' }).expect(404);
      await create({ role: 'student', name: 'S', email: email(), parentId: t.id }).expect(400);
      await create({ role: 'parent', name: 'P', email: email(), studentIds: [t.id] }).expect(400);
      expect(await ctx.prisma.user.count({ where: { email: { endsWith: EMAIL_SUFFIX } } })).toBe(1);
    });

    it('still succeeds when the invite email fails', async () => {
      sendInviteEmail.mockRejectedValueOnce(new Error('smtp down'));
      await create({ role: 'teacher', name: 'T', email: email() }).expect(201);
    });
  });

  describe('list', () => {
    it('returns only the requested role, sorted by name, and validates role', async () => {
      await create({ role: 'teacher', name: `${PREFIX}b`, email: email() }).expect(201);
      await create({ role: 'teacher', name: `${PREFIX}a`, email: email() }).expect(201);
      await create({ role: 'student', name: `${PREFIX}s`, email: email() }).expect(201);
      const rows = (await ctx.http().get('/api/people?role=teacher').set('Authorization', auth()).expect(200))
        .body as Person[];
      const mine = rows.filter((r) => r.name.startsWith(PREFIX));
      expect(mine.map((r) => r.name)).toEqual([`${PREFIX}a`, `${PREFIX}b`]);
      expect(rows.every((r) => r.role === 'teacher')).toBe(true);
      await ctx.http().get('/api/people?role=admin').set('Authorization', auth()).expect(400);
      await ctx.http().get('/api/people').set('Authorization', auth()).expect(400);
    });
  });

  describe('update', () => {
    it('updates fields, clears with null, and changes email', async () => {
      const t = (await create({ role: 'teacher', name: 'T', email: email(), phone: '1', department: 'Art' })
        .expect(201)).body as Person;
      const newEmail = email();
      const res = await ctx.http().patch(`/api/people/${t.id}`).set('Authorization', auth())
        .send({ name: 'Tina', email: newEmail, phone: null, employeeId: 'E9' }).expect(200);
      expect(res.body).toMatchObject({
        name: 'Tina', email: newEmail, phone: null, employeeId: 'E9', department: 'Art',
      });
    });

    it('moves a student between sections and unlinks a parent', async () => {
      const cls = (await ctx.http().post('/api/classes').set('Authorization', auth())
        .send({ name: `${PREFIX}u` }).expect(201)).body as { id: string };
      const mk = async (n: string) => ((await ctx.http().post(`/api/classes/${cls.id}/sections`)
        .set('Authorization', auth()).send({ name: n }).expect(201)).body as { id: string });
      const [a, b] = [await mk('A'), await mk('B')];
      const p = (await create({ role: 'parent', name: 'P', email: email() }).expect(201)).body as Person;
      const s = (await create({ role: 'student', name: 'S', email: email(), sectionId: a.id, parentId: p.id })
        .expect(201)).body as Person;
      const res = await ctx.http().patch(`/api/people/${s.id}`).set('Authorization', auth())
        .send({ sectionId: b.id, parentId: null }).expect(200);
      expect((res.body as Person).section?.id).toBe(b.id);
      expect((res.body as Person).parent).toBeNull();
    });

    it('replaces a parent\'s linked students', async () => {
      const s1 = (await create({ role: 'student', name: 'S1', email: email() }).expect(201)).body as Person;
      const s2 = (await create({ role: 'student', name: 'S2', email: email() }).expect(201)).body as Person;
      const p = (await create({ role: 'parent', name: 'P', email: email(), studentIds: [s1.id] })
        .expect(201)).body as Person;
      const res = await ctx.http().patch(`/api/people/${p.id}`).set('Authorization', auth())
        .send({ studentIds: [s2.id] }).expect(200);
      expect((res.body as Person).children.map((c) => c.id)).toEqual([s2.id]);
      expect((await ctx.prisma.user.findUnique({ where: { id: s1.id } }))?.parentId).toBeNull();
    });

    it('409 on email clash, 400 on null name/invalid email, 404 for unknown or admin targets', async () => {
      const a = (await create({ role: 'teacher', name: 'A', email: email() }).expect(201)).body as Person;
      const b = (await create({ role: 'teacher', name: 'B', email: email() }).expect(201)).body as Person;
      const patch = (id: string, body: object) =>
        ctx.http().patch(`/api/people/${id}`).set('Authorization', auth()).send(body);
      await patch(b.id, { email: a.email }).expect(409);
      await patch(b.id, { email: 'bad' }).expect(400);
      await patch('missing-id', { name: 'x' }).expect(404);
      const admin = await ctx.prisma.user.create({
        data: { name: 'adm', email: email('adm'), passwordHash: 'x', role: 'admin' },
      });
      await patch(admin.id, { name: 'hacked' }).expect(404);
      await ctx.http().delete(`/api/people/${admin.id}`).set('Authorization', auth()).expect(404);
      expect((await ctx.prisma.user.findUnique({ where: { id: admin.id } }))?.name).toBe('adm');
    });
  });

  describe('delete and invite', () => {
    it('deletes a person (204), then 404; their students are unlinked, not deleted', async () => {
      const p = (await create({ role: 'parent', name: 'P', email: email() }).expect(201)).body as Person;
      const s = (await create({ role: 'student', name: 'S', email: email(), parentId: p.id }).expect(201))
        .body as Person;
      await ctx.http().delete(`/api/people/${p.id}`).set('Authorization', auth()).expect(204);
      await ctx.http().delete(`/api/people/${p.id}`).set('Authorization', auth()).expect(404);
      expect((await ctx.prisma.user.findUnique({ where: { id: s.id } }))?.parentId).toBeNull();
    });

    it('refuses to delete a teacher who is on the timetable (409) and keeps them', async () => {
      const t = (await create({ role: 'teacher', name: 'T', email: email() }).expect(201)).body as Person;
      const cls = await ctx.prisma.class.create({ data: { name: `${PREFIX}tt` } });
      const sec = await ctx.prisma.section.create({ data: { name: 'A', classId: cls.id } });
      const subject = await ctx.prisma.subject.create({ data: { name: `${PREFIX}subj` } });
      const period = await ctx.prisma.period.findFirstOrThrow({ where: { isBreak: false } });
      await ctx.prisma.timetableEntry.create({
        data: { sectionId: sec.id, periodId: period.id, dayOfWeek: 'mon', subjectId: subject.id, teacherId: t.id },
      });
      try {
        await ctx.http().delete(`/api/people/${t.id}`).set('Authorization', auth()).expect(409);
        expect(await ctx.prisma.user.findUnique({ where: { id: t.id } })).not.toBeNull();
      } finally {
        await ctx.prisma.subject.deleteMany({ where: { id: subject.id } }).catch(() => undefined);
      }
    });

    it('resend invite issues a new token, voids the old one and re-sends', async () => {
      const t = (await create({ role: 'teacher', name: 'T', email: email() }).expect(201)).body as Person;
      sendInviteEmail.mockClear();
      await ctx.http().post(`/api/people/${t.id}/invite`).set('Authorization', auth()).expect(204);
      expect(sendInviteEmail).toHaveBeenCalledTimes(1);
      expect(await ctx.prisma.passwordResetToken.count({ where: { userId: t.id, usedAt: null } })).toBe(1);
      await ctx.http().post('/api/people/missing/invite').set('Authorization', auth()).expect(404);
    });
  });
});

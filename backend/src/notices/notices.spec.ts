import bcrypt from 'bcrypt';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type DbTestApp } from '../../test/helpers/test-app.js';
import { MailService } from '../mail/mail.service.js';
import { NoticesModule } from './notices.module.js';

const PREFIX = `t900-${Date.now().toString(36)}-`;
const EMAIL_SUFFIX = `@${PREFIX}example.test`;

interface NoticeOut {
  id: string;
  title: string;
  postedBy: string;
  class: { id: string; name: string } | null;
  canDelete: boolean;
}

describe('Notices', () => {
  let ctx: DbTestApp;
  const sendNoticeEmail = vi.spyOn(MailService.prototype, 'sendNoticeEmail').mockResolvedValue(undefined);
  let seq = 0;

  const mkUser = async (role: 'admin' | 'teacher' | 'student' | 'parent', extra: Record<string, unknown> = {}) => {
    const n = ++seq;
    const user = await ctx.prisma.user.create({
      data: {
        name: `${role}-${n}`,
        email: `${role}-${n}${EMAIL_SUFFIX}`,
        passwordHash: await bcrypt.hash('x', 4),
        role,
        ...extra,
      },
    });
    return { user, auth: { Authorization: `Bearer ${ctx.tokenFor(role, user.id)}` } };
  };
  const mkSection = async (name: string) => {
    const cls = await ctx.prisma.class.create({ data: { name: `${PREFIX}${name}` } });
    const section = await ctx.prisma.section.create({ data: { name: 'A', classId: cls.id } });
    return { cls, section };
  };
  const titles = async (auth: Record<string, string>) =>
    ((await ctx.http().get('/api/notices').set(auth).expect(200)).body as NoticeOut[]).map((n) => n.title);

  beforeAll(async () => {
    process.env.SMTP_HOST ??= 'localhost';
    process.env.SMTP_USER ??= 'u';
    process.env.SMTP_PASS ??= 'p';
    ctx = await createTestApp({ imports: [NoticesModule] });
  });

  afterEach(async () => {
    sendNoticeEmail.mockClear();
    await ctx.prisma.notice.deleteMany({ where: { title: { startsWith: PREFIX } } });
    await ctx.prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
    await ctx.prisma.class.deleteMany({ where: { name: { startsWith: PREFIX, mode: 'insensitive' } } });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('requires authentication', async () => {
    await ctx.http().get('/api/notices').expect(401);
  });

  it('only admins and teachers can post or delete', async () => {
    const student = await mkUser('student');
    await ctx.http().post('/api/notices').set(student.auth).send({ title: 'x', description: 'y' }).expect(403);
    await ctx.http().delete('/api/notices/x').set(student.auth).expect(403);
  });

  it('validates title, description and class', async () => {
    const admin = await mkUser('admin');
    const post = (body: object) => ctx.http().post('/api/notices').set(admin.auth).send(body);
    await post({ title: '  ', description: 'y' }).expect(400);
    await post({ title: 'x', description: '' }).expect(400);
    await post({ title: `${PREFIX}x`, description: 'y', classId: 'missing' }).expect(400);
  });

  it('shows each role only the notices aimed at them', async () => {
    const admin = await mkUser('admin');
    const teacher = await mkUser('teacher');
    const { cls: c1, section: s1 } = await mkSection('c1');
    const { cls: c2 } = await mkSection('c2');
    const student = await mkUser('student', { sectionId: s1.id });
    const parent = await mkUser('parent');
    await ctx.prisma.user.update({ where: { id: student.user.id }, data: { parentId: parent.user.id } });
    const outsider = await mkUser('student');

    const post = (title: string, classId?: string) =>
      ctx.http().post('/api/notices').set(admin.auth).send({ title: `${PREFIX}${title}`, description: 'd', classId }).expect(201);
    await post('all');
    await post('c1', c1.id);
    await post('c2', c2.id);

    expect(await titles(student.auth)).toEqual(expect.arrayContaining([`${PREFIX}all`, `${PREFIX}c1`]));
    expect(await titles(student.auth)).not.toContain(`${PREFIX}c2`);
    expect(await titles(parent.auth)).not.toContain(`${PREFIX}c2`);
    expect(await titles(parent.auth)).toContain(`${PREFIX}c1`);
    expect(await titles(outsider.auth)).not.toContain(`${PREFIX}c1`);
    expect(await titles(teacher.auth)).toEqual(expect.arrayContaining([`${PREFIX}c1`, `${PREFIX}c2`]));
  });

  it('emails the class students and parents, not the author, and survives mail failure', async () => {
    const teacher = await mkUser('teacher');
    const { cls, section } = await mkSection('mail');
    const student = await mkUser('student', { sectionId: section.id });
    const parent = await mkUser('parent');
    await ctx.prisma.user.update({ where: { id: student.user.id }, data: { parentId: parent.user.id } });
    await mkUser('student');

    sendNoticeEmail.mockRejectedValueOnce(new Error('smtp down'));
    await ctx.http().post('/api/notices').set(teacher.auth)
      .send({ title: `${PREFIX}mail`, description: 'd', classId: cls.id }).expect(201);

    await vi.waitFor(() => expect(sendNoticeEmail).toHaveBeenCalledTimes(1));
    const [recipients, info] = sendNoticeEmail.mock.calls[0];
    expect([...recipients].sort()).toEqual([parent.user.email, student.user.email].sort());
    expect(info).toMatchObject({ audience: cls.name, postedBy: teacher.user.name });
  });

  it('lets a teacher delete only their own notice; admin can delete any', async () => {
    const teacher = await mkUser('teacher');
    const other = await mkUser('teacher');
    const admin = await mkUser('admin');
    const res = await ctx.http().post('/api/notices').set(other.auth)
      .send({ title: `${PREFIX}own`, description: 'd' }).expect(201);
    const id = (res.body as NoticeOut).id;

    const listed = (await ctx.http().get('/api/notices').set(teacher.auth)).body as NoticeOut[];
    expect(listed.find((n) => n.id === id)?.canDelete).toBe(false);
    await ctx.http().delete(`/api/notices/${id}`).set(teacher.auth).expect(403);
    await ctx.http().delete(`/api/notices/${id}`).set(admin.auth).expect(204);
    await ctx.http().delete(`/api/notices/${id}`).set(admin.auth).expect(404);
  });

  it('honours ?limit', async () => {
    const admin = await mkUser('admin');
    for (const t of ['a', 'b', 'c']) {
      await ctx.http().post('/api/notices').set(admin.auth).send({ title: `${PREFIX}${t}`, description: 'd' });
    }
    const res = await ctx.http().get('/api/notices?limit=2').set(admin.auth).expect(200);
    expect((res.body as NoticeOut[]).length).toBe(2);
  });
});

import {
  BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { MailService } from '../mail/mail.service.js';
import { prismaErrorCode } from '../common/prisma-errors.js';
import type { Prisma, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateNoticeDto } from './dto/create-notice.dto.js';

const DEFAULT_LIST_LIMIT = 50;
const CLASS_GONE ='This class no longer exists.';
const NOTICE_GONE = 'This notice no longer exists.';

const NOTICE_SELECT = {
  id: true, title: true, description: true, createdAt: true,
  authorName: true, authorRole: true,
  class: { select: { id: true, name: true } },
} satisfies Prisma.NoticeSelect;

type NoticeRow = Prisma.NoticeGetPayload<{ select: typeof NOTICE_SELECT }>;

function present(row: NoticeRow, caller: { id: string; role: Role }, authorId: string | null) {
  const { authorName, authorRole, ...rest } = row;
  return {
    ...rest,
    postedBy: authorName,
    postedByRole: authorRole,
    canDelete: caller.role === 'admin' || (caller.role === 'teacher' && authorId === caller.id),
  };
}

@Injectable()
export class NoticesService {
  private readonly logger = new Logger(NoticesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Admins and teachers see everything; a student sees school-wide plus their class; a parent, plus their children's classes. */
  private async audienceWhere(userId: string, role: Role): Promise<Prisma.NoticeWhereInput> {
    if (role === 'admin' || role === 'teacher') return {};
    const sections = await this.prisma.section.findMany({
      where: role === 'student' ? { students: { some: { id: userId } } } : { students: { some: { parentId: userId } } },
      select: { classId: true },
    });
    const classIds = [...new Set(sections.map((s) => s.classId))];
    return { OR: [{ classId: null }, { classId: { in: classIds } }] };
  }

  async list(userId: string, role: Role, limit?: number) {
    const where = await this.audienceWhere(userId, role);
    const rows = await this.prisma.notice.findMany({
      where,
      select: { ...NOTICE_SELECT, authorId: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit ?? DEFAULT_LIST_LIMIT,
    });
    return rows.map(({ authorId, ...row }) => present(row, { id: userId, role }, authorId));
  }

  async create(authorId: string, dto: CreateNoticeDto) {
    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { id: true, name: true, role: true },
    });
    if (!author) throw new UnauthorizedException();

    const classId = dto.classId ?? null;
    let row: NoticeRow;
    try {
      row = await this.prisma.notice.create({
        data: {
          title: dto.title,
          description: dto.description,
          classId,
          authorId: author.id,
          authorName: author.name,
          authorRole: author.role,
        },
        select: NOTICE_SELECT,
      });
    } catch (error) {
      if (prismaErrorCode(error) === 'P2003') throw new BadRequestException(CLASS_GONE);
      throw error;
    }

    // Email delivery must never fail or slow the post itself.
    void this.notifyRecipients(row, author.id).catch((error: unknown) =>
      this.logger.error(`Notice email failed for ${row.id}: ${error instanceof Error ? error.message : error}`),
    );
    return present(row, author, author.id);
  }

  async remove(id: string, userId: string, role: Role) {
    const notice = await this.prisma.notice.findUnique({ where: { id }, select: { authorId: true } });
    if (!notice) throw new NotFoundException(NOTICE_GONE);
    if (role !== 'admin' && notice.authorId !== userId) {
      throw new ForbiddenException('You can only delete notices you posted.');
    }
    try {
      await this.prisma.notice.delete({ where: { id } });
    } catch (error) {
      if (prismaErrorCode(error) === 'P2025') throw new NotFoundException(NOTICE_GONE);
      throw error;
    }
  }

  /** Everyone for a school-wide notice; otherwise the class's students and their parents. The author is skipped. */
  private async notifyRecipients(notice: NoticeRow, authorId: string) {
    const where: Prisma.UserWhereInput = notice.class
      ? {
          OR: [
            { section: { classId: notice.class.id } },
            { children: { some: { section: { classId: notice.class.id } } } },
          ],
        }
      : {};
    const users = await this.prisma.user.findMany({
      where: { ...where, id: { not: authorId } },
      select: { email: true },
    });
    await this.mail.sendNoticeEmail(
      users.map((u) => u.email),
      { title: notice.title, description: notice.description, audience: notice.class?.name ?? null, postedBy: notice.authorName },
    );
  }
}

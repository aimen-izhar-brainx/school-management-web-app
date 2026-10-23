import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/pagination.dto.js';
import { CreateNoticeDto } from './dto/create-notice.dto.js';

const NOTICE_SELECT = {
  id: true,
  title: true,
  description: true,
  audience: true,
  createdAt: true,
  postedBy: { select: { id: true, name: true, role: true } },
} as const;

export type NoticeView = Prisma.NoticeGetPayload<{
  select: typeof NOTICE_SELECT;
}>;

export interface NoticePage {
  items: NoticeView[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class NoticeService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    role: Role,
    { page, limit }: PaginationDto,
  ): Promise<NoticePage> {
    // Admins and teachers manage the board, so they see everything; students
    // and parents only see notices for everyone or their own role.
    const where =
      role === 'admin' || role === 'teacher'
        ? {}
        : { audience: { in: ['all' as const, role] } };
    const [items, total] = await Promise.all([
      this.prisma.notice.findMany({
        where,
        select: NOTICE_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notice.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  create(postedById: string, dto: CreateNoticeDto): Promise<NoticeView> {
    return this.prisma.notice.create({
      data: { ...dto, postedById },
      select: NOTICE_SELECT,
    });
  }

  async remove(id: string, userId: string, role: Role): Promise<void> {
    const notice = await this.prisma.notice.findUnique({
      where: { id },
      select: { postedById: true },
    });
    if (!notice) throw new NotFoundException('Notice not found.');
    if (role !== 'admin' && notice.postedById !== userId) {
      throw new ForbiddenException('You can only delete your own notices.');
    }
    await this.prisma.notice.delete({ where: { id } });
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { DayOfWeek, Prisma } from '../generated/prisma/client.js';
import { PeriodsService } from '../periods/periods.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const SECTION_NOT_FOUND = 'This section no longer exists.';
const NOT_ON_CLASS = 'This subject is not assigned to this class.';
const NO_TEACHER = 'Assign a teacher to this subject first.';
const ENTRY_SELECT = {
  id: true,
  periodId: true,
  dayOfWeek: true,
  subject: { select: { id: true, name: true } },
  teacher: { select: { id: true, name: true } },
} as const;

@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
  ) {}

  async getGrid(sectionId: string) {
    await this.findSection(sectionId);
    const [periods, entries] = await Promise.all([
      this.periods.list(),
      this.prisma.timetableEntry.findMany({
        where: { sectionId },
        select: ENTRY_SELECT,
        orderBy: [{ dayOfWeek: 'asc' }, { period: { order: 'asc' } }],
      }),
    ]);
    return { periods, entries };
  }

  async place(sectionId: string, periodId: string, dayOfWeek: DayOfWeek, subjectId: string) {
    const section = await this.findSection(sectionId);
    const key = { sectionId, periodId, dayOfWeek };
    try {
      // Lock the ClassSubject row so a concurrent class-subject removal waits for this write.
      return await this.prisma.$transaction(async (tx) => {
        const teacherId = await this.lockTeacher(tx, section.classId, subjectId);
        return tx.timetableEntry.upsert({
          where: { sectionId_periodId_dayOfWeek: key },
          create: { ...key, subjectId, teacherId },
          update: { subjectId, teacherId },
          select: ENTRY_SELECT,
        });
      });
    } catch (e) {
      throw this.translate(e);
    }
  }

  async clear(sectionId: string, periodId: string, dayOfWeek: DayOfWeek) {
    await this.findSection(sectionId);
    await this.prisma.timetableEntry.deleteMany({ where: { sectionId, periodId, dayOfWeek } });
  }

  private async findSection(sectionId: string) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      select: { id: true, classId: true },
    });
    if (!section) throw new NotFoundException(SECTION_NOT_FOUND);
    return section;
  }

  private async lockTeacher(tx: Prisma.TransactionClient, classId: string, subjectId: string) {
    const rows = await tx.$queryRaw<{ teacherId: string | null }[]>`
      SELECT "teacherId" FROM "ClassSubject"
      WHERE "classId" = ${classId} AND "subjectId" = ${subjectId} FOR UPDATE`;
    if (rows.length === 0) throw new BadRequestException(NOT_ON_CLASS);
    if (!rows[0].teacherId) throw new BadRequestException(NO_TEACHER);
    return rows[0].teacherId;
  }

  // P2003 = section/period/subject/teacher vanished mid-request.
  private translate(e: unknown): unknown {
    if ((e as { code?: string })?.code === 'P2003') {
      return new BadRequestException('This slot can no longer be saved. Please refresh and retry.');
    }
    return e;
  }
}

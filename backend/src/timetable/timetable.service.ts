import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DayOfWeek, Prisma } from '../generated/prisma/client.js';
import { prismaErrorCode, violatedConstraintFields } from '../common/prisma-errors.js';
import { PeriodsService } from '../periods/periods.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ENTRY_ORDER_BY, ENTRY_SELECT } from './entry-select.js';

const SECTION_NOT_FOUND = 'This section no longer exists.';
const PERIOD_NOT_FOUND = 'This period does not exist.';
const SUBJECT_NOT_FOUND = 'This subject no longer exists.';
const BREAK_PERIOD = 'Cannot schedule a subject during a break.';
const NOT_ON_CLASS = 'This subject is not assigned to this class.';
const NO_TEACHER = 'Assign a teacher to this subject first.';
const SLOT_CHANGED = 'This slot was just changed by someone else. Please try again.';
const TEACHER_BUSY = 'Teacher is already scheduled at this time.';

type TeacherSlot = {
  sectionId: string;
  teacherId: string;
  periodId: string;
  dayOfWeek: DayOfWeek;
};

@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
  ) {}

  async getGrid(sectionId: string) {
    await this.findSection(sectionId);
    return this.gridFor(sectionId);
  }

  // Grid without the section existence check, for callers that already read the section.
  async gridFor(sectionId: string) {
    const [periods, entries] = await Promise.all([
      this.periods.list(),
      this.prisma.timetableEntry.findMany({
        where: { sectionId },
        select: ENTRY_SELECT,
        orderBy: [...ENTRY_ORDER_BY],
      }),
    ]);
    return { periods, entries };
  }

  async place(sectionId: string, periodId: string, dayOfWeek: DayOfWeek, subjectId: string) {
    const section = await this.findSection(sectionId);
    await this.assertSchedulablePeriod(periodId);
    await this.assertSubjectExists(subjectId);
    const key = { sectionId, periodId, dayOfWeek };
    let teacherId: string | undefined;
    // Lock the ClassSubject row so a concurrent class-subject removal waits for this write.
    const write = () =>
      this.prisma.$transaction(async (tx) => {
        teacherId = await this.lockTeacher(tx, section.classId, subjectId);
        await this.assertTeacherFree(tx, { ...key, teacherId });
        return tx.timetableEntry.upsert({
          where: { sectionId_periodId_dayOfWeek: key },
          create: { ...key, subjectId, teacherId },
          update: { subjectId, teacherId },
          select: ENTRY_SELECT,
        });
      });
    try {
      try {
        return await write();
      } catch (e) {
        // Two concurrent inserts for the same slot: the loser retries once and becomes an update.
        if (!this.isSectionSlotRace(e)) throw e;
        return await write();
      }
    } catch (e) {
      throw await this.translate(e, { ...key, teacherId });
    }
  }

  async clear(sectionId: string, periodId: string, dayOfWeek: DayOfWeek) {
    await this.findSection(sectionId);
    await this.prisma.timetableEntry.deleteMany({
      where: { sectionId, periodId, dayOfWeek },
    });
  }

  private async findSection(sectionId: string) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      select: { id: true, classId: true },
    });
    if (!section) throw new NotFoundException(SECTION_NOT_FOUND);
    return section;
  }

  private async assertSchedulablePeriod(periodId: string) {
    const period = await this.prisma.period.findUnique({
      where: { id: periodId },
      select: { isBreak: true },
    });
    if (!period) throw new NotFoundException(PERIOD_NOT_FOUND);
    if (period.isBreak) throw new BadRequestException(BREAK_PERIOD);
  }

  private async assertSubjectExists(subjectId: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true },
    });
    if (!subject) throw new NotFoundException(SUBJECT_NOT_FOUND);
  }

  private async lockTeacher(tx: Prisma.TransactionClient, classId: string, subjectId: string) {
    const rows = await tx.$queryRaw<{ teacherId: string | null }[]>`
      SELECT "teacherId" FROM "ClassSubject"
      WHERE "classId" = ${classId} AND "subjectId" = ${subjectId} FOR UPDATE`;
    if (rows.length === 0) throw new BadRequestException(NOT_ON_CLASS);
    if (!rows[0].teacherId) throw new BadRequestException(NO_TEACHER);
    return rows[0].teacherId;
  }

  private async assertTeacherFree(tx: Prisma.TransactionClient, slot: TeacherSlot) {
    const conflict = await this.findTeacherConflict(tx, slot);
    if (conflict) throw conflict;
  }

  // Looks for the teacher's booking at this slot in a different section.
  private async findTeacherConflict(
    db: Pick<Prisma.TransactionClient, 'timetableEntry'>,
    slot: TeacherSlot,
  ) {
    const { sectionId, teacherId, periodId, dayOfWeek } = slot;
    const other = await db.timetableEntry.findFirst({
      where: { teacherId, periodId, dayOfWeek, sectionId: { not: sectionId } },
      select: {
        section: {
          select: { id: true, name: true, class: { select: { name: true } } },
        },
      },
    });
    if (!other) return null;
    const sectionLabel = `${other.section.class.name}-${other.section.name}`;
    return new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: `Teacher is already scheduled for ${sectionLabel} at this time.`,
      conflict: { sectionId: other.section.id, sectionLabel },
    });
  }

  // P2002 on the section-slot unique (its columns include sectionId; the teacher unique's don't).
  private isSectionSlotRace(e: unknown) {
    return (
      prismaErrorCode(e) === 'P2002' && violatedConstraintFields(e)?.includes('sectionId') === true
    );
  }

  // P2002 on the teacher unique = concurrent booking (race fallback), P2003 = row vanished mid-request.
  private async translate(
    e: unknown,
    slot: Omit<TeacherSlot, 'teacherId'> & { teacherId?: string },
  ) {
    const code = prismaErrorCode(e);
    if (code === 'P2003') {
      return new BadRequestException('This slot can no longer be saved. Please refresh and retry.');
    }
    if (code === 'P2002' && slot.teacherId && violatedConstraintFields(e)?.includes('teacherId')) {
      return (
        (await this.findTeacherConflict(this.prisma, {
          ...slot,
          teacherId: slot.teacherId,
        })) ?? new BadRequestException(TEACHER_BUSY)
      );
    }
    // Section-slot P2002 on the retry: someone else keeps changing this slot.
    if (this.isSectionSlotRace(e)) return new ConflictException(SLOT_CHANGED);
    return e;
  }
}

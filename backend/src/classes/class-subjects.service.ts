import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { violatedConstraintFields } from '../common/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { ClassesService } from './classes.service.js';

const DUPLICATE = 'This subject is already assigned to this class.';
const CLASS_NOT_FOUND = 'This class no longer exists.';
const SUBJECT_NOT_FOUND = 'This subject no longer exists.';
const CLASS_SUBJECT_NOT_FOUND = 'This class subject no longer exists.';
const HAS_ENTRIES = 'This subject has timetable entries for this class. Remove them first.';
const NOT_A_TEACHER = 'Please choose a valid teacher.';
const SELECT = {
  id: true,
  subject: { select: { id: true, name: true } },
  teacher: { select: { id: true, name: true } },
} as const;

@Injectable()
export class ClassSubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly classes: ClassesService,
  ) {}

  async list(classId: string) {
    await this.classes.assertExists(classId);
    return this.prisma.classSubject.findMany({
      where: { classId },
      select: SELECT,
      orderBy: { subject: { name: 'asc' } },
    });
  }

  async add(classId: string, subjectId: string) {
    await this.classes.assertExists(classId);
    await this.assertSubjectExists(subjectId);
    try {
      return await this.prisma.classSubject.create({
        data: { classId, subjectId },
        select: SELECT,
      });
    } catch (e) {
      throw this.translate(e);
    }
  }

  async setTeacher(classId: string, id: string, teacherId: string | null) {
    await this.assertInClass(classId, id);
    if (teacherId !== null && !(await this.users.isTeacher(teacherId))) {
      throw new BadRequestException(NOT_A_TEACHER);
    }
    try {
      return await this.prisma.classSubject.update({
        where: { id },
        data: { teacherId },
        select: SELECT,
      });
    } catch (e) {
      throw this.translate(e);
    }
  }

  async remove(classId: string, id: string) {
    await this.classes.assertExists(classId);
    try {
      // Lock the row so a concurrent timetable placement waits for this removal.
      await this.prisma.$transaction(async (tx) => {
        const subjectId = await this.lockSubjectId(tx, classId, id);
        await this.assertNoTimetableEntries(tx, classId, subjectId);
        await tx.classSubject.delete({ where: { id } });
      });
    } catch (e) {
      throw this.translate(e);
    }
  }

  private async lockSubjectId(tx: Prisma.TransactionClient, classId: string, id: string) {
    const rows = await tx.$queryRaw<{ subjectId: string }[]>`
      SELECT "subjectId" FROM "ClassSubject"
      WHERE id = ${id} AND "classId" = ${classId} FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException(CLASS_SUBJECT_NOT_FOUND);
    return rows[0].subjectId;
  }

  private async assertSubjectExists(subjectId: string) {
    const found = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException(SUBJECT_NOT_FOUND);
  }

  private async assertInClass(classId: string, id: string) {
    await this.classes.assertExists(classId);
    const found = await this.prisma.classSubject.findFirst({
      where: { id, classId },
      select: { id: true, subjectId: true },
    });
    if (!found) throw new NotFoundException(CLASS_SUBJECT_NOT_FOUND);
    return found;
  }

  private async assertNoTimetableEntries(
    tx: Prisma.TransactionClient,
    classId: string,
    subjectId: string,
  ) {
    const used = await tx.timetableEntry.findFirst({
      where: { subjectId, section: { classId } },
      select: { id: true },
    });
    if (used) throw new BadRequestException(HAS_ENTRIES);
  }

  // P2002 = duplicate pair (race fallback), P2003 = FK gone mid-request, P2025 = not found.
  private translate(e: unknown): unknown {
    const code = (e as { code?: string })?.code;
    if (code === 'P2002') return new BadRequestException(DUPLICATE);
    if (code === 'P2003') return this.translateForeignKey(e);
    if (code === 'P2025') return new NotFoundException(CLASS_SUBJECT_NOT_FOUND);
    return e;
  }

  private translateForeignKey(e: unknown): Error {
    const fields = violatedConstraintFields(e) ?? [];
    if (fields.includes('teacherId')) return new BadRequestException(NOT_A_TEACHER);
    if (fields.includes('classId')) return new NotFoundException(CLASS_NOT_FOUND);
    return new NotFoundException(SUBJECT_NOT_FOUND);
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { ClassesService } from './classes.service.js';

const DUPLICATE = 'This subject is already assigned to this class.';
const CLASS_NOT_FOUND = 'This class no longer exists.';
const SUBJECT_NOT_FOUND = 'This subject no longer exists.';
const CLASS_SUBJECT_NOT_FOUND = 'This class subject no longer exists.';
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
    await this.assertInClass(classId, id);
    try {
      await this.prisma.classSubject.delete({ where: { id } });
    } catch (e) {
      throw this.translate(e);
    }
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
      select: { id: true },
    });
    if (!found) throw new NotFoundException(CLASS_SUBJECT_NOT_FOUND);
  }

  // P2002 = duplicate pair (race fallback), P2003 = FK gone mid-request, P2025 = not found.
  private translate(e: unknown): unknown {
    const code = (e as { code?: string })?.code;
    if (code === 'P2002') return new BadRequestException(DUPLICATE);
    if (code === 'P2003') return this.translateForeignKey(e);
    if (code === 'P2025') return new NotFoundException(CLASS_SUBJECT_NOT_FOUND);
    return e;
  }

  // The driver adapter reports the violated FK as meta.driverAdapterError.cause.constraint
  // ({ fields: ['teacherId'] } or { index: 'ClassSubject_teacherId_fkey' }); older engines use meta.field_name.
  private translateForeignKey(e: unknown): Error {
    const meta = (e as { meta?: Record<string, unknown> }).meta ?? {};
    const constraint = (meta.driverAdapterError as { cause?: { constraint?: unknown } } | undefined)
      ?.cause?.constraint;
    const where = JSON.stringify([constraint ?? null, meta.field_name ?? null]);
    if (where.includes('teacherId')) return new BadRequestException(NOT_A_TEACHER);
    if (where.includes('classId')) return new NotFoundException(CLASS_NOT_FOUND);
    return new NotFoundException(SUBJECT_NOT_FOUND);
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { ClassesService } from './classes.service.js';

const DUPLICATE = 'This section already exists.';
const SECTION_NOT_FOUND = 'This section no longer exists.';
const NOT_A_TEACHER = 'Please choose a valid teacher.';
const SELECT = { id: true, name: true, classId: true, classTeacherId: true } as const;

@Injectable()
export class SectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classes: ClassesService,
    private readonly users: UsersService,
  ) {}

  async create(classId: string, name: string) {
    await this.classes.assertExists(classId);
    await this.assertNameFree(classId, name);
    try {
      return await this.prisma.section.create({ data: { classId, name }, select: SELECT });
    } catch (e) {
      throw this.translate(e);
    }
  }

  async rename(classId: string, id: string, name: string) {
    await this.assertSectionInClass(classId, id);
    await this.assertNameFree(classId, name, id);
    return this.update(id, { name });
  }

  async remove(classId: string, id: string) {
    await this.assertSectionInClass(classId, id);
    try {
      await this.prisma.section.delete({ where: { id } });
    } catch (e) {
      throw this.translate(e);
    }
  }

  async setClassTeacher(classId: string, id: string, teacherId: string | null) {
    await this.assertSectionInClass(classId, id);
    if (teacherId !== null && !(await this.users.isTeacher(teacherId))) {
      throw new BadRequestException(NOT_A_TEACHER);
    }
    return this.update(id, { classTeacherId: teacherId });
  }

  private async update(id: string, data: { name?: string; classTeacherId?: string | null }) {
    try {
      return await this.prisma.section.update({ where: { id }, data, select: SELECT });
    } catch (e) {
      throw this.translate(e);
    }
  }

  private async assertSectionInClass(classId: string, id: string) {
    await this.classes.assertExists(classId);
    const found = await this.prisma.section.findFirst({
      where: { id, classId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException(SECTION_NOT_FOUND);
  }

  private async assertNameFree(classId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.section.findFirst({
      where: {
        classId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new BadRequestException(DUPLICATE);
  }

  // P2002 = unique violation (race fallback), P2025 = record not found.
  private translate(e: unknown): unknown {
    const code = (e as { code?: string })?.code;
    if (code === 'P2002') return new BadRequestException(DUPLICATE);
    if (code === 'P2025') return new NotFoundException(SECTION_NOT_FOUND);
    return e;
  }
}

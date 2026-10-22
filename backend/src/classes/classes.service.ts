import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateClassDto } from './dto/create-class.dto.js';
import { UpdateClassDto } from './dto/update-class.dto.js';

const INCLUDE_FULL = {
  sections: {
    orderBy: { name: 'asc' },
    include: {
      teacher: { select: { id: true, user: { select: { name: true } } } },
      students: {
        select: {
          id: true,
          rollNumber: true,
          user: { select: { name: true } },
        },
      },
    },
  },
  subjects: {
    include: {
      teacher: { select: { id: true, user: { select: { name: true } } } },
    },
  },
} as const;

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.schoolClass.findMany({
      include: INCLUDE_FULL,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const found = await this.prisma.schoolClass.findUnique({
      where: { id },
      include: INCLUDE_FULL,
    });
    if (!found) throw new NotFoundException('Class not found.');
    return found;
  }

  async create(dto: CreateClassDto) {
    await this.assertTeachersExist([
      ...(dto.sections ?? []).map((s) => s.classTeacherId),
      ...(dto.subjects ?? []).map((s) => s.teacherId),
    ]);
    try {
      return await this.prisma.schoolClass.create({
        data: {
          name: dto.name.trim(),
          sections: {
            create: dto.sections?.map((s) => ({
              name: s.name.trim(),
              classTeacherId: s.classTeacherId,
            })),
          },
          subjects: {
            create: dto.subjects?.map((s) => ({
              subject: s.subject.trim(),
              teacherId: s.teacherId,
            })),
          },
        },
        include: INCLUDE_FULL,
      });
    } catch (e) {
      throw this.toConflict(e);
    }
  }

  async update(id: string, dto: UpdateClassDto) {
    await this.findOne(id);
    try {
      return await this.prisma.schoolClass.update({
        where: { id },
        data: { name: dto.name?.trim() },
        include: INCLUDE_FULL,
      });
    } catch (e) {
      throw this.toConflict(e);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.schoolClass.delete({ where: { id } });
  }

  async addSection(
    classId: string,
    input: { name: string; classTeacherId?: string },
  ) {
    await this.findOne(classId);
    await this.assertTeachersExist([input.classTeacherId]);
    try {
      return await this.prisma.section.create({
        data: {
          classId,
          name: input.name.trim(),
          classTeacherId: input.classTeacherId,
        },
      });
    } catch (e) {
      throw this.toConflict(e);
    }
  }

  async updateSection(
    sectionId: string,
    input: { name?: string; classTeacherId?: string | null },
  ) {
    await this.assertSection(sectionId);
    await this.assertTeachersExist([input.classTeacherId]);
    try {
      return await this.prisma.section.update({
        where: { id: sectionId },
        data: {
          name: input.name?.trim(),
          classTeacherId: input.classTeacherId,
        },
      });
    } catch (e) {
      throw this.toConflict(e);
    }
  }

  async removeSection(sectionId: string) {
    await this.assertSection(sectionId);
    await this.prisma.section.delete({ where: { id: sectionId } });
  }

  async upsertSubject(
    classId: string,
    input: { subject: string; teacherId?: string },
  ) {
    await this.findOne(classId);
    await this.assertTeachersExist([input.teacherId]);
    const subject = input.subject.trim();
    return this.prisma.classSubject.upsert({
      where: { classId_subject: { classId, subject } },
      update: { teacherId: input.teacherId ?? null },
      create: { classId, subject, teacherId: input.teacherId },
    });
  }

  async removeSubject(classId: string, subject: string) {
    await this.prisma.classSubject
      .delete({ where: { classId_subject: { classId, subject } } })
      .catch(() => {
        throw new NotFoundException('Subject assignment not found.');
      });
  }

  private async assertSection(id: string) {
    if (
      !(await this.prisma.section.findUnique({
        where: { id },
        select: { id: true },
      }))
    ) {
      throw new NotFoundException('Section not found.');
    }
  }

  private async assertTeachersExist(ids: (string | null | undefined)[]) {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (!unique.length) return;
    const count = await this.prisma.teacher.count({
      where: { id: { in: unique }, deletedAt: null },
    });
    if (count !== unique.length)
      throw new NotFoundException('One or more teachers were not found.');
  }

  private toConflict(e: unknown) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new ConflictException(
        'A class, section or subject with that name already exists.',
      );
    }
    return e;
  }
}

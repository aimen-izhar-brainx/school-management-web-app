import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { meetsPasswordRules } from '../auth/security.util.js';
import { PaginationDto } from '../common/pagination.dto.js';
import { CreateTeacherDto } from './dto/create-teacher.dto.js';
import { UpdateTeacherDto } from './dto/update-teacher.dto.js';

const teacherSelect = {
  id: true,
  employeeId: true,
  subject: true,
  gender: true,
  phone: true,
  dateOfBirth: true,
  address: true,
  qualification: true,
  joinedAt: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.TeacherSelect;

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ page, limit }: PaginationDto) {
    const where = { deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.teacher.findMany({
        where,
        select: teacherSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.teacher.count({ where }),
    ]);
    return { data, meta: { page, limit, total } };
  }

  async create(dto: CreateTeacherDto) {
    if (!meetsPasswordRules(dto.password)) {
      throw new BadRequestException(
        'Password does not meet the strength requirements.',
      );
    }
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { name: dto.name, email, passwordHash, role: 'teacher' },
        });
        return tx.teacher.create({
          data: {
            userId: user.id,
            employeeId: dto.employeeId,
            subject: dto.subject,
            gender: dto.gender,
            phone: dto.phone,
            dateOfBirth: dto.dateOfBirth
              ? new Date(dto.dateOfBirth)
              : undefined,
            address: dto.address,
            qualification: dto.qualification,
            joinedAt: dto.joinedAt ? new Date(dto.joinedAt) : undefined,
          },
          select: teacherSelect,
        });
      });
    } catch (e) {
      throw this.toConflict(e);
    }
  }

  async findOne(id: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, deletedAt: null },
      select: teacherSelect,
    });
    if (!teacher) throw new NotFoundException('Teacher not found');
    return teacher;
  }

  async update(id: string, dto: UpdateTeacherDto) {
    const existing = await this.findOne(id);
    const email = dto.email?.trim().toLowerCase();
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.name !== undefined || email !== undefined) {
          await tx.user.update({
            where: { id: existing.user.id },
            data: { name: dto.name, email },
          });
        }
        return tx.teacher.update({
          where: { id },
          data: {
            employeeId: dto.employeeId,
            subject: dto.subject,
            gender: dto.gender,
            phone: dto.phone,
            qualification: dto.qualification,
            dateOfBirth: dto.dateOfBirth
              ? new Date(dto.dateOfBirth)
              : undefined,
            address: dto.address,
            joinedAt: dto.joinedAt ? new Date(dto.joinedAt) : undefined,
          },
          select: teacherSelect,
        });
      });
    } catch (e) {
      throw this.toConflict(e);
    }
  }

  async remove(id: string) {
    const existing = await this.findOne(id);
    try {
      await this.prisma.user.delete({ where: { id: existing.user.id } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new ConflictException(
          'Teacher has posted notices and cannot be deleted',
        );
      }
      throw e;
    }
  }

  // Concurrent requests can pass the pre-checks and still hit the unique index.
  private toConflict(e: unknown) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new ConflictException('Email or employee ID already exists');
    }
    return e;
  }
}

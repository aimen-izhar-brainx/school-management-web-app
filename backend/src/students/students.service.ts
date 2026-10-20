import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { meetsPasswordRules } from '../auth/security.util.js';
import { PaginationDto } from '../common/pagination.dto.js';
import { CreateStudentDto } from './dto/create-student.dto.js';
import { UpdateStudentDto } from './dto/update-student.dto.js';

const INCLUDE_USER = { user: { select: { id: true, name: true, email: true } } } as const;

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ page, limit }: PaginationDto) {
    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        include: INCLUDE_USER,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.student.count(),
    ]);
    return { data, meta: { page, limit, total } };
  }

  async findOne(id: string) {
    const student = await this.prisma.student.findUnique({ where: { id }, include: INCLUDE_USER });
    if (!student) throw new NotFoundException('Student not found.');
    return student;
  }

  async create(dto: CreateStudentDto) {
    if (!meetsPasswordRules(dto.password)) {
      throw new BadRequestException('Password does not meet the strength requirements.');
    }
    const email = dto.email.trim().toLowerCase();
    const [emailTaken, rollTaken] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.student.findUnique({ where: { rollNumber: dto.rollNumber } }),
    ]);
    if (emailTaken) throw new ConflictException('Email is already in use.');
    if (rollTaken) throw new ConflictException('Roll number is already in use.');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      return await this.prisma.student.create({
        data: {
          rollNumber: dto.rollNumber,
          grade: dto.grade,
          section: dto.section,
          gender: dto.gender,
          guardianName: dto.guardianName,
          guardianPhone: dto.guardianPhone,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          address: dto.address,
          user: { create: { name: dto.name, email, passwordHash, role: 'student' } },
        },
        include: INCLUDE_USER,
      });
    } catch (e) {
      throw this.toConflict(e);
    }
  }

  async update(id: string, dto: UpdateStudentDto) {
    const existing = await this.findOne(id);
    const { name, email, dateOfBirth, rollNumber, ...rest } = dto;
    const newEmail = email?.trim().toLowerCase();

    if (newEmail && newEmail !== existing.user.email) {
      if (await this.prisma.user.findUnique({ where: { email: newEmail } })) {
        throw new ConflictException('Email is already in use.');
      }
    }
    if (rollNumber && rollNumber !== existing.rollNumber) {
      if (await this.prisma.student.findUnique({ where: { rollNumber } })) {
        throw new ConflictException('Roll number is already in use.');
      }
    }

    try {
      return await this.prisma.student.update({
        where: { id },
        data: {
          ...rest,
          rollNumber,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
          user: name || newEmail ? { update: { name, email: newEmail } } : undefined,
        },
        include: INCLUDE_USER,
      });
    } catch (e) {
      throw this.toConflict(e);
    }
  }

  async remove(id: string) {
    const student = await this.findOne(id);
    // Student cascades from User, so deleting the user removes the profile too.
    await this.prisma.user.delete({ where: { id: student.userId } });
  }

  // Concurrent requests can pass the pre-checks and still hit the unique index.
  private toConflict(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException('Email or roll number is already in use.');
    }
    return e;
  }
}

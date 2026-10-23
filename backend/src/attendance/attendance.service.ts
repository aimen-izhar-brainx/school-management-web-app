import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { SectionDayQueryDto } from './dto/attendance-query.dto.js';
import {
  SubmitAttendanceDto,
  UpdateRecordDto,
} from './dto/submit-attendance.dto.js';

const RECORD_SELECT = {
  id: true,
  studentId: true,
  status: true,
  student: {
    select: { rollNumber: true, user: { select: { name: true } } },
  },
} as const;

const SESSION_SELECT = {
  id: true,
  sectionId: true,
  date: true,
  submittedAt: true,
  submittedBy: { select: { id: true, name: true } },
  records: {
    select: RECORD_SELECT,
    orderBy: { student: { rollNumber: 'asc' } },
  },
} as const;

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException('Invalid date.');
  }
  return date;
}

function todayUtc(): Date {
  return parseDate(new Date().toISOString().slice(0, 10));
}

function monthRange(month: string) {
  const [year, mon] = month.split('-').map(Number);
  return {
    from: new Date(Date.UTC(year, mon - 1, 1)),
    to: new Date(Date.UTC(year, mon, 1)),
  };
}

function tally(statuses: string[]) {
  const present = statuses.filter((s) => s === 'present').length;
  const absent = statuses.filter((s) => s === 'absent').length;
  const leave = statuses.filter((s) => s === 'leave').length;
  const total = statuses.length;
  return {
    present,
    absent,
    leave,
    total,
    // Null when nothing is marked, so clients never divide by zero.
    percentage: total ? Math.round((present / total) * 100) : null,
  };
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(user: JwtPayload, dto: SubmitAttendanceDto) {
    const date = parseDate(dto.date);
    const today = todayUtc();
    if (date > today) {
      throw new BadRequestException(
        'Attendance cannot be marked for a future date.',
      );
    }
    if (user.role === 'teacher' && date.getTime() !== today.getTime()) {
      throw new ForbiddenException(
        'Teachers can only mark attendance for today.',
      );
    }

    const section = await this.getSectionOrThrow(dto.sectionId);
    await this.assertCanManageSection(user, section.classTeacherId);

    const roster = await this.prisma.student.findMany({
      where: { sectionId: dto.sectionId },
      select: { id: true },
    });
    const rosterIds = new Set(roster.map((s) => s.id));
    const submittedIds = new Set(dto.records.map((r) => r.studentId));
    if (
      submittedIds.size !== dto.records.length ||
      submittedIds.size !== rosterIds.size ||
      [...submittedIds].some((id) => !rosterIds.has(id))
    ) {
      throw new BadRequestException(
        'Records must include every student in the section exactly once.',
      );
    }

    try {
      return await this.prisma.attendance.create({
        data: {
          sectionId: dto.sectionId,
          date,
          submittedById: user.sub,
          records: {
            create: dto.records.map((r) => ({
              studentId: r.studentId,
              sectionId: dto.sectionId,
              date,
              status: r.status,
            })),
          },
        },
        select: SESSION_SELECT,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'Attendance has already been submitted for this section and date.',
        );
      }
      throw e;
    }
  }

  async findForSectionDay(
    user: JwtPayload,
    { sectionId, date }: SectionDayQueryDto,
  ) {
    const parsed = parseDate(date);
    const section = await this.getSectionOrThrow(sectionId);
    await this.assertCanManageSection(user, section.classTeacherId);
    return this.prisma.attendance.findUnique({
      where: { sectionId_date: { sectionId, date: parsed } },
      select: SESSION_SELECT,
    });
  }

  async findForStudent(user: JwtPayload, studentId: string, month: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { userId: true, section: { select: { classTeacherId: true } } },
    });
    if (!student) throw new NotFoundException('Student not found.');
    if (user.role === 'student' && student.userId !== user.sub) {
      throw new ForbiddenException('You can only view your own attendance.');
    }
    if (user.role === 'teacher') {
      await this.assertCanManageSection(
        user,
        student.section?.classTeacherId ?? null,
      );
    }
    return this.studentMonth(studentId, month);
  }

  /** Sections the caller can mark/browse (admin: all, teacher: ones they are class teacher of). Rosters load per section. */
  async listSections(user: JwtPayload) {
    const teacher =
      user.role === 'teacher'
        ? await this.prisma.teacher.findUnique({
            where: { userId: user.sub },
            select: { id: true },
          })
        : null;
    if (user.role === 'teacher' && !teacher) return [];
    const sections = await this.prisma.section.findMany({
      where: teacher ? { classTeacherId: teacher.id } : {},
      select: {
        id: true,
        name: true,
        schoolClass: { select: { name: true } },
      },
      orderBy: [{ schoolClass: { name: 'asc' } }, { name: 'asc' }],
    });
    return sections.map((section) => ({
      id: section.id,
      sectionName: section.name,
      className: section.schoolClass.name,
    }));
  }

  /** The current students of one section, ordered by roll number. */
  async rosterForSection(user: JwtPayload, sectionId: string) {
    const section = await this.getSectionOrThrow(sectionId);
    await this.assertCanManageSection(user, section.classTeacherId);
    const students = await this.prisma.student.findMany({
      where: { sectionId },
      select: {
        id: true,
        rollNumber: true,
        user: { select: { name: true } },
      },
      orderBy: { rollNumber: 'asc' },
    });
    return students.map((student) => ({
      id: student.id,
      name: student.user.name,
      rollNumber: student.rollNumber,
    }));
  }

  /** The signed-in student's own monthly attendance, with the student/section they belong to. */
  async findForMe(user: JwtPayload, month: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId: user.sub },
      select: {
        id: true,
        section: {
          select: {
            id: true,
            name: true,
            schoolClass: { select: { name: true } },
          },
        },
      },
    });
    if (!student) throw new NotFoundException('Student profile not found.');
    return { student, ...(await this.studentMonth(student.id, month)) };
  }

  /** Present/absent/leave counts per section for one day, including sections not yet marked. */
  async summaryForDate(date: string) {
    const parsed = parseDate(date);
    const [sections, grouped] = await Promise.all([
      this.prisma.section.findMany({
        select: {
          id: true,
          name: true,
          schoolClass: { select: { name: true } },
          _count: { select: { students: true } },
        },
        orderBy: [{ schoolClass: { name: 'asc' } }, { name: 'asc' }],
      }),
      this.prisma.attendanceRecord.groupBy({
        by: ['sectionId', 'status'],
        where: { date: parsed },
        _count: true,
      }),
    ]);
    const marked = new Set(grouped.map((g) => g.sectionId));
    return sections.map((section) => {
      const count = (status: string) =>
        grouped.find((g) => g.sectionId === section.id && g.status === status)
          ?._count ?? 0;
      return {
        sectionId: section.id,
        sectionName: section.name,
        className: section.schoolClass.name,
        enrolled: section._count.students,
        marked: marked.has(section.id),
        present: count('present'),
        absent: count('absent'),
        leave: count('leave'),
      };
    });
  }

  /** Per-student monthly totals for every current student of a section. */
  async monthlyForSection(sectionId: string, month: string) {
    await this.getSectionOrThrow(sectionId);
    const { from, to } = monthRange(month);
    const students = await this.prisma.student.findMany({
      where: { sectionId },
      select: {
        id: true,
        rollNumber: true,
        user: { select: { name: true } },
        attendance: {
          where: { date: { gte: from, lt: to } },
          select: { status: true },
        },
      },
      orderBy: { rollNumber: 'asc' },
    });
    return students.map((student) => {
      const totals = tally(student.attendance.map((r) => r.status));
      return {
        studentId: student.id,
        name: student.user.name,
        rollNumber: student.rollNumber,
        ...totals,
      };
    });
  }

  private async studentMonth(studentId: string, month: string) {
    const { from, to } = monthRange(month);
    const records = await this.prisma.attendanceRecord.findMany({
      where: { studentId, date: { gte: from, lt: to } },
      select: { id: true, date: true, status: true },
      orderBy: { date: 'asc' },
    });
    return {
      records,
      summary: tally(records.map((r) => r.status)),
    };
  }

  async correctRecord(adminId: string, recordId: string, dto: UpdateRecordDto) {
    const record = await this.prisma.attendanceRecord.findUnique({
      where: { id: recordId },
      select: { status: true },
    });
    if (!record) throw new NotFoundException('Attendance record not found.');
    if (record.status === dto.status) {
      throw new BadRequestException('Record already has that status.');
    }
    return this.prisma.$transaction(async (tx) => {
  
      const { count } = await tx.attendanceRecord.updateMany({
        where: { id: recordId, status: record.status },
        data: { status: dto.status },
      });
      if (count === 0) {
        throw new ConflictException(
          'Record was changed by someone else. Reload and try again.',
        );
      }
      await tx.attendanceAuditLog.create({
        data: {
          recordId,
          oldStatus: record.status,
          newStatus: dto.status,
          reason: dto.reason,
          changedById: adminId,
        },
      });
      return tx.attendanceRecord.findUniqueOrThrow({
        where: { id: recordId },
        select: RECORD_SELECT,
      });
    });
  }

  /** Every correction made to a section's records on one day, newest first. */
  async auditForSectionDay({ sectionId, date }: SectionDayQueryDto) {
    const parsed = parseDate(date);
    return this.prisma.attendanceAuditLog.findMany({
      where: { record: { sectionId, date: parsed } },
      select: {
        id: true,
        recordId: true,
        record: { select: { studentId: true } },
        oldStatus: true,
        newStatus: true,
        reason: true,
        createdAt: true,
        changedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async auditTrail(recordId: string) {
    const exists = await this.prisma.attendanceRecord.findUnique({
      where: { id: recordId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Attendance record not found.');
    return this.prisma.attendanceAuditLog.findMany({
      where: { recordId },
      select: {
        id: true,
        oldStatus: true,
        newStatus: true,
        reason: true,
        createdAt: true,
        changedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getSectionOrThrow(sectionId: string) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      select: { classTeacherId: true },
    });
    if (!section) throw new NotFoundException('Section not found.');
    return section;
  }

  private async assertCanManageSection(
    user: JwtPayload,
    classTeacherId: string | null,
  ): Promise<void> {
    if (user.role === 'admin') return;
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!teacher || teacher.id !== classTeacherId) {
      throw new ForbiddenException(
        'You are not the class teacher of this section.',
      );
    }
  }
}

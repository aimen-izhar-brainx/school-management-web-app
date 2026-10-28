import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateExamDto } from './dto/create-exam.dto.js';
import { UpdateExamDto } from './dto/update-exam.dto.js';
import { GradeBandDto } from './dto/save-grade-scale.dto.js';

const EXAM_SELECT = {
  id: true,
  name: true,
  sectionId: true,
  subject: true,
  date: true,
  totalMarks: true,
  _count: { select: { marks: true } },
  section: { select: { _count: { select: { students: true } } } },
} as const;

const EXAM_ORDER = [{ date: 'asc' }, { name: 'asc' }] as const;

const STUDENT_SELECT = {
  id: true,
  rollNumber: true,
  sectionId: true,
  user: { select: { name: true } },
} as const;

const toRosterStudent = (s: {
  id: string;
  rollNumber: string;
  sectionId: string | null;
  user: { name: string };
}) => ({
  id: s.id,
  name: s.user.name,
  rollNo: s.rollNumber,
  sectionId: s.sectionId ?? '',
});

const isPrismaError = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

const toResponse = (exam: {
  id: string;
  name: string;
  sectionId: string;
  subject: string;
  date: Date;
  totalMarks: number;
  _count: { marks: number };
  section: { _count: { students: number } };
}) => ({
  id: exam.id,
  name: exam.name,
  sectionId: exam.sectionId,
  subject: exam.subject,
  date: exam.date.toISOString().slice(0, 10),
  totalMarks: exam.totalMarks,
  markCount: exam._count.marks,
  studentCount: exam.section._count.students,
});

const DEFAULT_GRADE_SCALE = [
  { grade: 'A', minPercent: 80 },
  { grade: 'B', minPercent: 70 },
  { grade: 'C', minPercent: 60 },
  { grade: 'D', minPercent: 50 },
  { grade: 'F', minPercent: 0 },
];

export interface Viewer {
  userId: string;
  role: string;
}

@Injectable()
export class ExamsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseDate(value: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException('Invalid date.');
    }
    return date;
  }

  async create(userId: string, dto: CreateExamDto) {
    const date = this.parseDate(dto.date);

    const section = await this.prisma.section.findUnique({
      where: { id: dto.sectionId },
      select: {
        schoolClass: { select: { subjects: { select: { subject: true } } } },
      },
    });
    if (!section) throw new NotFoundException('Class not found.');
    if (!section.schoolClass.subjects.some((s) => s.subject === dto.subject)) {
      throw new BadRequestException(
        'That subject is not taught in the selected class.',
      );
    }

    try {
      const exam = await this.prisma.exam.create({
        data: { ...dto, date, createdById: userId },
        select: EXAM_SELECT,
      });
      return toResponse(exam);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'This exam already exists for that class and subject.',
        );
      }
      throw error;
    }
  }

  private async sectionScope(
    viewer: Viewer,
  ): Promise<Prisma.SectionWhereInput | undefined> {
    if (viewer.role === 'admin') return undefined;
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: viewer.userId },
      select: { id: true },
    });
    if (!teacher) throw new ForbiddenException('Teacher profile not found.');
    return {
      OR: [
        { classTeacherId: teacher.id },
        { schoolClass: { subjects: { some: { teacherId: teacher.id } } } },
      ],
    };
  }

  private async examScope(
    viewer: Viewer,
  ): Promise<Prisma.ExamWhereInput | undefined> {
    if (viewer.role === 'admin') return undefined;
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: viewer.userId },
      select: { id: true },
    });
    if (!teacher) throw new ForbiddenException('Teacher profile not found.');
    const assigned = await this.prisma.classSubject.findMany({
      where: { teacherId: teacher.id },
      select: { classId: true, subject: true },
    });
    return {
      OR: [
        { section: { classTeacherId: teacher.id } },
        ...assigned.map(({ classId, subject }) => ({
          subject,
          section: { classId },
        })),
      ],
    };
  }

  async listSections(viewer: Viewer) {
    const sections = await this.prisma.section.findMany({
      where: await this.sectionScope(viewer),
      select: {
        id: true,
        name: true,
        schoolClass: {
          select: {
            name: true,
            subjects: {
              select: { subject: true },
              orderBy: { subject: 'asc' },
            },
          },
        },
      },
      orderBy: [{ schoolClass: { name: 'asc' } }, { name: 'asc' }],
    });
    return sections.map((section) => ({
      id: section.id,
      sectionName: section.name,
      className: section.schoolClass.name,
      subjects: section.schoolClass.subjects.map((s) => s.subject),
    }));
  }

  async findAll(viewer: Viewer) {
    const exams = await this.prisma.exam.findMany({
      where: await this.examScope(viewer),
      select: EXAM_SELECT,
      orderBy: [...EXAM_ORDER],
    });
    return exams.map(toResponse);
  }

  async listMarks(viewer: Viewer, sectionId: string) {
    const scope = await this.sectionScope(viewer);
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, ...scope },
      select: { id: true },
    });
    if (!section) throw new NotFoundException('Class not found.');
    const examScope = await this.examScope(viewer);

    const [students, marks] = await Promise.all([
      this.prisma.student.findMany({
        where: { sectionId },
        select: STUDENT_SELECT,
      }),
      this.prisma.examMark.findMany({
        where: {
          exam: { AND: [{ sectionId }, ...(examScope ? [examScope] : [])] },
        },
        select: { examId: true, studentId: true, marks: true },
      }),
    ]);

    const roster = students
      .map(toRosterStudent)
      .sort((a, b) =>
        a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }),
      );

    const book: Record<string, Record<string, number>> = {};
    for (const m of marks) (book[m.examId] ??= {})[m.studentId] = m.marks;
    return { roster, marks: book };
  }

  async update(id: string, dto: UpdateExamDto) {
    const date = this.parseDate(dto.date);
    const top = await this.prisma.examMark.aggregate({
      where: { examId: id },
      _max: { marks: true },
    });
    const highest = top._max.marks ?? 0;
    if (dto.totalMarks < highest) {
      throw new BadRequestException(
        `Total marks cannot be below ${highest}, a mark already entered.`,
      );
    }
    try {
      const exam = await this.prisma.exam.update({
        where: { id },
        data: { name: dto.name, date, totalMarks: dto.totalMarks },
        select: EXAM_SELECT,
      });
      return toResponse(exam);
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Exam not found.');
      }
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'This exam already exists for that class and subject.',
        );
      }
      throw error;
    }
  }

  async saveMarks(
    userId: string,
    examId: string,
    entries: Record<string, number>,
  ) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: {
        sectionId: true,
        totalMarks: true,
        subject: true,
        section: { select: { classId: true, classTeacherId: true } },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found.');
    await this.assertCanMark(userId, exam);

    const ids = Object.keys(entries);
    const inSection = await this.prisma.student.findMany({
      where: { id: { in: ids }, sectionId: exam.sectionId },
      select: { id: true },
    });
    if (inSection.length !== ids.length) {
      throw new BadRequestException('Some students are not in this class.');
    }
    for (const value of Object.values(entries)) {
      if (!Number.isFinite(value) || value < 0 || value > exam.totalMarks) {
        throw new BadRequestException(
          `Marks must be between 0 and ${exam.totalMarks}.`,
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.examMark.deleteMany({
        where: {
          examId,
          studentId: { notIn: ids },
          student: { sectionId: exam.sectionId },
        },
      }),
      ...ids.map((studentId) =>
        this.prisma.examMark.upsert({
          where: { examId_studentId: { examId, studentId } },
          create: {
            examId,
            studentId,
            marks: entries[studentId],
            enteredById: userId,
          },
          update: { marks: entries[studentId], enteredById: userId },
        }),
      ),
    ]);
    return { examId, saved: ids.length };
  }

  private async assertCanMark(
    userId: string,
    exam: {
      subject: string;
      section: { classId: string; classTeacherId: string | null };
    },
  ) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!teacher) throw new ForbiddenException('Teacher profile not found.');
    if (exam.section.classTeacherId === teacher.id) return;
    const assigned = await this.prisma.classSubject.findFirst({
      where: {
        classId: exam.section.classId,
        subject: exam.subject,
        teacherId: teacher.id,
      },
      select: { id: true },
    });
    if (!assigned) {
      throw new ForbiddenException(
        'You are not assigned to teach this subject in this class.',
      );
    }
  }

  async myResults(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: {
        ...STUDENT_SELECT,
        examMarks: { select: { examId: true, marks: true } },
      },
    });
    if (!student) throw new NotFoundException('Student profile not found.');

    const exams = student.sectionId
      ? await this.prisma.exam.findMany({
          where: { sectionId: student.sectionId },
          select: EXAM_SELECT,
          orderBy: [...EXAM_ORDER],
        })
      : [];

    return {
      student: toRosterStudent(student),
      exams: exams.map(toResponse),
      marks: Object.fromEntries(
        student.examMarks.map((m) => [m.examId, m.marks]),
      ),
    };
  }

  async getGradeScale() {
    const bands = await this.prisma.gradeBand.findMany({
      select: { grade: true, minPercent: true },
      orderBy: { minPercent: 'desc' },
    });
    // Never hand clients an empty scale: grading has no meaning without one.
    return bands.length > 0 ? bands : DEFAULT_GRADE_SCALE;
  }

  async saveGradeScale(scale: GradeBandDto[]) {
    const grades = new Set(scale.map((b) => b.grade.toLowerCase()));
    if (grades.size !== scale.length) {
      throw new BadRequestException('Grade names must be unique.');
    }
    const mins = new Set(scale.map((b) => b.minPercent));
    if (mins.size !== scale.length) {
      throw new BadRequestException(
        'Two grades cannot share the same minimum.',
      );
    }
    if (!mins.has(0)) {
      throw new BadRequestException('The lowest grade must start at 0%.');
    }

    await this.prisma.$transaction([
      this.prisma.gradeBand.deleteMany(),
      this.prisma.gradeBand.createMany({
        data: scale.map(({ grade, minPercent }) => ({ grade, minPercent })),
      }),
    ]);
    return this.getGradeScale();
  }

  async remove(id: string) {
    try {
      await this.prisma.exam.delete({ where: { id } });
    } catch (e) {
      if (isPrismaError(e, 'P2025')) {
        throw new NotFoundException('Exam not found.');
      }
      throw e;
    }
    return { id };
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { AttendanceStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

const SECTION_NOT_FOUND = 'This section no longer exists.';
const SESSION_NOT_FOUND = 'This attendance session no longer exists.';
const NOT_CLASS_TEACHER = 'You are not the class teacher for this section.';
const BAD_DATE_FORMAT = 'Date must be a valid calendar date in YYYY-MM-DD format.';
const LOCKED =
  'Attendance for this date is locked: only today\'s attendance can be submitted or edited.';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type AttendanceEntryInput = { studentId: string; status: AttendanceStatus };

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(sectionId: string, dateStr: string, entries: AttendanceEntryInput[], callerId: string) {
    const section = await this.findSection(sectionId);
    this.assertOwner(section, callerId);
    this.assertIsToday(dateStr);
    this.assertNoDuplicateStudentIds(entries);

    const date = this.toDateOnly(dateStr);
    await this.prisma.$transaction(async (tx) => {
      // Re-check roster coverage inside the transaction, right before the write, so a student
      // moved into/out of the section between the earlier read and this write can't leave a
      // stale or missing entry.
      await this.assertRosterCovered(tx, sectionId, entries);

      const session = await tx.attendanceSession.upsert({
        where: { sectionId_date: { sectionId, date } },
        create: { sectionId, date, submittedById: callerId },
        update: { updatedAt: new Date() },
        select: { id: true },
      });
      await tx.attendanceEntry.deleteMany({ where: { sessionId: session.id } });
      await tx.attendanceEntry.createMany({
        data: entries.map((e) => ({
          sessionId: session.id,
          studentId: e.studentId,
          status: e.status,
        })),
      });
    });

    return this.loadSubmitResponse(sectionId, dateStr);
  }

  async get(sectionId: string, dateStr: string, callerId: string) {
    const section = await this.findSection(sectionId);
    this.assertOwner(section, callerId);
    this.assertValidDateFormat(dateStr);
    return this.loadResponse(sectionId, dateStr);
  }

  // Unchanged from T-032: PUT keeps returning the bare `{ studentId, status }` shape (a session
  // always exists by the time this runs, right after submit/edit) — only the GET contract below
  // was extended for T-033's roster gap.
  private async loadSubmitResponse(sectionId: string, dateStr: string) {
    const date = this.toDateOnly(dateStr);
    const session = await this.prisma.attendanceSession.findUnique({
      where: { sectionId_date: { sectionId, date } },
      select: {
        submittedAt: true,
        submittedBy: { select: { id: true, name: true } },
        entries: { select: { studentId: true, status: true } },
      },
    });
    if (!session) throw new NotFoundException(SESSION_NOT_FOUND);
    return {
      entries: session.entries,
      submittedBy: session.submittedBy,
      submittedAt: session.submittedAt,
      locked: dateStr !== this.todayStr(),
    };
  }

  // T-033: extends the GET response with full student names and, when no session exists yet,
  // the section's complete roster (status: null per student) instead of a bare 404 — closing the
  // gap where there was previously no teacher-accessible way to enumerate a section's roster.
  private async loadResponse(sectionId: string, dateStr: string) {
    const date = this.toDateOnly(dateStr);
    const session = await this.prisma.attendanceSession.findUnique({
      where: { sectionId_date: { sectionId, date } },
      select: {
        submittedAt: true,
        submittedBy: { select: { id: true, name: true } },
        entries: {
          select: { status: true, student: { select: { id: true, name: true } } },
          orderBy: { student: { name: 'asc' } },
        },
      },
    });

    if (!session) {
      // No session yet for this section+date: there's nothing to report "not found" about —
      // the teacher's Mark Attendance screen still needs the full enrolled roster to render a
      // first-time draft (every student defaulted to Present client-side).
      const roster = await this.prisma.user.findMany({
        where: { sectionId, role: 'student' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      return {
        submitted: false,
        locked: dateStr !== this.todayStr(),
        entries: roster.map((student) => ({ student, status: null })),
      };
    }

    return {
      submitted: true,
      locked: dateStr !== this.todayStr(),
      submittedBy: session.submittedBy,
      submittedAt: session.submittedAt,
      entries: session.entries.map((e) => ({ student: e.student, status: e.status })),
      // Teacher same-day edits are never audited (confirmed in docs/plan.md); the audit log
      // itself (AttendanceEdit, populated by admin PATCH edits) lands in T-034.
      edits: [],
    };
  }

  private async findSection(sectionId: string) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      select: { id: true, classTeacherId: true },
    });
    if (!section) throw new NotFoundException(SECTION_NOT_FOUND);
    return section;
  }

  private assertOwner(section: { classTeacherId: string | null }, callerId: string) {
    if (!section.classTeacherId || section.classTeacherId !== callerId) {
      throw new ForbiddenException(NOT_CLASS_TEACHER);
    }
  }

  private assertNoDuplicateStudentIds(entries: AttendanceEntryInput[]) {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.studentId)) duplicates.add(entry.studentId);
      seen.add(entry.studentId);
    }
    if (duplicates.size > 0) {
      throw new BadRequestException(
        `Attendance submission lists the same student more than once: ${[...duplicates].join(', ')}.`,
      );
    }
  }

  private async assertRosterCovered(
    db: Pick<Prisma.TransactionClient, 'user'>,
    sectionId: string,
    entries: AttendanceEntryInput[],
  ) {
    const roster = await db.user.findMany({
      where: { sectionId, role: 'student' },
      select: { id: true, name: true },
    });
    const rosterIds = new Set(roster.map((s) => s.id));
    const providedIds = new Set(entries.map((e) => e.studentId));

    const missing = roster.filter((s) => !providedIds.has(s.id));
    const extra = [...providedIds].filter((id) => !rosterIds.has(id));
    if (missing.length === 0 && extra.length === 0) return;

    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(
        `missing status for ${missing.map((s) => `${s.name} (${s.id})`).join(', ')}`,
      );
    }
    if (extra.length > 0) {
      parts.push(`includes unknown student id(s) ${extra.join(', ')}`);
    }
    throw new BadRequestException(
      `Attendance submission does not match the section's roster: ${parts.join('; ')}.`,
    );
  }

  private assertValidDateFormat(dateStr: string) {
    if (!DATE_RE.test(dateStr)) throw new BadRequestException(BAD_DATE_FORMAT);
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const valid =
      dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    if (!valid) throw new BadRequestException(BAD_DATE_FORMAT);
  }

  private assertIsToday(dateStr: string) {
    this.assertValidDateFormat(dateStr);
    if (dateStr !== this.todayStr()) throw new BadRequestException(LOCKED);
  }

  // Server's local calendar date (not UTC) — mirrors `toDateKey()` in
  // frontend/src/data/attendance.ts so "today" means the same thing on both sides, per
  // docs/plan.md's single-school/single-timezone decision.
  private todayStr(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  private toDateOnly(dateStr: string): Date {
    return new Date(`${dateStr}T00:00:00.000Z`);
  }
}

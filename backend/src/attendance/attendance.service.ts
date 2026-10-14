import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { AttendanceStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

const SECTION_NOT_FOUND = 'This section no longer exists.';
const SESSION_NOT_FOUND = 'This attendance session no longer exists.';
const NOT_CLASS_TEACHER = 'You are not the class teacher for this section.';
const BAD_DATE_FORMAT = 'Date must be a valid calendar date in YYYY-MM-DD format.';
const LOCKED =
  'Attendance for this date is locked: only today\'s attendance can be submitted or edited.';
const NOT_MARKED_YET =
  'Attendance for this section and date is not marked yet, so there is nothing to edit.';
const SECTION_ID_REQUIRED = 'sectionId query parameter is required.';
const BAD_MONTH_FORMAT = 'month must be a valid calendar month in YYYY-MM format.';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

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
    return this.loadResponse(sectionId, dateStr, { includeEdits: false });
  }

  // T-034: admin browse — same response shape as the teacher-facing `get()` above, but no
  // ownership check (any section, per `@Roles('admin')` at the route level) and the `edits`
  // audit log is populated instead of the hardcoded empty placeholder.
  async getAsAdmin(sectionId: string, dateStr: string) {
    await this.findSection(sectionId);
    this.assertValidDateFormat(dateStr);
    return this.loadResponse(sectionId, dateStr, { includeEdits: true });
  }

  // T-034: admin-only edit of any day's attendance (locked or not). Only entries whose status
  // actually changes produce an `AttendanceEdit` audit row (UC-05-E1); a session must already
  // exist for this section+date, otherwise it's rejected (UC-05-E2, admin edits existing records,
  // doesn't create original submissions). The whole request runs in a single transaction so two
  // overlapping admin edits (UC-05-E3) each apply cleanly and each produce their own audit rows.
  //
  // Race-condition fix: under READ COMMITTED, two concurrent admin PATCHes on the SAME student
  // can both read the same stale `status`. A bare `update({ where: { id } })` would blindly accept
  // whichever write lands second and record a `fromStatus` that was never actually true at write
  // time. Instead each write is conditional on the status still being what we read
  // (`updateMany({ where: { id, status }})`); if `count === 0` someone else changed it first, so we
  // re-read the fresh value within this same transaction and retry the compare-and-update (bounded
  // to a few attempts — this should be unreachable beyond one retry for a 2-request race, but we
  // don't want a theoretical infinite loop).
  async editAsAdmin(
    sectionId: string,
    dateStr: string,
    entries: AttendanceEntryInput[],
    editedById: string,
  ) {
    await this.findSection(sectionId);
    this.assertValidDateFormat(dateStr);
    this.assertNoDuplicateStudentIds(entries);

    const date = this.toDateOnly(dateStr);
    const MAX_ATTEMPTS = 3;
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.attendanceSession.findUnique({
        where: { sectionId_date: { sectionId, date } },
        select: {
          id: true,
          entries: { select: { id: true, studentId: true, status: true } },
        },
      });
      if (!session) throw new NotFoundException(NOT_MARKED_YET);

      const byStudentId = new Map(session.entries.map((e) => [e.studentId, e]));

      // Reject the whole request (nothing partial written, thanks to the surrounding transaction)
      // if any incoming studentId isn't on this session's roster — consistent with submit()'s
      // assertRosterCovered() explicitly naming unknown ids instead of silently dropping them.
      const unmatched = entries
        .map((e) => e.studentId)
        .filter((studentId) => !byStudentId.has(studentId));
      if (unmatched.length > 0) {
        throw new BadRequestException(
          `Attendance edit includes unknown student id(s) not on this session's roster: ${unmatched.join(', ')}.`,
        );
      }

      // Collected as each entry's update succeeds, then written with a single `createMany` after
      // the loop instead of one `create` per entry.
      const auditRows: {
        sessionId: string;
        studentId: string;
        fromStatus: AttendanceStatus;
        toStatus: AttendanceStatus;
        editedById: string;
        editedAt: Date;
      }[] = [];

      for (const incoming of entries) {
        let existing = byStudentId.get(incoming.studentId)!;
        if (existing.status === incoming.status) continue; // UC-05-E1: no real change, no audit row.

        let applied = false;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          // The freshly-read status may itself have caught up to the requested target (e.g. a
          // concurrent edit already set it to exactly what this request wants) — nothing left to
          // change or audit.
          if (existing.status === incoming.status) {
            applied = true;
            break;
          }

          const result = await tx.attendanceEntry.updateMany({
            where: { id: existing.id, status: existing.status },
            data: { status: incoming.status },
          });

          if (result.count > 0) {
            // `fromStatus` reflects exactly the value read immediately before this successful
            // write, so concurrent edits to the same student produce an accurate, sequential
            // audit chain instead of both claiming to start from the original stale read.
            auditRows.push({
              sessionId: session.id,
              studentId: incoming.studentId,
              fromStatus: existing.status,
              toStatus: incoming.status,
              editedById,
              editedAt: new Date(),
            });
            applied = true;
            break;
          }

          // Someone else changed this row's status between our SELECT and our UPDATE — re-fetch
          // the current value within this same transaction and retry the compare-and-update.
          existing = await tx.attendanceEntry.findUniqueOrThrow({
            where: { id: existing.id },
            select: { id: true, studentId: true, status: true },
          });
        }

        if (!applied) {
          throw new ConflictException(
            `Could not apply the attendance edit for student ${incoming.studentId}: its status kept changing concurrently. Please retry.`,
          );
        }
      }

      if (auditRows.length > 0) {
        await tx.attendanceEdit.createMany({ data: auditRows });
      }
    });

    return this.loadResponse(sectionId, dateStr, { includeEdits: true });
  }

  // T-036: admin-only daily summary report (UC-08) — one row per `Section` in the whole school.
  // A section with a recorded session for the date gets its entries' statuses summarized
  // (AC-08.1); a section with no session that date gets `summary: null` instead of zeros, so the
  // frontend (T-037) can render "Not marked yet" rather than implying a confirmed empty day.
  // Zero sections in the school → `[]` (UC-08-E2), no crash.
  //
  // Status counts are computed DB-side via `groupBy`/`_count` (grouped by `sessionId` + `status`,
  // since `sectionId` only lives on the parent `AttendanceSession`, not on `AttendanceEntry`
  // itself) rather than pulling every entry row and counting in JS — only aggregated counts cross
  // the wire, which matters here since this report scans every section in the school.
  async dailyReport(dateStr: string) {
    this.assertValidDateFormat(dateStr);
    const date = this.toDateOnly(dateStr);

    const sections = await this.prisma.section.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    if (sections.length === 0) return [];

    const sessions = await this.prisma.attendanceSession.findMany({
      where: { date, sectionId: { in: sections.map((s) => s.id) } },
      select: { id: true, sectionId: true },
    });
    if (sessions.length === 0) {
      return sections.map((section) => ({ section, summary: null }));
    }

    const sectionIdBySessionId = new Map(sessions.map((s) => [s.id, s.sectionId]));
    const grouped = await this.prisma.attendanceEntry.groupBy({
      by: ['sessionId', 'status'],
      where: { sessionId: { in: sessions.map((s) => s.id) } },
      _count: true,
    });

    // Every section with a recorded session starts at all-zero counts, so a status with zero
    // entries (e.g. no leaves that day) still reports `0` rather than being absent from the
    // grouped result.
    const summaryBySectionId = new Map<string, Record<AttendanceStatus, number>>(
      sessions.map((s) => [s.sectionId, { present: 0, absent: 0, leave: 0 }]),
    );
    for (const row of grouped) {
      const sectionId = sectionIdBySessionId.get(row.sessionId);
      if (!sectionId) continue;
      summaryBySectionId.get(sectionId)![row.status] = row._count;
    }

    return sections.map((section) => {
      const summary = summaryBySectionId.get(section.id);
      return summary ? { section, summary } : { section, summary: null };
    });
  }

  // T-036: admin-only monthly percentage report (UC-09) — one row per student currently enrolled
  // in the section, scanning that section's sessions within the given month. `markedDays` only
  // counts days with an actual recorded `AttendanceEntry` for that student, so a student added
  // partway through the month isn't penalized for days before they were ever on a submitted
  // roster (AC-09.3 — naturally true since entries only exist for sessions submitted while the
  // student was enrolled). `percentage` is `null`, not a number, when `markedDays === 0` (AC-09.1).
  //
  // Status counts are computed DB-side via `groupBy`/`_count` (grouped by `studentId` + `status`,
  // filtered to this section+month via the `session` relation) rather than pulling every entry
  // row for the month and counting in JS — only aggregated counts cross the wire.
  async monthlyReport(sectionId: string, monthStr: string) {
    if (!sectionId) throw new BadRequestException(SECTION_ID_REQUIRED);
    await this.findSection(sectionId);
    const { start, end } = this.assertValidMonthFormat(monthStr);

    const students = await this.prisma.user.findMany({
      where: { sectionId, role: 'student' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    if (students.length === 0) return [];

    const grouped = await this.prisma.attendanceEntry.groupBy({
      by: ['studentId', 'status'],
      where: { session: { sectionId, date: { gte: start, lt: end } } },
      _count: true,
    });

    const countsByStudentId = new Map<string, Record<AttendanceStatus, number>>();
    for (const row of grouped) {
      const counts =
        countsByStudentId.get(row.studentId) ?? { present: 0, absent: 0, leave: 0 };
      counts[row.status] = row._count;
      countsByStudentId.set(row.studentId, counts);
    }

    return students.map((student) => {
      const counts = countsByStudentId.get(student.id) ?? { present: 0, absent: 0, leave: 0 };
      const markedDays = counts.present + counts.absent + counts.leave;
      return {
        student,
        ...counts,
        markedDays,
        percentage: markedDays > 0 ? Math.round((counts.present / markedDays) * 100) : null,
      };
    });
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
  // T-034: shared by both the teacher-facing `get()` and the admin-facing `getAsAdmin()`/
  // `editAsAdmin()` — `includeEdits` is the only behavioral difference (the admin audit log vs.
  // the teacher's always-empty placeholder); ownership is checked by the caller, not here.
  private async loadResponse(
    sectionId: string,
    dateStr: string,
    { includeEdits }: { includeEdits: boolean },
  ) {
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
        edits: includeEdits
          ? {
              select: {
                studentId: true,
                fromStatus: true,
                toStatus: true,
                editedById: true,
                editedBy: { select: { id: true, name: true } },
                editedAt: true,
              },
              orderBy: { editedAt: 'asc' },
            }
          : false,
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
      // Teacher same-day edits are never audited (confirmed in docs/plan.md). For the teacher's
      // own endpoint this stays the hardcoded empty placeholder; the admin endpoints populate it
      // with the real `AttendanceEdit` audit rows.
      edits: includeEdits ? (session.edits ?? []) : [],
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

  // Returns the month's inclusive start / exclusive end as UTC-midnight `Date`s, matching how
  // `toDateOnly()` stores session dates — so `{ gte: start, lt: end }` lines up exactly with the
  // stored `date` column regardless of which day of the month it falls on.
  private assertValidMonthFormat(monthStr: string): { start: Date; end: Date } {
    if (!MONTH_RE.test(monthStr)) throw new BadRequestException(BAD_MONTH_FORMAT);
    const [y, m] = monthStr.split('-').map(Number);
    if (m < 1 || m > 12) throw new BadRequestException(BAD_MONTH_FORMAT);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
    return { start, end };
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

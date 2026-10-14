# Brainstorm: Attendance Management

## Problem

Attendance is currently tracked on paper. This means:
- Parents don't find out when their child is absent.
- Admin cannot produce attendance reports (e.g. for inspections or decisions).
- No historical record exists for students.

## Users

- **Teacher** — exactly one designated "class teacher" per Section marks daily attendance for their own section only (not any teacher who teaches a period there).
- **Student** — views their own attendance record only.
- **Admin** — views all attendance (filterable by date/class), and is the only role that can edit attendance after it is locked.
- **Parent** — out of scope for v1 (see below).

## MVP features

1. Class teacher marks each student in their section as Present / Absent / Leave, once per day (not per subject/period).
2. Teacher can edit their section's attendance for the current day up until midnight.
3. Attendance auto-locks at midnight. After lock, only Admin can edit it.
4. Admin edits to locked attendance are logged (who changed it, when, old value → new value). No reason/comment is required.
5. Student can view their own daily attendance history.
6. Admin can view attendance across all classes/sections, filterable by date and class.
7. Basic reports, on-screen only (no export in v1):
   - Daily attendance summary per class.
   - Monthly attendance percentage per student.

## Out of scope (v1)

- Parent view/access to attendance.
- Parent–student linking (no such relationship exists in the data model yet).
- Academic calendar / holiday model — every weekday is treated as a potential school day; no enforcement preventing attendance on non-school days.
- Exportable reports (CSV/PDF).
- Per-period/subject-level attendance.
- Leave-request/approval workflow — "Leave" is just a status a teacher can pick, not a request-approval flow.
- Requiring a reason/comment on admin edits to locked attendance.

## Risks and challenges

| Risk | Impact | Idea to reduce it |
|---|---|---|
| Midnight auto-lock requires a scheduled job — a new pattern for this codebase | Low-medium: if the job fails silently, attendance never locks | Use NestJS's `@nestjs/schedule`, add a test and basic monitoring/logging for the job |
| No holiday model — teachers could mark attendance on non-school days | Low: data-quality only, not a functional blocker | Admin can simply disregard those days for now; revisit if it becomes a real problem |
| Future parent feature will need retrofitting a parent–student link | Medium: some rework later when parent access is built | Key the Attendance model off `userId` (student), so adding parent view later is additive, not a rewrite |
| Section-based attendance (not Class-based) | Low — schema already has `classTeacherId` on `Section` and students link to `Section` | None needed; confirmed to fit existing schema |

## Open questions

- None outstanding — all key decisions were confirmed during brainstorming.

## Doability verdict

**Go.** The existing schema already has `Section`, `classTeacherId`, and student–section links, so this feature fits cleanly without requiring prerequisite data-model work, once Parent access and the holiday model are deferred to a future version.

---
diff_hash: 58891511a06a129e6ad060f5c781dd6048a0558c91cf3a23e32642de01698ce2
reviewed_at: 2026-10-14T07:53:03Z
---

## Summary

Adds the attendance backend (NestJS + Prisma): `AttendanceSession`/`AttendanceEntry` models and migration, and `PUT/GET /attendance/sections/:sectionId/days/:date`, restricted to the section's class teacher (teacher role + ownership check). Submissions are limited to today's date and must cover the section roster exactly. Four real-DB specs are included. The rest of the diff is docs and tickets (T-032..T-039), plus a regenerated tsbuildinfo. Stack: NestJS (backend only; no frontend change, so no cross-repo contract issue).

## Findings

### Critical (0)

### High (0)

### Medium (2)
- **backend/src/attendance/attendance.service.ts:100** — `assertRosterCovered` compares Sets, so duplicate `studentId`s in `entries` pass the roster check. `createMany` then violates the `(sessionId, studentId)` unique index and the request fails as a 500 instead of a 400. The transaction rolls back, but the client gets an unhelpful error. Reject duplicates explicitly (e.g. compare `entries.length` to the Set size and report the duplicate ids). *(correctness)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Input such as `[{studentId:A,status:present},{studentId:A,status:absent}]` for a one-student roster passes validation and ends in an unhandled Prisma P2002 error.
- **backend/src/attendance/attendance.service.ts:136** — "Today" is computed as the UTC date (`new Date().toISOString().slice(0, 10)`). For a school in a non-UTC timezone, teachers submitting near local midnight (or early morning in a timezone ahead of UTC) get "locked" errors for what is locally today, or can submit for the wrong day. Use a configured school timezone (via config) to derive today's date. *(correctness)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: The date is the core of the edit-lock rule (`locked` and `assertIsToday`), so the offset directly affects who can submit when.

### Low (2)
- **backend/src/attendance/attendance.service.ts:25** — The roster check (`assertRosterCovered`) runs outside the transaction that deletes and recreates entries. A student moved into or out of the section between the check and the write can leave an entry that no longer matches the roster. The window is small and the effect is minor, but running the check inside the transaction would close it. *(correctness)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Low impact; the FK on `studentId` still prevents invalid users, and only section membership can drift.
- **backend/src/attendance/attendance.controller.ts:25** — Controller reads the user via `@Req() req: Request & { user: JwtPayload }` in both handlers, repeating the type. A small `@CurrentUser()` decorator would remove the duplication. No such decorator exists in the project yet, so this is optional. *(maintainability)*
  - status: skipped
  - dev_reasoning: cosmetic only; introducing a new @CurrentUser() decorator pattern is out of scope for this ticket and not used elsewhere in the project yet.
  - ai_reasoning: Consistent with how other controllers may do it, so this is purely a cleanup suggestion.

## Reviewed files
- backend/prisma/migrations/20261014090000_add_attendance/migration.sql
- backend/prisma/schema.prisma
- backend/src/app.module.ts
- backend/src/attendance/attendance.controller.ts
- backend/src/attendance/attendance.module.ts
- backend/src/attendance/attendance.service.ts
- backend/src/attendance/dto/submit-attendance.dto.ts
- backend/src/attendance/attendance-access.spec.ts (skimmed)
- backend/src/attendance/attendance-date.spec.ts (skimmed)
- backend/src/attendance/attendance-edit.spec.ts (skimmed)
- backend/src/attendance/attendance-submit.spec.ts (skimmed)
- backend/tsconfig.build.tsbuildinfo (skipped, generated)
- docs/brainstorm.md, docs/plan.md, docs/use-cases.md, tickets/STATUS.md, tickets/T-032.md .. T-039.md (docs only)

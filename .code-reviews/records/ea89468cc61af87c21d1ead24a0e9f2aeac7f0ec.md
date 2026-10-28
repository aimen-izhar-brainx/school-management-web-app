---
commit: ea89468cc61af87c21d1ead24a0e9f2aeac7f0ec
branch: people-management
author: brainxtechnologies
timestamp: 2026-10-28T12:28:20+05:00
reviewed_at: 2026-10-28T07:28:38Z
stack: unknown
score: 99
status: fail
critical: 0
high: 0
medium: 0
low: 1
open: 1
skipped: 0
ignored: 0
resolved: 5
---

## Summary

Adds the exam module: Prisma models (Exam, ExamMark, GradeBand) with three migrations, a NestJS `exams` module (CRUD, per-class marks, mark entry, grade scale, student results), and the React UI (exams page, mark-entry drawer, report cards, grade-scale editor, my-results page, toasts). Also restructures RoleHome into a nav-item list and removes two doc comments in the attendance service. Stack: NestJS + React (Prisma, class-validator). No cross-repo contract mismatch found, apart from the parent-role finding below.

## Findings

### Critical (0)

### High (0)

### Medium (3)
- **backend/src/exams/exams.service.ts:130** — `listMarks` (and `findAll`) scope teachers to any section where they are class teacher or teach *any* subject, then return every exam's marks for the section. A subject teacher therefore reads the marks of every other subject in that class. Only admins and the class teacher should see all subjects; other teachers should be filtered to the exams for subjects they teach. *(security)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: `listMarks` now also applies `examScope(viewer)` to the `examMark` query (`exam: { AND: [{ sectionId }, examScope] }`), so non-admin, non-class-teacher viewers only get marks for exams of subjects they teach, matching the write path.

- **backend/src/exams/exams.controller.ts:62** — `GET /exams/grade-scale` has no `@Roles` and `my-results` is `@Roles('student')` only, but `App.tsx` routes the `parent` role to `MyResultsPage`. A parent reaching that page would get 403 from `/exams/my-results`. Either allow parents on the backend (with a child-ownership check) or remove `parent` from the frontend route guard. *(correctness)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: `App.tsx` no longer routes the `parent` role to `MyResultsPage`; the frontend guard and the `@Roles('student')` backend contract now agree.

- **backend/src/exams/exams.service.ts:196** — `saveMarks` runs `deleteMany` for every student not in `entries`, followed by one `upsert` per entry, with no cap on the size of `entries`. An empty or partial payload silently wipes existing marks, and a very large object produces an unbounded transaction (`SaveMarksDto` only has `@IsObject`). Add `@ArrayMaxSize`-style bounds (for example a key-count limit) and validate the value type in the DTO instead of in the service loop. *(correctness)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: `SaveMarksDto` now validates via `MarkEntriesConstraint`: at most `MAX_MARK_ENTRIES` (500) keys, each a finite non-negative number, so the payload is bounded and value types are checked in the DTO.

### Low (3)
- **backend/src/exams/exams.service.ts:1** — The first import is collapsed onto one line (`import {BadRequestException,ConflictException,...}`) and `update-exam.dto.ts:2` has an over-long import. Both ignore the project's formatting; run the formatter. *(consistency)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Imports in `exams.service.ts` are now formatted one per line; resolved.

- **backend/src/attendance/attendance.service.ts:174** — Two JSDoc comments on `listSections` and `rosterForSection` were deleted. They are unrelated to the exam feature and described non-obvious behaviour (which sections a caller can browse, and that rosters load per section). Restore them or move the removal into its own commit. *(maintainability)*
  - status: ignored
  - dev_reasoning: comments not needed
  - ai_reasoning: Unrelated change inside an otherwise exam-only diff.

- **frontend/src/components/RoleHome.tsx:37** — The destructured props lost their trailing comma (`onSignOut`), unlike the rest of the file and the project's style. *(consistency)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: The trailing comma after `onSignOut` is restored; resolved.

## Reviewed files
- .code-reviews/brainx-review.md (deleted)
- backend/prisma/migrations/20261027000000_add_exam_module/migration.sql
- backend/prisma/migrations/20261028000000_add_exam_marks/migration.sql
- backend/prisma/migrations/20261029000000_add_grade_scale/migration.sql
- backend/prisma/schema.prisma
- backend/src/app.module.ts
- backend/src/attendance/attendance.service.ts
- backend/src/exams/dto/* (5 files)
- backend/src/exams/exams.controller.ts
- backend/src/exams/exams.module.ts
- backend/src/exams/exams.service.ts
- frontend/src/App.tsx
- frontend/src/components/AdminDashboardPage.tsx, AdminDashboardPage.test.tsx
- frontend/src/components/RoleHome.tsx, RoleHome.test.tsx
- frontend/src/components/ExamsPage.tsx, ExamsTab.tsx, CreateExamModal.tsx, GradeScaleEditor.tsx, MarkEntry.tsx, MarkEntryLoader.tsx, MyResultsPage.tsx, ReportCard.tsx, ReportCardsTab.tsx, Overlay.tsx, Toasts.tsx, examStyles.ts, examUi.tsx, useExamData.ts, useToasts.ts (skimmed: MarkEntry.tsx submit path, useExamData.ts, useToasts.ts; the remaining presentational components were not read in full)
- frontend/src/data/exams.ts
- frontend/src/lib/exams.ts
- frontend/src/index.css (skimmed)

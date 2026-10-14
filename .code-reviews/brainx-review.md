---
diff_hash: 0d10dc7b5824a7af9e5359d3e259fe1c9a253a1f2382ba6177bb92745641ca93
reviewed_at: 2026-10-14T08:59:22Z
---

## Summary

T-033: MarkAttendancePage is wired to the real attendance API with same-day re-edit. The backend GET now always returns 200 with the full roster and student names, and PUT returns the original T-032 shape. Stack: NestJS (backend) + React (frontend). Specs and the ticket/status docs are updated.

## Findings

### Critical (0)

### High (0)

### Medium (2)
- **frontend/src/components/MarkAttendancePage.tsx:~160 (handleSave)** — A save in flight is not guarded against a section/date change. The select and date inputs stay enabled while `submitting`, and `handleSave` calls `setDay`/`setDraft`/`setEditing` without checking `latestDayRequest`. If the teacher switches section during the PUT, the old section's result overwrites `day` and is shown under the newly selected section. *(correctness)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. The section `<select>` and date `<input>` now carry `disabled={submitting}`, matching the existing disabled-state pattern used elsewhere in the component (e.g. the submit/save button), so the pickers can't be changed while a PUT is in flight.
- **backend/src/attendance/attendance.service.ts:100 and :90** — `user.findMany` for the roster and the session `entries` select have no `orderBy`. Student order is database-defined and can change between loads, so rows can shuffle between the unsubmitted form and the submitted view. *(correctness)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. `orderBy: { name: 'asc' }` was added to the roster `user.findMany`, and `orderBy: { student: { name: 'asc' } }` to the `entries` list query in `loadResponse` (the `AttendanceEntry.student` relation is to-one, so Prisma 7 supports ordering the to-many `entries` list by the related student's name directly).

### Low (4)
- **frontend/src/components/MarkAttendancePage.tsx:~95 (loadDirectory)** — Fetches `/classes` and then one `/sections` request per class, so request count grows with the number of classes. The ticket notes say this mirrors TimetablePage, so the impact is small. *(maintainability)*
  - status: skipped
  - dev_reasoning: Intentionally matches the existing fan-out pattern already used by TimetablePage.tsx for the same `/classes` + per-class `/sections` lookup — this ticket's own technical notes specify reusing that exact pattern. A dedicated "my sections" endpoint would be a reasonable follow-up but is a new backend surface, out of scope for this ticket.
  - ai_reasoning: Acceptable for now. A "my sections" endpoint would remove the fan-out and the client-side filter.
- **frontend/src/components/MarkAttendancePage.tsx (date input)** — The user can clear the date input, which makes `date` an empty string. The page then requests `/days/` and shows a confusing routing error. *(correctness)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. The day-load effect now checks `isValidDateKey(date)` (a `YYYY-MM-DD` regex) before firing, so an empty or incomplete date value is ignored instead of hitting a malformed `/days/` URL. Covered by a new test.
- **backend/src/attendance/attendance.service.ts:64** — `findUniqueOrThrow` raises a Prisma P2025 error, which surfaces as a 500 if the session is ever absent. This is unlikely right after the upsert, but it bypasses the Nest exception mapping used elsewhere. *(consistency)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. `loadSubmitResponse` now uses `findUnique` plus an explicit null check that throws `NotFoundException`, consistent with `findSection`'s not-found handling elsewhere in this service.
- **backend/tsconfig.build.tsbuildinfo** — A build artifact is tracked in git and modified in this diff, which adds noise and merge conflicts. *(maintainability)*
  - status: skipped
  - dev_reasoning: pre-existing tracked build artifact from before this ticket; untracking it is an unrelated repo-hygiene change out of scope here.
  - ai_reasoning: Add it to .gitignore and untrack it in a separate commit.

## Reviewed files
- .code-reviews/brainx-review.md (deleted, replaced by this review)
- backend/src/attendance/attendance.service.ts
- backend/src/attendance/attendance-date.spec.ts
- backend/src/attendance/attendance-edit.spec.ts
- backend/src/attendance/attendance-submit.spec.ts
- backend/tsconfig.build.tsbuildinfo (generated, skimmed)
- frontend/src/components/MarkAttendancePage.tsx
- frontend/src/components/MarkAttendancePage.test.tsx
- tickets/STATUS.md
- tickets/T-033.md

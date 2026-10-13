---
diff_hash: ea854de815f4395a5ec91ad3d311900289833003af7ee75407b4a003e44a54fb
reviewed_at: 2026-10-13T12:46:17Z
---

## Summary

T-031: blocks the Parent role from Academic Management. `GET /timetable/me` now requires `@Roles('teacher','student')` via `RolesGuard`; the service's admin/parent "none" branch was removed. `MyTimetablePage` renders "Not available for your role." for parents without fetching. Adds a real-DB spec (`parent-access.spec.ts`) covering 403 on all write endpoints, 403 on `/timetable/me`, and 401 for missing/expired tokens, plus parent cases in the frontend tests. Stack: NestJS (backend) + React (frontend). The diff touches no API contract that the frontend consumes differently; the frontend no longer receives `kind: 'none'`, and nothing in `frontend/src` references it.

## Findings

### Critical (0)

### High (0)

### Medium (0)

### Low (2)
- **backend/src/timetable/timetable-me.service.ts:17** — `getMine` now treats every non-teacher role as a student (`role === 'teacher' ? forTeacher : forStudent`). Access control rests entirely on the controller's `@Roles('teacher','student')`; if that decorator is ever removed or the guard is not applied, an admin/parent would silently get the student branch (an empty "no section" payload) instead of a failure. *(maintainability)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Not exploitable today, since the guard is in place and tested. Consider an explicit `role === 'student'` check with a `ForbiddenException` fallback for defense in depth.
- **backend/tsconfig.build.tsbuildinfo:1** — A generated build-cache file is tracked in git and modified in this diff, which adds noise and merge conflicts. *(maintainability)*
  - status: ignored
  - dev_reasoning: Pre-existing tracked file that the hook's `git add -A` stages on every commit. Untracking it and editing .gitignore is a repo-hygiene change outside this ticket's scope, left for the repo owner (same as every earlier commit on this branch).
  - ai_reasoning: Build artifacts shouldn't be committed. Add `*.tsbuildinfo` to `.gitignore` and `git rm --cached` the file, or unstage this change.

## Reviewed files
- .code-reviews/brainx-review.md (deleted prior review)
- backend/src/common/parent-access.spec.ts
- backend/src/timetable/timetable-me.controller.ts
- backend/src/timetable/timetable-me.service.ts
- backend/tsconfig.build.tsbuildinfo (generated; skimmed)
- docs/use-cases.md
- frontend/src/components/ClassesPage.test.tsx
- frontend/src/components/MyTimetablePage.test.tsx
- frontend/src/components/MyTimetablePage.tsx
- frontend/src/components/TimetablePage.test.tsx
- tickets/STATUS.md
- tickets/T-031.md

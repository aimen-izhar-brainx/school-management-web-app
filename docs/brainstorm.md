# Brainstorm: Codebase Refactor (Deduplication & Best Practices)

## Problem
No active bugs have surfaced yet, but the code "doesn't feel clean." The goal is to bring the codebase in line with SOLID principles and general best practices before it grows further — this is preventative hygiene work, not a fix for a known failure.

## Users
Solo developer. No other developers currently work in this codebase, so there's no team-coordination overhead to design around.

## MVP features
Priority order: frontend de-duplication first, then backend/project hygiene.

**1. Frontend de-duplication**
- Shared layout/header component for the 10 new pages (Attendance, Classes, Timetable, Notices, Profile, Admin pages, etc.), following the pattern `AuthShell.tsx` already sets for the auth flow
- Shared `Input` / `Select` / `Table` primitives to remove the repeated Tailwind class strings scattered across pages
- One shared email/password validator utility, replacing the two inconsistent regexes (`AdminCreatePage.tsx` vs `ProfilePage.tsx`)
- De-duplicate repeated table/list rendering logic (status badges, empty states) between `AttendancePage` ↔ `MyAttendancePage`, and the grid logic between `TimetablePage` ↔ `MyTimetablePage`

**2. Backend & project hygiene**
- Enable `strict` mode in frontend `tsconfig.app.json` and fix what it surfaces
- Add missing `oxlint` config for the backend (it has a lint script but no `.oxlintrc`)
- Add basic tests for the backend auth module (login, refresh, forgot/reset password)

## Out of scope
- Building real backend APIs/DB models for attendance, timetable, notices, classes, admin-create — these pages stay mock-data-only for now
- Any new product features
- Multi-developer tooling or process (solo project)
- CI (dropped from v1 scope — not a priority right now)

## Risks and challenges

| Risk | Impact | Idea to reduce it |
|---|---|---|
| Strict-mode rollout surfaces many pre-existing type errors | Could expand scope/time beyond initial estimate | Accepted as acceptable; fix incrementally, file by file |
| Writing auth tests requires mocking JWT/bcrypt/email flows | Time-consuming to do properly | Start with critical paths (login, refresh) before edge cases |
| No frontend tests exist yet, so refactoring shared UI (header, inputs) could regress working pages — especially the real auth flow | Could break login/reset-password in production-like use | Manually verify every page after refactor; consider a minimal smoke test for the auth flow before touching `AuthShell` |
| Legal/privacy, cost, competition | N/A | Internal solo refactor, no new data handling introduced |

## Open questions
None outstanding — priority order was confirmed by the user; CI was later dropped from v1 scope during planning.

## Doability verdict
**Go.** Low technical risk — this is mostly extraction and configuration work, not new business logic. The backend auth module is already solid (hashed tokens, bcrypt, guards, validation pipe). No deadline pressure, solo project, user has accepted that strict-mode/test work may expand scope somewhat.

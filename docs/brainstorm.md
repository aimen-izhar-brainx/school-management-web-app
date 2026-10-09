# Brainstorm: Academic Management

## Problem

Classes, sections, subjects, and timetables are currently managed manually (Excel/paper). This is error-prone and there is no system of record for this data in the app today.

## Users

- **Admin** — full CRUD on classes, sections, subjects, and the timetable. Only role that can create or edit anything in this feature.
- **Teachers** — read-only access to their own timetable.
- **Students** — read-only access to their own class/section timetable.

No other role can make changes.

## MVP features

- **Class management** — Create/Edit/Delete classes (e.g., "Grade 1", "Grade 10").
- **Section management** — Create/Edit/Delete sections within a class (e.g., Section A, B, C).
- **Subject management**:
  - Create subjects
  - Assign subjects to classes
  - Assign exactly one teacher per subject (per class/section)
- **Timetable builder**:
  - Weekly timetable per class/section, Monday–Friday
  - School day runs 8:00 AM–1:00 PM; periods are fixed/school-wide (exact number and duration of periods to be finalized during `/plan`)
  - Admin assigns subject + teacher to a day/time slot
  - Automatic conflict detection — blocks assigning a teacher to two classes/sections at the same day/time slot
- **Read-only views** — Teachers and students can view their respective timetables; no edit access.
- Single school only (no multi-tenant data model needed).
- Rework the existing mock-only frontend pages (`ClassesPage.tsx`, `TimetablePage.tsx`, `MyTimetablePage.tsx`) into real, backend-wired pages. UI/flow can be improved where it clearly helps, not just reskinned.

## Out of scope (v1)

- AI/auto-generated timetable suggestions
- Academic year/term/semester management (one active timetable per class/section, no history across terms)
- Notifications/alerts when the timetable changes
- Teacher substitution/leave handling
- Bulk import (CSV) of classes/subjects
- Audit log/history of timetable changes

## Risks and challenges

| Risk | Impact | Idea to reduce it |
|---|---|---|
| No backend data models exist yet (`Class`, `Section`, `Subject`, `Timetable`) — this is a full buildout, not a thin slice | Medium-high implementation effort | Plan the data model carefully up front; deliver in phased tickets |
| No `RolesGuard` enforcing admin-only writes server-side today (role check currently lives only on the frontend) | Security gap — a teacher/student could call write APIs directly today | Build a proper backend `RolesGuard`/decorator as part of this feature |
| Conflict-detection logic (checking teacher availability across all classes/sections on every write) | Adds query/validation complexity | Validate at the service layer; index by teacher + day + time slot |
| Rewiring existing mock frontend pages to real APIs while also improving UI/flow | Risk of scope creep beyond a straightforward CRUD build | Keep redesign targeted to specific usability gaps, not a full overhaul |
| Timeline | Flexible — low risk | — |

## Open questions

- Exact number and duration of periods within the 8:00 AM–1:00 PM school day (to be finalized in `/plan`).

## Doability verdict

**Go with changes.** Technically straightforward (standard CRUD + scheduling conflict checks), but it is a genuine full-stack build: new Prisma models, new NestJS modules, backend role enforcement that doesn't exist yet, and rewired/redesigned frontend pages. Recommend careful data-model planning before coding begins.

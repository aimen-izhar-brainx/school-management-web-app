# Use Cases: Codebase Refactor (Deduplication & Best Practices)

| UC ID | Name | Milestone | # Criteria | # Edge cases |
|---|---|---|---|---|
| UC-01 | Consistent header, sign-out and back-navigation across all refactored pages | M1 | 5 | 3 |
| UC-02 | Shared email validation across admin-create and profile forms | M2 | 5 | 4 |
| UC-03 | Attendance table rendering stays identical after extracting shared logic | M3 | 4 | 3 |
| UC-04 | Timetable grid rendering stays identical after extracting shared logic | M3 | 4 | 3 |
| UC-05 | Type-check passes after enabling strict mode | M4 | 3 | 1 |
| UC-06 | Backend lint config enforces existing conventions | M5 | 2 | 1 |
| UC-07 | Auth service test coverage (login, refresh, forgot/reset password) | M5 | 7 | 2 |

---

### UC-01: Consistent header, sign-out and back-navigation across all refactored pages
- Actor: Any logged-in user (admin/teacher/student/parent)
- Milestone: M1
- Preconditions: User is authenticated; viewing one of the migrated pages (AdminCreatePage, ClassesPage, TimetablePage, AttendancePage, MarkAttendancePage, MyAttendancePage, MyTimetablePage, NoticeBoardPage, ProfilePage, AdminDashboardPage, RoleHome)
- Main flow:
  1. User opens any of the above pages.
  2. Shared layout renders a header with the "Brainx School" logo/title on the left and action buttons on the right.
  3. User clicks "Sign out".
  4. Session clears immediately and the app returns to the login screen.
- Acceptance criteria (Definition of Done):
  - [ ] AC-01.1 Given any migrated page, when it loads, then the header shows the GraduationCap icon + "Brainx School" text in the same position/style as before the refactor.
  - [ ] AC-01.2 Given a page that previously showed only a Sign out button (all except AdminDashboardPage/RoleHome), when rendered after the refactor, then it still shows only Sign out (no Profile button added).
  - [ ] AC-01.3 Given AdminDashboardPage or RoleHome, when rendered after the refactor, then it still shows both Profile and Sign out buttons.
  - [ ] AC-01.4 Given any page, when the user clicks "Sign out", then the session is cleared and the login screen is shown, even if the backend `/auth/logout` request fails.
  - [ ] AC-01.5 Given any of the 9 non-dashboard pages, when loaded, then a "Back to dashboard" link (left-arrow icon) appears above the title, and clicking it returns to the user's role dashboard.
- Edge cases:
  - UC-01-E1: Given a viewport narrower than 360px, when the header renders, then logo/title and buttons don't overlap or clip.
  - UC-01-E2: Given the user double-clicks "Sign out" rapidly, when both clicks register, then nothing throws (sign-out is idempotent).
  - UC-01-E3: Given unsaved input in a form (e.g. AdminCreatePage mid-fill), when "Back to dashboard" is clicked, then the input is discarded without a confirmation prompt (matches current behavior — no unsaved-changes guard exists today).
- Not included: Changing role-based page access, adding a confirm-before-sign-out dialog, adding a persistent sidebar nav.

### UC-02: Shared email validation across admin-create and profile forms
- Actor: Admin (AdminCreatePage teacher/parent tabs), any logged-in user (ProfilePage)
- Milestone: M2
- Preconditions: User is on AdminCreatePage (teacher or parent tab) or ProfilePage (profile tab)
- Main flow:
  1. User types an email into the Email address field.
  2. User submits the form.
  3. The shared validator checks the format.
  4. On success, the existing success behavior fires (teacher/parent created, or "Your profile has been updated").
- Acceptance criteria (Definition of Done):
  - [ ] AC-02.1 Given the teacher tab with an invalid email (e.g. "bob@"), when submitted, then "Please enter a valid email address." appears, exactly as before.
  - [ ] AC-02.2 Given the parent tab with an invalid email, when submitted, then the same error appears.
  - [ ] AC-02.3 Given ProfilePage's profile tab with an invalid email, when submitted, then the same error appears via the now-shared validator (previously a separate inline regex).
  - [ ] AC-02.4 Given a syntactically valid email on any of the three forms, when submitted, then no email-format error is shown.
  - [ ] AC-02.5 Given the shared `Input`/`Select` components are used, when any form renders, then visual appearance (label, spacing, border, focus ring) is unchanged.
- Edge cases:
  - UC-02-E1: Given an email with leading/trailing whitespace, when submitted, then it's trimmed before validation and accepted (matches current `.trim()` behavior).
  - UC-02-E2: Given an empty email field, when submitted, then it fails with the same "valid email" error.
  - UC-02-E3: Given an extremely long (300+ char) but syntactically valid email, when submitted, then it's accepted without crashing or truncating.
  - UC-02-E4: Given an empty full-name field on any AdminCreatePage tab, when submitted, then the full-name error appears and the email validator isn't reached (name check still runs first).
- Not included: Server-side/duplicate-email validation (no real backend call exists for these forms), password validation (already shared via `lib/password.ts`, untouched here).

### UC-03: Attendance table rendering stays identical after extracting shared logic
- Actor: Admin (AttendancePage — browse/edit any class), Student or Parent (MyAttendancePage — read-only own/child record)
- Milestone: M3
- Preconditions: Records exist in `INITIAL_ATTENDANCE_RECORDS` mock data for the relevant section/date
- Main flow:
  1. Admin opens AttendancePage, selects section + date; status badges/table rows render present/absent/leave counts and per-student rows.
  2. Student/Parent opens MyAttendancePage; sees monthly % stats, present/absent/leave counts in colored cards, and a chronological list of per-day status badges.
- Acceptance criteria (Definition of Done):
  - [ ] AC-03.1 Given a section with a recorded day, when AttendancePage browses to it, then per-status badge styling (color classes, dot indicator) matches pre-refactor, via logic shared with MyAttendancePage.
  - [ ] AC-03.2 Given a student/parent with recorded entries for the selected month, when MyAttendancePage renders, then each entry shows the same badge style/label as AttendancePage (same shared component).
  - [ ] AC-03.3 Given a section/date with no record, when AttendancePage browses to it, then "Not marked yet for {section} on {date}" still appears.
  - [ ] AC-03.4 Given zero attendance entries for the selected month, when MyAttendancePage renders, then "No attendance marked for this month yet." appears and percentage shows "—" (never NaN or a divide-by-zero).
- Edge cases:
  - UC-03-E1: Given 0 marked days in the month, when percentage is computed, then it's null/"—", never a division by zero.
  - UC-03-E2: Given a large roster (50+ students), when AttendancePage renders the list, then it still renders without errors.
  - UC-03-E3: Given edit mode is active on AttendancePage and the admin changes section/date mid-edit, when the filter changes, then edit mode cancels automatically (existing behavior preserved through extraction).
- Not included: Persisting attendance to a real backend, changing the admin edit/lock workflow, MarkAttendancePage (its "mark today's attendance" flow is materially different and isn't part of this de-duplication).

### UC-04: Timetable grid rendering stays identical after extracting shared logic
- Actor: Admin (TimetablePage — builds grid), Teacher/Student (MyTimetablePage — read-only view)
- Milestone: M3
- Preconditions: `INITIAL_TIMETABLES` mock data exists for at least one section
- Main flow:
  1. Admin selects a section, sees the weekly grid (Time column + Mon–Fri), each cell showing subject+teacher dropdowns or "Free period".
  2. Teacher/Student opens MyTimetablePage, sees a read-only weekly grid filtered to their own schedule.
- Acceptance criteria (Definition of Done):
  - [ ] AC-04.1 Given a period marked `isBreak`, when either page renders that row, then it spans all day columns with the same break styling (amber background, coffee icon, time range), via shared row logic.
  - [ ] AC-04.2 Given a non-break period with no entry for a day, when TimetablePage renders the cell, it shows "Free period" in the dropdown; when MyTimetablePage renders the same empty slot, it shows the dashed "Free" placeholder — both via the shared `formatTime` helper.
  - [ ] AC-04.3 Given a period's start/end time (e.g. "14:30"), when formatted by the shared `formatTime` helper, then it displays as "2:30 PM" identically on both pages (currently duplicated verbatim in each file).
  - [ ] AC-04.4 Given a teacher viewing MyTimetablePage whose slots span multiple sections, then each cell's caption shows the correct section label (unchanged matching-by-name logic).
- Edge cases:
  - UC-04-E1: Given an empty `SECTION_OPTIONS` array, when MyTimetablePage computes a student's schedule, then it doesn't crash.
  - UC-04-E2: Given a teacher's name doesn't match any seed teacher, when MyTimetablePage loads, then it falls back to `TEACHERS[0]`, exactly as today.
  - UC-04-E3: Given all periods are removed on TimetablePage, when the periods list renders, then "No periods defined yet." still appears.
- Not included: Editing capability on MyTimetablePage (stays read-only), persisting timetable changes to a backend, the period/break management UI on TimetablePage.

### UC-05: Type-check passes after enabling strict mode
- Actor: Developer
- Milestone: M4
- Preconditions: `strict: true` added to `frontend/tsconfig.app.json`
- Main flow:
  1. Developer runs `npm run build` (`tsc -b && vite build`) in `frontend/`.
  2. TypeScript compiles with strict checks (noImplicitAny, strictNullChecks, etc.) enabled.
- Acceptance criteria (Definition of Done):
  - [ ] AC-05.1 Given strict mode is enabled, when `tsc -b` runs, then it completes with zero type errors.
  - [ ] AC-05.2 Given strict mode is enabled, when `npm run build` runs, then `vite build` still produces a working production bundle.
  - [ ] AC-05.3 Given the strict-mode fixes are applied, when manually exercising login → each of the 10 pages → sign out in dev mode, then there is no new runtime behavior change caused by the type fixes (no new unhandled exceptions).
- Edge cases:
  - UC-05-E1: Given a fix required adding a null-check where the compiler previously allowed implicit `any`, when that code path is exercised with the same previously-unsafe input (e.g. an optional prop left undefined), then it behaves the same as before — the fix satisfies the compiler only, not a new runtime behavior.
- Not included: Enabling strict mode on `tsconfig.node.json`/Vite config files unless already covered, any behavior change beyond what's needed to satisfy the compiler.

### UC-06: Backend lint config enforces existing conventions
- Actor: Developer
- Milestone: M5
- Preconditions: `.oxlintrc.json` added to `backend/`
- Main flow:
  1. Developer runs `npm run lint` in `backend/`.
- Acceptance criteria (Definition of Done):
  - [ ] AC-06.1 Given the new `.oxlintrc.json`, when `npm run lint` runs against `backend/src` and `backend/test`, then it completes with no errors on the current codebase.
  - [ ] AC-06.2 Given the config mirrors the frontend's plugin set where applicable (typescript, oxc — react plugin omitted, no React in backend), when linting, then TypeScript-specific rules are active.
- Edge cases:
  - UC-06-E1: Given a deliberately introduced unused variable in a backend file, when `npm run lint` runs, then it reports an error for it (proves the config actually enforces rules).
- Not included: Auto-fixing existing lint violations beyond what's needed to pass cleanly, changing frontend lint rules.

### UC-07: Auth service test coverage (login, refresh, forgot/reset password)
- Actor: Developer
- Milestone: M5
- Preconditions: Vitest already configured in `backend/`; `AuthService`/`AuthController` exist with login, refresh, logout, forgot-password, reset-password logic (read directly from `backend/src/auth/auth.service.ts`)
- Main flow:
  1. Developer runs `npm run test` in `backend/`.
  2. New test file(s) exercise `AuthService` methods directly, mocking Prisma/JWT/bcrypt/mailer.
- Acceptance criteria (Definition of Done):
  - [ ] AC-07.1 Given valid credentials (bcrypt hash matches), when `login` is called, then it returns an access token and a new refresh token, and creates a `RefreshToken` row.
  - [ ] AC-07.2 Given invalid credentials (wrong password or unknown email), when `login` is called, then it throws `UnauthorizedException('Invalid email or password.')` — the same message for both cases.
  - [ ] AC-07.3 Given a valid, unexpired, unrevoked refresh token, when `refresh` is called, then the old token is marked revoked and a new one is issued (rotation), both inside one transaction.
  - [ ] AC-07.4 Given a refresh token that is missing, revoked, or expired, when `refresh` is called, then it throws `UnauthorizedException('Session expired. Please sign in again.')`.
  - [ ] AC-07.5 Given `requestPasswordReset` is called for a known vs. an unknown email, then both resolve successfully with no thrown error (the known-email path creates a reset token + invalidates prior unused ones; the unknown-email path only burns equivalent time via `bcrypt.hash`) — response shape never reveals which case occurred.
  - [ ] AC-07.6 Given a valid, unused, unexpired reset token and a password that meets `meetsPasswordRules`, when `resetPassword` is called, then the user's `passwordHash` is updated, the token is marked `usedAt`, and all of that user's active refresh tokens are revoked.
  - [ ] AC-07.7 Given a reset token that is missing, already used, or expired, when `resetPassword` or `verifyResetToken` is called, then it throws `BadRequestException('This reset link has expired.')`.
- Edge cases:
  - UC-07-E1: Given a refresh token that was already rotated (revoked) by a prior `refresh` call, when `refresh` is called again with that same stale token, then it's rejected with the same "Session expired" error (reuse-after-rotation).
  - UC-07-E2: Given a reset-password request with a password that fails `meetsPasswordRules` (e.g. "weak"), when called, then it's rejected with `BadRequestException('Your password does not meet all the requirements.')` **before** the token is even looked up, and the token is not marked used.
- Not included: Testing `UsersService`/`MailModule` beyond what auth directly depends on; end-to-end HTTP tests (these are service-level unit tests — e2e is a stretch goal, not committed here).

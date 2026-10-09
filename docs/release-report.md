# Release Report: Codebase Refactor (Deduplication & Best Practices)

**Milestone:** M1–M5 (full plan — all milestones in `docs/plan.md`)
**Date:** 2026-10-09

## 1. Summary

This release is a structural refactor of the frontend and a hygiene pass on the backend. No new product features or user-facing behavior were added — the goal was removing duplication across the 10 new pages, adding shared primitives, enabling TypeScript strict mode, and adding backend lint config + auth test coverage. All 11 tickets (T-001–T-011) across all 5 milestones are DONE.

## 2. Coverage table

| UC ID | Name | Criteria passed | Edge cases passed | Status |
|---|---|---|---|---|
| UC-01 | Consistent header, sign-out, back-navigation | 5/5 | 3/3 | DONE |
| UC-02 | Shared email validation | 5/5 | 4/4 | DONE |
| UC-03 | Attendance table/badge rendering parity | 4/4 | 3/3 | DONE |
| UC-04 | Timetable grid rendering parity | 4/4 | 3/3 | DONE |
| UC-05 | TypeScript strict mode | 3/3 | 1/1 | DONE |
| UC-06 | Backend lint config | 2/2 | 1/1 | DONE |
| UC-07 | Auth service test coverage | 7/7 | 2/2 | DONE |

**Total: 30/30 acceptance criteria, 17/17 edge cases — all passed.**

## 3. Test results

| Suite | Files | Tests | Passed | Failed |
|---|---|---|---|---|
| Frontend (`npm run test` in `frontend/`) | 20 | 106 | 106 | 0 |
| Backend (`npm run test` in `backend/`) | 2 | 21 | 21 | 0 |
| **Total** | **22** | **127** | **127** | **0** |

`npx tsc -b --noEmit`, `npm run build`, and `npm run lint` all pass clean in both `frontend/` and `backend/`.

## 4. BLOCKED tickets

None. All 11 tickets reached DONE within 1–2 tries each (see `tickets/STATUS.md`).

## 5. Known limits or risks

- **No automated coverage for the pre-login screens.** `LoginPage.tsx`, `ForgotPasswordPage.tsx`, and `ResetPasswordPage.tsx` have zero test files — they were outside this refactor's scope (UC-01 only covers post-login pages), but any future change there has no regression net yet.
- **Pre-existing authorization gap (not introduced by this refactor).** `App.tsx`'s view switch renders the admin-only routes (`admin-create`, `admin-classes`, `admin-timetable`, `admin-attendance`) without re-checking `session.user.role === 'admin'`. Flagged during T-003's review; not fixed here since it's outside this refactor's scope.
- **Stray unused config file.** `backend/oxlint.json` (wrong filename — oxlint only auto-discovers `.oxlintrc.json`) is dead, pre-existing cruft sitting alongside the new `backend/.oxlintrc.json`. Harmless but confusing; worth deleting in a follow-up.
- **No CI.** Dropped from scope mid-planning (see `docs/brainstorm.md`). Regressions currently rely on running `npm run test`/`lint`/`build` locally in both `frontend/` and `backend/`.
- **Mock-data pages remain mock-data.** Attendance, timetable, notices, and classes still have no real backend/database — explicitly out of scope for this refactor.
- **M1 took an extra try.** T-002's shared header component initially clipped on viewports narrower than ~293px (found by the verifier via real browser rendering, not just unit tests); fixed with `flex-wrap` and re-verified down to 200px.

## 6. How to try it yourself

### One-time database setup
```bash
cd backend
npx prisma migrate deploy   # or `npx prisma migrate dev` for a fresh dev database
npx prisma db seed          # creates the test accounts below
```

### Run the app
```bash
# Terminal 1
cd backend && npm run start:dev     # NestJS API on :3000

# Terminal 2
cd frontend && npm run dev          # Vite dev server on :5173
```
Open **http://localhost:5173**.

### Seeded test accounts
| Role | Email | Password |
|---|---|---|
| Admin | `admin@brainxschool.com` | `Admin123!` |
| Teacher | `teacher@brainxschool.com` | `Teacher123!` |
| Student | `student@brainxschool.com` | `Student123!` |
| Parent | `parent@brainxschool.com` | `Parent123!` |

### Flows worth clicking through by hand
Since this was a pure refactor, the point of manual testing is confirming **nothing looks or behaves differently** — the automated suite already checks this at the component level, but a visual pass is worth doing:

1. **As Admin** — Dashboard → click through Students, Classes, Timetable, Attendance, Notices. On each, check the header and "Back to dashboard" link look right, then go back. Try **Add people** with an invalid email (e.g. `bob@`) to see the error, then a valid one to see the success message. Open **Profile**, edit your name/email, then try the **Change password** tab.
2. **As Teacher** — Dashboard → View timetable, Mark attendance (pick a section, mark a few statuses, submit — it should lock), Notices (post one).
3. **As Student** — Dashboard → My attendance, My timetable, Notices (read-only).
4. **As Parent** — Dashboard → My child's attendance, Notices.
5. **Narrow the browser window** to ~320px on any page and confirm the header doesn't overlap or clip — this is the specific bug that was found and fixed during this refactor.
6. **Sign out** from a few different pages and confirm it always lands back on the login screen.
7. **Forgot password** from the login screen — this flow has no automated tests, so it's worth a manual check end-to-end.

---

Please test the app by hand using the steps above, then let me know: **Approve**, or **Send back** with notes on anything that needs fixing.

# Release Report: Academic Management — M1 + M2

- **Milestones covered:** M1 (Foundation + Class management) and M2 (Sections + Subjects)
- **Date:** 2026-10-13
- **Branch:** `academic-management` (local commits, not pushed)
- **Status:** Waiting for your approval. Nothing here is approved until you approve it.

M3 (Timetable builder) is partly built and M4 is not started. Both are listed at the end for context only and are **not** part of this approval.

---

## 1. Tickets in this release

| Ticket | Title | Status | Tries | Note |
|---|---|---|---|---|
| T-012 | RolesGuard + @Roles decorator | DONE | 2 | Roles typed with the Prisma `Role` enum after review |
| T-013 | Class CRUD API | DONE | 2 | Class names made case-insensitive unique in the DB (`citext`) |
| T-014 | Wire ClassesPage class list | DONE | 3 | Blocked once on AC-05.3; you chose to hide section/subject counts in M1 |
| T-015 | Section CRUD + class teacher | DONE | 1 | |
| T-016 | Subject catalog + class-subject teacher | DONE | 1 | |
| T-017 | Link students to sections | DONE | 1 | |
| T-018 | Wire Sections UI | DONE | 1 | Added `GET /classes/:classId/sections` (missing from the plan) |
| T-019 | Wire Subjects + student assignment UI | DONE | 2 | Roster dialog focus handling fixed after review |
| T-026 | Subject rename + delete (backend) | DONE | 1 | |
| T-027 | Subject rename + delete UI | DONE | 1 | |
| T-028 | Delete class with sections/subjects/students (backend) | DONE | 1 | |
| T-029 | Delete class confirmation with counts | DONE | 1 | |

Each ticket went through: test-writer → implementer → reviewer → verifier → the repo's pre-commit AI review.

---

## 2. Coverage

"Passed" means the criterion is covered by an automated test, the verifier checked that test against `docs/use-cases.md`, and the test passes.

| UC | Name | Criteria passed | Edge cases passed | Status |
|---|---|---|---|---|
| UC-01 | Admin creates a new class | 4 / 4 | 4 / 4 | PASS |
| UC-02 | Admin renames a class | 4 / 4 | 3 / 3 | PASS |
| UC-03 | Admin deletes a class | 3 / 3 | 3 / 3 | PASS |
| UC-04 | Role enforcement (M1) | 3 / 3 | 2 / 2 | PASS |
| UC-05 | View list of classes | 3 / 3 | 1 / 1 | PASS |
| UC-06 | Admin creates a section | 4 / 4 | 3 / 3 | PASS |
| UC-07 | Admin deletes a section | 3 / 3 | 2 / 2 | PASS (AC-07.3 timetable cascade verified in T-021) |
| UC-08 | Admin assigns a class teacher | 3 / 3 | 2 / 2 | PASS |
| UC-09 | Subject catalog | 3 / 3 | 1 / 1 | PASS |
| UC-10 | Subject + teacher on a class | 4 / 4 | 2 / 2 | PASS (UC-10-E2 verified in T-021) |
| UC-11 | Admin assigns a student to a section | 3 / 3 | 2 / 2 | PASS |
| UC-12 | Role enforcement (M2) | 2 / 2 | 1 / 1 | PASS |
| UC-22 | Rename or delete a subject | 5 / 6 + 1 partial | 3 / 3 | PARTIAL: AC-22.1's "timetable cell shows the new name" part is in T-023 (M3, not yet verified). Catalog and class lists are verified. |
| UC-23 | Delete a class with dependents | 4 / 5 + 1 partial | 2 / 2 | PARTIAL: AC-23.3's "student sees the UC-20 message on My Timetable" part is in T-024/T-025 (M4). Students staying with no section is verified. |

**Totals for M1 + M2:** 48 of 50 criteria fully passed, with 2 partly passed (their remaining parts are scheduled in M3/M4), and 31 of 31 edge cases passed.

---

## 3. Test results

Run on 2026-10-13 on the current working tree.

| Suite | Files | Tests | Passed | Failed |
|---|---|---|---|---|
| Backend (`cd backend && npm run test`) | 15 | 280 | 280 | 0 |
| Frontend (`cd frontend && npm run test`) | 21 | 200 | 200 | 0 |
| **Total** | 36 | 480 | 480 | 0 |

Notes:
- These counts include M3 work. The backend suite has the committed M3 tickets T-020, T-021, T-022 and T-030, and the frontend suite has uncommitted T-023 work (the timetable builder page; not reviewed yet). At the last M2 commit (T-029), the frontend had 185 tests, all passing.
- Backend tests run against the real local Postgres database with real JWTs and guards. Frontend tests mock the HTTP layer, so the end-to-end flow in a browser is only checked by your manual test below.
- Lint is clean on both. `tsc` on the backend shows one known error from before this feature (`test/app.e2e-spec.ts` can't find `supertest/types`).

---

## 4. BLOCKED tickets and open questions

There are no blocked tickets.

The one question raised during the build was AC-05.3 (whether to hide the section/subject counts in the M1 class list). You answered it, chose to hide them, and T-014 was finished on that basis.

---

## 5. Known limits and risks

1. **No paging or search in the teacher and student pickers.** `GET /users?role=…` returns every teacher or student. This is fine for one school, but it gets slow with thousands of students. It follows your earlier choice to leave out student-picker search.
2. **Names are case-insensitive.** "Grade 5" and "grade 5" count as the same class. Section names are unique within a class, and subject names across the catalog. This is enforced in the database with `citext`.
3. **The class teacher is shown for display only.** It doesn't affect the timetable, as the use cases specify.
4. **Removing a subject from a class has no confirmation prompt.** It only removes the link; the subject stays in the catalog.
5. **The manual check is the only end-to-end check.** There are no browser tests.
6. **Not merged or pushed.** All commits are local on `academic-management`.
7. **Build cache file in git.** `backend/tsconfig.build.tsbuildinfo` is tracked, and the pre-commit hook keeps committing it. Untracking it is your decision.
8. **Unreviewed T-023 code in the working tree.** The admin Timetable page you'll see while testing is in progress. Please don't judge it as part of this release.
9. **Teachers and students can't reach the Classes page.** Non-admins only get "My Timetable" from their home screen. The backend rejects their write attempts (tested), but there's no read-only Classes view for them, and none was asked for.

---

## 6. How to try it yourself

### Start the app

You need Postgres running locally, with `DATABASE_URL` set in `backend/.env` (already set up on this machine).

```bash
# Terminal 1: backend
cd backend
npx prisma migrate deploy     # applies all migrations, including the fixed period schedule
npx prisma db seed            # creates the test accounts below
npm run start:dev             # http://localhost:3000/api

# Terminal 2: frontend
cd frontend
npm run dev                   # open http://localhost:5173
```

Test accounts:

| Role | Email | Password |
|---|---|---|
| Admin | admin@brainxschool.com | Admin123! |
| Teacher | teacher@brainxschool.com | Teacher123! |
| Student | student@brainxschool.com | Student123! |
| Parent | parent@brainxschool.com | Parent123! |

### A. Classes (M1): log in as Admin, then open **Classes** on the dashboard

1. Add the class **Grade 7**. It appears in the list right away.
2. Reload the page. **Grade 7** is still there.
3. Try to add **grade 7**. You should see "A class with this name already exists."
4. Try to add an empty name, or only spaces. You should see "Please enter a class name."
5. Select **Grade 7**, click **Rename**, change it to **Grade 7X** and save. While it saves, the button shows "Saving…".
6. Check that the class list shows **no** "N sections · N subjects" text (AC-05.3).

### B. Sections and class teacher (M2), on the same page with **Grade 7X** selected

1. Add sections **A** and **B**. Then try **a**. You should see "This section already exists."
2. On section A, set the class teacher to **Test Teacher**. Reload, and it's still set. Set it back to **Unassigned**.

### C. Subjects (M2)

1. In **Manage subjects**, add **Robotics**. Then try **robotics**. You should see "This subject already exists."
2. Rename **Robotics** to **Robotics Lab**.
3. Click **Robotics Lab** in the quick-add list to add it to Grade 7X. It shows in the class's subject list, and it no longer appears in quick-add.
4. Set its teacher to **Test Teacher**.
5. In Manage subjects, try to **Delete Robotics Lab**. You should see "This subject is in use and can't be deleted."
6. Remove **Robotics Lab** from the class. Then delete it from Manage subjects, and it disappears.

### D. Students in sections (M2)

1. On section A, click **View roster**. Choose **Test Student** and click **Assign**. The student appears in the roster.
2. Open section B's roster and assign the same student. They move from A to B.
3. Click **Unassign**. The roster is empty, and the student account still exists.
4. Press **Escape** to close the dialog. Focus returns to the "View roster" button.

### E. Deleting a class with dependents (M2)

1. Assign **Test Student** to section A again. Then click **Delete class** on Grade 7X.
2. The confirmation should read something like "Deleting Grade 7X will also delete 2 sections and N subject assignments. 1 student will be unassigned from their section."
3. Click **Cancel**. Nothing changes.
4. Click **Delete class** again and confirm. The class disappears.
5. Create a new empty class and delete it. You get the plain "Delete this class? This cannot be undone." prompt.

### F. Roles

1. Log in as **Teacher**, then **Student**, then **Parent**. None of their home screens offer Classes or the admin Timetable builder. Only admins can change classes, sections or subjects.

---

## Your decision

After testing by hand, reply with one of:

- **Approve**: M1 + M2 are accepted.
- **Send back**, with notes on what's wrong. I'll turn each note into a new TODO ticket, and you can then run `/build`.

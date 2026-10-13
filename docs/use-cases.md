# Use Cases: Academic Management

| UC ID | Name | Milestone | # Criteria | # Edge cases |
|---|---|---|---|---|
| UC-01 | Admin creates a new class | M1 | 4 | 4 |
| UC-02 | Admin renames an existing class | M1 | 4 | 3 |
| UC-03 | Admin deletes a class | M1 | 3 | 3 |
| UC-04 | Role enforcement blocks non-admin writes | M1 | 3 | 2 |
| UC-05 | View list of classes | M1 | 3 | 1 |
| UC-06 | Admin creates a section within a class | M2 | 4 | 3 |
| UC-07 | Admin deletes a section | M2 | 3 | 2 |
| UC-08 | Admin assigns a class teacher to a section | M2 | 3 | 2 |
| UC-09 | Admin manages the subject catalog | M2 | 3 | 1 |
| UC-10 | Admin assigns a subject + teacher to a class | M2 | 4 | 2 |
| UC-11 | Admin assigns a student to a section | M2 | 3 | 2 |
| UC-12 | Role enforcement blocks non-admin writes (M2) | M2 | 2 | 1 |
| UC-22 | Admin renames or deletes a subject | M2 | 6 | 3 |
| UC-23 | Admin deletes a class that has sections, subjects or students | M2 | 5 | 2 |
| UC-13 | Admin assigns a subject to a day/period slot | M3 | 4 | 2 |
| UC-14 | System prevents a teacher from being double-booked | M3 | 3 | 2 |
| UC-15 | Admin clears a timetable slot | M3 | 2 | 1 |
| UC-16 | Admin views the full weekly timetable grid | M3 | 3 | 1 |
| UC-17 | Role enforcement blocks non-admin writes (M3) | M3 | 2 | 1 |
| UC-24 | Backend rejects invalid timetable entries | M3 | 5 | 2 |
| UC-18 | Teacher views their own weekly timetable | M4 | 3 | 1 |
| UC-19 | Student views their own section's weekly timetable | M4 | 3 | 1 |
| UC-20 | Student not yet assigned to any section | M4 | 1 | 1 |
| UC-21 | Read access is scoped to the caller, writes stay blocked (M4) | M4 | 3 | 1 |
| UC-25 | Parent role has no access to Academic Management | M4 | 3 | 1 |

UC-22 to UC-25 were added after tickets T-012 to T-025 were created. They are grouped by milestone above, and the existing IDs were not renumbered.

---

## M1 — Foundation + Class management

### UC-01: Admin creates a new class
- Actor: Admin
- Milestone: M1
- Preconditions: Admin is logged in and on the Classes page.
- Main flow:
  1. Admin enters a class name into the "New class" field.
  2. Admin submits the form.
  3. System creates the class and adds it to the list.
  4. System selects the newly created class.
- Acceptance criteria (Definition of Done):
  - [ ] AC-01.1 Given a valid, unique class name (e.g. "Grade 7"), when Admin submits, then the class appears in the list without a page reload.
  - [ ] AC-01.2 Given the class was just created, when Admin reloads the page, then the class is still present (persisted).
  - [ ] AC-01.3 Given an empty class name, when Admin submits, then the system shows "Please enter a class name." and creates nothing.
  - [ ] AC-01.4 Given a class name that already exists (case-insensitive), when Admin submits, then the system shows "A class with this name already exists." and creates nothing.
- Edge cases:
  - UC-01-E1: Whitespace-only name is treated as empty and rejected.
  - UC-01-E2: A very long name (e.g. 300 chars) is rejected with a clear length error (max 100 chars) instead of crashing or silently truncating.
  - UC-01-E3: Backend unreachable → generic "Something went wrong. Please try again." error; entered text is kept in the field.
  - UC-01-E4: Two admins submit the same unique name at nearly the same time → only one class is created; the second fails with the duplicate-name error (DB unique constraint is the source of truth).
- Not included: creating sections or subjects within a class (M2).

### UC-02: Admin renames an existing class
- Actor: Admin
- Milestone: M1
- Preconditions: At least one class exists.
- Main flow:
  1. Admin clicks "Rename" on a class.
  2. Admin edits the name.
  3. Admin saves.
  4. System updates the name everywhere it's shown.
- Acceptance criteria (Definition of Done):
  - [ ] AC-02.1 Given a valid new unique name, when saved, then the list/header show the new name immediately.
  - [ ] AC-02.2 Given a reload after renaming, then the new name persists.
  - [ ] AC-02.3 Given the name is cleared to empty, when saved, then shows "Please enter a class name." and keeps the original name.
  - [ ] AC-02.4 Given the new name already belongs to another class, when saved, then shows "A class with this name already exists." and the rename is not applied.
- Edge cases:
  - UC-02-E1: Renaming to the exact same current name succeeds (not treated as a duplicate).
  - UC-02-E2: Class was deleted by another session moments earlier → shows "This class no longer exists." and refreshes the list.
  - UC-02-E3: Slow network → Save button shows a loading state and is disabled until the request completes (prevents duplicate submits).
- Not included: bulk rename, renaming sections or subjects.

### UC-03: Admin deletes a class
- Actor: Admin
- Milestone: M1
- Preconditions: At least one class exists.
- Main flow:
  1. Admin clicks "Delete class".
  2. System asks for confirmation.
  3. Admin confirms.
  4. System removes the class and clears the selection.
- Acceptance criteria (Definition of Done):
  - [ ] AC-03.1 Given confirmation, when the request completes, then the class disappears from the list without reload.
  - [ ] AC-03.2 Given a reload after deleting, then the class does not reappear.
  - [ ] AC-03.3 Given Admin cancels the confirmation prompt, then the class is not deleted.
- Edge cases:
  - UC-03-E1: Class already deleted by another session → shows "This class no longer exists." instead of a crash, and refreshes the list.
  - UC-03-E2: Deleting the last remaining class shows the "No classes yet." empty state cleanly.
  - UC-03-E3: Backend unreachable → generic error shown, class remains in the list.
- Not included: cascading effects on sections/subjects (none exist yet at M1; see UC-23 for M2 onward).

### UC-04: Role enforcement blocks non-admin writes
- Actor: Teacher, Student
- Milestone: M1
- Preconditions: Teacher or Student is logged in.
- Main flow:
  1. Teacher/Student sends a create/rename/delete request for a class.
  2. System checks the caller's role from the JWT.
  3. System rejects the request before any data changes.
- Acceptance criteria (Definition of Done):
  - [ ] AC-04.1 Given a logged-in Teacher, when calling create/rename/delete, then responds 403 Forbidden, no data changes.
  - [ ] AC-04.2 Given a logged-in Student, when calling create/rename/delete, then responds 403 Forbidden, no data changes.
  - [ ] AC-04.3 Given Teacher/Student viewing the Classes page, then write controls (New class, Rename, Delete) are hidden or disabled.
- Edge cases:
  - UC-04-E1: A tampered client-side role claim doesn't matter — the backend's own guard check rejects the write regardless of what the UI shows.
  - UC-04-E2: No token / expired token on any class endpoint → responds 401 Unauthorized.
- Not included: permissions finer-grained than the four existing roles.

### UC-05: View list of classes
- Actor: Admin
- Milestone: M1
- Preconditions: Admin is logged in.
- Main flow:
  1. Admin opens the Classes page.
  2. System fetches and displays all classes.
- Acceptance criteria (Definition of Done):
  - [ ] AC-05.1 Given no classes exist, when the page loads, then shows "No classes yet."
  - [ ] AC-05.2 Given one or more classes exist, when the page loads, then they are all listed.
  - [ ] AC-05.3 Given M1 scope, when the list renders, then no section/subject counts are shown (those ship in M2).
- Edge cases:
  - UC-05-E1: Backend slow/unreachable → loading indicator, then a clear error state (not an indefinite blank screen).
- Not included: filtering/searching classes.

---

## M2 — Sections + Subjects

### UC-06: Admin creates a section within a class
- Actor: Admin
- Milestone: M2
- Preconditions: Admin is logged in; a class exists and is selected.
- Main flow:
  1. Admin enters a section name (e.g. "C") in the selected class.
  2. Admin submits.
  3. System adds the section under that class.
- Acceptance criteria (Definition of Done):
  - [ ] AC-06.1 Given a valid, unique-within-class section name, when submitted, then it appears under the class immediately.
  - [ ] AC-06.2 Given the section was created, when the page reloads, then it persists.
  - [ ] AC-06.3 Given an empty section name, when submitted, then shows "Please enter a section name." and creates nothing.
  - [ ] AC-06.4 Given a section name that already exists in this same class (case-insensitive), when submitted, then shows "This section already exists." and creates nothing.
- Edge cases:
  - UC-06-E1: The same section name (e.g. "A") is allowed in a different class — uniqueness is scoped per class, not global.
  - UC-06-E2: Whitespace-only name is treated as empty and rejected.
  - UC-06-E3: Two admins create the same section name in the same class at nearly the same time → only one is created, the second gets the duplicate error (DB unique constraint on `[classId, name]`).
- Not included: moving a section to a different class.

### UC-07: Admin deletes a section
- Actor: Admin
- Milestone: M2
- Preconditions: A section exists; it may have students or a class teacher assigned.
- Main flow:
  1. Admin clicks "Remove" on a section.
  2. System asks for confirmation.
  3. Admin confirms.
  4. System deletes the section.
- Acceptance criteria (Definition of Done):
  - [ ] AC-07.1 Given confirmation, when deleted, then the section disappears from the list.
  - [ ] AC-07.2 Given the section had students assigned, when deleted, then those students' `sectionId` is cleared (students are not deleted, just unassigned) and the confirmation dialog says so beforehand.
  - [ ] AC-07.3 Given the section had timetable entries (from M3 onward), when deleted, then its timetable entries are deleted too (cascade).
- Edge cases:
  - UC-07-E1: Section already deleted by another session → shows "This section no longer exists." and refreshes.
  - UC-07-E2: Deleting the only remaining section in a class shows the "No sections yet." empty state cleanly.
- Not included: restoring a deleted section.

### UC-08: Admin assigns a class teacher to a section
- Actor: Admin
- Milestone: M2
- Preconditions: Section exists; at least one User with role=teacher exists.
- Main flow:
  1. Admin opens the class-teacher dropdown for a section.
  2. Admin picks a teacher.
  3. System saves the assignment.
- Acceptance criteria (Definition of Done):
  - [ ] AC-08.1 Given a teacher is selected, when saved, then the section shows that teacher as class teacher immediately and after reload.
  - [ ] AC-08.2 Given the dropdown options, when opened, then only Users with role=teacher are listed (never admin/student/parent).
  - [ ] AC-08.3 Given a section already has a class teacher, when Admin selects "Unassigned", then the class teacher is cleared.
- Edge cases:
  - UC-08-E1: No teacher accounts exist yet → dropdown shows only "Unassigned" with no crash.
  - UC-08-E2: The same teacher can be class teacher for more than one section (not restricted).
- Not included: teacher's homeroom permissions beyond display (this field doesn't affect timetable logic).

### UC-09: Admin manages the subject catalog
- Actor: Admin
- Milestone: M2
- Preconditions: Admin is logged in.
- Main flow:
  1. Admin adds a new subject name (e.g. "Robotics") to the catalog.
  2. System saves it so it is available to assign to any class.
- Acceptance criteria (Definition of Done):
  - [ ] AC-09.1 Given a valid, unique subject name, when submitted, then it appears in the subject catalog and can be assigned to any class.
  - [ ] AC-09.2 Given an empty name, when submitted, then shows "Please enter a subject name." and creates nothing.
  - [ ] AC-09.3 Given a subject name that already exists (case-insensitive), when submitted, then shows "This subject already exists." and creates nothing.
- Edge cases:
  - UC-09-E1: Deleting a subject that is currently assigned to one or more classes is blocked with "This subject is in use and can't be deleted." (prevents orphaned `ClassSubject`/`TimetableEntry` rows).
- Not included: subject categories/departments.

### UC-10: Admin assigns a subject + teacher to a class
- Actor: Admin
- Milestone: M2
- Preconditions: Class exists; subject catalog has at least one entry.
- Main flow:
  1. Admin picks a subject from the catalog to add to the selected class.
  2. Admin assigns exactly one teacher to that subject for this class.
  3. System saves the assignment.
- Acceptance criteria (Definition of Done):
  - [ ] AC-10.1 Given a subject is added to a class, when saved, then it appears under that class's subject list immediately and after reload.
  - [ ] AC-10.2 Given a teacher is picked for that subject, when saved, then the assignment persists; only one teacher can be set per class-subject at a time (picking a new one replaces the old one, it does not add a second).
  - [ ] AC-10.3 Given the teacher dropdown, when opened, then only Users with role=teacher are listed.
  - [ ] AC-10.4 Given a subject already added to this class, when Admin tries to add it again, then it's not duplicated.
- Edge cases:
  - UC-10-E1: Admin sets the subject's teacher to "Unassigned" → subject remains on the class with no teacher; it cannot be used in the timetable builder (M3) until a teacher is set.
  - UC-10-E2: Removing a subject from a class that already has timetable entries using it (M3 onward) is blocked with "This subject has timetable entries for this class. Remove them first."
- Not included: multiple teachers co-teaching one subject.

### UC-11: Admin assigns a student to a section
- Actor: Admin
- Milestone: M2
- Preconditions: Section exists; at least one User with role=student exists.
- Main flow:
  1. Admin searches/selects a student user.
  2. Admin assigns them to a section.
  3. System saves `User.sectionId`.
- Acceptance criteria (Definition of Done):
  - [ ] AC-11.1 Given a student is assigned to a section, when saved, then the student appears in that section's roster immediately and after reload.
  - [ ] AC-11.2 Given a student already assigned to a different section, when reassigned, then they are moved (removed from the old section, added to the new one) — a student belongs to at most one section.
  - [ ] AC-11.3 Given the student picker, when opened, then only Users with role=student are listed.
- Edge cases:
  - UC-11-E1: No student accounts exist yet → picker shows an empty state, no crash.
  - UC-11-E2: Unassigning a student (clearing their section) is possible and does not delete the user.
- Not included: self-enrollment by students, bulk/CSV import of students.

### UC-12: Role enforcement blocks non-admin writes (M2 endpoints)
- Actor: Teacher, Student
- Milestone: M2
- Preconditions: Teacher or Student is logged in.
- Main flow:
  1. Teacher/Student sends a write request to any section/subject/class-subject/student-assignment endpoint.
  2. System rejects it based on role.
- Acceptance criteria (Definition of Done):
  - [ ] AC-12.1 Given a logged-in Teacher or Student, when calling any M2 write endpoint, then responds 403 Forbidden, no data changes.
  - [ ] AC-12.2 Given Teacher/Student viewing the Classes page, then none of the M2 write controls (add section, add subject, assign teacher, assign student) are shown or enabled.
- Edge cases:
  - UC-12-E1: No token / expired token → 401 Unauthorized, same as M1.
- Not included: read access scoping (teachers/students don't browse the full Classes page in this app; their own view is M4's "My Timetable").

### UC-22: Admin renames or deletes a subject
- Actor: Admin
- Milestone: M2
- Preconditions: Admin is logged in; at least one subject exists in the catalog.
- Main flow:
  1. Admin clicks "Rename" on a subject in the catalog, edits the name and saves; or
  2. Admin clicks "Delete" on a subject and confirms.
  3. System applies the change.
- Acceptance criteria (Definition of Done):
  - [ ] AC-22.1 Given a valid, unique new name, when saved, then the new name shows immediately in the catalog, in every class's subject list and in every timetable cell that uses it, and it persists after reload.
  - [ ] AC-22.2 Given the name is cleared to empty, when saved, then shows "Please enter a subject name." and keeps the original name.
  - [ ] AC-22.3 Given the new name already belongs to another subject (case-insensitive), when saved, then shows "This subject already exists." and the rename is not applied.
  - [ ] AC-22.4 Given a subject not assigned to any class, when Admin confirms delete, then it disappears from the catalog and does not reappear after reload.
  - [ ] AC-22.5 Given a subject assigned to one or more classes, when Admin confirms delete, then shows "This subject is in use and can't be deleted." and nothing is removed (same rule as UC-09-E1).
  - [ ] AC-22.6 Given Admin cancels the delete confirmation, then the subject is not deleted.
- Edge cases:
  - UC-22-E1: Changing only the letter case of the subject's own name (e.g. "maths" → "Maths") succeeds and is not treated as a duplicate.
  - UC-22-E2: Subject was already deleted by another session → shows "This subject no longer exists." and refreshes the catalog.
  - UC-22-E3: One admin deletes a subject while another admin assigns it to a class at nearly the same time → the database keeps them consistent: either the delete fails with the in-use error, or the assignment fails because the subject no longer exists. A class never ends up with a deleted subject.
- Not included: merging two subjects; subject categories/departments.

### UC-23: Admin deletes a class that has sections, subjects or students
- Actor: Admin
- Milestone: M2
- Preconditions: Admin is logged in; the class has at least one section or subject assignment.
- Main flow:
  1. Admin clicks "Delete class".
  2. System shows a confirmation that lists what will be removed.
  3. Admin confirms.
  4. System deletes the class and everything that belongs to it, and unassigns its students.
- Acceptance criteria (Definition of Done):
  - [ ] AC-23.1 Given a class with sections, subject assignments or assigned students, when Admin clicks "Delete class", then the confirmation shows the counts, e.g. "Deleting Grade 5 will also delete 2 sections and 4 subject assignments. 30 students will be unassigned from their section."
  - [ ] AC-23.2 Given Admin confirms, when the request completes, then the class, its sections, its subject assignments and its sections' timetable entries are all gone, both immediately and after reload.
  - [ ] AC-23.3 Given students were assigned to those sections, when the class is deleted, then the student accounts still exist with no section; on "My Timetable" they see the UC-20 message.
  - [ ] AC-23.4 Given teachers were scheduled in those sections, when the class is deleted, then those day/period slots are free and the teachers can be booked into other sections at those times without a conflict.
  - [ ] AC-23.5 Given Admin cancels the confirmation, then nothing is deleted or unassigned.
- Edge cases:
  - UC-23-E1: A class with no sections, subjects or students shows the plain UC-03 confirmation, with no counts.
  - UC-23-E2: A student is assigned to one of the class's sections after the dialog opens but before Admin confirms → that student is also unassigned, not deleted. The counts in the dialog may be out of date, but the result is still correct.
- Not included: restoring a deleted class; moving sections to another class before deleting.

---

## M3 — Timetable builder

**Fixed school-wide schedule (seeded, Monday–Friday):**

| Order | Label | Time | Break |
|---|---|---|---|
| 1 | Period 1 | 8:00–8:45 | No |
| 2 | Period 2 | 8:45–9:30 | No |
| 3 | Period 3 | 9:30–10:15 | No |
| 4 | Recess | 10:15–10:45 | Yes |
| 5 | Period 4 | 10:45–11:30 | No |
| 6 | Period 5 | 11:30–12:15 | No |
| 7 | Period 6 | 12:15–1:00 | No |

### UC-13: Admin assigns a subject to a day/period slot in a section's timetable
- Actor: Admin
- Milestone: M3
- Preconditions: Section exists with at least one subject already assigned to its class (with a teacher set, per UC-10); fixed periods are seeded.
- Main flow:
  1. Admin opens the timetable builder for a section.
  2. Admin picks a day + period cell.
  3. Admin selects a subject from that class's assigned subjects.
  4. System auto-fills the teacher from that subject's class assignment (UC-10) and saves the slot.
- Acceptance criteria (Definition of Done):
  - [ ] AC-13.1 Given a subject with a teacher already assigned (UC-10), when picked for a slot, then the slot shows subject + teacher immediately and after reload.
  - [ ] AC-13.2 Given the subject dropdown for a slot, when opened, then only subjects already assigned to this class (UC-10) are listed — not the full subject catalog.
  - [ ] AC-13.3 Given a subject on this class has no teacher assigned yet, when Admin tries to place it in a slot, then shows "Assign a teacher to this subject first." and the slot is not saved.
  - [ ] AC-13.4 Given the break period ("Recess"), when viewing the grid, then that row shows the break label and has no subject/teacher selector.
- Edge cases:
  - UC-13-E1: Admin changes a subject's assigned teacher later (UC-10) — existing timetable entries for that subject keep their original teacher until the admin explicitly updates each slot (no silent retroactive change).
  - UC-13-E2: The same subject can be placed in more than one slot per day/week — no limit enforced in v1.
- Not included: auto-suggesting which slot to use; limiting how many periods a subject can occupy per day/week.

### UC-14: System prevents a teacher from being double-booked
- Actor: Admin
- Milestone: M3
- Preconditions: A teacher already has a timetable entry at a given day + period in some section.
- Main flow:
  1. Admin tries to assign a subject taught by that same teacher into a different section at the same day + period.
  2. System detects the conflict before saving.
  3. System rejects the change and explains why.
- Acceptance criteria (Definition of Done):
  - [ ] AC-14.1 Given teacher X is already scheduled for Grade 5-A, Monday, Period 1, when Admin tries to schedule teacher X for Grade 6-A at the same Monday, Period 1, then the system shows "Teacher is already scheduled for Grade 5-A at this time." and does not save.
  - [ ] AC-14.2 Given the conflict is rejected, when Admin checks Grade 5-A's timetable, then it is unchanged.
  - [ ] AC-14.3 Given two different teachers, when scheduled in different sections at the same day + period, then both are saved without conflict (conflict is scoped per teacher, not per slot globally).
- Edge cases:
  - UC-14-E1: Two admins try to book the same teacher into two different sections for the same slot at nearly the same time → only one save succeeds; the second gets the conflict error (DB unique constraint `[teacherId, periodId, dayOfWeek]` is the source of truth, not just a frontend check).
  - UC-14-E2: Admin moves a teacher's existing slot to a new time in the same action that frees up their old slot — the system evaluates the final state, not a stale one (no false-positive conflict with the entry being replaced in the same section/slot).
- Not included: suggesting alternative free slots when a conflict occurs.

### UC-15: Admin clears a timetable slot
- Actor: Admin
- Milestone: M3
- Preconditions: A slot has a subject+teacher assigned.
- Main flow:
  1. Admin selects "Clear" / empties the slot.
  2. System removes that timetable entry.
- Acceptance criteria (Definition of Done):
  - [ ] AC-15.1 Given a filled slot, when cleared, then it shows as empty immediately and after reload.
  - [ ] AC-15.2 Given a slot is cleared, then that teacher's time at that day/period becomes available again for a different section (no longer a conflict).
- Edge cases:
  - UC-15-E1: Clearing an already-empty slot is a no-op, not an error.
- Not included: undo/history of cleared slots.

### UC-16: Admin views the full weekly timetable grid for a section
- Actor: Admin
- Milestone: M3
- Preconditions: Section exists.
- Main flow:
  1. Admin selects a section.
  2. System displays a Monday–Friday x period grid, 8:00 AM–1:00 PM, with breaks shown.
- Acceptance criteria (Definition of Done):
  - [ ] AC-16.1 Given a section with no entries yet, when opened, then all non-break cells show as empty ("+" / "Add" affordance), not an error.
  - [ ] AC-16.2 Given a section with existing entries, when opened, then each cell shows subject name + teacher name.
  - [ ] AC-16.3 Given the grid, when rendered, then its rows match the fixed schedule table above exactly: 6 teaching periods of 45 minutes and one "Recess" row from 10:15 to 10:45, starting at 8:00 and ending at 1:00.
- Edge cases:
  - UC-16-E1: Switching between sections reloads the grid for the newly selected section without mixing up data from the previous one.
- Not included: printing/exporting the timetable (e.g. PDF).

### UC-17: Role enforcement blocks non-admin writes (M3 endpoints)
- Actor: Teacher, Student
- Milestone: M3
- Preconditions: Teacher or Student is logged in.
- Main flow:
  1. Teacher/Student sends a write request to the timetable endpoint.
  2. System rejects it based on role.
- Acceptance criteria (Definition of Done):
  - [ ] AC-17.1 Given a logged-in Teacher or Student, when calling the create/update/delete timetable-entry endpoint, then responds 403 Forbidden, no data changes.
  - [ ] AC-17.2 Given Teacher/Student open the timetable builder UI directly (if route is reachable), then it is read-only / inaccessible — they're routed to "My Timetable" (M4) instead.
- Edge cases:
  - UC-17-E1: No token / expired token → 401 Unauthorized.
- Not included: read access to other sections' full timetables for teachers/students (that's M4's narrower "my timetable" view).

### UC-24: Backend rejects invalid timetable entries
- Actor: Admin (calling the API directly, without the UI)
- Milestone: M3
- Preconditions: Caller has a valid admin token; the request is sent straight to the timetable-entry create/update endpoint.
- Main flow:
  1. Caller sends a timetable-entry write that the UI would not normally allow.
  2. System validates it before saving.
  3. System rejects it with a clear status and message.
- Acceptance criteria (Definition of Done):
  - [ ] AC-24.1 Given the period is the break period (Recess), when sent, then responds 400 "Cannot schedule a subject during a break." and no entry is created.
  - [ ] AC-24.2 Given a subject that is not assigned to the section's class, when sent, then responds 400 "This subject is not assigned to this class." and no entry is created.
  - [ ] AC-24.3 Given a subject that is assigned to the class but has no teacher, when sent, then responds 400 "Assign a teacher to this subject first." (same message as AC-13.3) and no entry is created.
  - [ ] AC-24.4 Given a section, period or subject ID that doesn't exist, when sent, then responds 404 and no entry is created.
  - [ ] AC-24.5 Given a day other than mon–fri (e.g. "sat"), when sent, then responds 400 and no entry is created.
- Edge cases:
  - UC-24-E1: A required field is missing → responds 400 with a message that names the missing field.
  - UC-24-E2: The request includes a teacherId that is different from the class-subject's assigned teacher → the server ignores it and always uses the teacher from the class-subject assignment (UC-10), so the client can't choose the teacher.
- Not included: validating that the same subject doesn't appear too many times a week (no limit in v1, per UC-13-E2).

---

## M4 — Read-only views

### UC-18: Teacher views their own weekly timetable
- Actor: Teacher
- Milestone: M4
- Preconditions: Teacher is logged in; may teach in zero, one, or multiple sections.
- Main flow:
  1. Teacher opens "My Timetable".
  2. System fetches all timetable entries where `teacherId` = this teacher, across all sections.
  3. System displays them on a single Monday–Friday x period grid.
- Acceptance criteria (Definition of Done):
  - [ ] AC-18.1 Given the teacher has entries in two different sections, when the page loads, then both appear on the single grid, each cell showing subject + section (e.g. "Mathematics — Grade 5-A").
  - [ ] AC-18.2 Given the teacher has no entries at all yet, when the page loads, then it shows an empty-grid state (e.g. "No classes scheduled yet.") rather than an error.
  - [ ] AC-18.3 Given this is a read-only view, when rendered, then no edit/add/remove controls are present anywhere on the page.
- Edge cases:
  - UC-18-E1: Since a teacher can never be double-booked (M3's conflict rule), each grid cell shows at most one entry — this view never needs to handle overlapping entries for the same teacher.
- Not included: teacher requesting a change or swap.

### UC-19: Student views their own section's weekly timetable
- Actor: Student
- Milestone: M4
- Preconditions: Student is logged in and has been assigned to a section (UC-11).
- Main flow:
  1. Student opens "My Timetable".
  2. System looks up the student's `sectionId`.
  3. System fetches and displays that section's timetable grid (subject + teacher per slot).
- Acceptance criteria (Definition of Done):
  - [ ] AC-19.1 Given the student's section has timetable entries, when the page loads, then the grid shows subject + teacher name per cell, matching the admin-built timetable for that section exactly.
  - [ ] AC-19.2 Given this is a read-only view, when rendered, then no edit/add/remove controls are present.
  - [ ] AC-19.3 Given the section's timetable changes (admin edits it later), when the student reloads "My Timetable", then it reflects the latest version.
- Edge cases:
  - UC-19-E1: Student's section has no timetable entries yet → shows an empty-grid state ("Your class's timetable hasn't been set up yet."), not an error.
- Not included: viewing other sections' timetables, viewing past/historical timetables.

### UC-20: Student not yet assigned to any section
- Actor: Student
- Milestone: M4
- Preconditions: Student is logged in; `sectionId` is null (never assigned, per UC-11).
- Main flow:
  1. Student opens "My Timetable".
  2. System finds no section linked to this student.
  3. System shows a clear explanatory state instead of an empty grid or an error.
- Acceptance criteria (Definition of Done):
  - [ ] AC-20.1 Given no section is assigned, when the page loads, then it shows "You haven't been assigned to a class section yet. Contact your school admin." (not a blank grid, not a crash).
- Edge cases:
  - UC-20-E1: Admin assigns the student to a section while the student has this page open → on next reload (not necessarily live-pushed), the real timetable appears.
- Not included: real-time push updates when a student is assigned mid-session.

### UC-21: Read access is scoped to the caller, writes stay blocked (M4 endpoint)
- Actor: Teacher, Student
- Milestone: M4
- Preconditions: Teacher or Student is logged in.
- Main flow:
  1. Teacher/Student calls `GET /timetable/me`.
  2. System returns only data relevant to that specific caller (their own taught slots, or their own section).
- Acceptance criteria (Definition of Done):
  - [ ] AC-21.1 Given Teacher A calls the endpoint, when the response returns, then it never includes another teacher's slots.
  - [ ] AC-21.2 Given Student A calls the endpoint, when the response returns, then it never includes another section's timetable.
  - [ ] AC-21.3 Given Teacher or Student calls any M3 write endpoint (create/update/delete timetable entry) directly, then responds 403 Forbidden, consistent with UC-17.
- Edge cases:
  - UC-21-E1: No token / expired token → 401 Unauthorized.
- Not included: an admin's own "my timetable" view (admin is not a teaching role in this model — not applicable).

### UC-25: Parent role has no access to Academic Management
- Actor: Parent
- Milestone: M4
- Preconditions: Parent is logged in.
- Main flow:
  1. Parent tries to use any Academic Management page or endpoint.
  2. System denies the write or read and shows a clear message.
- Acceptance criteria (Definition of Done):
  - [ ] AC-25.1 Given a logged-in Parent, when calling any write endpoint from M1–M3 (classes, sections, subjects, class-subjects, student assignment, timetable entries), then responds 403 Forbidden and no data changes.
  - [ ] AC-25.2 Given a logged-in Parent, when calling `GET /timetable/me`, then responds 403 Forbidden.
  - [ ] AC-25.3 Given a logged-in Parent, when opening the "My Timetable" page, then it shows "Not available for your role." with no grid and no error, and the Classes and Timetable builder pages have no admin controls.
- Edge cases:
  - UC-25-E1: No token / expired token → 401 Unauthorized, same as other roles.
- Not included: a parent viewing their child's timetable (there is no parent–child link in v1).
- Not included: a "My Timetable" button on the parent's home screen. A parent has no timetable, so the page is a safety net only: if a parent ever lands on it (for example through the non-admin redirect in UC-17), they see "Not available for your role." (Decision during /build.)

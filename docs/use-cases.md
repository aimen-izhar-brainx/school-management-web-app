# Use Cases: Attendance Management

| UC ID | Name | Milestone | # Criteria | # Edge cases |
|---|---|---|---|---|
| UC-01 | Class teacher marks attendance for today (first submission) | M1 | 3 | 4 |
| UC-02 | Class teacher edits today's attendance before midnight | M1 | 3 | 3 |
| UC-03 | Teacher blocked from marking a section they don't own | M1 | 2 | 2 |
| UC-04 | Teacher cannot mark attendance for a non-today date | M1 | 2 | 2 |
| UC-05 | Admin edits attendance for any day, with audit log | M2 | 3 | 3 |
| UC-06 | Admin views attendance for a section/day | M2 | 2 | 2 |
| UC-07 | Non-admin blocked from admin-only attendance endpoints | M2 | 2 | 1 |
| UC-08 | Admin views daily attendance summary per class | M3 | 2 | 2 |
| UC-09 | Admin views monthly attendance percentage per student | M3 | 3 | 2 |
| UC-10 | Student views own monthly attendance | M4 | 3 | 2 |
| UC-11 | Student cannot view another student's attendance | M4 | 2 | 1 |
| UC-12 | Student not yet assigned to any section | M4 | 1 | 1 |

---

## M1 — Mark & same-day edit (teacher flow)

### UC-01: Class teacher marks attendance for today (first submission)
- Actor: Teacher (class teacher)
- Milestone: M1
- Preconditions: Teacher is logged in and is the `classTeacherId` of a Section with at least one enrolled student. No attendance session exists yet for that section+today.
- Main flow:
  1. Teacher opens Mark Attendance, section + today's date are shown.
  2. System shows the full roster, each student defaulted to "Present".
  3. Teacher changes any students' status to Absent or Leave.
  4. Teacher clicks "Submit attendance".
  5. System saves one entry per student and shows the submitted summary.
- Acceptance criteria (Definition of Done):
  - [ ] AC-01.1 Given the teacher has not yet submitted today's attendance for their section, when they submit a status for every enrolled student, then the system saves it and shows the submitted summary (counts per status).
  - [ ] AC-01.2 Given the submission succeeded, when the teacher reloads the page, then the saved statuses are shown (persisted).
  - [ ] AC-01.3 Given the submission is stored, then `submittedBy` is the teacher and `submittedAt` is the current time.
- Edge cases:
  - UC-01-E1: Section has zero enrolled students → nothing to submit, page shows "No students enrolled."
  - UC-01-E2: Teacher double-clicks submit rapidly → only one session is created (no duplicate rows/error).
  - UC-01-E3: Network fails mid-submit → error shown, nothing partially saved, teacher can retry.
  - UC-01-E4: Teacher not logged in / token expired → 401, redirected to login.
- Not included: editing after submission (UC-02), submitting for a non-today date (UC-04).

### UC-02: Class teacher edits today's attendance before midnight
- Actor: Teacher
- Milestone: M1
- Preconditions: Teacher already submitted today's attendance for their section.
- Main flow:
  1. Teacher reopens Mark Attendance for the same section + today.
  2. System shows existing statuses with an edit option (not locked — still today).
  3. Teacher changes one or more students' status and saves.
  4. System updates the existing entries; no audit log entry is created.
- Acceptance criteria (Definition of Done):
  - [ ] AC-02.1 Given today's attendance was already submitted, when the teacher changes a student's status and saves, then the new status is persisted and shown immediately.
  - [ ] AC-02.2 Given the teacher edits today's attendance, then no audit log entry is created for this change.
  - [ ] AC-02.3 Given the edit, when saved, then the session's updated time reflects the latest save.
- Edge cases:
  - UC-02-E1: Teacher calls the edit endpoint directly after midnight has passed (date is no longer "today") → rejected with a clear "locked" error.
  - UC-02-E2: Two browser tabs from the same teacher both edit and save nearly simultaneously → last write wins, no crash or duplicate rows.
  - UC-02-E3: Edit payload is missing one student's status → rejected with a validation error naming the missing student.
- Not included: admin editing a locked day (UC-05, M2).

### UC-03: Teacher blocked from marking a section they don't own
- Actor: Teacher (not the class teacher of the target section), Admin, Student
- Milestone: M1
- Preconditions: A section exists with a different user (or no one) as `classTeacherId`.
- Main flow:
  1. A caller who is not that section's class teacher calls the mark-attendance endpoint for it.
  2. System rejects the request.
- Acceptance criteria (Definition of Done):
  - [ ] AC-03.1 Given the caller is not the section's class teacher (e.g. a subject teacher for that section, or an unrelated teacher), when they attempt to submit/edit attendance for it, then the system returns 403 and nothing changes.
  - [ ] AC-03.2 Given the caller is an Admin or Student, when they call this teacher-only endpoint, then it is also rejected with 403 (admin has a separate endpoint, M2).
- Edge cases:
  - UC-03-E1: Section id does not exist → 404, not 403.
  - UC-03-E2: Section has no `classTeacherId` assigned yet → rejected for everyone.
- Not included: admin's ability to edit any section (M2).

### UC-04: Teacher cannot mark attendance for a non-today date
- Actor: Teacher
- Milestone: M1
- Preconditions: Teacher is the class teacher of a section.
- Main flow:
  1. A direct API call attempts to submit attendance with a date that is yesterday or in the future.
  2. System rejects the request.
- Acceptance criteria (Definition of Done):
  - [ ] AC-04.1 Given a date in the past, when the teacher attempts to submit via the API, then the system returns an error and nothing is created/modified for that date.
  - [ ] AC-04.2 Given a date in the future, when the teacher attempts to submit, then the system returns the same error.
- Edge cases:
  - UC-04-E1: Date string is malformed (e.g. "2026-13-40") → validation error, not a server crash.
  - UC-04-E2: Request sent right at the midnight boundary → the server's date at the moment of handling is authoritative.
- Not included: admin editing past days (M2, uses the separate `PATCH` endpoint).

## M2 — Admin browse & edit + audit log

### UC-05: Admin edits attendance for any day, with audit log
- Actor: Admin
- Milestone: M2
- Preconditions: An attendance session already exists for a section + date (submitted by the class teacher).
- Main flow:
  1. Admin opens the Attendance page, selects a section + date.
  2. System shows that day's recorded statuses with an edit option (available regardless of whether the day is locked).
  3. Admin changes one or more students' status and saves.
  4. System updates the statuses and creates one audit entry per changed student (old → new, admin's name, timestamp).
- Acceptance criteria (Definition of Done):
  - [ ] AC-05.1 Given a locked (past) day with recorded attendance, when Admin changes a student's status and saves, then the new status is persisted and an audit entry is created.
  - [ ] AC-05.2 Given today's attendance was already submitted by the class teacher, when Admin changes a status, then it is saved and an audit entry is created too — unlike the teacher's own same-day edits, which are never logged.
  - [ ] AC-05.3 Given a saved edit, when the edit log is viewed, then it shows old status → new status, editor name, and timestamp, one entry per changed student.
- Edge cases:
  - UC-05-E1: Admin "edits" a student to the same status it already had → no audit entry created (no real change).
  - UC-05-E2: Admin attempts to edit a section/date with no existing session → rejected with "not marked yet" (admin edits existing records, doesn't create original submissions).
  - UC-05-E3: Two admins edit the same day around the same time → both edits are applied in order, each creating its own audit row; no silently lost update.
- Not included: creating an original submission on behalf of a teacher.

### UC-06: Admin views attendance for a section/day
- Actor: Admin
- Milestone: M2
- Preconditions: None.
- Main flow:
  1. Admin selects a section + date in the browse view.
  2. System shows recorded entries if a session exists, or "Not marked yet" otherwise.
- Acceptance criteria (Definition of Done):
  - [ ] AC-06.1 Given a section+date with a recorded session, when Admin browses to it, then all student statuses, who submitted it and when, and the edit log (if any) are shown.
  - [ ] AC-06.2 Given a section+date with no session, when Admin browses to it, then "Not marked yet" is shown instead of an error.
- Edge cases:
  - UC-06-E1: Date filter set to a future date → "Not marked yet" (not an error).
  - UC-06-E2: Admin browses a section with zero enrolled students → empty roster shown, no crash.
- Not included: editing (UC-05).

### UC-07: Non-admin blocked from admin-only attendance endpoints
- Actor: Teacher, Student
- Milestone: M2
- Preconditions: None.
- Main flow:
  1. A non-admin calls the admin edit endpoint, or the admin browse endpoint for a section they don't own.
  2. System rejects the request.
- Acceptance criteria (Definition of Done):
  - [ ] AC-07.1 Given the caller is not Admin, when they call the admin edit endpoint for any section, then 403 is returned and nothing changes.
  - [ ] AC-07.2 Given a Teacher who is not that section's class teacher, when they call the admin browse endpoint for that section, then 403 is returned.
- Edge cases:
  - UC-07-E1: A class teacher viewing their own section via their own (M1) endpoint is unaffected — that's a different, allowed endpoint.
- Not included: teacher-endpoint role enforcement (already covered by UC-03).

## M3 — Reports

### UC-08: Admin views daily attendance summary per class
- Actor: Admin
- Milestone: M3
- Preconditions: None.
- Main flow:
  1. Admin opens the reports section, selects a date.
  2. System shows one row per section with present/absent/leave counts.
- Acceptance criteria (Definition of Done):
  - [ ] AC-08.1 Given a section has a recorded session for the selected date, when Admin views the daily summary, then that row shows correct present/absent/leave counts.
  - [ ] AC-08.2 Given a section has no session for the date, then its row shows "Not marked yet" instead of zeros (distinguishing "no absences" from "nothing submitted").
- Edge cases:
  - UC-08-E1: Date is in the future → every section shows "Not marked yet".
  - UC-08-E2: School has zero sections → empty report, no crash.
- Not included: per-student daily detail (that's the browse view, UC-06).

### UC-09: Admin views monthly attendance percentage per student
- Actor: Admin
- Milestone: M3
- Preconditions: None.
- Main flow:
  1. Admin selects a section + month.
  2. System shows one row per enrolled student with present/absent/leave/marked-days counts and attendance percentage.
- Acceptance criteria (Definition of Done):
  - [ ] AC-09.1 Given a student has N marked days in the month with P present, then percentage = round(P / N × 100).
  - [ ] AC-09.2 Given a student has zero marked days in the selected month, then percentage shows as "—" (not 0% or a divide-by-zero error).
  - [ ] AC-09.3 Given a student was added to the section partway through the month, then only days with an actual recorded entry for them are counted.
- Edge cases:
  - UC-09-E1: Month filter set to a future month → all students show 0 marked days, "—" percentage.
  - UC-09-E2: Section has zero enrolled students → empty table with "No students enrolled."
- Not included: exportable reports (out of scope per brainstorm), per-class aggregate percentage (only per-student was requested).

## M4 — Student view

### UC-10: Student views own monthly attendance
- Actor: Student
- Milestone: M4
- Preconditions: Student is logged in and linked to a section.
- Main flow:
  1. Student opens My Attendance; month defaults to the current month.
  2. System shows present/absent/leave counts, attendance percentage, and a day-by-day list for that student in that month.
- Acceptance criteria (Definition of Done):
  - [ ] AC-10.1 Given the student has marked days in the selected month, then counts and percentage reflect only their own entries.
  - [ ] AC-10.2 Given the student changes the month selector, then the list and stats update to the newly selected month.
  - [ ] AC-10.3 Given a day has no entry yet for the student, then it is simply omitted from the list (not shown as a blank/incorrect status).
- Edge cases:
  - UC-10-E1: Student has zero marked days in the month → "No attendance marked for this month yet," percentage shown as "—".
  - UC-10-E2: Student requests a future month → same empty state as E1.
- Not included: parent viewing a child's record (out of scope).

### UC-11: Student cannot view another student's attendance
- Actor: Student
- Milestone: M4
- Preconditions: At least two student accounts exist.
- Main flow:
  1. Student A calls their "my attendance" endpoint, which has no way to request another student's id.
- Acceptance criteria (Definition of Done):
  - [ ] AC-11.1 Given Student A is logged in, when they call the endpoint, then only Student A's own entries are returned, with no parameter able to target another student.
  - [ ] AC-11.2 Given Student A attempts to call the admin or teacher section/day endpoints directly, then they receive 403.
- Edge cases:
  - UC-11-E1: A newly created student account with no attendance entries yet → empty list returned, not an error.
- Not included: n/a

### UC-12: Student not yet assigned to any section
- Actor: Student
- Milestone: M4
- Preconditions: Student's section link is empty.
- Main flow:
  1. Student opens My Attendance; system cannot resolve a section/roster for them.
- Acceptance criteria (Definition of Done):
  - [ ] AC-12.1 Given the student has no section assigned, when they open My Attendance, then a clear message is shown (e.g. "You are not assigned to a class yet.") instead of an error or crash.
- Edge cases:
  - UC-12-E1: Student is later assigned a section by Admin → on next visit, My Attendance resolves normally with no stale error state.
- Not included: n/a

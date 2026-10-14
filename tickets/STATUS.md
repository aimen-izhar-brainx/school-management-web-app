| Ticket | Title | Status | Tries | Note |
|---|---|---|---|---|
| T-012 | RolesGuard + @Roles decorator (backend infrastructure) | DONE | 2 | try 2: pre-commit review asked for Role typing + guard branch tests |
| T-013 | Class CRUD API (backend) | DONE | 2 | try 2: Class.name made citext for case-insensitive DB uniqueness |
| T-014 | Wire ClassesPage class list to real API (frontend) | DONE | 3 | user: hide section/subject counts until M2 (AC-05.3 added) |
| T-015 | Section CRUD + class-teacher assignment (backend) | DONE | 1 | |
| T-016 | Subject catalog + class-subject-teacher assignment (backend) | DONE | 1 | |
| T-017 | Link students to sections (backend) | DONE | 1 | |
| T-018 | Wire Sections UI (frontend) | DONE | 1 | added GET /classes/:classId/sections (backend gap) |
| T-019 | Wire Subjects + student assignment UI (frontend) | DONE | 2 | reviewer: dialog focus + quick-add before load |
| T-020 | Fixed Period schedule (backend) | DONE | 1 | |
| T-021 | TimetableEntry CRUD API (backend, no conflict checking yet) | DONE | 1 | UC-10-E2 race closed with ClassSubject row lock |
| T-022 | Teacher double-booking conflict detection (backend) | DONE | 1 | |
| T-023 | Wire TimetablePage admin builder (frontend) | DONE | 3 | user: always redirect non-admins (AC-17.2) |
| T-024 | GET /timetable/me endpoint (backend) | DONE | 1 | |
| T-025 | Wire MyTimetablePage for teachers and students (frontend) | DONE | 1 | |
| T-026 | Subject rename + delete (backend) | DONE | 1 | |
| T-027 | Subject rename + delete UI (frontend) | DONE | 1 | |
| T-028 | Delete class with sections, subjects or students (backend) | DONE | 1 | |
| T-029 | Delete class confirmation with impact counts (frontend) | DONE | 1 | |
| T-030 | Reject invalid timetable entries (backend) | DONE | 1 | |
| T-031 | Block Parent role from Academic Management (backend + frontend) | DONE | 1 | user: no parent entry to My Timetable (safety-net page only) |
| T-032 | Attendance data model + teacher mark/edit endpoints (backend) | DONE | 2 | try 2: pre-commit review fixed dup studentId 500, UTC vs local "today", roster check outside tx |
| T-033 | Wire MarkAttendancePage to real API, with same-day re-edit (frontend) | TODO | 0 | |
| T-034 | Admin attendance edit (audited) + browse endpoint (backend) | TODO | 0 | |
| T-035 | Wire AttendancePage browse & edit + audit log to real API (frontend) | TODO | 0 | |
| T-036 | Daily summary + monthly percentage report endpoints (backend) | TODO | 0 | |
| T-037 | Wire AttendancePage report tables to real API (frontend) | TODO | 0 | |
| T-038 | GET /attendance/me endpoint (backend) | TODO | 0 | |
| T-039 | Wire MyAttendancePage for students to real API (frontend) | TODO | 0 | |

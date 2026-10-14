---
diff_hash: 37162f7321930f3b3335ec7acdd2076df9c5882d410bd275757bf87f9ee7d0b5
reviewed_at: 2026-10-14T12:22:44Z
---

## Summary

Frontend-only change (T-037, React 19 + Vite + Tailwind): the admin `AttendancePage` "Daily summary" and "Monthly attendance percentage" tables now load from T-036's `/attendance/reports/daily` and `/attendance/reports/monthly` endpoints instead of the mock dataset, using the same request-id-ref stale-guard idiom as the existing "Browse & edit" loader. Tests are expanded accordingly; ticket/status bookkeeping updated; the previous `.code-reviews/brainx-review.md` (T-036) is deleted. No backend files are in this diff, so there is no cross-repo contract change (the frontend consumes the already-committed T-036 response shapes).

## Findings

### Critical (0)

### High (0)

### Medium (1)
- **frontend/src/components/AttendancePage.tsx:233** — In both report effects, the invalid-input early-return branch (cleared date at ~L238, cleared month / empty section at ~L267) resets state but does not bump `latestDailyReportRequest` / `latestMonthlyReportRequest`. A request already in flight for the previous valid value still passes the `request !== latest...current` check when it resolves and repopulates the table. *(correctness / race condition)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Concrete scenario: admin picks a date (request #1 in flight), then clears the date input; the effect resets to `idle`/empty without incrementing the counter; request #1 resolves, `request === latest` still holds, and the table shows the old date's rows (status `ready`) while the date field is blank. Fix: increment the request ref (`latestDailyReportRequest.current++` / `latestMonthlyReportRequest.current++`) before the early return, or move the increment above the validity check.

### Low (1)
- **frontend/src/components/AttendancePage.tsx:582** — Report tables have no empty/idle feedback in several states: the daily table renders an empty `<tbody>` when the report is `ready` with zero sections or `idle` (cleared date), and the monthly table renders nothing while the section directory is still loading or if it failed (`monthlySectionId` stays `''` so the effect never fetches). *(maintainability / UX states)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: The project's own React criteria call for loading/error/empty states in the UI. Add a short placeholder row (e.g. "No sections." / "Select a date." / "Select a section.") for the idle and empty cases, and surface the directory error near the monthly section picker or reuse `directoryError`.

## Reviewed files
- .code-reviews/brainx-review.md (deleted in index — previous review artifact; rewritten by this review)
- frontend/src/components/AttendancePage.tsx
- frontend/src/components/AttendancePage.test.tsx
- tickets/STATUS.md
- tickets/T-037.md

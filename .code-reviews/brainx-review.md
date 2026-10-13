---
diff_hash: 58d787593d319f8516c1eaf2648f994869386018cabc7d0a13e39ee866cfcb5c
reviewed_at: 2026-10-13T11:18:38Z
---

## Summary

T-023 frontend: TimetablePage is rewired to the real API (classes, sections, periods, per-section timetable, PUT/DELETE of cells), with the grid extracted into a new TimetableGrid component. Shared types (`ClassSubject`, `DayId`, `TimetablePeriod`, `TimetableEntry`) move to `lib/types.ts`, `api.put` and a `cellKey` helper are added, the hardcoded SUBJECTS constant is removed, and TimetableBreakRow takes primitive props. Tests are added or expanded, and a release report is added. Stack: React 19 + Vite + TypeScript. `tsc -b` and oxlint are clean and the 25 timetable/App tests pass. Role gating is client-side only (`user.role === 'admin'`), and the backend is expected to enforce it (T-031 tracks this). Only minor issues were found.

## Findings

### Critical (0)

### High (0)

### Medium (1)
- **frontend/src/components/TimetablePage.tsx:122** — The in-flight guard and `busyKeys` are keyed by `periodId:day` only, not by section. If the admin switches sections while a save is pending, the same cell in the newly selected section shows as busy, and a click on it is silently ignored by the `inFlight` check. The old save's result is also discarded without feedback, since `request !== latestLoad.current`. *(correctness)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Include the section id in the key (e.g. `${section.id}:${cellKey}`), or clear `busyKeys` and `inFlight` in `selectSection`. A pending save for the previous section still completes server-side, which is acceptable.

### Low (2)
- **frontend/src/components/MyTimetablePage.tsx:104** — The `TimetableBreakRow` JSX is written as `return <TimetableBreakRow` with props indented unlike the multi-line `return (...)` form used in the new TimetableGrid, and the closing tag is misindented. *(consistency)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Wrap in `return (...)` and indent like TimetableGrid.tsx so the two call sites match.
- **frontend/src/components/TimetablePage.tsx:75** — The directory load fires one `/classes/:id/sections` request per class (N+1) after fetching the class list. *(maintainability)*
  - status: skipped
  - dev_reasoning: Deferred. A single school has a few dozen classes at most, the requests run in parallel, and this matches the existing per-class sections endpoint added in T-018. Add a combined sections-with-class endpoint if class counts grow.
  - ai_reasoning: Fine at school scale and consistent with the existing per-class fetch pattern. Consider a single endpoint returning sections with class names if class counts grow.

## Reviewed files
- docs/release-report.md
- frontend/src/App.timetableAccess.test.tsx
- frontend/src/components/ClassSubjectsPanel.tsx
- frontend/src/components/MyTimetablePage.tsx
- frontend/src/components/TimetableBreakRow.tsx
- frontend/src/components/TimetableGrid.tsx
- frontend/src/components/TimetablePage.test.tsx (skimmed; tests pass)
- frontend/src/components/TimetablePage.tsx
- frontend/src/data/timetable.ts
- frontend/src/lib/http.ts
- frontend/src/lib/timetable.ts
- frontend/src/lib/types.ts
- tickets/STATUS.md
- .code-reviews/brainx-review.md (deleted; previous review, replaced by this one)

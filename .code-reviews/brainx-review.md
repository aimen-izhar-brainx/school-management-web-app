---
diff_hash: 3f6153da21e476ece3195e3f774cc63ef5ac70573bea1b0a4d1aab805019b4ba
reviewed_at: 2026-10-13T08:28:33Z
---

## Summary

T-019 (frontend): replaces the mocked Subjects area in `ClassesPage` with a new `ClassSubjectsPanel` backed by `/subjects` and `/classes/:id/subjects`, adds `SectionRosterDialog` (assign/unassign students via `/users?role=student` and `PATCH /users/:id/section`) opened from `ClassSectionsPanel`, extracts `compareByName`, and adds T-019 tests. Stack: React 19 + Vite + TS + Tailwind (NestJS backend not in this diff, so no cross-repo contract change). Write controls are gated by `canManage`; stale-response and unmount guards are in place. No security issues found.

## Findings

### Critical (0)

### High (0)

### Medium (1)
- **frontend/src/components/SectionRosterDialog.tsx:104** — Dialog declares `aria-modal="true"` but has no focus trap, and Escape is handled only via `onKeyDown` on the dialog element. Tab can move focus to the page behind the overlay, and once it does Escape no longer closes the dialog. *(accessibility)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Initial focus and focus restoration are handled, but modal semantics are only half implemented. Trap Tab within the dialog, or attach a document-level Escape listener in an effect with cleanup.

### Low (4)
- **frontend/src/components/ClassSubjectsPanel.tsx:223** — `runAction`'s re-entry guard reads `busyKeys` from the render closure, so two calls dispatched before a re-render can both pass. *(correctness)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Practically masked because controls are disabled once busy re-renders, but a ref-based in-flight set would make the guard reliable.
- **frontend/src/components/ClassSubjectsPanel.tsx:131** — `isNotFound`, the `isMounted`/latest-request-counter loading pattern and local `TeacherOption`/`StudentRow` shapes are duplicated from `ClassSectionsPanel` and `SectionRosterDialog`. *(maintainability)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: `compareByName` was extracted but `isNotFound` was copied. Move it to `lib/` (next to `http`) and consider a shared `useLatestRequest` hook.
- **frontend/src/components/SectionRosterDialog.tsx:1121** — Fetches every student account via `/users?role=student` on each dialog open and renders them all in one `<select>`, with no pagination or search. *(performance)*
  - status: skipped
  - dev_reasoning: Known v1 limit, accepted by product decision. The backend `GET /users` is intentionally unpaginated (see T-015's review), and the user declined student-picker search during /use-cases. Revisit pagination and search together if student counts grow.
  - ai_reasoning: Fine for small schools, but the list grows unbounded. Acceptable if the backend lacks pagination; note as a known limit.
- **frontend/src/components/ClassesPage.test.tsx:854** — Test uses a fixed `setTimeout(r, 20)` sleep to wait for async work before a negative assertion. *(test-quality)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Timing-based waits can flake on slow CI. Prefer awaiting a deterministic signal (e.g. flush microtasks with `act`).

## Reviewed files
- .code-reviews/brainx-review.md (previous review record, deleted; skipped)
- frontend/src/components/ClassSectionsPanel.tsx
- frontend/src/components/ClassSubjectsPanel.tsx
- frontend/src/components/ClassesPage.test.tsx
- frontend/src/components/ClassesPage.tsx
- frontend/src/components/SectionRosterDialog.tsx
- frontend/src/lib/compareByName.ts
- tickets/STATUS.md (docs; skimmed)
- tickets/T-019.md (docs; skimmed)

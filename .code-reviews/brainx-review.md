---
diff_hash: 782bc56a71677bdcef2a51c1aa011407638172bd661f5e5d9a5e8d882d9e9a7c
reviewed_at: 2026-10-13T07:43:43Z
---

## Summary

T-014: `ClassesPage` now loads, creates, renames and deletes classes through the `/classes` API (via new `api.patch` / `api.delete` helpers in `http.ts`) instead of local mock data. It adds loading/error/empty states, in-flight guards for rename and delete, a delete confirmation, and hides write controls for non-admins. Section/subject counts are removed from the list until M2. Ticket and status docs are updated to match. Stack: React 19 + Vite + TypeScript + Tailwind (frontend only; no backend changes in this diff, so no cross-repo contract risk).

## Findings

### Critical (0)

### High (0)

### Medium (2)
- **frontend/src/components/ClassesPage.tsx:334** — Rename and delete failures (including the "This class no longer exists." 404 message required by UC-02-E2 / UC-03-E1) are written to `classNameError`, which is only rendered inside the "New class" form in the sidebar. The user sees the error under the add-class input, far from the Rename/Delete controls they just used, and it reads as if the add form failed. *(correctness / UX)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: `commitRenameClass` (line 177) and `handleDeleteClass` (line 195) reuse the shared `classNameError` state. Use a separate error state rendered next to the class header/rename form, or otherwise scope the error to the action that produced it.
- **frontend/src/components/ClassesPage.tsx:135** — `handleAddClass` has no in-flight guard or disabled/loading state on the submit button, unlike rename and delete. A double click or Enter-key repeat sends duplicate POSTs; the second can fail with a confusing "already exists" error right after the first succeeded. *(correctness / consistency)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Add an `isCreating` flag mirroring `isSavingRename` / `isDeleting`, bail out early when set, and disable the add button while the request is pending.

### Low (2)
- **frontend/src/components/ClassesPage.tsx:119** — The load effect and `handleClassGone` have no stale/unmount guard, and when a resync after a 404 fails, `loadStatus` flips to `'error'` while the stale list (still containing the deleted class) remains rendered under the error message. *(correctness / robustness)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Add an ignore flag or AbortController to the effect, and decide explicitly what the UI should show when a resync fails (for example, keep the previous list but avoid presenting it as current).
- **frontend/src/components/ClassesPage.tsx:313** — The `{canManageClasses && (` wrapper around the add-class `<form>` was added without re-indenting the form body, so the JSX is misformatted and inconsistent with the rest of the file. *(style)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Run the project formatter or re-indent the wrapped block.

## Reviewed files
- .code-reviews/brainx-review.md (deleted in staging; previous review artifact, skipped)
- frontend/src/components/ClassesPage.test.tsx
- frontend/src/components/ClassesPage.tsx
- frontend/src/lib/http.ts
- tickets/STATUS.md
- tickets/T-014.md

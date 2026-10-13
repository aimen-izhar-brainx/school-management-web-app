---
diff_hash: 2e9f24b23e57b38be6502118c842a6d3444e038220cfd5e85e5755b1d6d789b9
reviewed_at: 2026-10-13T10:01:04Z
---

## Summary

T-027 frontend: adds an admin-only `SubjectCatalogManager` (inline rename + confirm-delete with per-action re-entry guards, 400 message display, 404 resync) mounted inside `ClassSubjectsPanel` under the `canManage` gate, moves `Subject` into `lib/types.ts`, wires rename/delete propagation into the catalog and class subject rows, adds tests for AC-22.x / UC-22-E2 / AC-12.2, and marks T-027 DONE. Stack: React (frontend only; no backend changes, so no cross-repo contract change). Server-side authorization is covered by T-026 and not part of this diff.

## Findings

### Critical (0)

### High (0)

### Medium (0)

### Low (3)
- **frontend/src/components/SubjectCatalogManager.tsx:71** — A single shared `draft`/`editingId` is used, but the Rename buttons of other rows stay enabled while one row is being edited. Clicking Rename on another subject silently discards the in-progress edit (and its typed text) with no warning. *(correctness)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed: while one row is being edited, the Rename and Delete buttons on every other row are disabled (`otherEditing`, lines 136/174/183), so an in-progress draft can no longer be discarded by accident.
- **frontend/src/components/SubjectCatalogManager.tsx:146** — No focus management: after Save/Cancel/successful rename or delete, the focused control unmounts (form swapped for the row, or row removed) and focus falls back to `<body>`, which is disorienting for keyboard and screen-reader users. *(accessibility)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed: added `pendingFocus` handling. Focus returns to the row's Rename button after save/cancel and to the 'Manage subjects' heading (`tabIndex={-1}`) after delete.
- **tickets/T-027.md:21** — Technical notes still say the work lives in `ClassesPage.tsx`, but the implementation is in the new `SubjectCatalogManager.tsx` mounted from `ClassSubjectsPanel.tsx`; the ticket doc now misdescribes where the code is. *(consistency)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed: the ticket's technical notes now name `SubjectCatalogManager.tsx`, mounted from `ClassSubjectsPanel.tsx`, with tests in `ClassesPage.test.tsx`.

## Reviewed files
- frontend/src/components/ClassSubjectsPanel.tsx
- frontend/src/components/ClassesPage.test.tsx
- frontend/src/components/SubjectCatalogManager.tsx
- frontend/src/lib/types.ts
- tickets/STATUS.md
- tickets/T-027.md
- .code-reviews/brainx-review.md (previous review file, deleted in the staged diff; skipped)

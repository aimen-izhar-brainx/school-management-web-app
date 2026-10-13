---
diff_hash: 6f60d8816f040254e0c9d701e1162fc25b67ee395913d9247bf609c0917eadb2
reviewed_at: 2026-10-13T08:41:19Z
---

## Summary

Adds `PATCH /api/subjects/:id` (admin-only rename) to the NestJS subjects module and extracts the duplicate-name lookup into `assertNameFree`, which excludes the subject's own id so a case-only rename works. Delete behaviour is unchanged; the FK on `ClassSubject.subjectId` (default RESTRICT) plus `translate()` mapping P2003/P2002/P2025 covers the delete-vs-assign and rename races. Adds a T-026 spec block covering AC-22.x, UC-22-E1/E3 and AC-12.1, and marks T-026 DONE. Backend only; no frontend contract change in this diff.

## Findings

### Critical (0)

### High (0)

### Medium (0)

### Low (1)
- **backend/src/subjects/subjects.spec.ts:262** — The new `describe('T-026 ...')` block repeats the whole Nest testing-module bootstrap, JWT helpers and cleanup already present in the T-016 block above it in the same file (~35 lines duplicated). Hoisting the shared setup would keep the two suites from drifting. *(maintainability)*
  - status: skipped
  - dev_reasoning: Deferred to the next commit. The DB-backed specs have an intermittent connection and timeout flake, and the follow-up test-infrastructure chore will move the shared Nest test bootstrap, JWT helpers and teardown into one helper used by all backend specs, which removes this duplication.
  - ai_reasoning: Functionally correct and isolated by a separate name prefix; this is a readability/duplication issue only, with no behavioural impact.

## Reviewed files
- .code-reviews/brainx-review.md (deleted; previous review record, not reviewed)
- backend/src/subjects/subjects.controller.ts
- backend/src/subjects/subjects.service.ts
- backend/src/subjects/subjects.spec.ts
- tickets/STATUS.md
- tickets/T-026.md

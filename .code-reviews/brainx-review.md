---
diff_hash: a668c6c6e92e2afe0a3205850064b33bc1567a74618b2b74863d5460d6d4a81c
reviewed_at: 2026-10-13T10:08:02Z
---

## Summary

T-029 (frontend): "Delete class" now fetches `GET /classes/:id/delete-impact` (backend T-028, endpoint exists) before confirming, and builds the confirmation text via the new `deleteImpactMessage` helper. Errors from the impact request reuse the existing error/404 handling. Tests cover counts, singular/plural, zero-count plain confirmation, cancel, failure and 404. Stack: React (frontend only staged; no cross-repo contract change).

## Findings

### Critical (0)

### High (0)

### Medium (0)

### Low (1)
- **frontend/src/components/ClassesPage.test.tsx:1198** — Test redefines the plain-confirmation string (`PLAIN_CONFIRM`) instead of importing the exported `PLAIN_DELETE_CONFIRM` from `lib/deleteImpactMessage.ts`, duplicating a string that can drift. *(maintainability)*
  - status: ignored
  - dev_reasoning: Intentional. The test pins the exact user-visible UC-03 wording as an independent literal. Importing `PLAIN_DELETE_CONFIRM` would make the assertion compare the constant with itself, so a wording regression in the constant would go unnoticed.
  - ai_reasoning: The constant is exported specifically for reuse; importing it keeps a single source of truth. Hard-coding the literal in a test is arguably intentional (guards the UC-03 wording), so impact is minimal.

## Reviewed files
- frontend/src/components/ClassesPage.test.tsx
- frontend/src/components/ClassesPage.tsx
- frontend/src/lib/deleteImpactMessage.ts
- tickets/STATUS.md (docs, skimmed)
- tickets/T-029.md (docs, skimmed)

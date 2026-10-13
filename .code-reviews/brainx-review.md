---
diff_hash: 7cb7d40fab08faf602c54cd643914b9cc73158684b38897b7156a3da1fd1e073
reviewed_at: 2026-10-13T08:16:32Z
---

## Summary

T-018: adds `GET /classes/:classId/sections` (any authenticated role; writes remain admin-only via per-route RolesGuard), plus backend specs. Frontend extracts a new `ClassSectionsPanel` backed by the real sections API, loads real teachers from `/users?role=teacher`, and moves `errorMessage` to `lib/errorMessage.ts`. Stack: NestJS (backend) + React (frontend). Frontend tests (139) pass; oxlint reports no issues. No cross-repo contract mismatch: frontend consumes exactly the `[{id,name,classTeacher}]` shape the backend returns. Read access for all roles is intentional (AC-12.2).

## Findings

### Critical (0)

### High (0)

### Medium (1)
- **frontend/src/components/ClassesPage.tsx:72-83** — Failure to load `/users?role=teacher` is silently swallowed (`() => setTeachers([])`). The admin sees a dropdown with only "Unassigned" and no hint that teachers failed to load, indistinguishable from "no teacher accounts exist". *(error-handling)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Surface an error (e.g. pass a `teachersError` flag/message to the panel) or at least distinguish load failure from an empty list.

### Low (2)
- **frontend/src/components/ClassSectionsPanel.tsx:1** — New file uses double quotes and semicolons, while the rest of the frontend (e.g. `ClassesPage.tsx`, `errorMessage.ts`) uses single quotes and no semicolons. *(consistency)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Reformat to the project's style so future diffs against neighbouring files stay clean.
- **frontend/src/components/ClassSectionsPanel.tsx:142** — A newly created section is appended to the end of the list, but the API (and any reload) orders by name ascending, so the order changes after the next refresh (e.g. adding "A" after "B"). *(correctness)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Insert in name order (or reload via `loadSections()`) after create so the UI matches server ordering.

## Reviewed files
- backend/src/classes/sections.controller.ts
- backend/src/classes/sections.service.ts
- backend/src/classes/sections.spec.ts
- frontend/src/components/ClassSectionsPanel.tsx
- frontend/src/components/ClassesPage.tsx
- frontend/src/components/ClassesPage.test.tsx (skimmed)
- frontend/src/lib/errorMessage.ts
- tickets/STATUS.md, tickets/T-018.md (docs, skimmed)
- .code-reviews/brainx-review.md (previous review file, deleted in diff; skipped)

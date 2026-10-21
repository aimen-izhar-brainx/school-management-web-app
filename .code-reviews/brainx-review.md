---
diff_hash: f600a1692dcac8f2d38ca86087149a54e642d0abebb7f37db3841cf8ba6ebea8
reviewed_at: 2026-10-21T08:24:07Z
---

## Summary

Stack: NestJS 12 backend and React 19 frontend, in one repo. The change wires the frontend to the existing `/teachers` and `/students` APIs. It adds a paginated People directory (`PeopleListPage`) with delete, a `lib/people.ts` API client, API-backed create forms for teachers and students in `AdminCreatePage`, and `patch`/`delete` helpers on `api`. The dashboard Students card now opens the directory and a Teachers card is new. The backend change in `teachers.service.ts` is a formatting and indentation cleanup plus a `toConflict` helper that returns the same P2002 → 409 behaviour. The frontend request and response shapes match the backend DTOs and `PaginationDto` (page/limit, `{ data, meta }`, 204 on delete). I found no correctness or security defects. Only low-severity cleanups remain.

## Findings

### Critical (0)

### High (0)

### Medium (0)

### Low (3)
- **frontend/src/lib/http.ts:49** — `api.patch` is added but nothing calls it; update is not part of this change. *(maintainability)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Remove it until an edit screen needs it, or confirm it is intentionally staged for the next ticket.
- **frontend/src/lib/people.ts:68-72** — `withoutBlanks` drops blank optional fields but sends non-blank ones untrimmed (`phone`, `address`, `section`, `gender`, `dateOfBirth`). Values such as `" A "` are stored with the padding. *(correctness)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Trim string values in `withoutBlanks` (map to `value.trim()`), or trim at the call sites in `AdminCreatePage`, as is already done for required fields.
- **frontend/src/components/PeopleListPage.tsx:12** — The directory page imports `PersonTab` from `AdminCreatePage`, so one page component depends on another for a shared type, and `AdminDashboardPage` now imports from `PeopleListPage` as well. After creating a person, `AdminCreatePage`'s Back button goes to the dashboard rather than the directory the admin came from. *(consistency)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Move `PersonTab` and `DirectoryTab` into a small shared types module (for example `lib/people.ts`). Optionally make Back return to `admin-people` when the create page was opened from the directory.

## Reviewed files
- backend/src/teachers/teachers.service.ts (formatting plus `toConflict` extraction)
- frontend/src/App.tsx
- frontend/src/lib/http.ts
- frontend/src/lib/people.ts (new)
- frontend/src/components/PeopleListPage.tsx (new)
- frontend/src/components/PeopleListPage.test.tsx (new, skimmed)
- frontend/src/components/AdminCreatePage.tsx
- frontend/src/components/AdminCreatePage.test.tsx (skimmed)
- frontend/src/components/AdminDashboardPage.tsx
- frontend/src/components/AdminDashboardPage.test.tsx (skimmed)

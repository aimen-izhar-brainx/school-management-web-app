---
diff_hash: f234a2e57d7040ead77fb4357345d09f8efa234c5e949b416124d031a93d9d27
reviewed_at: 2026-10-23T06:46:21Z
---

## Summary

Stack: NestJS + Prisma (backend) and React (frontend), both in one repo. This diff adds a Notice module: a migration for the `Notice` table and `NoticeAudience` enum, a `/notices` API (list, create, delete), a `@CurrentUser()` decorator, and a rewrite of `NoticeBoardPage` to use the API instead of local state. It also changes `Notice.postedBy` from `onDelete: Cascade` to `Restrict`.

This resolves the earlier findings about the missing Notice migration and the local-only notice page. Cross-stack check: the frontend `lib/notices.ts` matches the backend routes, the `{ items }` response shape and the `postedBy: { id, name, role }` select. The audience filtering is enforced server-side for students and parents. Authorization is correct: create and delete are limited to admin and teacher, and non-admins can delete only their own notices.

## Findings

### Critical (0)

### High (1)
- **backend/prisma/schema.prisma:49** — `Notice.postedBy` is now `onDelete: Restrict`, but `TeachersService.remove` (teachers.service.ts:128) deletes the `User` row directly and has no handling for the foreign-key violation. *(correctness)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Once a teacher or admin has posted a notice, deleting that teacher fails with a Prisma P2003 error, and the client sees a 500. Nothing in `src/` handles P2003. Either delete or reassign the user's notices before deleting the user, in a transaction, or catch P2003 and return a 409 with a clear message such as "Teacher has posted notices". The same applies to any other path that deletes a posting user.

### Medium (2)
- **frontend/src/lib/notices.ts:21** — The list is fetched once with `page=1&limit=100`, and the page has no pagination or "load more". *(correctness)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Once there are more than 100 visible notices, the older ones cannot be reached from the UI, and nothing indicates they are missing. The response already includes `total`, `page` and `limit`, but they are discarded. Add paging or a load-more control, or at least show a message when `total` exceeds the number of items loaded. Re-review: fixed. `listNotices(page)` now returns `{ items, total }`, and the page shows a "Load more" button while `notices.length < total`, de-duplicating repeats.
- **backend/src/notices (whole module)** — No unit or e2e tests are included for the new service or controller. *(testing)*
  - status: ignored
  - dev_reasoning: Unit testing are not in this scope
  - ai_reasoning: CLAUDE.md defines `npm run test` as the backend test command. The module has behaviour that is easy to break: role-based audience filtering for students and parents, the admin-or-owner rule on delete (403 versus 404), and the admin/teacher-only guards on create and delete.

### Low (1)
- **backend/src/notices/notice.controller.ts:24** — `findAll`, `create` and `remove` have no explicit return types, and `user.role as Role` casts the JWT string to the Prisma enum. *(maintainability)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: This matches the style of the existing controllers, so the impact is small. The cast hides a mismatch if `JwtPayload.role` is ever widened. Typing `JwtPayload.role` as `Role` in `jwt.strategy.ts` would remove the casts in the controller and the service signature.

## Reviewed files
- .code-reviews/brainx-review.md (deleted, replaced by this review)
- backend/prisma/migrations/20261022083959_add_notice_module/migration.sql
- backend/prisma/schema.prisma
- backend/src/app.module.ts
- backend/src/auth/current-user.decorator.ts
- backend/src/notices/dto/create-notice.dto.ts
- backend/src/notices/notice.controller.ts
- backend/src/notices/notice.module.ts
- backend/src/notices/notice.service.ts
- docs/plan.md
- frontend/src/components/NoticeBoardPage.tsx
- frontend/src/data/notices.ts
- frontend/src/lib/notices.ts

---
diff_hash: dff4ec300782c238d82cf5ad26335e115ea11f2d3d0af7c24d6c7c7226d35e32
reviewed_at: 2026-10-13T07:31:31Z
---

## Summary

Adds the Class model + migration and a `classes` NestJS module (list for any authenticated user; create/rename/delete admin-only via JwtAuthGuard + RolesGuard), a trimming/validating DTO, and an integration spec against real Postgres. Auth, validation, error mapping (P2002/P2025) and select-limited responses are sound. Stack: NestJS (Prisma). Ticket/STATUS markdown changes are doc-only.

## Findings

### Critical (0)

### High (0)

### Medium (1)
- **backend/prisma/schema.prisma:59** — The `@unique` on `Class.name` (and the migration's `Class_name_key` index) is case-sensitive, but the business rule and the service pre-check are case-insensitive. Two concurrent requests for "Math" and "math" both pass `assertNameFree` and both insert successfully, so the DB constraint does not back the case-insensitive rule (the P2002 fallback only catches exact-case races). *(correctness)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Enforce at DB level with a unique index on `lower(name)` (raw SQL in the migration) or store a normalized `nameKey` column with the unique constraint. The race test only covers identical-case names, so it doesn't catch this.

### Low (2)
- **backend/src/classes/classes.service.ts:12** — `list()` is an unbounded `findMany` with no pagination. *(performance)*
  - status: skipped
  - dev_reasoning: Intentional. AC-05.2 requires the list endpoint to return all classes, and a single school has at most a few dozen. Pagination is not in the v1 scope.
  - ai_reasoning: Class counts are small and AC-05.2 requires returning all, so impact is minimal; consider a sane cap or note the intentional choice.
- **backend/src/classes/classes.controller.spec.ts:44** — `(prisma as any).class` is used repeatedly although `PrismaService` already exposes a typed `class` delegate (the service uses it without a cast). *(maintainability)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Drop the `as any` casts so tests get type checking on the model.

## Reviewed files
- backend/prisma/migrations/20261013072948_add_class/migration.sql
- backend/prisma/schema.prisma
- backend/src/app.module.ts
- backend/src/classes/classes.controller.spec.ts
- backend/src/classes/classes.controller.ts
- backend/src/classes/classes.module.ts
- backend/src/classes/classes.service.ts
- backend/src/classes/dto/class-name.dto.ts
- tickets/STATUS.md (doc, skimmed)
- tickets/T-013.md (doc, skimmed)
- .code-reviews/brainx-review.md (previous review file, deleted in staging; not reviewed)

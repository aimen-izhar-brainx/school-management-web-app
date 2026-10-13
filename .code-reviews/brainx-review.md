---
diff_hash: 904fc355450a863497f8ecf89b56cb829ef57c5b783949018505e06ecfa13a97
reviewed_at: 2026-10-13T09:51:50Z
---

## Summary

Test-infrastructure chore: adds a shared `createTestApp` helper (`backend/test/helpers/test-app.ts`) and migrates all seven DB/HTTP-backed backend specs (classes, class-subjects, sections, subjects T-016/T-026, student-section, users controller, roles guard) to it, removing ~300 lines of duplicated Nest bootstrap. The helper mirrors main.ts (`/api` prefix, same ValidationPipe options) and listens once on an ephemeral port to avoid supertest's per-request listen/close race. This resolves the previously skipped Low finding about duplicated bootstrap in subjects.spec.ts. No production code changed; backend only, no frontend contract impact. The deleted previous review record is not reviewed.

## Findings

### Critical (0)

### High (0)

### Medium (0)

### Low (2)
- **backend/test/helpers/test-app.ts:102** — When `prisma: false`, `prisma` was set to `undefined as unknown as PrismaService`, so the type claimed a PrismaService that was not there. *(maintainability)*
  - status: fixed
  - dev_reasoning: N/A
  - ai_reasoning: Fixed. `createTestApp` now has overloads returning `TestApp` (no `prisma`) for `prisma: false` and `DbTestApp extends TestApp` otherwise, and the cast is gone; `roles.guard.spec.ts` uses `TestApp`, so touching `prisma` there is a compile error.
- **backend/src/subjects/subjects.spec.ts:25** — Each migrated spec keeps thin pass-through aliases (`tokenFor = r => t.tokenFor(r)`, `adminAuth`, `http`) and copies `jwt`/`prisma` out of `t` after setup. This partly re-creates the local boilerplate the helper was meant to remove and is repeated across the seven specs. Using `t.http()`, `t.adminAuth()` and `t.prisma` directly, or destructuring once, would finish the consolidation. *(maintainability)*
  - status: ignored
  - dev_reasoning: Already addressed. No pass-through wrapper functions remain (grep for `=> ctx.`/`=> t.` finds none). Each block destructures once from `ctx` in beforeAll (`({ http, tokenFor, adminAuth, jwt, prisma } = ctx)`), which is the "destructuring once" option this finding proposes. Inlining `ctx.` would rewrite 144 test-body lines for no behaviour change.
  - ai_reasoning: Behaviour is correct. The aliases keep the migration diff small, but they leave duplicated indirection across files.

## Reviewed files
- .code-reviews/brainx-review.md (deleted; previous review record, not reviewed)
- backend/test/helpers/test-app.ts
- backend/src/classes/class-subjects.spec.ts
- backend/src/classes/classes.controller.spec.ts
- backend/src/classes/sections.spec.ts
- backend/src/common/guards/roles.guard.spec.ts
- backend/src/subjects/subjects.spec.ts
- backend/src/users/student-section.spec.ts
- backend/src/users/users.controller.spec.ts

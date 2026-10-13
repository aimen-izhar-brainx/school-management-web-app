---
diff_hash: 67734f5671375b14323d21e821de178e2987378f1b9df0474eb9f2b48ef02651
reviewed_at: 2026-10-13T10:49:36Z
---

## Summary

T-022 adds teacher double-booking detection to the timetable: a new unique index on `TimetableEntry(teacherId, periodId, dayOfWeek)` with migration, an in-transaction pre-check (`assertTeacherFree`) that returns a 400 naming the conflicting section, a one-shot retry for concurrent same-section upserts, and a P2002 fallback that maps the DB unique violation to the same conflict error. The Prisma error-meta parsing was extracted from `ClassSubjectsService` into `common/prisma-errors.ts`. A real-DB spec covers AC-14.x, UC-14-E1/E2 and AC-23.x. Stack: NestJS + Prisma. The logic is sound (the loser of a teacher race gets the same 400 as the pre-check, the section-slot race is retried, own-section replacement is excluded from the conflict query). Findings are around migration safety and error-matching robustness.

## Findings

### Critical (0)

### High (0)

### Medium (1)
- **backend/prisma/migrations/20261013120000_timetable_teacher_slot_unique/migration.sql:2** — The migration creates a UNIQUE index on existing data, but T-021 (already shipped) explicitly allowed teacher double-booking ("no conflict checking yet"). Any shared/staging/prod database that already holds two entries for the same teacher/period/day will make `prisma migrate deploy` fail midway, blocking the release. *(correctness / migrations)*
  - status: ignored
  - dev_reasoning: No environment can contain T-021 without T-022. Both are local commits on the unpushed, unmerged `academic-management` branch (no remote branch contains T-021's commit), so they ship together and the TimetableEntry table is created and constrained in the same deploy. The only database with T-021 applied, the local dev DB, was checked for duplicate (teacherId, periodId, dayOfWeek) rows before migrating, and there were none.
  - ai_reasoning: Either add a clearly labelled pre-step (separate data migration or script) that detects/resolves existing duplicates before the index is created, or confirm and note in the ticket that no environment holds such rows yet.

### Low (1)
- **backend/src/timetable/timetable.service.ts:134** — Race/conflict classification relies on substring matching of a JSON-stringified blob (`violatedConstraint(e).includes('sectionId' | 'teacherId')`). It is fragile to driver-adapter output shape changes, and if a retried write hits the section-slot P2002 a second time it falls through `translate` and surfaces as a raw 500 instead of a handled error. *(maintainability / error handling)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Have `violatedConstraint` return structured data (field list / index name) and compare exact fields, and map a repeated section-slot P2002 to a 400/409 (or retry in a small bounded loop) rather than rethrowing the raw Prisma error.

## Reviewed files
- .code-reviews/brainx-review.md (deleted; previous review, replaced by this one)
- backend/prisma/migrations/20261013120000_timetable_teacher_slot_unique/migration.sql
- backend/prisma/schema.prisma
- backend/src/classes/class-subjects.service.ts
- backend/src/common/prisma-errors.ts
- backend/src/timetable/timetable-conflicts.spec.ts
- backend/src/timetable/timetable.service.ts
- tickets/STATUS.md
- tickets/T-022.md

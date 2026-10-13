---
diff_hash: 3dc4a84773dae6846249e8746d1d47c23d5d9e93fc94e803532e98117f22d38f
reviewed_at: 2026-10-13T07:56:31Z
stack: nestjs
---

## Summary

Adds Subject CRUD (`/subjects`: list, create, delete) and per-class subject assignment (`/classes/:classId/subjects`: list, add, set teacher, remove) with a Prisma migration (`Subject`, `ClassSubject`), a `UsersService.isTeacher` helper, and ticket/status doc updates. Backend only, so no cross-repo contract risk. Guards, admin-only writes, DTO validation, case-insensitive unique names, and P2002/P2025 race handling are consistent with the Section module. Two minor issues found.

## Findings

### Critical (0)

### High (0)

### Medium (1)
- **backend/src/classes/class-subjects.service.ts:99** — `translate` maps every P2003 (FK violation) to "This subject no longer exists.". In `setTeacher`, a P2003 means the teacher was deleted mid-request, and in `add` it can mean the class was deleted, so the client gets a misleading message (and a 404 naming the wrong entity). *(correctness)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Pass the context into `translate` (or check `e.meta.constraint`/field name: `ClassSubject_classId_fkey`, `_subjectId_fkey`, `_teacherId_fkey`) and return the matching message, e.g. NOT_A_TEACHER for the teacher FK and CLASS_NOT_FOUND for the class FK.

### Low (1)
- **backend/src/classes/class-subjects.service.ts:70** — `assertClassExists` (and the `translate` pattern) is duplicated from `sections.service.ts`; two copies of the same existence check will drift. *(maintainability)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Consider a shared helper or a small shared class-lookup in `ClassesService`; low impact, so fine to defer.

## Reviewed files
- .code-reviews/brainx-review.md (deleted, replaced by this review)
- backend/prisma/migrations/20261013075328_add_subject_class_subject/migration.sql
- backend/prisma/schema.prisma
- backend/src/app.module.ts
- backend/src/classes/class-subjects.controller.ts
- backend/src/classes/class-subjects.service.ts
- backend/src/classes/class-subjects.spec.ts
- backend/src/classes/classes.module.ts
- backend/src/classes/dto/class-subject.dto.ts
- backend/src/subjects/dto/subject-name.dto.ts
- backend/src/subjects/subjects.controller.ts
- backend/src/subjects/subjects.module.ts
- backend/src/subjects/subjects.service.ts
- backend/src/subjects/subjects.spec.ts
- backend/src/users/users.service.ts
- tickets/STATUS.md
- tickets/T-016.md

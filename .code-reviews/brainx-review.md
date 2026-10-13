---
diff_hash: bc33e1810dc234bff07a93a8208883621d29d57d453b2ef8e00b0cb02402a750
reviewed_at: 2026-10-13T07:06:44Z
---

## Summary

Docs/ticket-only change: adds UC-22 to UC-25 and tickets T-026 to T-031 (subject rename/delete, class-delete cascade, timetable validation, Parent role block), and updates T-016/T-020/T-022/T-023/T-024 to match. Stack detected: NestJS + React (monorepo). No application code changed. One generated build artifact is tracked. Several ticket dependency lists are incomplete.

## Findings

### Critical (0)

### High (0)

### Medium (3)
- **tickets/T-022.md:3** — T-022 gains AC-23.2/AC-23.4, which need the class-delete endpoint from T-028, but "Depends on" is still only T-021. A build run in dependency order could attempt T-022 before T-028 exists. *(consistency)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Add T-028 to T-022's Depends on. The same applies to T-024 (AC-23.3 needs T-028) and T-023 (AC-22.1 needs T-026).
- **tickets/T-023.md:17** — AC-16.3 says "the fixed schedule table above", but T-023 contains no such table. The table is in T-020's technical notes, so the reference is dangling for the verifier and implementer. *(correctness)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Inline the 7-row schedule in T-023 or reference T-020 explicitly. Also reword the "above" in T-020:10, where the table is below the DoD.
- **tickets/T-024.md:3** — T-024 and T-031 reference each other's `@Roles('teacher','student')` change, and T-024's DoD has no test for admin/parent returning 403 on `GET /timetable/me`. The admin behaviour was changed from "empty or 404" to 403 only in a technical note. *(consistency)*
  - status: open
  - dev_reasoning: N/A
  - ai_reasoning: Pick one owner. Either make the admin 403 an explicit AC in T-024, or leave it entirely to T-031 and drop the "fine to apply here" note.

### Low (1)
- **backend/tsconfig.build.tsbuildinfo:1** — Generated TypeScript incremental build cache is tracked in git and modified in this diff. It adds noise and causes merge conflicts. *(maintainability)*
  - status: skipped
  - dev_reasoning: Unstaged from this commit; it was only staged by the hook's `git add -A`. Untracking it and changing .gitignore is a separate repo-hygiene change that needs the owner's OK, so it is deferred.
  - ai_reasoning: Unstage it (`git restore --staged`), then `git rm --cached` it and add `*.tsbuildinfo` to backend/.gitignore.

## Reviewed files
- backend/tsconfig.build.tsbuildinfo (generated artifact)
- docs/plan.md
- docs/use-cases.md
- tickets/STATUS.md
- tickets/T-016.md, T-020.md, T-022.md, T-023.md, T-024.md
- tickets/T-026.md, T-027.md, T-028.md, T-029.md, T-030.md, T-031.md

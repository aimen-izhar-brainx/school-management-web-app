---
name: use-cases
description: Step 3. Write detailed, testable use cases and edge cases with the user. These become the Definition of Done and are used by the verifier. Use when the user runs /use-cases.
---

# Use Cases

You are a careful QA analyst and business analyst. Read `docs/brainstorm.md` and `docs/plan.md`. Do not write code.

## Why this matters
Every ticket, test, and verification is based on this file. If a behavior is not written here, it will not be tested.

## How to work
1. Go milestone by milestone. For each feature, draft use cases, then show them to the user and ask for corrections.
2. For every use case, actively look for edge cases: empty input, wrong input, very long input, duplicates, no internet, slow network, no permission, user not logged in, two users at the same time, deleted data, limits (0, 1, max).
3. Every acceptance criterion must be testable: a clear action and a clear, visible result. Bad: "works well". Good: "Shows error 'Email is required' under the email field".

## Format (use exactly this for each use case)

```
### UC-01: <short name>
- Actor: <role>
- Milestone: M1
- Preconditions: <what is true before>
- Main flow:
  1. ...
  2. ...
- Acceptance criteria (Definition of Done):
  - [ ] AC-01.1 Given <situation>, when <action>, then <result>
  - [ ] AC-01.2 ...
- Edge cases:
  - UC-01-E1: Given ..., when ..., then ...
  - UC-01-E2: ...
- Not included: <what this use case does not cover>
```

## Output
Write `docs/use-cases.md`. Start it with a table: UC ID / name / milestone / number of criteria / number of edge cases.

Ask the user to approve the whole file. End with: "Next step: run /make-tickets".

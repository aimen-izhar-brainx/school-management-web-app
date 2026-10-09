---
name: make-tickets
description: Step 4. Create small, ordered tickets from docs/plan.md and docs/use-cases.md. Use when the user runs /make-tickets.
---

# Make Tickets

Read `CLAUDE.md`, `docs/plan.md`, `docs/use-cases.md`.

## Rules
- One ticket = small piece of work (about half a day for a human developer).
- Every ticket links to the use case IDs, acceptance criteria and edge cases it must satisfy. Copy them word by word into the ticket.
- The first ticket (T-001) is always project setup: create the project, install the test tool, make one sample test pass.
- Order tickets so each one only depends on earlier tickets.
- Every AC and edge case in docs/use-cases.md must belong to at least one ticket. Check this at the end and report any missing ones.

## Ticket file format: `tickets/T-001.md`

```
# T-001: <title>
- Milestone: M1
- Depends on: none | T-00X
- Use cases: UC-01
## Goal
<one or two sentences>
## Definition of Done (copied from use cases)
- [ ] AC-01.1 ...
- [ ] UC-01-E1 ...
- [ ] All tests pass. Reviewer approved. Verifier passed.
## Technical notes
<files, components, API endpoints, data model parts>
```

## Also create `tickets/STATUS.md`

```
| Ticket | Title | Status | Tries | Note |
|---|---|---|---|---|
| T-001 | Project setup | TODO | 0 | |
```
Status values: TODO, IN-PROGRESS, DONE, BLOCKED.

Show the user the ticket list and ask them to review before running /build.

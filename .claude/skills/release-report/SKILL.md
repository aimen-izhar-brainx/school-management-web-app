---
name: release-report
description: Step 8. Prepare a product approval report for a finished milestone so the user can approve or send work back. Use when the user runs /release-report.
---

# Release Report

Read `docs/use-cases.md`, `tickets/STATUS.md`, and the ticket files. Run the full test suite.

Write `docs/release-report.md` with:
1. Milestone and date.
2. Coverage table: UC ID / criteria passed / edge cases passed / status.
3. Test results: total, passed, failed.
4. BLOCKED tickets and their open questions.
5. Known limits or risks.
6. "How to try it yourself": exact steps for the user to run the app and test the main flows by hand.

Then ask the user to test the app by hand and answer: Approve / Send back (with notes).
- If Send back: create new tickets for the notes (status TODO) and tell the user to run /build.
- Never mark the milestone approved yourself. Only the user approves.

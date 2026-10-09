---
name: plan
description: Step 2. Turn docs/brainstorm.md into a technical and delivery plan together with the user. Use when the user runs /plan.
---

# Plan

You are a senior software architect. Read `docs/brainstorm.md` and `CLAUDE.md` first. Do not write code.

## How to work
1. Propose a tech stack with a short reason for each choice. Prefer simple, popular, well-documented tools.
2. Propose the architecture: main parts (frontend, backend, database, external services) and how they connect.
3. Propose the data model: main entities and their fields.
4. Split the MVP into milestones (M1, M2, ...). Each milestone must give something the user can see and test.
5. Ask the user to confirm or change each part. One topic at a time.

## Output
When the user approves, write `docs/plan.md` with: Tech stack, Architecture (include a mermaid diagram), Data model, Milestones, Technical risks, Decisions log (decision + reason).

Then fill the "Project" section of `CLAUDE.md` (name, stack, run command, test command).

End with: "Next step: run /use-cases. This is the most important step."

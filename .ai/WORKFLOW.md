# Workflow

1. Read `AGENTS.md`.
2. Read `.ai/PROJECT_CONTEXT.md` and `.ai/TASK_STATE.md`.
3. Read only the additional relevant `.ai` file.
4. Inspect relevant source with targeted search.
5. Implement one bounded phase.
6. Run focused tests, then full gates.
7. Update TASK_STATE and affected context docs.
8. Inspect the diff and scan for secrets.
9. Commit and push the feature branch only when gates pass.
10. Never merge to main without explicit final release instruction.

Do not restate all project context in prompts. Prefer targeted diffs and concise reports. Add dependencies only for demonstrated need. Stop on unexpected worktree or remote state; never force-push or discard unrelated changes.

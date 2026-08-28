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
10. Promote a completed milestone only with explicit final release instruction.

## Release promotion

- Development occurs on feature branches; do not make development commits directly on `main`.
- Merge completed milestones into a temporary integration branch created from the current `origin/main`.
- Run the complete release gates on the integration branch. Only a passing, verified integration commit may advance `main`.
- Start new feature branches from the updated `origin/main` after promotion.
- Never force-push or push an unverified commit to `main`.

Do not restate all project context in prompts. Prefer targeted diffs and concise reports. Add dependencies only for demonstrated need. Stop on unexpected worktree or remote state; never force-push or discard unrelated changes.

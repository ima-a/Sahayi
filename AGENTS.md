# Sahayi contributor notes

- Always read `.ai/PROJECT_CONTEXT.md` and `.ai/TASK_STATE.md`, then only task-relevant `.ai` documents. Follow `.ai/WORKFLOW.md` for Git and verification; update TASK_STATE after a completed phase.
- Backend: `python -m pytest`; frontend: `cd frontend && npm run typecheck && npm test && npm run build`.
- Never persist PII. Do not add citizen inputs, sessions, cookies, browser storage, or telemetry without explicit approval.
- Never place secrets in frontend code or Git; use placeholders in `.env.example` only.
- Procedure facts must be deterministic and verified before they are shown to users.
- Do not commit, push, merge, pull, or rebase without explicit user instruction.
- Preserve unrelated working-tree changes.

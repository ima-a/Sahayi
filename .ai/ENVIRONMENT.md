# Environment

Verified runtimes: Python 3.14.7 and Node 25.2.1. System runtimes must not be changed automatically.

Backend manifest versions: FastAPI 0.141.1, OpenAI Python 3.0.0, Starlette 1.6.0, Uvicorn 0.40.0, HTTPX 0.28.1, pytest 9.1.1. Frontend manifest versions: React 19.2.8, React DOM 19.2.8, Vite 8.2.2, Vitest 4.1.11, TypeScript 6.0.2.

Install with `python3 -m venv .venv && . .venv/bin/activate && python -m pip install -e '.[test]'`, then `cd frontend && npm install`. Develop with `uvicorn sahayi_api.main:app --host 127.0.0.1 --port 8000 --reload` and `cd frontend && npm run dev`.

Run `python -m pytest`; `cd frontend && npm run typecheck && npm test && npm run build`. For a same-origin check, build the frontend then run Uvicorn on `127.0.0.1:8000` and request `/` and `/api/v1/health`.

`SAHAYI_DEV_FRONTEND_ORIGIN` permits one exact Vite development origin. `VITE_API_BASE_URL` selects the frontend development API base. `SAHAYI_KIOSK_INACTIVITY_SECONDS` defaults to 300 and is bounded to 60–1800 seconds; `SAHAYI_KIOSK_WARNING_SECONDS` defaults to 30 and is bounded to 10–120 seconds. Their safe effective values are public so the browser can enforce kiosk clearing. Optional server-only AI configuration is `OPENAI_API_KEY`, `SAHAYI_AGENT_ENABLED` (default false), fixed/allowlisted `SAHAYI_AGENT_MODEL=gpt-5.6-luna`, and bounded timeout, output, tool-round, concurrency, request-budget, and rate-window variables documented as placeholders in `.env.example`. Secrets and model/provider details remain server-only.

The source detector is invoked with `.venv/bin/python -m sahayi_api.procedure_tool monitor`; offline fixture mode is the default and returns non-zero for its demonstrated changed/unreachable cases. Live public-source retrieval is never part of application startup or hosted routes and requires both `--live` and `--acknowledge-live-public-source-check`. Use `--json` and an explicit `--output PATH` only when a bounded review artifact is intentionally needed; runtime reports are not tracked.

The production Docker build uses Python 3.14.7 for build/runtime and Node 25.2.1 only to compile the frontend. Render injects `PORT`; the container binds one Uvicorn process to `0.0.0.0` on that value, with `10000` as a local fallback. Deterministic Sahayi requires no secret. Optional AI later requires an `OPENAI_API_KEY` Render secret and deliberate `SAHAYI_AGENT_ENABLED=true`; cost/spend limits and provider retention settings must be reviewed by the owner first.

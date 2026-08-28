# Environment

Verified runtimes: Python 3.14.7 and Node 25.2.1. System runtimes must not be changed automatically.

Backend manifest versions: FastAPI 0.128.8, Uvicorn 0.40.0, HTTPX 0.28.1, pytest 9.0.2. Frontend manifest versions: React 19.2.8, React DOM 19.2.8, Vite 8.2.2, Vitest 4.1.11, TypeScript 6.0.2.

Install with `python3 -m venv .venv && . .venv/bin/activate && python -m pip install -e '.[test]'`, then `cd frontend && npm install`. Develop with `uvicorn sahayi_api.main:app --host 127.0.0.1 --port 8000 --reload` and `cd frontend && npm run dev`.

Run `python -m pytest`; `cd frontend && npm run typecheck && npm test && npm run build`. For a same-origin check, build the frontend then run Uvicorn on `127.0.0.1:8000` and request `/` and `/api/v1/health`.

`SAHAYI_DEV_FRONTEND_ORIGIN` permits one exact Vite development origin. `VITE_API_BASE_URL` selects the frontend development API base. Values and secrets do not belong in this document.

The production Docker build uses Python 3.14.7 for build/runtime and Node 25.2.1 only to compile the frontend. Render injects `PORT`; the container binds one Uvicorn process to `0.0.0.0` on that value, with `10000` as a local fallback. Sahayi requires no production secret or application environment variable for the current stateless demo.

# Development environment

The verified runtime is Python 3.14.7 and Node.js 25.2.1. Python dependencies are pinned in `pyproject.toml`; frontend dependencies are pinned in `frontend/package-lock.json`.

## Setup and run

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -e '.[test]'
npm --prefix frontend ci
```

Run the API and Vite frontend in separate terminals:

```bash
.venv/bin/python -m uvicorn sahayi_api.main:app --host 127.0.0.1 --port 8000 --reload
npm --prefix frontend run dev
```

The backend reads process environment variables and does not load `.env` automatically. `VITE_API_BASE_URL` and `SAHAYI_DEV_FRONTEND_ORIGIN` are for local development. See `.env.example` for the optional kiosk and server-side Groq settings. Never place real secrets in the example file.

## Common checks

```bash
.venv/bin/python -m pytest
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
.venv/bin/python -m tools.intent_model --check
.venv/bin/python -m sahayi_api.procedure_tool validate
.venv/bin/python -m sahayi_api.procedure_tool check-schema
```

Frontend prebuild copies and verifies the pinned, same-origin OCR assets and checks the form registry. `npm --prefix frontend run ocr:check` and `npm --prefix frontend run forms:check` run those integrity checks directly.

Source monitoring uses an offline fixture by default. Live retrieval is an explicit one-shot command requiring both `--live` and `--acknowledge-live-public-source-check`; it is not part of development startup or hosted API requests.

# Sahayi

Sahayi is a privacy-first local kiosk prototype for making government services easier to understand. It starts with a browser-only service finder: describe the service needed, confirm a deterministic suggestion from verified pack phrases, or browse all supported services. Raw text is not sent to the backend or stored. The current slice serves verified, versioned procedure guidance without accounts or stored citizen data.

The hackathon deliverable will be a hosted web demonstration of the intended kiosk experience. Project context and implementation decisions are in [`.ai/`](.ai/PROJECT_CONTEXT.md).

## Prerequisites

- Python 3.14+
- Node.js 20.19+ (or 22.12+) and npm

## Setup

Create and activate a virtual environment, then run `python -m pip install -e '.[test]'`. Install frontend packages with `cd frontend && npm install`.

Copy `.env.example` to `.env` only when configuration is needed. Never place secrets in it for this phase.

## Development

Start FastAPI with `uvicorn sahayi_api.main:app --host 127.0.0.1 --port 8000 --reload`. Start Vite with `cd frontend && npm run dev`. Open `http://127.0.0.1:5173`; it calls `http://127.0.0.1:8000/api/v1` during development.

## Testing and production build

Run `python -m pytest`, then `cd frontend && npm run typecheck && npm test && npm run build`, and finally `git diff --check`.

Validate procedure packs with `.venv/bin/python -m sahayi_api.procedure_tool validate`. Check generated-schema drift with `.venv/bin/python -m sahayi_api.procedure_tool check-schema`; regenerate it only after an intentional contract change with `.venv/bin/python -m sahayi_api.procedure_tool export-schema`.

After `npm run build`, run `uvicorn sahayi_api.main:app --host 127.0.0.1 --port 8000` and open `http://127.0.0.1:8000` for the same-origin production-style build.

## Render deployment

`Dockerfile` builds the Vite frontend and serves it with FastAPI as one same-origin, non-root container. `render.yaml` defines one free Render Docker Web Service from `feat/sahayi-deployment`, with `/api/v1/health` and manual deploys. In Render, create a Blueprint from this repository and branch, review the single service, deploy it, and complete the post-deployment checks in [`.ai/DEPLOYMENT.md`](.ai/DEPLOYMENT.md). No live URL is committed.

Sahayi is a hackathon prototype, not an official government service. It does not submit real applications, collect OTPs or payments, or integrate with government systems.

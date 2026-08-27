# Sahayi

Sahayi is a privacy-first local kiosk prototype for making government services easier to understand. This first slice has no citizen inputs, accounts, stored data, or procedure intelligence.

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

After `npm run build`, run `uvicorn sahayi_api.main:app --host 127.0.0.1 --port 8000` and open `http://127.0.0.1:8000` for the same-origin production-style build. No production deployment configuration is included.

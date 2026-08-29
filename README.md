# Sahayi

Sahayi is a privacy-first local kiosk prototype for making government services easier to understand in English, Hindi, and Malayalam. Its deterministic journey includes a browser-only service finder with a compact trained on-device intent classifier, verified procedures, closed-choice readiness, source-linked personalized checklists, synthetic preparation worksheets, and a clearly non-government demo submission/status timeline. An optional consent-gated AI guide can choose among seven verified local tools; it is disabled by default and never becomes the source of procedure facts.

English is the canonical verified guidance. Hindi and Malayalam are machine-assisted prototype translations of that already-validated content, require native-speaker and legal review before production use, and defer to the linked official source wording. Sahayi uses no runtime translation API, external translation resource, or external font.

The hackathon deliverable will be a hosted web demonstration of the intended kiosk experience. Project context and implementation decisions are in [`.ai/`](.ai/PROJECT_CONTEXT.md).

## Prerequisites

- Python 3.14+
- Node.js 20.19+ (or 22.12+) and npm

## Setup

Create and activate a virtual environment, then run `python -m pip install -e '.[test]'`. Install frontend packages with `cd frontend && npm install`.

Copy `.env.example` to `.env` only when configuration is needed. The complete deterministic application requires no OpenAI key. For an intentionally enabled local AI test, keep `OPENAI_API_KEY` server-only and set `SAHAYI_AGENT_ENABLED=true`; never place a real key in source or Git.

## Development

Start FastAPI with `uvicorn sahayi_api.main:app --host 127.0.0.1 --port 8000 --reload`. Start Vite with `cd frontend && npm run dev`. Open `http://127.0.0.1:5173`; it calls `http://127.0.0.1:8000/api/v1` during development.

## Testing and production build

Run `python -m pytest`, then `cd frontend && npm run typecheck && npm test && npm run build`, and finally `git diff --check`.

The local intent model uses no runtime ML dependency. Reproduce its canonical artifact/report with `python -m tools.intent_model --write`, check dataset/model digest and regeneration drift with `python -m tools.intent_model --check`, and inspect held-out synthetic metrics with `python -m tools.intent_model --evaluate`. See the [model card](docs/intent-model-card.md) for labels, provenance, metrics, privacy, ensemble behavior, retraining, and native-review limitations.

Validate procedure packs with `.venv/bin/python -m sahayi_api.procedure_tool validate`. Check generated-schema drift with `.venv/bin/python -m sahayi_api.procedure_tool check-schema`; regenerate it only after an intentional contract change with `.venv/bin/python -m sahayi_api.procedure_tool export-schema`.

Run the source-change demonstration with `.venv/bin/python -m sahayi_api.procedure_tool monitor` (offline fixture mode is the default). It intentionally demonstrates unchanged, quarantined change, and unreachable cases, so it exits non-zero. Live retrieval is not used by the hosted app and requires the explicit one-shot pair `--live --acknowledge-live-public-source-check`; it is restricted to active-pack allowlists and cannot update a pack. Production scheduling would require separate authorization and operational controls. Review reports contain bounded metadata, never full source content or citizen data.

After `npm run build`, run `uvicorn sahayi_api.main:app --host 127.0.0.1 --port 8000` and open `http://127.0.0.1:8000` for the same-origin production-style build.

## Render deployment

`Dockerfile` builds the Vite frontend and serves it with FastAPI as one same-origin, non-root container. `render.yaml` defines one free Render Docker Web Service from `feat/sahayi-deployment`, with `/api/v1/health` and manual deploys. In Render, create a Blueprint from this repository and branch, review the single service, deploy it, and complete the post-deployment checks in [`.ai/DEPLOYMENT.md`](.ai/DEPLOYMENT.md). No live URL is committed.

Sahayi is a hackathon prototype, not an official government service. It does not submit real applications, collect OTPs or payments, or integrate with government systems.

## Optional AI and synthetic assistance

“Ask Sahayi AI” requires a localized disclosure and affirmative memory-only consent. Sanitized bounded turns may then be processed by OpenAI using the Responses API with `gpt-5.6-luna`, low reasoning, strict local functions, `store: false`, no streaming, and explicit cost bounds. `store: false` is not represented as a Zero Data Retention guarantee. Missing configuration, privacy blocks, provider failures, malformed output, rate limits, or exhausted budgets return citizens to deterministic guidance. The dependency-free process-local limiter is a prototype control, not distributed production abuse protection.

Form assistance and demo submission/status use bundled fictional DEMO personas only. The worksheet is prominently watermarked, and the deterministic status timeline uses only obvious `DEMO-...` references. Sahayi never fills a live site, generates a server file, contacts a government system, submits or tracks an application, or accepts citizen free-text PII for the demo.

The persistent End session control aborts frontend requests and clears all Sahayi citizen workflow state from memory. The same clearing boundary runs after a localized inactivity warning (five-minute default). It does not claim control over browser, network, or optional provider retention outside Sahayi. No cookies or browser storage are used. Voice remains unimplemented.

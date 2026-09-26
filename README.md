# Sahayi

Sahayi is a multilingual prototype that helps people prepare for selected public services. It explains verified procedures, asks structured readiness questions, builds a reviewable preparation sheet, and points to the official service channel.

**Demo:** [sahayi.onrender.com](https://sahayi.onrender.com)

## Supported services

- UIDAI Aadhaar address update
- Kerala Indira Gandhi National Old Age Pension (preliminary guidance)

The service finder and preparation flow work locally in the browser. English is the canonical guidance language. Hindi and Malayalam are machine-assisted prototypes that need native-speaker and legal review.

## What the prototype does

1. Suggests a supported service from a short description and asks the user to confirm it.
2. Provides source-linked steps and deterministic readiness guidance.
3. Keeps preparation values in browser memory and creates a watermarked preparation worksheet for review.
4. Offers optional document text assistance in the browser and optional GroqCloud guidance with explicit consent.
5. Opens the verified official handoff for the user to continue independently.

Sahayi is not a government service. It does not determine legal eligibility, submit applications, handle OTPs or payments, or retrieve real application status. The readiness result is guidance only. No official PDF form is enabled; generated worksheets are marked `DEMO — NOT FOR SUBMISSION`.

## Repository layout

```text
.
├── docs/                  Project architecture, privacy, and model documentation
├── form-registry/         Reviewed form-availability manifests
├── frontend/              React, TypeScript, and build tools
├── intent-model/          Synthetic training data and generated classifier
├── procedure-packs/       Versioned service guidance and JSON Schema
├── src/sahayi_api/        FastAPI application and deterministic services
├── tests/                 Python backend tests
│   └── browser/           Manual Chromium browser smoke scripts
└── tools/                 Offline intent-model tooling
```

See the [documentation index](docs/README.md) for details.

## Run locally

Verified development runtimes are Python 3.14 and Node.js 25.2.1.

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -e '.[test]'
npm --prefix frontend ci
```

Start the API and frontend in separate terminals:

```bash
.venv/bin/python -m uvicorn sahayi_api.main:app --host 127.0.0.1 --port 8000 --reload
```

```bash
npm --prefix frontend run dev
```

Open `http://127.0.0.1:5173`. Optional cloud guidance is disabled unless the server is configured with `SAHAYI_AGENT_ENABLED=true` and a server-side `GROQ_API_KEY`. See [.env.example](.env.example) for available settings. Never put provider secrets in frontend configuration.

## Quality checks

```bash
.venv/bin/python -m pytest
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
.venv/bin/python -m tools.intent_model --check
.venv/bin/python -m sahayi_api.procedure_tool validate
.venv/bin/python -m sahayi_api.procedure_tool check-schema
npm --prefix frontend run forms:check
```

The browser smoke scripts in `tests/browser/` require a running app and a Chromium DevTools Protocol endpoint. They are manual integration checks, separate from the automated unit-test commands above.

## Deployment

The Docker image serves the compiled frontend and FastAPI from one same-origin service. `render.yaml` describes the Render service; auto-deploy is disabled, so publishing requires the project's verified release process and an authorized manual deployment.

## Documentation

- [Architecture](docs/architecture.md)
- [Privacy and safety](docs/privacy-boundary.md)
- [Local intent model card](docs/intent-model-card.md)
- [Procedure Packs](procedure-packs/README.md)
- [Deployment operations](docs/deployment.md)

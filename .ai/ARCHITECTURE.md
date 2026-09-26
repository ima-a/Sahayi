# Engineering architecture notes

Use [docs/architecture.md](../docs/architecture.md) as the maintained architecture reference.

Implementation entry points:

- `frontend/src/App.tsx` — primary conversation and browser-memory workflow
- `frontend/src/conversation.ts` — local conversation state and API events
- `frontend/src/localIntent.ts` and `frontend/src/matcher.ts` — browser-local service matching
- `frontend/src/documentOcr.ts` — optional browser-local document extraction
- `src/sahayi_api/main.py` — FastAPI routes and static frontend serving
- `src/sahayi_api/orchestration.py` — stateless conversation graph
- `src/sahayi_api/procedures.py` — Procedure Pack loading and validation
- `procedure-packs/packs/` — versioned service facts and rules

Keep citizen values inside the browser. Server workflow state may contain only validated service and field identifiers, closed-choice answers, and explicitly confirmed document clue categories. Procedure Packs remain authoritative for facts and outcomes. Do not add persistence, telemetry, or new external calls without an explicit product decision.

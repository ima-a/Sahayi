# Frontend API reference

The frontend calls the versioned FastAPI routes in `src/sahayi_api/main.py`. Production requests are same-origin. API responses use `Cache-Control: no-store`; there is no server-side citizen session.

| Route | Purpose |
| --- | --- |
| `GET /api/v1/health` | Service health check |
| `GET /api/v1/public-config` | Safe feature availability and kiosk timing configuration |
| `GET /api/v1/procedures` | Active catalogue used by local matching |
| `GET /api/v1/procedures/{service_id}` | Source-linked procedure guidance |
| `POST /api/v1/procedures/{service_id}/readiness/evaluate` | Deterministic readiness evaluation |
| `POST /api/v1/procedures/{service_id}/checklist` | Deterministic checklist |
| `POST /api/v1/procedures/{service_id}/synthetic-form-assistance` | Synthetic persona worksheet |
| `POST /api/v1/procedures/{service_id}/demo-submission` | Synthetic demo journey |
| `POST /api/v1/procedures/{service_id}/demo-status` | Synthetic demo status |
| `POST /api/v1/conversation/turn` | Primary stateless guided conversation |
| `POST /api/v1/assistant/turn` | Optional consent-gated AI guidance |

## Data contract

The browser sends only validated service, question, field, and document-clue IDs; bounded closed-choice answers; and structural journey state. Personal preparation values, files, filenames, raw OCR, and local finder text are not API fields. Only the explicit cloud-clarification event accepts screened message text, and the optional route accepts bounded screened conversation text after consent.

The server revalidates all IDs and answers against the current active Procedure Pack. It computes procedure facts, readiness, checklists, preparation definitions, and official handoff locally. Citizen values remain in the browser and are overlaid only in the local worksheet.

The authoritative request/response models are the Pydantic models in `src/sahayi_api/`. Keep this document at overview level; update it if routes or privacy boundaries change.

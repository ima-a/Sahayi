# Architecture

The implemented frontend is React/TypeScript/Vite; the backend is FastAPI. Development uses loopback Vite and API servers. A production build is served by FastAPI so the browser uses same-origin API paths.

Local kiosk mode and a future hosted web-demo mode share this application shape. React fetches `/api/v1/health`, `/api/v1/public-config`, and the read-only `/api/v1/procedures` catalogue/detail resources. FastAPI returns JSON with no-store headers. No citizen data is collected or stored; all client state is ephemeral.

Procedure facts cross one deterministic boundary: JSON files under `procedure-packs/packs/` are validated by strict Pydantic Procedure Pack v1 models, checked for version/lifecycle/provenance consistency, assigned a canonical SHA-256 digest, and loaded into an active read-only registry. API routes and the frontend never read pack files directly. Draft and superseded packs are excluded; multiple active versions, invalid packs, or no active packs fail closed. Freshness is computed at response time from `review_due_at`, so expired guidance is returned as stale rather than current. Conflicting official fee claims remain structured, source-linked facts with no canonical amount; a derived attention flag exposes that conflict independently of freshness, allowing unaffected verified guidance to remain available.

Future boundaries are a deterministic rule engine and privacy gateway. Cryptographic signing is deliberately deferred; the current digest provides traceability, not authenticity. Durable data is limited to verified source packs and build artifacts; workflow state is ephemeral. See [architecture](../docs/architecture.md) and the [privacy boundary](../docs/privacy-boundary.md) for details.

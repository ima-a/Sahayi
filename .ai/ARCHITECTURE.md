# Architecture

The implemented frontend is React/TypeScript/Vite; the backend is FastAPI. Development uses loopback Vite and API servers. A production build is served by FastAPI so the browser uses same-origin API paths.

Local kiosk mode and a future hosted web-demo mode share this application shape. Current flow: React fetches `/api/v1/health` and `/api/v1/public-config`; FastAPI returns JSON with no-store headers. No citizen data is collected or stored; all current client state is ephemeral.

Future boundaries are a verified procedure-pack loader, deterministic rule engine, and privacy gateway. Durable data is limited to source and build artifacts; workflow state is ephemeral. See [architecture](../docs/architecture.md) and the [privacy boundary](../docs/privacy-boundary.md) for details.

# Architecture

Sahayi currently consists of a React/TypeScript kiosk screen and a FastAPI API. In development, Vite runs at `127.0.0.1:5173` and FastAPI at `127.0.0.1:8000`; FastAPI permits CORS only from that exact configured Vite origin. The React client calls the versioned `/api/v1` API.

For a local production-style run, Vite builds static files to `frontend/dist` and FastAPI serves that directory, including the root kiosk screen. Browser requests then use same-origin `/api/v1` paths. API responses are JSON with `Cache-Control: no-store`.

There is no database, session store, user data store, procedure-pack reader, external AI service, or deployment setup in this phase.

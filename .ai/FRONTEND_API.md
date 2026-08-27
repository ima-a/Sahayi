# Current frontend API

`GET /api/v1/health` returns `{"status":"ok"}`. `GET /api/v1/public-config` returns `{"application_name":"Sahayi","kiosk_mode":true}`. Both return JSON with `Cache-Control: no-store`.

Errors are generic JSON errors with no stack trace or environment detail. Development CORS permits only the exact configured Vite origin; production uses same-origin `/api/v1` requests. Public config must never contain secrets or citizen data.

Future endpoints are not implemented; do not infer their contracts.

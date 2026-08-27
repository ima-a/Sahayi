# Current frontend API

`GET /api/v1/health` returns `{"status":"ok"}`. `GET /api/v1/public-config` returns `{"application_name":"Sahayi","kiosk_mode":true}`. Both return JSON with `Cache-Control: no-store`.

`GET /api/v1/procedures` returns `{ procedures: ProcedureSummary[] }`. A summary contains `service_id`, English `title`, English `short_description`, `category`, `interaction_modes`, `official_publisher`, `pack_version`, ISO 8601 `last_verified_at`, ISO 8601 `review_due_at`, and `trust_state` (`current` or `stale`). Only active validated packs are listed; procedure facts and handoff URLs are not included in summaries.

`GET /api/v1/procedures/{service_id}` returns one `ProcedureDetail` with:

- identity/trust: `service_id`, `title`, `short_description`, `category`, `jurisdiction`, `department`, `official_publisher`, `interaction_modes`, `pack_version`, `pack_digest`, `last_verified_at`, `review_due_at`, and `trust_state`;
- guidance: cited `requirements`, cited `required_documents`, `fee`, ordered cited `steps`, cited `submission_channels`, optional cited `tracking_guidance`, and cited `limitations`;
- handoff/provenance: HTTPS `official_handoff_url`, official `sources`, and the fact-key-to-source-ID `provenance` map.

Nested cited records include stable IDs, plain-text guidance, and non-empty `source_ids`. Fee contains decimal-string-or-null `amount`, three-letter `currency`, plain-text `statement`, `qualifiers`, and `source_ids`. Source records contain `source_id`, `publisher`, `title`, HTTPS `url`, `retrieved_at`, optional `official_updated_date`, optional recorded `sha256`, and `source_type` (`webpage` or `pdf`).

An unknown service returns `404 {"error":"Procedure not found"}`. An unavailable/invalid active registry returns `503 {"error":"Procedure guidance is unavailable"}`. Errors are generic JSON with no stack trace, filesystem path, or environment detail. All API responses retain `Cache-Control: no-store`. Development CORS permits only the exact configured Vite origin; production uses same-origin `/api/v1` requests. Public config and procedure responses must never contain secrets or citizen data.

No write, submission, OTP, status-tracking, or personalised endpoints are implemented; do not infer their contracts.

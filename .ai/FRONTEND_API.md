# Current frontend API

`GET /api/v1/health` returns `{"status":"ok"}`. `GET /api/v1/public-config` returns `{"application_name":"Sahayi","kiosk_mode":true}`. Both return JSON with `Cache-Control: no-store`.

`GET /api/v1/procedures` returns `{ procedures: ProcedureSummary[] }`. A summary contains `service_id`, English `title`, English `short_description`, `category`, `interaction_modes`, `official_publisher`, `pack_version`, ISO 8601 `last_verified_at`, ISO 8601 `review_due_at`, `trust_state` (`current` or `stale`), and boolean `attention_required`. The attention flag is derived from unresolved structured fact conflicts and is independent of freshness. Only active validated packs are listed; procedure facts and handoff URLs are not included in summaries.

`GET /api/v1/procedures/{service_id}` returns one `ProcedureDetail` with:

- identity/trust: `service_id`, `title`, `short_description`, `category`, `jurisdiction`, `department`, `official_publisher`, `interaction_modes`, `pack_version`, `pack_digest`, `last_verified_at`, `review_due_at`, `trust_state`, and `attention_required`;
- guidance: cited `requirements`, cited `required_documents`, `fee`, ordered cited `steps`, cited `submission_channels`, optional cited `tracking_guidance`, and cited `limitations`;
- handoff/provenance: HTTPS `official_handoff_url`, official `sources`, and the fact-key-to-source-ID `provenance` map.

Nested cited records include stable IDs, plain-text guidance, and non-empty `source_ids`. Fee contains `verification_status` (`confirmed`, `conflicting`, `free`, or `not_stated`), canonical decimal-string-or-null `amount`, canonical three-letter-or-null `currency`, `display_message`, `claims`, optional `resolution_guidance`, and aggregate `source_ids`. Each claim contains its decimal-string `amount`, three-letter `currency`, plain-text `qualifier`, and `source_ids`. A conflicting fee has null canonical amount/currency, at least two differently valued claims, and resolution guidance; a confirmed fee has agreeing claims and a canonical amount/currency. `attention_required` is true for a conflicting fee in both summary and detail responses. Source records contain `source_id`, `publisher`, `title`, HTTPS `url`, `retrieved_at`, optional `official_updated_date`, optional recorded `sha256`, and `source_type` (`webpage` or `pdf`).

An unknown service returns `404 {"error":"Procedure not found"}`. An unavailable/invalid active registry returns `503 {"error":"Procedure guidance is unavailable"}`. Errors are generic JSON with no stack trace, filesystem path, or environment detail. All API responses retain `Cache-Control: no-store`. Development CORS permits only the exact configured Vite origin; production uses same-origin `/api/v1` requests. Public config and procedure responses must never contain secrets or citizen data.

`POST /api/v1/procedures/{service_id}/readiness/evaluate` accepts exactly `{ "answers": { question_id: boolean | integer | option_id } }`. The answer map is bounded, unknown fields and question IDs are rejected, and every value is strictly revalidated against the active pack. Strings are never coerced into booleans or integers. The endpoint is stateless, performs no retry or external call, does not log or echo answers, and returns generic `404`, `422`, or `503` errors.

The readiness response contains `pack_version`, `pack_digest`, `evaluation_status`, `complete`, adaptive `progress`, the next applicable question or resolved outcome, a stable-ID `reason_trace`, the official source records used by that state, recommended next steps, an HTTPS official handoff, and a non-approval disclaimer. An incomplete response contains one question with its English prompt/help, answer type, permitted options or numeric bounds, and required flag. A complete outcome status is `ready`, `alternative_path`, `needs_information`, or `cannot_confirm`. The frontend keeps its answer map and Back history in React memory only and sends the complete map on each evaluation.

No official write, submission, OTP, status-tracking, database, session, or citizen free-text endpoint is implemented; do not infer those contracts.

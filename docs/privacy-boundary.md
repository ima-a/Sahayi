# Privacy and safety boundary

Sahayi minimizes citizen data by separating local service discovery, deterministic procedure APIs, optional consent-gated cloud processing, and offline administration.

## What remains in browser memory

The raw service-search query and local inference result never leave the browser. Language, selection, readiness answers/history, checklist, worksheet/persona, synthetic demo reference/status, optional-agent consent and conversation, and navigation state live in React memory. Sahayi does not add cookies, `localStorage`, `sessionStorage`, IndexedDB, Cache API, a service worker, analytics, telemetry, or browser-persisted citizen state.

The local finder blocks obvious Aadhaar-, Indian-phone-, email-, and numbered-address-shaped values before matching. This is a warning gate, not a guarantee that every personal detail can be recognized. Citizens are instructed not to enter identifiers or private details.

## What reaches FastAPI

Deterministic routes receive only the current locale, allowlisted service/persona/scenario/status IDs, and bounded closed-choice readiness answers. They do not accept names, addresses, account numbers, documents, exact financial values, arbitrary form text, OTPs, payment data, or real application references. Requests are validated, processed without a durable session, and not logged by Sahayi. API responses use `Cache-Control: no-store`.

The synthetic worksheet leaves private fields blank. Demo submission/status accepts only predefined fictional values and obvious `DEMO-...` references. No government endpoint is contacted.

## Optional cloud processing

The assistant is disabled unless a server flag and server-only Groq key are both configured. Before use, the UI names GroqCloud, explains that a minimized identifier-screened message and up to four memory-only turns may be processed there, and requires affirmative consent. Browser and backend gates screen the current message and prior turns for common identifier shapes. The API does not accept files, arbitrary metadata, or real references.

Groq documents that usage metadata is always collected and says inference customer data is not retained by default except for limited reliability/abuse purposes; an organization owner may separately enable Zero Data Retention in Groq Console Data Controls. Sahayi does not set, verify, or guarantee that account setting and does not claim control over retention or logging by the browser, network, hosting platform, or Groq. Account data controls, access controls, spend/rate limits, model permission, and applicable terms require owner review before enabling the feature.

The Groq key, internal prompts, raw provider output, provider IDs, and tool arguments remain server-side and are not returned through public configuration or assistant responses. Public configuration may identify the selected provider/model and whether the feature is available. Sahayi does not log answer bodies, raw agent prompts, provider output, or citizen messages.

## Clearing and session end

**End session** aborts tracked requests, invalidates late responses, revokes tracked object URLs, clears every in-memory citizen workflow state, and returns to the localized welcome screen. The same clearing operation runs after the bounded inactivity warning expires; restoring a hidden tab recomputes elapsed time. Language changes and Start Over also clear relevant state.

This confirmation covers Sahayi's own in-memory state only. It does not promise erasure from browser/network/provider infrastructure outside Sahayi's control.

## Durable and administrative data

Durable repository data is limited to source code, static UI copy, versioned Procedure Packs, generated schema/model artifacts, owned synthetic datasets/evaluations, and an offline monitoring fixture. There is no citizen database. Offline monitoring compares official-source fingerprints and emits bounded administrative review metadata; it is not continuous, hosted, autonomous, or citizen-facing.

## Safety rules and limitations

- Procedure Packs and deterministic rules—not AI—decide displayed facts and readiness outcomes.
- Every local service proposal requires confirmation. Readiness is not eligibility, approval, submission, or legal advice.
- Conflicting official facts remain visible and source-linked rather than silently resolved.
- Hindi and Malayalam are machine-assisted prototypes pending native/legal review.
- Only synthetic model evaluation and demo personas are included; no real-world accuracy or production claim is made.
- Real submission/status, government authentication, OTP/payment, voice, file upload, analytics, and telemetry are absent.

Any future collection, persistence, third-party integration, or telemetry requires an explicit privacy design, retention decision, threat review, and user approval before implementation.

# Sahayi project context

Sahayi addresses the citizen problem of not knowing which department, scheme, channel, or sequence applies to a need. The final hackathon release candidate is a publicly demonstrable, privacy-first multilingual conversation: it starts from the person's need, proposes one of two supported services locally, requires confirmation, asks only the next deterministic question, prepares available guidance automatically, and hands off to a verified official channel.

The implemented release supports UIDAI Aadhaar address update and Kerala Indira Gandhi National Old Age Pension in English, Hindi, and Malayalam. English is canonical. Hindi/Malayalam UI, Procedure Pack text, and synthetic intent examples are machine-assisted prototypes pending native-speaker and legal review.

Architecture boundaries:

- Browser-local inference combines deterministic pack phrases with a bundled character 2–5-gram Multinomial Naive Bayes classifier; raw finder text is not sent online.
- A browser-memory conversation orchestrator composes intent confirmation, verified procedure routing, deterministic readiness, automatic checklist/synthetic preparation, and official handoff without adding a session API.
- FastAPI serves the React build and stateless deterministic Procedure Pack, readiness, checklist, synthetic worksheet, and demo status APIs from one same-origin container.
- Optional GroqCloud guidance is separately disclosed, consent-gated, unavailable without server configuration, and limited to strict local tools; AI never supplies authoritative facts or outcomes.
- Procedure Intelligence is an offline-first, one-shot, human-reviewed source comparison CLI, optionally invoked by a read-only daily GitHub Actions workflow; it is not hosted citizen functionality or automatic fact activation.
- Browser-dependent voice input/read-aloud is explicit, memory-only, and always paired with complete text/touch fallback; recognition may use browser/vendor processing.
- Citizen workflow state is memory-only and cleared by End Session/inactivity. No citizen database, cookies, browser storage, analytics, or telemetry exists.

The public demo is https://sahayi.onrender.com, but it remains on the older deployed release until a separately authorized deployment and hosted verification. The release-candidate branch is `release/sahayi-submission-2026-08-29`; `main` and `feat/sahayi-deployment` remain on the older release during candidate preparation.

Non-goals and limitations: government affiliation/endorsement, legal eligibility decisions, real forms/submission/status, OTP/payment, DigiLocker, certified voice/pronunciation or complete accessibility, production readiness, certified translation, automatic fact activation, verified real-world model accuracy, universal external-provider non-retention, or a Zero Data Retention claim. The UIDAI fee conflict remains unresolved and source-linked; the Kerala pension amount is omitted. Procedure facts must remain deterministic and verified before display.

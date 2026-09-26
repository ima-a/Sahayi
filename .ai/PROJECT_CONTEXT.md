# Project context

Sahayi is a multilingual hackathon prototype for preparing applications to two supported services: UIDAI Aadhaar address update and Kerala Indira Gandhi National Old Age Pension preliminary guidance.

## Current behavior

- React and TypeScript provide the conversation-first browser experience in English, Hindi, and Malayalam.
- The browser proposes services using pack-authored phrases and a bundled synthetic-data Naive Bayes model. The user confirms every proposed service.
- FastAPI and a stateless LangGraph serve deterministic, source-linked procedures, readiness guidance, checklists, worksheet definitions, and official handoff.
- Personal values, conversation state, documents, OCR text, and voice transcripts remain in browser memory. No citizen database, browser storage, analytics, or telemetry is implemented.
- Optional OCR and voice features are browser enhancements. Optional GroqCloud help is consent-gated and disabled unless configured on the server.
- Procedure monitoring is a bounded one-shot review workflow. It does not change or activate facts.

## Product limits

Sahayi is not a government service or eligibility authority. It does not submit applications, handle OTPs or payments, or retrieve real status. No official PDF is enabled; worksheets are marked `DEMO — NOT FOR SUBMISSION`. English is canonical. Hindi and Malayalam are machine-assisted prototypes that need native-speaker and legal review.

See the public [architecture](../docs/architecture.md) and [privacy boundary](../docs/privacy-boundary.md) for the maintained system description.

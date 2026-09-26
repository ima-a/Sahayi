# Privacy and safety

Sahayi keeps the citizen's preparation workflow in the browser and sends only the structured data needed for deterministic guidance.

## Browser data

Conversation history, finder text, preparation values, checklist, document contents, filenames, OCR text, and voice transcripts are held in React memory. Sahayi does not add citizen storage, cookies, analytics, or telemetry. Start Over, End Session, language changes, navigation, and inactivity clearing remove the active in-memory journey.

The finder checks for common identifier patterns before matching. This is a limited safeguard, not a guarantee that all personal information will be recognized.

## API data

Deterministic requests contain allowlisted service and field IDs, closed-choice readiness answers, completed-field IDs, and, when relevant, a citizen-confirmed document clue category. They do not contain personal preparation values, uploaded files, filenames, or raw OCR text. Responses are not cached. The API does not create durable sessions or store citizen data.

The optional GroqCloud path is separate. It requires explicit consent and server configuration, and sends a bounded, screened message with limited conversation history. The server-side key and provider internals are not sent to the browser. Groq documents usage metadata collection; Sahayi does not configure or guarantee the provider account's retention settings.

## Local voice and document assistance

Voice recognition starts only after a user action. Browser or vendor processing may be involved; Sahayi does not promise that recognition stays on-device.

Document text assistance supports selected image and PDF formats using same-origin assets. Files and OCR results remain in the browser. Results are uncertain clues, require user confirmation, and do not authenticate a document or verify a government record.

## Guidance limits

- Procedure Packs and deterministic rules provide the service facts and readiness outcomes.
- Readiness is preliminary guidance, not eligibility, approval, legal advice, or submission.
- Sahayi does not submit applications, handle OTPs or payments, or retrieve real application status.
- English is canonical. Hindi and Malayalam are machine-assisted prototypes awaiting native-speaker and legal review.
- Sahayi is not affiliated with or endorsed by UIDAI, the Government of Kerala, or another government body.

See [architecture](architecture.md) for the request flow and [Procedure Packs](../procedure-packs/README.md) for source and version controls.

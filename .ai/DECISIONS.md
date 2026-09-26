# Current decisions

These decisions describe the current prototype. Update this file when the product or trust boundary changes.

| Area | Decision |
| --- | --- |
| Supported services | Keep scope to UIDAI Aadhaar address update and Kerala old-age pension preliminary guidance. |
| Procedure facts | Serve facts, rules, and sources from validated, versioned Procedure Packs. Keep conflicts visible and do not infer unsupported values. |
| Readiness | Provide procedural guidance only; never claim eligibility, approval, or legal advice. |
| Intent matching | Run the phrase matcher and synthetic-data classifier in the browser; require confirmation before opening a service. |
| Citizen data | Keep conversation, personal values, documents, and preparation state in browser memory. Do not add storage or telemetry. |
| Cloud AI | Keep GroqCloud optional, explicitly consent-gated, server-configured, and subordinate to deterministic facts and outcomes. |
| Documents | Run optional OCR locally. Treat output as an unverified clue that needs citizen confirmation. |
| Forms | Generate only a watermarked preparation worksheet until a reviewed official form artifact and mapping are available. |
| Localization | Keep English canonical. Treat Hindi and Malayalam as machine-assisted prototypes pending native and legal review. |
| Source monitoring | Keep monitoring bounded and review-only. Never let it modify or activate facts. |
| Deployment | Serve the frontend and API from one same-origin container. Keep auto-deploy disabled and release only through an explicitly authorized process. |

# Decision ledger

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-08-28 | React, TypeScript, and Vite frontend | Small typed kiosk UI foundation. |
| 2026-08-28 | FastAPI and Pydantic backend | Typed, minimal versioned API. |
| 2026-08-28 | Same-origin production delivery | Limits browser cross-origin exposure. |
| 2026-08-28 | In-memory citizen workflow state | No persistent citizen data. |
| 2026-08-28 | No database for citizen data | Privacy-first MVP boundary. |
| 2026-08-28 | Deterministic eligibility and procedure facts | Facts must be verified and reproducible. |
| 2026-08-28 | Cloud AI optional and disabled by default | Explanation must not decide outcomes. |
| 2026-08-28 | Public hackathon deployment with synthetic-data guidance | Demonstrate safely without real citizen data. |
| 2026-08-28 | Push feature branches only after verification | Preserve a verified checkpoint. |
| 2026-08-28 | Protect main from direct feature work | Keep release integration explicit. |
| 2026-08-28 | JSON Procedure Pack v1 validated by strict Pydantic models | Deterministic contracts and tooling without another parser dependency. |
| 2026-08-28 | Every important procedure fact carries official-source provenance | Unsupported or dangling facts fail validation before reaching citizens. |
| 2026-08-28 | One active version per service; draft and superseded versions are never served | Version selection is explicit and fails closed. |
| 2026-08-28 | Canonical SHA-256 pack digest, with cryptographic signing deferred | Provide reproducible traceability now without introducing private-key operations in the MVP. |
| 2026-08-28 | Procedure trust becomes stale after its review deadline | Expired verification remains visible but is never silently presented as current. |
| 2026-08-28 | Represent conflicting official-source claims explicitly | Preserve each authoritative claim and its provenance instead of selecting a value without evidence. |
| 2026-08-28 | Never silently resolve conflicting authoritative claims | Direct citizens to confirm on the official service when Sahayi cannot establish one canonical fact. |
| 2026-08-28 | Keep review freshness and factual conflict as separate states | Current unaffected guidance can remain available while a specific unresolved fact receives attention. |
| 2026-08-28 | Use “readiness check” rather than eligibility terminology | Outcomes are personalised procedural guidance and never an official decision or approval. |
| 2026-08-28 | Encode readiness rules as a strict bounded JSON AST | Deterministic operators, load-time validation, and evaluation budgets avoid executable expressions and unbounded work. |
| 2026-08-28 | Keep readiness evaluation stateless | Each request carries a bounded answer map; no session, database, answer logging, or external call is required. |
| 2026-08-28 | Permit only non-sensitive structured readiness questions | Boolean, enumerated choice, and bounded integer answers preserve the no-PII boundary; free text and identifiers are excluded. |
| 2026-08-28 | Permit pack-labelled sensitive closed-choice readiness questions | Income, pension, and tax categories can provide useful preliminary guidance without exact values or identifiers; they require a privacy explanation and an optional withheld choice, remain memory/request only, and are never logged. |
| 2026-08-28 | Keep subjective and intrusive Kerala pension criteria outside automated screening | Respectful source-cited local-body review items preserve the official conditions without asking about or inferring personal circumstances. |
| 2026-08-28 | Omit Kerala pension amount pending a resolving official order | The reviewed Sevana criteria page presents inconsistent current-table, history, and special-amount material; no amount is needed for safe procedure guidance. |
| 2026-08-28 | Keep natural-language service matching entirely in the browser | Raw citizen text never leaves component memory: no API, URL, logging, telemetry, cookie, or browser persistence is used. |
| 2026-08-28 | Use deterministic English-only scoring over pack-authored intent phrases | NFKC normalisation, containment, weighted token overlap, threshold, and candidate margin are reproducible and avoid model calls or service-specific code. |
| 2026-08-28 | Require confirmation after every suggested service | A match is guidance for navigation, not an automatic selection or service decision. |
| 2026-08-28 | Locally warn on obvious identifier patterns before matching | Aadhaar-like, phone-like, and email patterns are blocked without retaining their value; this limited detector is not a guarantee of complete PII removal. |

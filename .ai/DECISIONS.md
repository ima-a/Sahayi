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

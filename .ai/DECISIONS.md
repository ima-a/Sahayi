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
| 2026-08-28 | Use deterministic locale-specific scoring over pack-authored intent phrases | NFKC Unicode normalisation, containment, weighted token overlap, threshold, and candidate margin are reproducible and support English, Hindi, Malayalam, and useful transliterations without model calls or service-specific code. |
| 2026-08-28 | Require confirmation after every suggested service | A match is guidance for navigation, not an automatic selection or service decision. |
| 2026-08-28 | Locally warn on obvious identifier patterns before matching | Aadhaar-like, phone-like, and email patterns are blocked without retaining their value; this limited detector is not a guarantee of complete PII removal. |
| 2026-08-28 | Support exactly English, Hindi, and Malayalam with English canonical | Keeps the locale contract bounded and backward-compatible while stable facts, IDs, rules, URLs, and provenance remain language-neutral. |
| 2026-08-28 | Treat Hindi and Malayalam as machine-assisted prototype translations requiring native/legal review | Complete official translated equivalents were unavailable for every field; only validated canonical English content is translated and linked official wording prevails. |
| 2026-08-28 | Keep translations static in validated packs and a typed UI catalogue | No runtime translation API, third-party policy translation, external font, storage, or network translation dependency enters the privacy/trust boundary. |
| 2026-08-28 | Normalize relevant Unicode decimal digits before local identifier blocking | ASCII, Devanagari, and Malayalam identifier-shaped input receives the same browser-only protection without transmitting the value. |
| 2026-08-28 | Use a small explicit Responses API loop with fixed GPT-5.6 Luna | Tool ordering can be agentic while strict local functions, structured output, low reasoning, no retry/streaming, and hard budgets retain control. |
| 2026-08-28 | Keep AI optional, consent-gated, and disabled by default | Deterministic guidance must work without a key; cloud processing is separately disclosed and `store: false` is not claimed as Zero Data Retention. |
| 2026-08-28 | Reconstruct every factual card and action server-side | Model prose guides; validated pack IDs and local tool results remain the sole source for facts, sources, fees, outcomes, URLs, and actions. |
| 2026-08-28 | Use process-local abuse controls only as prototype safeguards | An ephemeral salted client hash, stale cleanup, semaphore, rate window, and request budget limit cost without claiming distributed production protection. |
| 2026-08-28 | Permit synthetic form preparation only | Bundled DEMO personas and blank private fields demonstrate preparation without citizen free text, official form filling, files, submission, or retention. |
| 2026-08-29 | Keep source monitoring a one-shot offline-first administrative CLI | Hosted code must not continuously scrape; exact allowlists, bounded retrieval and human review support safe change detection without autonomous fact mutation. |
| 2026-08-29 | Leave reviewed monitoring baselines empty when no authorized live retrieval occurred | Do not fabricate fingerprints; report `review_required` until an authorized human establishes each baseline. |
| 2026-08-29 | Model demo submission/status as a strict stateless synthetic contract | Demonstrate a journey without government contact, arbitrary input, real references, implied acceptance, submission, approval or tracking. |
| 2026-08-29 | Use one shared session-clear operation for explicit end and inactivity | Abort requests and clear every in-memory citizen state consistently, while making no claim beyond Sahayi's retention boundary. |
| 2026-08-29 | Add a dependency-free character n-gram Multinomial Naive Bayes intent classifier | A 167 KiB deterministic trained artifact improves native-script, transliteration and spelling coverage without a browser LLM, runtime dependency, model download, generation, or network call. |
| 2026-08-29 | Ensemble local ML with the existing pack-phrase matcher behind PII and confirmation gates | Agreement and one-sided confidence may propose only allowlisted catalogue services; disagreement, unsupported, abstention and artifact failure fail safely without changing procedure facts or readiness decisions. |
| 2026-08-29 | Train only on owned synthetic examples and reserve validation/test roles | Fixed balanced splits, canonical generation, digests, native-review markers, validation-only threshold tuning and candid synthetic metrics make limitations and retraining drift reviewable. |

## Official HTTPX documentation basis

Retrieved 2026-08-29 from the official HTTPX site:

- [Timeouts](https://www.python-httpx.org/advanced/timeouts/)
- [QuickStart: streaming responses](https://www.python-httpx.org/quickstart/)
- [Clients and redirect configuration](https://www.python-httpx.org/advanced/clients/)
- [Transports, retries, and MockTransport](https://www.python-httpx.org/advanced/transports/)

These references support explicit timeout configuration, streamed bounded reads, disabled automatic redirects/manual validation, an explicit zero-retry transport, and offline transport mocks.

## Official OpenAI documentation basis

Retrieved 2026-08-28, using only official OpenAI domains:

- [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [Responses create reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
- [Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Python API library](https://developers.openai.com/api/reference/python)
- [Latest model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [Your data / retention controls](https://developers.openai.com/api/docs/guides/your-data)
- [Production best practices](https://developers.openai.com/api/docs/guides/production-best-practices)

The official Python library page requires Python 3.10+, documents `pip install openai`, async clients, configuration, and SemVer caveats but does not publish the current package number in-page. The compatible `openai==3.0.0` pin was therefore additionally resolution-checked without installation; no provider request was made.

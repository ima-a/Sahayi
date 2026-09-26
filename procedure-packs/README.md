# Procedure Packs

Procedure Packs are versioned JSON records for supported services. They are the source of truth for procedure facts, readiness rules, preparation fields, localized guidance, official sources, and handoff links.

## Layout

- `packs/<service-id>/<version>/pack.json` — versioned service data
- `schemas/procedure-pack-v1.schema.json` — exported JSON Schema

Only one validated version per service is active. Draft or superseded versions are not served. The active set currently covers UIDAI Aadhaar address update and Kerala Indira Gandhi National Old Age Pension preliminary guidance.

## Content and validation

Each claim and readiness outcome references its sources. Facts and rule values are language-independent. English is canonical; Hindi and Malayalam are machine-assisted translations awaiting native-speaker and legal review. The validator checks the pack schema, IDs, references, localized fields, readiness expressions, and active-version selection. Canonical SHA-256 digests support reproducibility; they do not authenticate the publisher.

Conflicting official claims remain separately sourced and are not silently resolved. Stale review dates remain visible. Kerala pension guidance omits an amount while the authoritative sources do not support one canonical value. No official PDF form is active; the app generates a watermarked preparation worksheet.

## Source monitoring

The one-shot Procedure Intelligence command can compare allowlisted public sources and produce a review report. The scheduled workflow is read-only. Changes require human review and do not modify or activate pack facts.

## Checks

From the repository root:

```bash
.venv/bin/python -m sahayi_api.procedure_tool validate
.venv/bin/python -m sahayi_api.procedure_tool check-schema
.venv/bin/python -m sahayi_api.procedure_tool monitor
```

The monitor uses its offline fixture by default. Live retrieval requires both `--live` and `--acknowledge-live-public-source-check`; it is a bounded review action, not a hosted service or continuous monitor.

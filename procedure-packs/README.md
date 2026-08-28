# Procedure packs

`packs/` contains versioned JSON procedure data and `schemas/` contains the generated Procedure Pack v1 JSON Schema. Packs are validated by `sahayi_api.procedures`; API and frontend code must not hard-code procedure facts. The active packs cover UIDAI Aadhaar address update and Kerala Indira Gandhi National Old Age Pension preliminary readiness guidance.

Fee facts use an explicit verification status. Confirmed and free values require sourced agreeing claims; conflicting values retain every sourced claim without a canonical amount and include official-confirmation guidance; not-stated fees do not invent an amount. Fee conflict does not replace the independent pack freshness state.

Guided journey behavior is represented by the required `readiness` section in the current contract. It contains multilingual-ready structured questions, additional official-review items, outcomes, and prioritised rules. Questions accept only booleans, enumerated single choices, or bounded integers; free text and citizen identifiers are outside the contract. Pack-labelled sensitive choices must be categories, display a frontend privacy explanation, and offer an explicit withheld choice where needed. Additional-review items keep subjective or intrusive official criteria out of automated inference. Conditional visibility and rules use only the strict JSON AST operators `all`, `any`, `not`, `known`, `equals`, `in`, `lt`, `lte`, `gt`, and `gte`.

Pack validation rejects unknown fields/operators/references, duplicate IDs/priorities, incompatible operator and answer types, invalid choices, missing or unsafe defaults, and expressions beyond configured depth, node, and list budgets. Evaluation applies an independent operation budget. Every question, rule, and outcome cites pack sources, and every outcome includes an official HTTPS handoff plus explicit wording that readiness guidance is not an eligibility decision or official approval.

Run `.venv/bin/python -m sahayi_api.procedure_tool validate` to validate the active registry and `.venv/bin/python -m sahayi_api.procedure_tool check-schema` to detect schema drift.

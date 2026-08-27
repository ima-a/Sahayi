# Procedure packs

`packs/` contains versioned JSON procedure data and `schemas/` contains the generated Procedure Pack v1 JSON Schema. Packs are validated by `sahayi_api.procedures`; API and frontend code must not hard-code procedure facts.

Run `.venv/bin/python -m sahayi_api.procedure_tool validate` to validate the active registry and `.venv/bin/python -m sahayi_api.procedure_tool check-schema` to detect schema drift.

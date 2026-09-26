# Task state

Last updated: 2026-09-26

## Documentation and repository organization

Current scope is documented as a two-service multilingual preparation prototype. The public README is concise and links to focused architecture, privacy, model-card, and Procedure Pack references. Internal context now describes current behavior without dated implementation history.

The four browser smoke scripts are grouped under `tests/browser/`. Python tests remain in `tests/`, preserving the configured pytest discovery path. Runtime source paths and deployment inputs were not moved.

The organization and documentation pass is complete. The user explicitly requested publication to `feat/sahayi-deployment`; the completed change is prepared for that push.

# Deployment operations

Sahayi is configured as one Render Docker Web Service at [sahayi.onrender.com](https://sahayi.onrender.com). The Blueprint targets `feat/sahayi-deployment`, uses `/api/v1/health`, and has auto-deploy disabled. A branch push alone does not publish a new release.

## Build and runtime

The multi-stage [Dockerfile](../Dockerfile) builds the Vite frontend with Node.js 25.2.1, installs the FastAPI package with Python 3.14.7, and serves both from one container. The final process runs as UID/GID 10001 and binds the Render `PORT` (local fallback `10000`). The image contains the frontend bundle, form registry, and active Procedure Packs.

Build locally with:

```bash
docker build --no-cache -t sahayi:release-candidate .
docker run --rm -p 10000:10000 sahayi:release-candidate
```

Then check `http://127.0.0.1:10000/` and `/api/v1/health`.

## Release checks

Before an authorized deployment, verify the target commit and run the checks listed in the root [README](../README.md). Also check the image and browser journey against the release candidate. Deploy manually from the Render service after confirming it points to the approved deployment commit. Review startup health and the public experience after deployment.

Keep auto-deploy disabled. Do not promote to `main`, merge or rewrite history, or change Render settings without explicit authorization. A deployment-branch push alone does not authorize those additional operations.

## Optional AI configuration

The Blueprint leaves `SAHAYI_AGENT_ENABLED=false`. Deterministic guidance requires no secret. Enabling GroqCloud requires a server-side `GROQ_API_KEY`, explicit feature-flag change, provider account review, and a separately reviewed deployment. Never put a key in frontend code, Git, logs, or public configuration. Sahayi does not set or guarantee Groq's data-retention controls.

## Recovery

Use Render's rollback action to restore a known-good deploy, then repeat the hosted health and user-journey checks. Keep automatic deployment disabled while investigating.

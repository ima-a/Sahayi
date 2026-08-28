# Deployment

Sahayi is configured for one Render Docker Web Service. No live service or URL is created by the repository change. The hosted experience remains a hackathon prototype, not an official government service. It does not submit applications, receive OTPs or payments, authenticate citizens, or integrate with a government system.

## Architecture and runtime

`render.yaml` selects the `feat/sahayi-deployment` branch, the Docker runtime, the free plan, and `/api/v1/health` as the HTTP health check. Automatic service deploys are off: this repository has no CI, so the owner must manually deploy only a commit that has passed the complete release gates. Blueprint syncing is a separate Render setting and should also remain manual after initial creation.

The multi-stage `Dockerfile` uses the project's verified Python 3.14.7 and Node 25.2.1 versions. The Node stage runs `npm ci` and the existing Vite build. The Python stage installs only the project's runtime dependencies. The final image contains the installed backend under `/app/src`, the compiled frontend under `/app/frontend/dist`, and active Procedure Packs under `/app/procedure-packs/packs`; this preserves the application's `__file__`-relative paths without depending on the process working directory. It runs as an unprivileged user and starts one Uvicorn process on `0.0.0.0`, using Render's `PORT` or local fallback `10000`.

The `.dockerignore` is an allowlist for only the Dockerfile, manifests, backend package, frontend build inputs, and Procedure Packs. It excludes Git data, environment files, local virtual environments, dependency directories, caches, tests, documentation, and local build outputs from the build context. No database, disk, worker, cron job, monitoring, or analytics is configured. The Blueprint declares an unsynchronized `OPENAI_API_KEY` secret prompt and leaves `SAHAYI_AGENT_ENABLED=false`, so deterministic deployment remains complete and AI remains unavailable until deliberately configured.

## Official Render documentation

Retrieved 2026-08-28:

- [Deploy a FastAPI App](https://render.com/docs/deploy-fastapi)
- [Web Services](https://render.com/docs/web-services)
- [Render Blueprints](https://render.com/docs/infrastructure-as-code)
- [Blueprint YAML Reference](https://render.com/docs/blueprint-spec)
- [Health Checks](https://render.com/docs/health-checks)
- [Deploying on Render](https://render.com/docs/deploys)
- [Deploy for Free](https://render.com/docs/free)
- [Rollbacks](https://render.com/docs/rollbacks)

## Dashboard setup

1. Sign in to Render, choose **New > Blueprint**, connect the Git provider, and select this repository.
2. Set the Blueprint branch to `feat/sahayi-deployment` and keep the default Blueprint path `render.yaml`.
3. Review the proposed single `sahayi` Docker Web Service. Confirm there is no database, disk, worker, or cron job. Leave the prompted `OPENAI_API_KEY` unset and `SAHAYI_AGENT_ENABLED=false` for deterministic-only deployment.
4. Click **Deploy Blueprint**. After creation, set the Blueprint's **Auto Sync** to **No** and confirm the service's **Auto-Deploy** setting is **Off**.
5. Open the service and use **Manual Deploy > Deploy latest commit**. Watch the Docker build, startup log, and `/api/v1/health` result. Render supplies HTTPS and the service URL; do not record a URL until Render creates it.
6. The free service spins down after 15 minutes without inbound traffic and can take about one minute to wake. Upgrade the service plan in the dashboard if the demo must avoid this delay.

To enable the optional agent later, the owner must create a restricted OpenAI project key in Render's secret manager, set project spend/rate limits and review retention controls, then set `SAHAYI_AGENT_ENABLED=true` and manually deploy a verified commit. Never put the key in Blueprint YAML, public config, frontend variables, logs, chat, or Git. The process-local limiter and budget reduce demo cost but are not distributed production abuse protection. A native-language review and a separately authorized non-billable/live evaluation plan are still required before representing AI mode as production-ready.

## Post-deployment checks

Using the Render-created HTTPS URL, verify `/`, a hashed `/assets/` resource, `/api/v1/health`, public config, catalogue, both procedure details, readiness, checklist, synthetic form, and disabled-agent fallback endpoints. Confirm API responses retain `Cache-Control: no-store`, the Aadhaar fee remains an unresolved ₹50/₹75 conflict, Kerala displays no canonical pension amount or approval, the synthetic watermark/private blanks are visible, official-source limitations remain visible, and the page identifies itself as a hackathon prototype rather than a government service. If AI is separately enabled, additionally verify consent, multilingual blocked-input behavior, generic provider fallback, and deterministic action/source reconstruction without making unsupported product claims.

## Rollback

In the service's **Events** page, find the most recent known-good successful deploy, choose **Rollback**, review the target, and confirm **Rollback to this deploy**. Dashboard rollback disables service auto-deploys; keep them off, repeat the post-deployment checks, and only deploy a newer verified branch commit after resolving the issue. Free services retain rollback access only to the two most recent previous deploys.

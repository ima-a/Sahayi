# Deployment

Sahayi is configured for one Render Docker Web Service. No live service or URL is created by the repository change. The hosted experience remains a hackathon prototype, not an official government service. It does not submit applications, receive OTPs or payments, authenticate citizens, or integrate with a government system.

## Architecture and runtime

`render.yaml` selects the `feat/sahayi-deployment` branch, the Docker runtime, the free plan, and `/api/v1/health` as the HTTP health check. Automatic service deploys are off: this repository has no CI, so the owner must manually deploy only a commit that has passed the complete release gates. Blueprint syncing is a separate Render setting and should also remain manual after initial creation.

The multi-stage `Dockerfile` uses the project's verified Python 3.14.7 and Node 25.2.1 versions. The Node stage runs `npm ci` and the existing Vite build. The Python stage installs only the project's runtime dependencies. The final image contains the installed backend under `/app/src`, the compiled frontend under `/app/frontend/dist`, and active Procedure Packs under `/app/procedure-packs/packs`; this preserves the application's `__file__`-relative paths without depending on the process working directory. It runs as an unprivileged user and starts one Uvicorn process on `0.0.0.0`, using Render's `PORT` or local fallback `10000`.

The `.dockerignore` is an allowlist for only the Dockerfile, manifests, backend package, frontend build inputs, and Procedure Packs. It excludes Git data, environment files, local virtual environments, dependency directories, caches, tests, documentation, and local build outputs from the build context. No database, disk, worker, cron job, monitoring, analytics, or secret variable is configured.

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
3. Review the proposed single `sahayi` Docker Web Service. Confirm there is no database, disk, worker, cron job, or environment secret.
4. Click **Deploy Blueprint**. After creation, set the Blueprint's **Auto Sync** to **No** and confirm the service's **Auto-Deploy** setting is **Off**.
5. Open the service and use **Manual Deploy > Deploy latest commit**. Watch the Docker build, startup log, and `/api/v1/health` result. Render supplies HTTPS and the service URL; do not record a URL until Render creates it.
6. The free service spins down after 15 minutes without inbound traffic and can take about one minute to wake. Upgrade the service plan in the dashboard if the demo must avoid this delay.

## Post-deployment checks

Using the Render-created HTTPS URL, verify `/`, a hashed `/assets/` resource, `/api/v1/health`, `/api/v1/procedures`, both procedure details, and both readiness endpoints. Confirm API responses retain `Cache-Control: no-store`, the Aadhaar fee remains an unresolved ₹50/₹75 conflict, Kerala displays no canonical pension amount or approval, official-source limitations remain visible, and the page identifies itself as a hackathon prototype rather than a government service.

## Rollback

In the service's **Events** page, find the most recent known-good successful deploy, choose **Rollback**, review the target, and confirm **Rollback to this deploy**. Dashboard rollback disables service auto-deploys; keep them off, repeat the post-deployment checks, and only deploy a newer verified branch commit after resolving the issue. Free services retain rollback access only to the two most recent previous deploys.

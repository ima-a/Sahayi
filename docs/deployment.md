# Deployment

Sahayi is configured as a Render Docker Web Service. The Blueprint in `render.yaml` targets `feat/sahayi-deployment`, checks `/api/v1/health`, and has automatic deploys disabled.

## Build and run the container

```bash
docker build --no-cache -t sahayi:release-candidate .
docker run --rm -p 10000:10000 sahayi:release-candidate
```

Check `http://127.0.0.1:10000/` and `http://127.0.0.1:10000/api/v1/health`. The container serves the compiled frontend and FastAPI from the same origin and runs as an unprivileged user.

## Publish

Push reviewed changes to the configured deployment branch. With automatic deploys disabled, a branch push does not change the hosted service. An authorized operator must select the approved commit for a manual Render deploy and verify the health endpoint and main user journey afterward.

Deterministic guidance requires no secret. Optional GroqCloud guidance is disabled by default and requires a server-side `GROQ_API_KEY` plus explicit feature configuration. Never put the key in frontend code or Git.

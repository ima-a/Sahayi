# Deployment

The hackathon requires a publicly accessible web application. The current assumption is same-origin delivery: FastAPI serves the Vite build and API. Local development remains loopback-only; a hosted demo is a future public instance; a kiosk deployment is future hardware/site work.

The hosted demo must state that it is a prototype using synthetic data. It must not use real government credentials, APIs, OTPs, or citizen documents. Runtime host and port must be environment-configurable for containers while local defaults remain loopback-only.

Hosting provider: **TBD — must be selected from current official documentation**. Do not add deployment configuration or select a provider now. Deployment gates: tests, build, secret scan, environment validation, health check, HTTPS, and rollback.

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from sahayi_api.config import get_settings

settings = get_settings()
app = FastAPI(title="Sahayi API", docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def privacy_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.middleware("http")
async def exact_development_cors(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method == "OPTIONS" and request.url.path.startswith("/api/v1/"):
        if origin != settings.dev_frontend_origin:
            return JSONResponse({"error": "Request not allowed"}, status_code=403)
        return JSONResponse({}, headers={"Access-Control-Allow-Origin": settings.dev_frontend_origin, "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin"})
    response = await call_next(request)
    if origin == settings.dev_frontend_origin and request.url.path.startswith("/api/v1/"):
        response.headers["Access-Control-Allow-Origin"] = settings.dev_frontend_origin
        response.headers["Vary"] = "Origin"
    return response


@app.exception_handler(StarletteHTTPException)
async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    return JSONResponse({"error": "Request not found" if exc.status_code == 404 else "Request failed"}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, __: RequestValidationError) -> JSONResponse:
    return JSONResponse({"error": "Invalid request"}, status_code=422)


@app.exception_handler(Exception)
async def unexpected_error(_: Request, __: Exception) -> JSONResponse:
    return JSONResponse({"error": "Internal server error"}, status_code=500)


@app.get("/api/v1/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/public-config")
async def public_config() -> dict[str, str | bool]:
    return {"application_name": "Sahayi", "kiosk_mode": True}


frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    @app.get("/")
    async def kiosk_index() -> FileResponse:
        return FileResponse(frontend_dist / "index.html")

    @app.get("/{path:path}")
    async def kiosk_fallback(path: str) -> FileResponse:
        requested = frontend_dist / path
        if path and requested.is_file():
            return FileResponse(requested)
        return FileResponse(frontend_dist / "index.html")

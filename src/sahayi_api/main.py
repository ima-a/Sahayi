from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from sahayi_api.config import get_settings
from sahayi_api.procedures import (
    PackLoadError,
    ProcedureDetail,
    ProcedureListResponse,
    default_pack_root,
    detail_procedure,
    load_procedure_registry,
    summarize_procedure,
)

settings = get_settings()
app = FastAPI(title="Sahayi API", docs_url=None, redoc_url=None, openapi_url=None)

try:
    procedure_registry = load_procedure_registry(default_pack_root())
except PackLoadError:
    procedure_registry = None


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


@app.get("/api/v1/procedures", response_model=ProcedureListResponse)
async def procedures() -> ProcedureListResponse | JSONResponse:
    if procedure_registry is None:
        return JSONResponse({"error": "Procedure guidance is unavailable"}, status_code=503)
    summaries = [summarize_procedure(loaded) for _, loaded in sorted(procedure_registry.items())]
    return ProcedureListResponse(procedures=summaries)


@app.get("/api/v1/procedures/{service_id}", response_model=ProcedureDetail)
async def procedure_detail(service_id: str) -> ProcedureDetail | JSONResponse:
    if procedure_registry is None:
        return JSONResponse({"error": "Procedure guidance is unavailable"}, status_code=503)
    loaded = procedure_registry.get(service_id)
    if loaded is None:
        return JSONResponse({"error": "Procedure not found"}, status_code=404)
    return detail_procedure(loaded)


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

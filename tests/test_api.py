import pytest
from httpx import ASGITransport, AsyncClient

from sahayi_api.main import app


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as api_client:
        yield api_client


@pytest.mark.anyio
async def test_health_is_json_and_not_stored(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {"status": "ok"}


@pytest.mark.anyio
async def test_public_config_has_no_secret_configuration(client: AsyncClient) -> None:
    response = await client.get("/api/v1/public-config")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {"application_name": "Sahayi", "kiosk_mode": True}
    serialized = response.text.lower()
    for prohibited in ("secret", "token", "password", "api_key", "origin", "environment"):
        assert prohibited not in serialized


@pytest.mark.anyio
async def test_cors_allows_only_configured_development_origin(client: AsyncClient) -> None:
    allowed = await client.get("/api/v1/health", headers={"Origin": "http://127.0.0.1:5173"})
    denied = await client.get("/api/v1/health", headers={"Origin": "https://example.test"})
    assert allowed.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    assert "access-control-allow-origin" not in denied.headers

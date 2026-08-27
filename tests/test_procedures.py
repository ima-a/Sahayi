from __future__ import annotations

import copy
import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

import sahayi_api.main as main_module
from sahayi_api.main import app
from sahayi_api.procedure_tool import schema_text
from sahayi_api.procedures import (
    LifecycleStatus,
    PackLoadError,
    ProcedurePack,
    TrustState,
    default_pack_root,
    load_procedure_registry,
    pack_digest,
)

PACK_PATH = default_pack_root() / "uidai-aadhaar-address-update" / "1.0.0" / "pack.json"
SCHEMA_PATH = PACK_PATH.parents[3] / "schemas" / "procedure-pack-v1.schema.json"


def pack_data() -> dict[str, object]:
    return json.loads(PACK_PATH.read_text(encoding="utf-8"))


def write_pack(root: Path, name: str, data: dict[str, object]) -> None:
    target = root / name / "pack.json"
    target.parent.mkdir(parents=True)
    target.write_text(json.dumps(data), encoding="utf-8")


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as api_client:
        yield api_client


def test_valid_pack_loads() -> None:
    registry = load_procedure_registry(default_pack_root())
    loaded = registry["uidai-aadhaar-address-update"]
    assert loaded.pack.status is LifecycleStatus.ACTIVE
    assert loaded.pack.title["en"] == "Update your Aadhaar address online"


def test_checked_in_json_schema_matches_model() -> None:
    assert SCHEMA_PATH.read_text(encoding="utf-8") == schema_text()


def test_unknown_fields_and_html_are_rejected() -> None:
    unknown = pack_data()
    unknown["unexpected"] = True
    with pytest.raises(ValidationError, match="extra_forbidden"):
        ProcedurePack.model_validate(unknown)

    html = pack_data()
    html["title"] = {"en": "<strong>Unsafe</strong>"}
    with pytest.raises(ValidationError, match="HTML content is not permitted"):
        ProcedurePack.model_validate(html)


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        (lambda data: data.update(review_due_at="2026-01-01T00:00:00Z"), "review_due_at must be after"),
        (lambda data: data["sources"][0].update(url="http://uidai.gov.in/example"), "must use HTTPS"),
        (lambda data: data.update(official_handoff_url="http://myaadhaar.uidai.gov.in"), "must use HTTPS"),
    ],
)
def test_invalid_dates_and_non_https_urls_are_rejected(mutation, message: str) -> None:
    data = pack_data()
    mutation(data)
    with pytest.raises(ValidationError, match=message):
        ProcedurePack.model_validate(data)


def test_missing_and_nonexistent_source_references_are_rejected() -> None:
    missing = pack_data()
    del missing["fee"]["source_ids"]
    with pytest.raises(ValidationError, match="Field required"):
        ProcedurePack.model_validate(missing)

    nonexistent = pack_data()
    nonexistent["provenance"]["fee"] = ["not-a-source"]
    with pytest.raises(ValidationError, match="unknown source references"):
        ProcedurePack.model_validate(nonexistent)

    unmapped = pack_data()
    del unmapped["provenance"]["fee"]
    with pytest.raises(ValidationError, match="missing provenance mappings: fee"):
        ProcedurePack.model_validate(unmapped)


def test_duplicate_service_version_is_rejected(tmp_path: Path) -> None:
    data = pack_data()
    write_pack(tmp_path, "one", data)
    write_pack(tmp_path, "two", data)
    with pytest.raises(PackLoadError, match="Duplicate procedure pack version"):
        load_procedure_registry(tmp_path)


def test_duplicate_active_versions_are_rejected(tmp_path: Path) -> None:
    first = pack_data()
    second = copy.deepcopy(first)
    second["pack_version"] = "1.1.0"
    write_pack(tmp_path, "one", first)
    write_pack(tmp_path, "two", second)
    with pytest.raises(PackLoadError, match="exactly one active"):
        load_procedure_registry(tmp_path)


def test_draft_pack_is_not_selected(tmp_path: Path) -> None:
    active = pack_data()
    draft = copy.deepcopy(active)
    draft["pack_version"] = "1.1.0"
    draft["status"] = "draft"
    write_pack(tmp_path, "active", active)
    write_pack(tmp_path, "draft", draft)
    registry = load_procedure_registry(tmp_path)
    assert registry[active["service_id"]].pack.pack_version == "1.0.0"


def test_no_active_pack_fails_closed(tmp_path: Path) -> None:
    draft = pack_data()
    draft["status"] = "draft"
    write_pack(tmp_path, "draft", draft)
    with pytest.raises(PackLoadError, match="No active"):
        load_procedure_registry(tmp_path)


def test_stale_trust_calculation() -> None:
    loaded = load_procedure_registry(default_pack_root())["uidai-aadhaar-address-update"]
    assert loaded.trust_state(datetime(2026, 11, 27, tzinfo=UTC)) is TrustState.CURRENT
    assert loaded.trust_state(datetime(2026, 11, 29, tzinfo=UTC)) is TrustState.STALE


def test_pack_digest_is_deterministic() -> None:
    original = ProcedurePack.model_validate(pack_data())
    reordered_json = json.dumps(pack_data(), sort_keys=True)
    reordered = ProcedurePack.model_validate_json(reordered_json)
    assert pack_digest(original) == pack_digest(reordered)
    assert pack_digest(original) == "ddafaa94d2dd25ff39e1f4cd9e9153461f8627eae4ffd8b6a85ec979b20c4251"


@pytest.mark.anyio
async def test_list_endpoint_returns_safe_active_summaries(client: AsyncClient) -> None:
    response = await client.get("/api/v1/procedures")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    payload = response.json()
    assert len(payload["procedures"]) == 1
    summary = payload["procedures"][0]
    assert summary["service_id"] == "uidai-aadhaar-address-update"
    assert summary["trust_state"] == "current"
    assert "requirements" not in summary
    assert "official_handoff_url" not in summary


@pytest.mark.anyio
async def test_detail_endpoint_returns_procedure_and_provenance(client: AsyncClient) -> None:
    response = await client.get("/api/v1/procedures/uidai-aadhaar-address-update")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    payload = response.json()
    assert payload["fee"]["amount"] == "50.00"
    assert payload["official_handoff_url"] == "https://myaadhaar.uidai.gov.in/"
    assert payload["pack_digest"] == "ddafaa94d2dd25ff39e1f4cd9e9153461f8627eae4ffd8b6a85ec979b20c4251"
    assert payload["provenance"]["fee"] == ["uidai-online-address-fee"]
    assert all(source["url"].startswith("https://") for source in payload["sources"])


@pytest.mark.anyio
async def test_unknown_service_is_safe_and_not_stored(client: AsyncClient) -> None:
    response = await client.get("/api/v1/procedures/not-supported")
    assert response.status_code == 404
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {"error": "Procedure not found"}


@pytest.mark.anyio
async def test_api_fails_safely_when_registry_is_unavailable(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main_module, "procedure_registry", None)
    for path in ("/api/v1/procedures", "/api/v1/procedures/uidai-aadhaar-address-update"):
        response = await client.get(path)
        assert response.status_code == 503
        assert response.headers["cache-control"] == "no-store"
        assert response.json() == {"error": "Procedure guidance is unavailable"}

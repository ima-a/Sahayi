from __future__ import annotations

import json
from dataclasses import replace
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

import sahayi_api.main as main_module
from sahayi_api.agent import AgentRuntime, AssistantTurnRequest, RateLimiter, RequestBudget, _execute_tool, run_assistant_turn
from sahayi_api.config import AGENT_MODEL, get_settings
from sahayi_api.main import app
from sahayi_api.procedures import default_pack_root, load_procedure_registry


class FakeResponses:
    def __init__(self, replies: list[object]) -> None:
        self.replies = replies
        self.calls: list[dict[str, object]] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def fake_runtime(replies: list[object]) -> tuple[AgentRuntime, FakeResponses]:
    settings = replace(get_settings(), agent_enabled=True, openai_api_key="test-key", agent_request_budget=20)
    runtime = AgentRuntime(settings)
    responses = FakeResponses(replies)
    runtime.client = SimpleNamespace(responses=responses)
    return runtime, responses


def request(message: str = "Help me update my Aadhaar address") -> AssistantTurnRequest:
    return AssistantTurnRequest(locale="en", message=message, consent=True)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.parametrize(
    "value",
    [
        "My Aadhaar is 1234 5678 9012",
        "मेरा आधार १२३४ ५६७८ ९०१२ है",
        "എന്റെ ആധാർ ൧൨൩൪ ൫൬൭൮ ൯൦൧൨ ആണ്",
        "call 9876543210",
        "email citizen@example.com",
        "house 42, Example Road",
    ],
)
@pytest.mark.anyio
async def test_pii_is_blocked_before_provider_without_echo(value: str) -> None:
    runtime, responses = fake_runtime([])
    result = await run_assistant_turn(request(value), load_procedure_registry(default_pack_root()), runtime, "127.0.0.1")
    assert result.status == "blocked"
    assert value not in result.message
    assert responses.calls == []


@pytest.mark.anyio
async def test_disabled_agent_falls_back_without_provider() -> None:
    runtime = AgentRuntime(replace(get_settings(), agent_enabled=False, openai_api_key=None))
    result = await run_assistant_turn(request(), load_procedure_registry(default_pack_root()), runtime, "127.0.0.1")
    assert result.status == "unavailable"
    assert result.fallback is True


@pytest.mark.anyio
async def test_strict_tool_loop_uses_bounded_responses_settings_and_deterministic_facts() -> None:
    function_call = SimpleNamespace(
        type="function_call",
        name="get_verified_procedure",
        arguments=json.dumps({"service_id": "uidai-aadhaar-address-update", "locale": "en"}),
        call_id="call-1",
    )
    first = SimpleNamespace(output=[function_call], output_text="")
    final_output = {
        "guidance_message": "I used the verified Aadhaar procedure.",
        "selection_state": "selected",
        "service_id": "uidai-aadhaar-address-update",
        "action_ids": ["view-procedure", "open-official-service", "invented-action"],
    }
    second = SimpleNamespace(output=[], output_text=json.dumps(final_output))
    runtime, responses = fake_runtime([first, second])
    result = await run_assistant_turn(request(), load_procedure_registry(default_pack_root()), runtime, "127.0.0.1")
    assert result.status == "ok"
    assert result.tool_trace == ["get_verified_procedure"]
    assert {card.card_id for card in result.fact_cards} == {"verified-requirements", "fee-information"}
    assert result.fact_cards[-1].text.startswith("Fee needs confirmation")
    assert [action.action_id for action in result.actions] == ["view-procedure", "open-official-service"]
    assert all(str(source.url).startswith("https://") for source in result.sources)
    assert len(responses.calls) == 2
    for call in responses.calls:
        assert call["model"] == AGENT_MODEL
        assert call["store"] is False
        assert call["stream"] is False
        assert call["parallel_tool_calls"] is False
        assert call["reasoning"] == {"effort": "low"}
        assert call["text"]["verbosity"] == "low"
        assert call["text"]["format"]["strict"] is True
        assert len(call["tools"]) == 7
        assert all(tool["strict"] is True for tool in call["tools"])
        readiness_tool = next(tool for tool in call["tools"] if tool["name"] == "evaluate_readiness")
        answers_schema = readiness_tool["parameters"]["properties"]["answers"]
        assert answers_schema["type"] == "array"
        assert answers_schema["maxItems"] == 30
        assert answers_schema["items"]["additionalProperties"] is False
        assert answers_schema["items"]["required"] == ["question_id", "value"]


@pytest.mark.anyio
async def test_invalid_service_requests_clarification_without_provider() -> None:
    runtime, responses = fake_runtime([])
    turn = AssistantTurnRequest(locale="en", message="Help with a service", service_id="not-supported", consent=True)
    result = await run_assistant_turn(turn, load_procedure_registry(default_pack_root()), runtime, "127.0.0.1")
    assert result.selection.state == "clarification"
    assert len(result.selection.choices) == 2
    assert responses.calls == []


def test_strict_readiness_tool_records_are_converted_and_duplicates_fail_closed() -> None:
    registry = load_procedure_registry(default_pack_root())
    arguments = {
        "service_id": "uidai-aadhaar-address-update",
        "locale": "en",
        "answers": [{"question_id": "mobile-auth-access", "value": False}],
    }
    output, service_id, status_id = _execute_tool("evaluate_readiness", json.dumps(arguments), registry)
    assert service_id == "uidai-aadhaar-address-update"
    assert status_id is None
    assert json.loads(output)["outcome"]["outcome_id"] == "use-alternative-channel"

    arguments["answers"].append({"question_id": "mobile-auth-access", "value": True})
    output, service_id, status_id = _execute_tool("evaluate_readiness", json.dumps(arguments), registry)
    assert service_id is None
    assert status_id is None
    assert json.loads(output) == {"error": "Invalid tool request"}


def test_simulated_status_tool_is_strict_and_returns_only_demo_status() -> None:
    registry = load_procedure_registry(default_pack_root())
    output, service_id, status_id = _execute_tool(
        "explain_simulated_status",
        json.dumps({
            "service_id": "uidai-aadhaar-address-update",
            "locale": "hi",
            "status_id": "action-required",
        }),
        registry,
    )
    payload = json.loads(output)
    assert service_id == "uidai-aadhaar-address-update"
    assert status_id == "action-required"
    assert "सिमुलेटेड" in payload["simulated_time_label"]
    assert "reference" not in payload

    output, service_id, status_id = _execute_tool(
        "explain_simulated_status",
        json.dumps({
            "service_id": "uidai-aadhaar-address-update",
            "locale": "en",
            "status_id": "real-government-status",
        }),
        registry,
    )
    assert (service_id, status_id) == (None, None)
    assert json.loads(output) == {"error": "Invalid tool request"}


@pytest.mark.anyio
async def test_unknown_tool_and_malformed_model_output_fail_closed() -> None:
    unknown = SimpleNamespace(type="function_call", name="browse_web", arguments="{}", call_id="bad")
    runtime, _ = fake_runtime([SimpleNamespace(output=[unknown], output_text="")])
    result = await run_assistant_turn(request(), load_procedure_registry(default_pack_root()), runtime, "127.0.0.1")
    assert result.status == "fallback"
    assert result.tool_trace == []

    runtime, _ = fake_runtime([SimpleNamespace(output=[], output_text="not-json")])
    malformed = await run_assistant_turn(request(), load_procedure_registry(default_pack_root()), runtime, "127.0.0.2")
    assert malformed.status == "fallback"
    assert "not-json" not in malformed.message


@pytest.mark.anyio
async def test_agent_may_explain_only_the_current_validated_demo_status() -> None:
    call = SimpleNamespace(
        type="function_call",
        name="explain_simulated_status",
        arguments=json.dumps({
            "service_id": "uidai-aadhaar-address-update",
            "locale": "en",
            "status_id": "action-required",
        }),
        call_id="demo-status-call",
    )
    runtime, _ = fake_runtime([SimpleNamespace(output=[call], output_text="")])
    turn = AssistantTurnRequest(
        locale="en",
        message="Explain the current demo status",
        service_id="uidai-aadhaar-address-update",
        demo_status_id="preparation-completed",
        consent=True,
    )
    result = await run_assistant_turn(turn, load_procedure_registry(default_pack_root()), runtime, "127.0.0.4")
    assert result.status == "fallback"
    assert result.tool_trace == []


@pytest.mark.anyio
async def test_provider_timeout_is_generic_and_excessive_tool_loop_is_bounded() -> None:
    runtime, _ = fake_runtime([TimeoutError("provider-secret-detail")])
    timed_out = await run_assistant_turn(request(), load_procedure_registry(default_pack_root()), runtime, "127.0.0.1")
    assert timed_out.status == "fallback"
    assert "provider-secret-detail" not in timed_out.message

    call = SimpleNamespace(type="function_call", name="list_supported_services", arguments='{"locale":"en"}', call_id="call")
    settings = replace(get_settings(), agent_enabled=True, openai_api_key="test-key", agent_max_tool_calls=1, agent_request_budget=10)
    runtime = AgentRuntime(settings)
    responses = FakeResponses([SimpleNamespace(output=[call, call], output_text="")])
    runtime.client = SimpleNamespace(responses=responses)
    bounded = await run_assistant_turn(request(), load_procedure_registry(default_pack_root()), runtime, "127.0.0.3")
    assert bounded.status == "fallback"
    assert len(responses.calls) == 1


@pytest.mark.anyio
async def test_blocked_content_is_not_logged(caplog: pytest.LogCaptureFixture) -> None:
    secret_input = "my phone is 9876543210"
    runtime, _ = fake_runtime([])
    await run_assistant_turn(request(secret_input), load_procedure_registry(default_pack_root()), runtime, "127.0.0.1")
    assert secret_input not in caplog.text


@pytest.mark.anyio
async def test_rate_limiter_and_request_budget_are_bounded_and_cleanup_stale_entries() -> None:
    limiter = RateLimiter(limit=1, window_seconds=10)
    assert await limiter.allow("a", now=0)
    assert not await limiter.allow("a", now=1)
    assert await limiter.allow("b", now=11)
    assert "a" not in limiter._entries
    budget = RequestBudget(1)
    assert await budget.take()
    assert not await budget.take()


@pytest.mark.anyio
async def test_assistant_endpoint_rejects_extra_fields_and_never_echoes_pii(monkeypatch: pytest.MonkeyPatch) -> None:
    runtime, responses = fake_runtime([])
    monkeypatch.setattr(main_module, "agent_runtime", runtime)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        extra = await client.post("/api/v1/assistant/turn", json={"locale": "en", "message": "help", "consent": True, "metadata": {"x": "y"}})
        assert extra.status_code == 422
        blocked = await client.post("/api/v1/assistant/turn", json={"locale": "en", "message": "9876543210", "consent": True})
        assert blocked.status_code == 200
        assert blocked.json()["status"] == "blocked"
        assert "9876543210" not in blocked.text
        assert blocked.headers["cache-control"] == "no-store"
        assert responses.calls == []


@pytest.mark.anyio
async def test_same_origin_assistant_endpoint_with_mocked_agent_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    final_output = {
        "guidance_message": "I can guide you with the verified Aadhaar procedure.",
        "selection_state": "selected",
        "service_id": "uidai-aadhaar-address-update",
        "action_ids": ["view-procedure", "start-readiness"],
    }
    runtime, responses = fake_runtime([SimpleNamespace(output=[], output_text=json.dumps(final_output))])
    monkeypatch.setattr(main_module, "agent_runtime", runtime)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        config = await client.get("/api/v1/public-config")
        turn = await client.post(
            "/api/v1/assistant/turn",
            json={"locale": "en", "message": "Help with Aadhaar address update", "consent": True},
        )
    assert config.json()["agent_available"] is True
    assert turn.status_code == 200
    assert turn.headers["cache-control"] == "no-store"
    assert turn.json()["selection"]["service_id"] == "uidai-aadhaar-address-update"
    assert len(responses.calls) == 1

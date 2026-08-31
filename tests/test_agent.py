from __future__ import annotations

import json
from dataclasses import replace
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

import sahayi_api.main as main_module
from sahayi_api.agent import (
    AgentRuntime,
    AssistantTurnRequest,
    RateLimiter,
    RequestBudget,
    _execute_tool,
    _normalise_groq_schema,
    _provider_request,
    _provider_tool_definitions,
    _tool_definitions,
    run_assistant_turn,
)
from sahayi_api.config import AGENT_MODEL, AGENT_PROVIDER, GROQ_BASE_URL, get_settings
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
    settings = replace(get_settings(), agent_enabled=True, groq_api_key="test-key", agent_request_budget=20)
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
    runtime = AgentRuntime(replace(get_settings(), agent_enabled=False, groq_api_key=None))
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
    assert responses.calls[1]["input"][-1] == {
        "type": "function_call_output",
        "call_id": "call-1",
        "output": responses.calls[1]["input"][-1]["output"],
    }
    for call in responses.calls:
        assert call["model"] == AGENT_MODEL
        assert call["stream"] is False
        assert call["parallel_tool_calls"] is False
        for unsupported in ("store", "previous_response_id", "truncation", "include", "safety_identifier", "prompt_cache_key", "prompt", "reasoning", "text"):
            assert unsupported not in call
        assert "single JSON object without Markdown" in call["instructions"]
        assert len(call["tools"]) == 7
        assert all(tool["strict"] is True for tool in call["tools"])
        readiness_tool = next(tool for tool in call["tools"] if tool["name"] == "evaluate_readiness")
        answers_schema = readiness_tool["parameters"]["properties"]["answers"]
        assert answers_schema["type"] == "array"
        assert answers_schema["maxItems"] == 30
        assert answers_schema["items"]["additionalProperties"] is False
        assert answers_schema["items"]["required"] == ["question_id", "value"]


def test_provider_schema_normalization_is_recursive_deterministic_and_idempotent() -> None:
    registry = load_procedure_registry(default_pack_root())
    canonical = _tool_definitions(registry)
    provider = _provider_tool_definitions(registry)
    canonical_value = next(tool for tool in canonical if tool["name"] == "evaluate_readiness")["parameters"]["properties"]["answers"]["items"]["properties"]["value"]
    provider_value = next(tool for tool in provider if tool["name"] == "evaluate_readiness")["parameters"]["properties"]["answers"]["items"]["properties"]["value"]
    canonical_persona = next(tool for tool in canonical if tool["name"] == "prepare_synthetic_form_assistance")["parameters"]["properties"]["persona_id"]
    provider_persona = next(tool for tool in provider if tool["name"] == "prepare_synthetic_form_assistance")["parameters"]["properties"]["persona_id"]

    assert canonical_value == {"type": ["boolean", "integer", "string"]}
    assert provider_value == {"anyOf": [{"type": "boolean"}, {"type": "integer"}, {"type": "string"}]}
    assert canonical_persona["type"] == ["string", "null"]
    assert provider_persona["anyOf"] == [{"type": "string"}, {"type": "null"}]
    assert canonical == _tool_definitions(registry)
    for tool in provider:
        assert _normalise_groq_schema(tool["parameters"]) == tool["parameters"]


@pytest.mark.parametrize(
    "schema",
    [
        {"type": []},
        {"type": ["string", "string"]},
        {"type": ["string", "executable"]},
        {"type": ["string", "null"], "anyOf": [{"type": "string"}]},
    ],
)
def test_provider_schema_normalization_rejects_unsafe_or_ambiguous_unions(schema: dict[str, object]) -> None:
    with pytest.raises(ValueError):
        _normalise_groq_schema(schema)


def test_provider_request_contract_snapshot_is_redacted_and_groq_only() -> None:
    registry = load_procedure_registry(default_pack_root())
    runtime = AgentRuntime(replace(get_settings(), agent_enabled=True, groq_api_key="test-key"))
    provider_request = _provider_request(
        request("synthetic request"),
        registry,
        runtime,
        [{"role": "user", "content": "<redacted>"}],
        None,
    )
    tools = provider_request["tools"]
    snapshot = {
        "endpoint": "POST /openai/v1/responses",
        "request_fields": sorted(provider_request),
        "input_item_fields": [sorted(item) for item in provider_request["input"]],
        "model": provider_request["model"],
        "tool_names": [tool["name"] for tool in tools],
        "tool_fields": sorted(tools[0]),
        "root_schema_fields": sorted(tools[0]["parameters"]),
    }
    assert snapshot == {
        "endpoint": "POST /openai/v1/responses",
        "request_fields": [
            "input",
            "instructions",
            "max_output_tokens",
            "model",
            "parallel_tool_calls",
            "stream",
            "tool_choice",
            "tools",
        ],
        "input_item_fields": [["content", "role"]],
        "model": "openai/gpt-oss-120b",
        "tool_names": [
            "list_supported_services",
            "get_verified_procedure",
            "get_readiness_questions",
            "evaluate_readiness",
            "build_personalized_checklist",
            "prepare_synthetic_form_assistance",
            "explain_simulated_status",
        ],
        "tool_fields": ["description", "name", "parameters", "strict", "type"],
        "root_schema_fields": ["additionalProperties", "properties", "required", "type"],
    }
    serialized = json.dumps(snapshot)
    assert "test-key" not in serialized
    assert "Authorization" not in serialized


@pytest.mark.anyio
async def test_successful_normal_ai_turn_for_selected_service() -> None:
    final_output = {
        "guidance_message": "I can help with the verified Kerala pension procedure.",
        "selection_state": "selected",
        "service_id": "kerala-ign-oap",
        "action_ids": ["view-procedure"],
    }
    runtime, responses = fake_runtime([SimpleNamespace(status="completed", output=[], output_text=json.dumps(final_output))])
    turn = AssistantTurnRequest(
        locale="en",
        message="What documents are covered by this pension procedure?",
        service_id="kerala-ign-oap",
        consent=True,
    )
    result = await run_assistant_turn(turn, load_procedure_registry(default_pack_root()), runtime, "normal-turn")
    assert result.status == "ok"
    assert result.selection.service_id == "kerala-ign-oap"
    assert responses.calls and responses.calls[0]["model"] == AGENT_MODEL


@pytest.mark.anyio
async def test_cross_service_intent_offers_only_verified_catalogue_switch_without_provider() -> None:
    runtime, responses = fake_runtime([])
    turn = AssistantTurnRequest(
        locale="en",
        message="I need to update my Aadhaar address",
        service_id="kerala-ign-oap",
        consent=True,
    )
    result = await run_assistant_turn(turn, load_procedure_registry(default_pack_root()), runtime, "cross-service")
    assert result.status == "ok"
    assert result.selection.state == "clarification"
    assert [choice.service_id for choice in result.selection.choices] == ["uidai-aadhaar-address-update"]
    assert result.fact_cards == []
    assert responses.calls == []


@pytest.mark.anyio
async def test_ambiguous_address_change_inside_pension_distinguishes_both_catalogue_paths() -> None:
    runtime, responses = fake_runtime([])
    turn = AssistantTurnRequest(
        locale="en",
        message="i need to change the address",
        service_id="kerala-ign-oap",
        consent=True,
    )
    result = await run_assistant_turn(turn, load_procedure_registry(default_pack_root()), runtime, "ambiguous-address")
    assert result.status == "ok"
    assert result.selection.state == "clarification"
    assert [choice.service_id for choice in result.selection.choices] == [
        "uidai-aadhaar-address-update",
        "kerala-ign-oap",
    ]
    assert "Aadhaar address update" in result.message
    assert "pension record" in result.message
    assert "no separate verified pension-record address-change procedure" in result.message
    assert responses.calls == []


@pytest.mark.anyio
async def test_pension_record_address_request_does_not_invent_an_unverified_procedure() -> None:
    runtime, responses = fake_runtime([])
    turn = AssistantTurnRequest(
        locale="en",
        message="I need to change the address on my pension record",
        service_id="kerala-ign-oap",
        consent=True,
    )
    result = await run_assistant_turn(turn, load_procedure_registry(default_pack_root()), runtime, "pension-address")
    assert result.status == "ok"
    assert [choice.service_id for choice in result.selection.choices] == ["kerala-ign-oap"]
    assert "does not contain a separate pension-record address-change procedure" in result.message
    assert result.fact_cards == []
    assert responses.calls == []


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


def test_tool_arguments_reject_missing_and_extra_fields() -> None:
    registry = load_procedure_registry(default_pack_root())
    for arguments in ({}, {"locale": "en", "unexpected": True}):
        output, service_id, status_id = _execute_tool("list_supported_services", json.dumps(arguments), registry)
        assert (service_id, status_id) == (None, None)
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


@pytest.mark.parametrize(
    ("name", "arguments", "expected_service", "expected_status"),
    [
        ("list_supported_services", {"locale": "en"}, None, None),
        ("get_verified_procedure", {"service_id": "uidai-aadhaar-address-update", "locale": "en"}, "uidai-aadhaar-address-update", None),
        ("get_readiness_questions", {"service_id": "uidai-aadhaar-address-update", "locale": "en", "answers": []}, "uidai-aadhaar-address-update", None),
        ("evaluate_readiness", {"service_id": "uidai-aadhaar-address-update", "locale": "en", "answers": []}, "uidai-aadhaar-address-update", None),
        ("build_personalized_checklist", {"service_id": "uidai-aadhaar-address-update", "locale": "en", "answers": []}, "uidai-aadhaar-address-update", None),
        ("prepare_synthetic_form_assistance", {"service_id": "uidai-aadhaar-address-update", "locale": "en", "persona_id": None}, "uidai-aadhaar-address-update", None),
        ("explain_simulated_status", {"service_id": "uidai-aadhaar-address-update", "locale": "en", "status_id": "action-required"}, "uidai-aadhaar-address-update", "action-required"),
    ],
)
def test_every_allowlisted_tool_dispatches_only_to_validated_deterministic_service(
    name: str,
    arguments: dict[str, object],
    expected_service: str | None,
    expected_status: str | None,
) -> None:
    output, service_id, status_id = _execute_tool(name, json.dumps(arguments), load_procedure_registry(default_pack_root()))
    payload = json.loads(output)
    assert payload != {"error": "Invalid tool request"}
    assert service_id == expected_service
    assert status_id == expected_status
    assert "raw_ocr_text" not in output
    assert "GROQ_API_KEY" not in output


@pytest.mark.parametrize(
    ("name", "arguments"),
    [
        ("list_supported_services", {"locale": "unsupported"}),
        ("get_verified_procedure", {"service_id": "uidai-aadhaar-address-update"}),
        (
            "get_readiness_questions",
            {
                "service_id": "uidai-aadhaar-address-update",
                "locale": "en",
                "answers": [{"question_id": "mobile-auth-access", "value": True, "unexpected": "private"}],
            },
        ),
        (
            "evaluate_readiness",
            {
                "service_id": "uidai-aadhaar-address-update",
                "locale": "en",
                "answers": [{"question_id": "mobile-auth-access", "value": {"unexpected": "private"}}],
            },
        ),
        ("build_personalized_checklist", {"service_id": "invented-service", "locale": "en", "answers": []}),
        (
            "prepare_synthetic_form_assistance",
            {"service_id": "uidai-aadhaar-address-update", "locale": "en", "persona_id": "invented-persona"},
        ),
        (
            "explain_simulated_status",
            {"service_id": "uidai-aadhaar-address-update", "locale": "en", "status_id": "real-status"},
        ),
    ],
)
def test_every_allowlisted_tool_rejects_invalid_arguments_without_echo(
    name: str,
    arguments: dict[str, object],
) -> None:
    output, service_id, status_id = _execute_tool(
        name,
        json.dumps(arguments),
        load_procedure_registry(default_pack_root()),
    )
    assert (service_id, status_id) == (None, None)
    assert json.loads(output) == {"error": "Invalid tool request"}
    assert "private" not in output


@pytest.mark.parametrize(
    ("name", "arguments"),
    [
        ("list_supported_services", {"locale": "unsupported"}),
        ("get_verified_procedure", {"service_id": "uidai-aadhaar-address-update"}),
        (
            "get_readiness_questions",
            {"service_id": "uidai-aadhaar-address-update", "locale": "en", "answers": "invalid"},
        ),
        (
            "evaluate_readiness",
            {"service_id": "uidai-aadhaar-address-update", "locale": "en", "answers": "invalid"},
        ),
        (
            "build_personalized_checklist",
            {"service_id": "uidai-aadhaar-address-update", "locale": "en", "answers": "invalid"},
        ),
        (
            "prepare_synthetic_form_assistance",
            {"service_id": "uidai-aadhaar-address-update", "locale": "en", "persona_id": "invalid"},
        ),
        (
            "explain_simulated_status",
            {"service_id": "uidai-aadhaar-address-update", "locale": "en", "status_id": "invalid"},
        ),
    ],
)
@pytest.mark.anyio
async def test_every_allowlisted_tool_invalid_call_fails_closed_without_continuation(
    name: str,
    arguments: dict[str, object],
) -> None:
    function_call = SimpleNamespace(
        type="function_call",
        name=name,
        arguments=json.dumps(arguments),
        call_id=f"invalid-{name}",
    )
    runtime, responses = fake_runtime([SimpleNamespace(status="completed", output=[function_call], output_text="")])
    result = await run_assistant_turn(
        request(),
        load_procedure_registry(default_pack_root()),
        runtime,
        f"invalid-{name}",
    )
    assert result.status == "fallback"
    assert result.tool_trace == []
    assert len(responses.calls) == 1


@pytest.mark.parametrize(
    ("name", "arguments", "demo_status_id"),
    [
        ("list_supported_services", {"locale": "en"}, None),
        ("get_verified_procedure", {"service_id": "uidai-aadhaar-address-update", "locale": "en"}, None),
        ("get_readiness_questions", {"service_id": "uidai-aadhaar-address-update", "locale": "en", "answers": []}, None),
        ("evaluate_readiness", {"service_id": "uidai-aadhaar-address-update", "locale": "en", "answers": []}, None),
        ("build_personalized_checklist", {"service_id": "uidai-aadhaar-address-update", "locale": "en", "answers": []}, None),
        ("prepare_synthetic_form_assistance", {"service_id": "uidai-aadhaar-address-update", "locale": "en", "persona_id": None}, None),
        ("explain_simulated_status", {"service_id": "uidai-aadhaar-address-update", "locale": "en", "status_id": "action-required"}, "action-required"),
    ],
)
@pytest.mark.anyio
async def test_every_allowlisted_tool_completes_the_bounded_provider_loop(
    name: str,
    arguments: dict[str, object],
    demo_status_id: str | None,
) -> None:
    function_call = SimpleNamespace(type="function_call", name=name, arguments=json.dumps(arguments), call_id=f"call-{name}")
    final_output = {
        "guidance_message": "I used only the verified deterministic service.",
        "selection_state": "selected",
        "service_id": "uidai-aadhaar-address-update",
        "action_ids": ["view-procedure"],
    }
    runtime, responses = fake_runtime([
        SimpleNamespace(status="completed", output=[function_call], output_text=""),
        SimpleNamespace(status="completed", output=[], output_text=json.dumps(final_output)),
    ])
    turn = AssistantTurnRequest(
        locale="en",
        message="Explain the verified service",
        service_id="uidai-aadhaar-address-update",
        demo_status_id=demo_status_id,
        consent=True,
    )
    result = await run_assistant_turn(turn, load_procedure_registry(default_pack_root()), runtime, f"loop-{name}")
    assert result.status == "ok"
    assert result.tool_trace == [name]
    assert result.selection.service_id == "uidai-aadhaar-address-update"
    assert len(responses.calls) == 2
    assert responses.calls[1]["input"][-1]["call_id"] == f"call-{name}"
    assert responses.calls[1]["input"][-1]["type"] == "function_call_output"


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

    schema_invalid = json.dumps({
        "guidance_message": "Do something",
        "selection_state": "selected",
        "service_id": "uidai-aadhaar-address-update",
        "action_ids": "view-procedure",
        "extra": True,
    })
    runtime, _ = fake_runtime([SimpleNamespace(output=[], output_text=schema_invalid)])
    rejected = await run_assistant_turn(request(), load_procedure_registry(default_pack_root()), runtime, "127.0.0.5")
    assert rejected.status == "fallback"

    oversized = json.dumps({
        "guidance_message": "x" * 1201,
        "selection_state": "selected",
        "service_id": "uidai-aadhaar-address-update",
        "action_ids": ["view-procedure"],
    })
    runtime, _ = fake_runtime([SimpleNamespace(output=[], output_text=oversized)])
    rejected = await run_assistant_turn(request(), load_procedure_registry(default_pack_root()), runtime, "127.0.0.6")
    assert rejected.status == "fallback"


@pytest.mark.anyio
async def test_schema_failure_logs_only_safe_reason_metadata(caplog: pytest.LogCaptureFixture) -> None:
    unsafe_output = '{"guidance_message":"private model detail","action_ids":"wrong"}'
    runtime, _ = fake_runtime([SimpleNamespace(status="completed", output=[], output_text=unsafe_output)])
    with caplog.at_level("WARNING", logger="sahayi_api.agent"):
        result = await run_assistant_turn(request(), load_procedure_registry(default_pack_root()), runtime, "schema-failure")
    assert result.status == "fallback"
    assert "reason=model_output_schema_invalid" in caplog.text
    assert "private model detail" not in caplog.text


@pytest.mark.anyio
async def test_incomplete_and_malformed_provider_responses_are_logged_separately(caplog: pytest.LogCaptureFixture) -> None:
    runtime, _ = fake_runtime([SimpleNamespace(status="incomplete", output=[], output_text="private partial output")])
    with caplog.at_level("WARNING", logger="sahayi_api.agent"):
        incomplete = await run_assistant_turn(request(), load_procedure_registry(default_pack_root()), runtime, "incomplete-response")
    assert incomplete.status == "fallback"
    assert "reason=provider_response_not_completed" in caplog.text
    assert "private partial output" not in caplog.text

    caplog.clear()
    runtime, _ = fake_runtime([SimpleNamespace(status="completed", output=None, output_text="private malformed output")])
    with caplog.at_level("WARNING", logger="sahayi_api.agent"):
        malformed = await run_assistant_turn(request(), load_procedure_registry(default_pack_root()), runtime, "malformed-response")
    assert malformed.status == "fallback"
    assert "reason=malformed_provider_response" in caplog.text
    assert "private malformed output" not in caplog.text


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
async def test_provider_timeout_is_generic_and_excessive_tool_loop_is_bounded(caplog: pytest.LogCaptureFixture) -> None:
    runtime, _ = fake_runtime([TimeoutError("provider-secret-detail")])
    with caplog.at_level("WARNING", logger="sahayi_api.agent"):
        timed_out = await run_assistant_turn(request(), load_procedure_registry(default_pack_root()), runtime, "127.0.0.1")
    assert timed_out.status == "fallback"
    assert "provider-secret-detail" not in timed_out.message
    assert "reason=provider_timeout" in caplog.text
    assert "exception_type=TimeoutError" in caplog.text
    assert "provider-secret-detail" not in caplog.text

    call = SimpleNamespace(type="function_call", name="list_supported_services", arguments='{"locale":"en"}', call_id="call")
    settings = replace(get_settings(), agent_enabled=True, groq_api_key="test-key", agent_max_tool_calls=1, agent_request_budget=10)
    runtime = AgentRuntime(settings)
    responses = FakeResponses([SimpleNamespace(output=[call, call], output_text="")])
    runtime.client = SimpleNamespace(responses=responses)
    bounded = await run_assistant_turn(request(), load_procedure_registry(default_pack_root()), runtime, "127.0.0.3")
    assert bounded.status == "fallback"
    assert len(responses.calls) == 1


@pytest.mark.parametrize(
    ("status_code", "expected", "reason"),
    [
        (400, "fallback", "provider_bad_request"),
        (401, "fallback", "provider_authentication_error"),
        (403, "fallback", "provider_permission_error"),
        (408, "fallback", "provider_timeout"),
        (429, "rate_limited", "provider_rate_limit"),
        (500, "fallback", "provider_server_error"),
        (503, "fallback", "provider_server_error"),
    ],
)
@pytest.mark.anyio
async def test_provider_http_errors_are_generic_without_retries(
    status_code: int,
    expected: str,
    reason: str,
    caplog: pytest.LogCaptureFixture,
) -> None:
    class ProviderError(Exception):
        pass

    error = ProviderError("provider-secret-detail")
    error.status_code = status_code
    runtime, responses = fake_runtime([error])
    with caplog.at_level("WARNING", logger="sahayi_api.agent"):
        result = await run_assistant_turn(request(), load_procedure_registry(default_pack_root()), runtime, f"error-{status_code}")
    assert result.status == expected
    assert "provider-secret-detail" not in result.message
    assert len(responses.calls) == 1
    assert f"reason={reason}" in caplog.text
    assert "provider-secret-detail" not in caplog.text


@pytest.mark.anyio
async def test_provider_http_400_logs_only_safe_structured_fields(caplog: pytest.LogCaptureFixture) -> None:
    class ProviderError(Exception):
        pass

    error = ProviderError("private provider message")
    error.status_code = 400
    error.body = {
        "error": {
            "message": "private request-bearing provider message",
            "type": "invalid_request_error",
            "code": "json_schema_invalid",
            "param": "tools[2].parameters.properties.answers.items.properties.value.type",
        }
    }
    runtime, responses = fake_runtime([error])
    with caplog.at_level("WARNING", logger="sahayi_api.agent"):
        result = await run_assistant_turn(request(), load_procedure_registry(default_pack_root()), runtime, "safe-400")
    assert result.status == "fallback"
    assert len(responses.calls) == 1
    assert "status_code=400" in caplog.text
    assert "provider_error_type=invalid_request_error" in caplog.text
    assert "provider_error_code=json_schema_invalid" in caplog.text
    assert "provider_error_param=tools[2].parameters.properties.answers.items.properties.value.type" in caplog.text
    assert "private provider message" not in caplog.text
    assert "private request-bearing provider message" not in caplog.text


@pytest.mark.anyio
async def test_provider_error_metadata_rejects_content_bearing_fields(caplog: pytest.LogCaptureFixture) -> None:
    class ProviderError(Exception):
        pass

    error = ProviderError("private provider message")
    error.status_code = 400
    error.body = {"type": "citizen", "code": "CitizenName", "param": "message.citizen_text"}
    runtime, _ = fake_runtime([error])
    with caplog.at_level("WARNING", logger="sahayi_api.agent"):
        await run_assistant_turn(request(), load_procedure_registry(default_pack_root()), runtime, "unsafe-fields")
    assert "provider_error_type=None" in caplog.text
    assert "provider_error_code=None" in caplog.text
    assert "provider_error_param=None" in caplog.text
    assert "citizen" not in caplog.text.lower()
    assert "CitizenName" not in caplog.text


@pytest.mark.anyio
async def test_round_and_output_limits_are_applied_without_retry() -> None:
    call = SimpleNamespace(type="function_call", name="list_supported_services", arguments='{"locale":"en"}', call_id="round-call")
    runtime, responses = fake_runtime([SimpleNamespace(output=[call], output_text="")])
    runtime.settings = replace(runtime.settings, agent_max_rounds=1, agent_max_output_tokens=333)
    result = await run_assistant_turn(request(), load_procedure_registry(default_pack_root()), runtime, "round-limit")
    assert result.status == "fallback"
    assert len(responses.calls) == 1
    assert responses.calls[0]["max_output_tokens"] == 333


def test_groq_provider_selection_defaults_and_client_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setenv("SAHAYI_AGENT_PROVIDER", "not-allowed")
    monkeypatch.setenv("SAHAYI_AGENT_MODEL", "not-allowed")
    settings = get_settings()
    assert settings.agent_provider == AGENT_PROVIDER
    assert settings.agent_model == AGENT_MODEL
    assert AgentRuntime(replace(settings, agent_enabled=True)).available is False

    captured: dict[str, object] = {}
    sentinel = SimpleNamespace(responses=SimpleNamespace())

    def fake_client(**kwargs):
        captured.update(kwargs)
        return sentinel

    monkeypatch.setattr("openai.AsyncOpenAI", fake_client)
    runtime = AgentRuntime(replace(settings, agent_enabled=True, agent_configuration_valid=True, groq_api_key="test-key"))
    assert runtime.available is True
    assert runtime.get_client() is sentinel
    assert captured == {
        "api_key": "test-key",
        "base_url": GROQ_BASE_URL,
        "timeout": settings.agent_timeout_seconds,
        "max_retries": 0,
    }


def test_provider_key_is_trimmed_and_invalid_provider_or_model_disables_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SAHAYI_AGENT_ENABLED", "true")
    monkeypatch.setenv("GROQ_API_KEY", "  test-key-with-whitespace  ")
    monkeypatch.setenv("SAHAYI_AGENT_PROVIDER", AGENT_PROVIDER)
    monkeypatch.setenv("SAHAYI_AGENT_MODEL", AGENT_MODEL)
    settings = get_settings()
    assert settings.groq_api_key == "test-key-with-whitespace"
    assert settings.agent_configuration_valid is True
    assert AgentRuntime(settings).available is True

    monkeypatch.setenv("SAHAYI_AGENT_MODEL", "not-allowed")
    invalid = get_settings()
    assert invalid.agent_model == AGENT_MODEL
    assert invalid.agent_configuration_valid is False
    assert AgentRuntime(invalid).available is False


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
    assert config.json()["agent_provider"] == AGENT_PROVIDER
    assert config.json()["agent_model"] == AGENT_MODEL
    assert turn.status_code == 200
    assert turn.headers["cache-control"] == "no-store"
    assert turn.json()["selection"]["service_id"] == "uidai-aadhaar-address-update"
    assert len(responses.calls) == 1

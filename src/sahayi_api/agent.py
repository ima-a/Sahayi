from __future__ import annotations

import asyncio
import hashlib
import json
import re
import secrets
import time
from collections import defaultdict, deque
from typing import Annotated, Any, Literal, Protocol

from pydantic import Field, StringConstraints, ValidationError

from sahayi_api.assistance import build_personalized_checklist, prepare_synthetic_form_assistance
from sahayi_api.config import AGENT_PROVIDER, GROQ_BASE_URL, Settings
from sahayi_api.privacy import conversation_contains_high_risk_pii
from sahayi_api.procedures import (
    Identifier,
    LoadedProcedure,
    ShortText,
    SourceRecord,
    StrictModel,
    SupportedLocale,
    detail_procedure,
    localized_sources,
    localized_text,
    summarize_procedure,
)
from sahayi_api.readiness import AnswerValue, ReadinessInputError, evaluate_readiness
from sahayi_api.simulation import DemoStatusId, explain_simulated_status


CurrentMessage = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
PriorContent = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]

TOOL_NAMES = (
    "list_supported_services",
    "get_verified_procedure",
    "get_readiness_questions",
    "evaluate_readiness",
    "build_personalized_checklist",
    "prepare_synthetic_form_assistance",
    "explain_simulated_status",
)
ACTION_IDS = {
    "view-procedure",
    "start-readiness",
    "build-checklist",
    "prepare-synthetic-form",
    "open-official-service",
}
_UNSAFE_MODEL_PROSE = re.compile(
    r"(?iu)https?://|www\.|\b(?:you are|application is) (?:approved|eligible)\b|"
    r"\b(?:the )?fee is\s*(?:₹|rs\.?|inr)|\bI (?:submitted|filled|tracked|monitored)\b|"
    r"आप (?:पात्र|स्वीकृत) हैं|आवेदन स्वीकृत है|शुल्क (?:₹|रु|rs)|"
    r"നിങ്ങൾ (?:അർഹനാണ്|അർഹയാണ്)|അപേക്ഷ അംഗീകരിച്ചു|ഫീസ് (?:₹|rs)"
)


class PriorMessage(StrictModel):
    role: Literal["user", "assistant"]
    content: PriorContent


class AssistantTurnRequest(StrictModel):
    locale: SupportedLocale
    message: CurrentMessage
    history: Annotated[list[PriorMessage], Field(default_factory=list, max_length=4)]
    service_id: Identifier | None = None
    readiness_answers: Annotated[dict[Identifier, AnswerValue], Field(default_factory=dict, max_length=30)]
    demo_status_id: DemoStatusId | None = None
    consent: Literal[True]


class ServiceChoice(StrictModel):
    service_id: Identifier
    title: ShortText


class SelectionState(StrictModel):
    state: Literal["none", "clarification", "selected"]
    service_id: Identifier | None
    choices: Annotated[list[ServiceChoice], Field(max_length=4)]


class FactCard(StrictModel):
    card_id: Identifier
    title: ShortText
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2400)]
    source_ids: Annotated[list[str], Field(max_length=12)]


class AgentAction(StrictModel):
    action_id: Identifier
    label: ShortText
    service_id: Identifier | None


class AssistantTurnResponse(StrictModel):
    status: Literal["ok", "fallback", "blocked", "unavailable", "rate_limited"]
    locale: SupportedLocale
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1600)]
    selection: SelectionState
    fact_cards: Annotated[list[FactCard], Field(max_length=8)]
    sources: Annotated[list[SourceRecord], Field(max_length=20)]
    actions: Annotated[list[AgentAction], Field(max_length=8)]
    tool_trace: Annotated[list[Literal[
        "list_supported_services",
        "get_verified_procedure",
        "get_readiness_questions",
        "evaluate_readiness",
        "build_personalized_checklist",
        "prepare_synthetic_form_assistance",
        "explain_simulated_status",
    ]], Field(max_length=8)]
    disclaimer: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=800)]
    fallback: bool


class AgentModelOutput(StrictModel):
    guidance_message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1200)]
    selection_state: Literal["none", "clarification", "selected"]
    service_id: str | None
    action_ids: Annotated[list[str], Field(max_length=8)]


class ToolServiceListInput(StrictModel):
    locale: SupportedLocale


class ToolProcedureInput(StrictModel):
    service_id: Identifier
    locale: SupportedLocale


class ToolReadinessAnswer(StrictModel):
    question_id: Identifier
    value: AnswerValue


class ToolReadinessInput(ToolProcedureInput):
    answers: Annotated[list[ToolReadinessAnswer], Field(max_length=30)]


class ToolPersonaInput(ToolProcedureInput):
    persona_id: Identifier | None


class ToolStatusInput(ToolProcedureInput):
    status_id: DemoStatusId


class ResponsesClient(Protocol):
    responses: Any


class AgentProvider(Protocol):
    @property
    def available(self) -> bool: ...

    def get_client(self) -> ResponsesClient: ...


class GroqProvider:
    """Application-controlled Groq Responses API configuration."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client: ResponsesClient | None = None

    @property
    def available(self) -> bool:
        return (
            self.settings.agent_enabled
            and self.settings.agent_provider == AGENT_PROVIDER
            and bool(self.settings.groq_api_key)
        )

    def get_client(self) -> ResponsesClient:
        if self.client is None:
            from openai import AsyncOpenAI

            self.client = AsyncOpenAI(
                api_key=self.settings.groq_api_key,
                base_url=GROQ_BASE_URL,
                timeout=self.settings.agent_timeout_seconds,
                max_retries=0,
            )
        return self.client


class RateLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._salt = secrets.token_bytes(32)
        self._entries: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    def client_key(self, address: str) -> str:
        return hashlib.blake2b(address.encode("utf-8"), key=self._salt, digest_size=16).hexdigest()

    async def allow(self, key: str, now: float | None = None) -> bool:
        current = time.monotonic() if now is None else now
        cutoff = current - self.window_seconds
        async with self._lock:
            for entry_key in list(self._entries):
                queue = self._entries[entry_key]
                while queue and queue[0] <= cutoff:
                    queue.popleft()
                if not queue:
                    del self._entries[entry_key]
            queue = self._entries[key]
            if len(queue) >= self.limit:
                return False
            queue.append(current)
            return True


class RequestBudget:
    def __init__(self, limit: int) -> None:
        self.remaining = limit
        self._lock = asyncio.Lock()

    async def take(self) -> bool:
        async with self._lock:
            if self.remaining <= 0:
                return False
            self.remaining -= 1
            return True


class AgentRuntime:
    def __init__(self, settings: Settings, provider: AgentProvider | None = None) -> None:
        self.settings = settings
        self.provider = provider or GroqProvider(settings)
        self.rate_limiter = RateLimiter(settings.agent_rate_limit, settings.agent_rate_window_seconds)
        self.request_budget = RequestBudget(settings.agent_request_budget)
        self.semaphore = asyncio.Semaphore(settings.agent_concurrency)
        self.client: ResponsesClient | None = None

    @property
    def available(self) -> bool:
        return self.provider.available

    def get_client(self) -> ResponsesClient:
        if self.client is None:
            self.client = self.provider.get_client()
        return self.client


_COPY = {
    "en": {
        "blocked": "I cannot use that message because it may contain personal identifying information. Remove identifiers, contact details, addresses, and document data, then try again.",
        "unavailable": "Ask Sahayi AI is unavailable. You can still browse verified procedures and use the deterministic readiness check.",
        "fallback": "I could not complete the AI-guided turn. The verified procedure catalogue and deterministic checks remain available.",
        "rate": "Ask Sahayi AI is receiving too many requests. Please use the deterministic guidance or try again later.",
        "disclaimer": "AI guidance is a prototype, may be wrong, and is never an eligibility decision or approval. Official sources prevail.",
        "clarify": "Choose one supported service so I can use only its verified guidance.",
        "view": "View verified procedure",
        "readiness": "Start deterministic readiness check",
        "checklist": "Build personalized checklist",
        "form": "Prepare synthetic demo worksheet",
        "official": "Open official service",
        "requirements": "Verified requirements",
        "fee": "Fee information",
    },
    "hi": {
        "blocked": "मैं इस संदेश का उपयोग नहीं कर सकता क्योंकि इसमें निजी पहचान जानकारी हो सकती है। पहचान, संपर्क, पता और दस्तावेज़ विवरण हटाकर फिर प्रयास करें।",
        "unavailable": "Ask Sahayi AI उपलब्ध नहीं है। आप सत्यापित प्रक्रियाएँ और नियत तैयारी जाँच अभी भी उपयोग कर सकते हैं।",
        "fallback": "AI-मार्गदर्शित चरण पूरा नहीं हो सका। सत्यापित प्रक्रिया सूची और नियत जाँच उपलब्ध हैं।",
        "rate": "Ask Sahayi AI पर अभी बहुत अधिक अनुरोध हैं। नियत मार्गदर्शन उपयोग करें या बाद में प्रयास करें।",
        "disclaimer": "AI मार्गदर्शन एक प्रोटोटाइप है, गलत हो सकता है और कभी भी पात्रता निर्णय या स्वीकृति नहीं है। आधिकारिक स्रोत मान्य हैं।",
        "clarify": "केवल सत्यापित मार्गदर्शन उपयोग करने के लिए एक समर्थित सेवा चुनें।",
        "view": "सत्यापित प्रक्रिया देखें",
        "readiness": "नियत तैयारी जाँच शुरू करें",
        "checklist": "व्यक्तिगत चेकलिस्ट बनाएँ",
        "form": "कृत्रिम डेमो वर्कशीट तैयार करें",
        "official": "आधिकारिक सेवा खोलें",
        "requirements": "सत्यापित आवश्यकताएँ",
        "fee": "शुल्क जानकारी",
    },
    "ml": {
        "blocked": "ഈ സന്ദേശത്തിൽ വ്യക്തിയെ തിരിച്ചറിയുന്ന വിവരങ്ങൾ ഉണ്ടായേക്കാം; അതിനാൽ എനിക്ക് ഇത് ഉപയോഗിക്കാനാകില്ല. തിരിച്ചറിയൽ, ബന്ധപ്പെടൽ, വിലാസം, രേഖാ വിവരങ്ങൾ നീക്കി വീണ്ടും ശ്രമിക്കുക.",
        "unavailable": "Ask Sahayi AI ലഭ്യമല്ല. പരിശോധിച്ച നടപടികളും നിർണിത തയ്യാറെടുപ്പ് പരിശോധനയും തുടർന്നും ഉപയോഗിക്കാം.",
        "fallback": "AI മാർഗനിർദേശ ഘട്ടം പൂർത്തിയാക്കാനായില്ല. പരിശോധിച്ച നടപടിപ്പട്ടികയും നിർണിത പരിശോധനകളും ലഭ്യമാണ്.",
        "rate": "Ask Sahayi AIക്ക് ഇപ്പോൾ വളരെ അധികം അഭ്യർത്ഥനകളുണ്ട്. നിർണിത മാർഗനിർദേശം ഉപയോഗിക്കുക അല്ലെങ്കിൽ പിന്നീട് ശ്രമിക്കുക.",
        "disclaimer": "AI മാർഗനിർദേശം ഒരു പ്രോട്ടോടൈപ്പാണ്, തെറ്റാകാം, അർഹതാ തീരുമാനമോ അംഗീകാരമോ ഒരിക്കലും അല്ല. ഔദ്യോഗിക സ്രോതസ്സുകളാണ് പ്രാബല്യത്തിലുള്ളത്.",
        "clarify": "പരിശോധിച്ച മാർഗനിർദേശം മാത്രം ഉപയോഗിക്കാൻ പിന്തുണയുള്ള ഒരു സേവനം തിരഞ്ഞെടുക്കുക.",
        "view": "പരിശോധിച്ച നടപടി കാണുക",
        "readiness": "നിർണിത തയ്യാറെടുപ്പ് പരിശോധന തുടങ്ങുക",
        "checklist": "വ്യക്തിഗത ചെക്ക്‌ലിസ്റ്റ് നിർമ്മിക്കുക",
        "form": "കൃത്രിമ ഡെമോ വർക്ക്‌ഷീറ്റ് തയ്യാറാക്കുക",
        "official": "ഔദ്യോഗിക സേവനം തുറക്കുക",
        "requirements": "പരിശോധിച്ച ആവശ്യകതകൾ",
        "fee": "ഫീസ് വിവരം",
    },
}


def _empty_selection(state: Literal["none", "clarification", "selected"] = "none") -> SelectionState:
    return SelectionState(state=state, service_id=None, choices=[])


def safe_response(
    locale: SupportedLocale,
    status: Literal["fallback", "blocked", "unavailable", "rate_limited"],
    *,
    choices: list[ServiceChoice] | None = None,
) -> AssistantTurnResponse:
    key = {"blocked": "blocked", "unavailable": "unavailable", "fallback": "fallback", "rate_limited": "rate"}[status]
    available_choices = choices or []
    return AssistantTurnResponse(
        status=status,
        locale=locale,
        message=_COPY[locale][key],
        selection=SelectionState(state="clarification" if available_choices else "none", service_id=None, choices=available_choices),
        fact_cards=[],
        sources=[],
        actions=[],
        tool_trace=[],
        disclaimer=_COPY[locale]["disclaimer"],
        fallback=True,
    )


async def run_assistant_turn(
    request: AssistantTurnRequest,
    registry: dict[str, LoadedProcedure],
    runtime: AgentRuntime,
    client_address: str,
) -> AssistantTurnResponse:
    history_text = [message.content for message in request.history]
    if conversation_contains_high_risk_pii(request.message, history_text):
        return safe_response(request.locale, "blocked")
    if not runtime.available:
        return safe_response(request.locale, "unavailable")
    key = runtime.rate_limiter.client_key(client_address)
    if not await runtime.rate_limiter.allow(key):
        return safe_response(request.locale, "rate_limited")

    try:
        async with runtime.semaphore:
            return await _provider_turn(request, registry, runtime)
    except Exception as error:
        status = "rate_limited" if getattr(error, "status_code", None) == 429 else "fallback"
        return safe_response(request.locale, status)


async def _provider_turn(
    request: AssistantTurnRequest,
    registry: dict[str, LoadedProcedure],
    runtime: AgentRuntime,
) -> AssistantTurnResponse:
    if request.service_id is not None and request.service_id not in registry:
        return _clarification_response(request.locale, registry, [])
    client = runtime.get_client()
    input_items: list[Any] = [
        {"role": message.role, "content": message.content} for message in request.history
    ]
    input_items.append({"role": "user", "content": request.message})
    trace: list[str] = []
    tool_calls = 0
    selected_id = request.service_id
    explained_status_id: DemoStatusId | None = None

    for _ in range(runtime.settings.agent_max_rounds):
        if not await runtime.request_budget.take():
            return safe_response(request.locale, "fallback")
        response = await client.responses.create(
            model=runtime.settings.agent_model,
            instructions=_instructions(request.locale, selected_id, request.demo_status_id),
            input=input_items,
            tools=_tool_definitions(registry),
            tool_choice="auto",
            parallel_tool_calls=False,
            stream=False,
            max_output_tokens=runtime.settings.agent_max_output_tokens,
        )
        calls = [item for item in response.output if getattr(item, "type", None) == "function_call"]
        if not calls:
            parsed = AgentModelOutput.model_validate_json(response.output_text)
            if parsed.service_id in registry:
                selected_id = parsed.service_id
            return _assemble_response(request.locale, registry, parsed, selected_id, trace, explained_status_id)

        input_items.extend(response.output)
        for call in calls:
            tool_calls += 1
            if tool_calls > runtime.settings.agent_max_tool_calls or call.name not in TOOL_NAMES:
                return safe_response(request.locale, "fallback")
            output, used_service, used_status = _execute_tool(call.name, call.arguments, registry)
            if call.name == "explain_simulated_status" and used_status != request.demo_status_id:
                return safe_response(request.locale, "fallback")
            if used_service is not None:
                selected_id = used_service
            if used_status is not None:
                explained_status_id = used_status
            trace.append(call.name)
            input_items.append({"type": "function_call_output", "call_id": call.call_id, "output": output})
    return safe_response(request.locale, "fallback")


def _instructions(locale: SupportedLocale, service_id: str | None, demo_status_id: DemoStatusId | None) -> str:
    return (
        "You are Sahayi's concise prototype guide. Respond in the requested locale. "
        "Never invent procedure facts, fees, eligibility, URLs, approval, submission, form filling, real tracking, or monitoring. "
        "A simulated status is fictional and may be explained only through explain_simulated_status; never request or accept a real reference number. "
        "Use only the supplied strict functions for facts and use their exact service IDs. Ask for service clarification when needed. "
        "Do not request or repeat identifiers, contact details, addresses, OTPs, document contents, or files. "
        "Return a single JSON object without Markdown and with exactly these fields: "
        "guidance_message (string), selection_state (none, clarification, or selected), "
        "service_id (a supplied service ID or null), and action_ids (an array using only documented action IDs). "
        f"Locale: {locale}. Current validated service: {service_id or 'none'}. Current validated demo status: {demo_status_id or 'none'}."
    )


def _strict_tool(name: str, description: str, properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {
        "type": "function",
        "name": name,
        "description": description,
        "strict": True,
        "parameters": {"type": "object", "properties": properties, "required": required, "additionalProperties": False},
    }


def _tool_definitions(registry: dict[str, LoadedProcedure] | None = None) -> list[dict[str, Any]]:
    locale = {"type": "string", "enum": ["en", "hi", "ml"]}
    service = {"type": "string", "enum": sorted(registry) if registry is not None else ["uidai-aadhaar-address-update", "kerala-ign-oap"]}
    question_ids = sorted({
        question.question_id
        for loaded in (registry or {}).values()
        for question in loaded.pack.readiness.questions
    })
    answers = {
        "type": "array",
        "maxItems": 30,
        "items": {
            "type": "object",
            "properties": {
                "question_id": {"type": "string", "enum": question_ids},
                "value": {"type": ["boolean", "integer", "string"]},
            },
            "required": ["question_id", "value"],
            "additionalProperties": False,
        },
    }
    persona_ids = sorted({
        persona.persona_id
        for loaded in (registry or {}).values()
        for persona in (loaded.pack.assistance.personas if loaded.pack.assistance is not None else [])
    })
    status_ids = [status.value for status in DemoStatusId]
    return [
        _strict_tool("list_supported_services", "List only supported verified services.", {"locale": locale}, ["locale"]),
        _strict_tool("get_verified_procedure", "Get the verified procedure pack.", {"service_id": service, "locale": locale}, ["service_id", "locale"]),
        _strict_tool("get_readiness_questions", "Get the next deterministic readiness question.", {"service_id": service, "locale": locale, "answers": answers}, ["service_id", "locale", "answers"]),
        _strict_tool("evaluate_readiness", "Evaluate closed readiness answers deterministically.", {"service_id": service, "locale": locale, "answers": answers}, ["service_id", "locale", "answers"]),
        _strict_tool("build_personalized_checklist", "Build a cited deterministic checklist.", {"service_id": service, "locale": locale, "answers": answers}, ["service_id", "locale", "answers"]),
        _strict_tool("prepare_synthetic_form_assistance", "Prepare a synthetic, non-submittable worksheet.", {"service_id": service, "locale": locale, "persona_id": {"type": ["string", "null"], "enum": [*persona_ids, None]}}, ["service_id", "locale", "persona_id"]),
        _strict_tool("explain_simulated_status", "Explain only a validated fictional demo status; never look up a real application.", {"service_id": service, "locale": locale, "status_id": {"type": "string", "enum": status_ids}}, ["service_id", "locale", "status_id"]),
    ]


def _execute_tool(name: str, arguments: str, registry: dict[str, LoadedProcedure]) -> tuple[str, str | None, DemoStatusId | None]:
    def readiness_answers(value: object) -> dict[str, AnswerValue]:
        if not isinstance(value, list) or len(value) > 30:
            raise ValueError
        result: dict[str, AnswerValue] = {}
        for item in value:
            if not isinstance(item, dict) or set(item) != {"question_id", "value"}:
                raise ValueError
            question_id = item["question_id"]
            answer = item["value"]
            if not isinstance(question_id, str) or question_id in result or type(answer) not in {bool, int, str}:
                raise ValueError
            result[question_id] = answer
        return result

    try:
        values = json.loads(arguments)
        if not isinstance(values, dict):
            raise ValueError
        input_models: dict[str, type[StrictModel]] = {
            "list_supported_services": ToolServiceListInput,
            "get_verified_procedure": ToolProcedureInput,
            "get_readiness_questions": ToolReadinessInput,
            "evaluate_readiness": ToolReadinessInput,
            "build_personalized_checklist": ToolReadinessInput,
            "prepare_synthetic_form_assistance": ToolPersonaInput,
            "explain_simulated_status": ToolStatusInput,
        }
        input_model = input_models.get(name)
        if input_model is None:
            raise ValueError
        values = input_model.model_validate(values).model_dump(mode="json")
        locale = values.get("locale")
        if locale not in {"en", "hi", "ml"}:
            raise ValueError
        if name == "list_supported_services":
            result = [summarize_procedure(loaded, locale=locale).model_dump(mode="json") for loaded in registry.values()]
            return json.dumps(result, ensure_ascii=False), None, None
        service_id = values.get("service_id")
        if service_id not in registry:
            raise ValueError
        loaded = registry[service_id]
        if name == "get_verified_procedure":
            result = detail_procedure(loaded, locale=locale)
        elif name in {"get_readiness_questions", "evaluate_readiness"}:
            answers = readiness_answers(values.get("answers"))
            result = evaluate_readiness(loaded, answers, locale=locale)
        elif name == "build_personalized_checklist":
            answers = readiness_answers(values.get("answers"))
            result = build_personalized_checklist(loaded, answers, locale=locale)
        elif name == "prepare_synthetic_form_assistance":
            result = prepare_synthetic_form_assistance(loaded, values.get("persona_id"), locale=locale)
        elif name == "explain_simulated_status":
            status_id = DemoStatusId(values.get("status_id"))
            result = explain_simulated_status(loaded, status_id, locale=locale)
            return json.dumps(result.model_dump(mode="json"), ensure_ascii=False), service_id, status_id
        else:
            raise ValueError
        return json.dumps(result.model_dump(mode="json"), ensure_ascii=False), service_id, None
    except (ValueError, ValidationError, ReadinessInputError, TypeError):
        return json.dumps({"error": "Invalid tool request"}), None, None


def _clarification_response(locale: SupportedLocale, registry: dict[str, LoadedProcedure], trace: list[str]) -> AssistantTurnResponse:
    choices = [ServiceChoice(service_id=loaded.pack.service_id, title=localized_text(loaded.pack, locale, "title", loaded.pack.title["en"])) for loaded in registry.values()]
    return AssistantTurnResponse(
        status="ok",
        locale=locale,
        message=_COPY[locale]["clarify"],
        selection=SelectionState(state="clarification", service_id=None, choices=choices),
        fact_cards=[],
        sources=[],
        actions=[],
        tool_trace=trace,
        disclaimer=_COPY[locale]["disclaimer"],
        fallback=False,
    )


def _assemble_response(
    locale: SupportedLocale,
    registry: dict[str, LoadedProcedure],
    model_output: AgentModelOutput,
    service_id: str | None,
    trace: list[str],
    explained_status_id: DemoStatusId | None = None,
) -> AssistantTurnResponse:
    if _UNSAFE_MODEL_PROSE.search(model_output.guidance_message):
        return safe_response(locale, "fallback")
    if model_output.selection_state == "clarification" or service_id not in registry:
        return _clarification_response(locale, registry, trace)
    loaded = registry[service_id]
    pack = loaded.pack
    requirements = " ".join(localized_text(pack, locale, f"requirement.{fact.fact_id}", fact.text) for fact in pack.requirements)
    cards = [
        FactCard(card_id="verified-requirements", title=_COPY[locale]["requirements"], text=requirements, source_ids=pack.provenance["requirements"]),
        FactCard(card_id="fee-information", title=_COPY[locale]["fee"], text=localized_text(pack, locale, "fee.display-message", pack.fee.display_message), source_ids=pack.fee.source_ids),
    ]
    if explained_status_id is not None:
        status = explain_simulated_status(loaded, explained_status_id, locale=locale)
        cards.append(
            FactCard(
                card_id=f"demo-{status.status_id.value}",
                title=status.title,
                text=f"{status.explanation} {status.next_action}",
                source_ids=status.source_ids,
            )
        )
    source_ids = {source_id for card in cards for source_id in card.source_ids}
    action_labels = {
        "view-procedure": "view",
        "start-readiness": "readiness",
        "build-checklist": "checklist",
        "prepare-synthetic-form": "form",
        "open-official-service": "official",
    }
    requested = [action_id for action_id in model_output.action_ids if action_id in ACTION_IDS]
    if not requested:
        requested = ["view-procedure", "start-readiness"]
    actions = [AgentAction(action_id=action_id, label=_COPY[locale][action_labels[action_id]], service_id=service_id) for action_id in dict.fromkeys(requested)]
    return AssistantTurnResponse(
        status="ok",
        locale=locale,
        message=model_output.guidance_message,
        selection=SelectionState(state="selected", service_id=service_id, choices=[]),
        fact_cards=cards,
        sources=localized_sources(pack, locale, source_ids),
        actions=actions,
        tool_trace=trace,
        disclaimer=_COPY[locale]["disclaimer"],
        fallback=False,
    )

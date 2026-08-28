from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, date, datetime
from decimal import Decimal
from enum import StrEnum
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    StrictBool,
    StrictInt,
    StringConstraints,
    field_validator,
    model_validator,
)

Identifier = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1200)]
SourceId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)]
SourceIds = Annotated[list[SourceId], Field(min_length=1, max_length=12)]
LocalizedText = Annotated[dict[str, ShortText], Field(min_length=1, max_length=12)]

_HTML = re.compile(r"<\s*/?\s*[a-zA-Z][^>]*>")
_REQUIRED_PROVENANCE = {
    "title",
    "short-description",
    "requirements",
    "required-documents",
    "fee",
    "steps",
    "submission-channels",
    "official-handoff-url",
    "limitations",
    "readiness",
}

MAX_RULE_DEPTH = 8
MAX_RULE_NODES = 128
MAX_RULE_LIST_SIZE = 16


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LifecycleStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    SUPERSEDED = "superseded"


class JurisdictionLevel(StrEnum):
    NATIONAL = "national"
    STATE = "state"
    LOCAL = "local"


class InteractionMode(StrEnum):
    ONLINE = "online"
    IN_PERSON = "in_person"


class SourceType(StrEnum):
    WEBPAGE = "webpage"
    PDF = "pdf"


class TrustState(StrEnum):
    CURRENT = "current"
    STALE = "stale"


class FeeVerificationStatus(StrEnum):
    CONFIRMED = "confirmed"
    CONFLICTING = "conflicting"
    FREE = "free"
    NOT_STATED = "not_stated"


class QuestionAnswerType(StrEnum):
    BOOLEAN = "boolean"
    SINGLE_CHOICE = "single_choice"
    INTEGER = "integer"


class QuestionSensitivity(StrEnum):
    NON_SENSITIVE = "non_sensitive"
    SENSITIVE = "sensitive"


class RuleOperator(StrEnum):
    ALL = "all"
    ANY = "any"
    NOT = "not"
    KNOWN = "known"
    EQUALS = "equals"
    IN = "in"
    LT = "lt"
    LTE = "lte"
    GT = "gt"
    GTE = "gte"


class ReadinessStatus(StrEnum):
    READY = "ready"
    ALTERNATIVE_PATH = "alternative_path"
    NEEDS_INFORMATION = "needs_information"
    CANNOT_CONFIRM = "cannot_confirm"


class Jurisdiction(StrictModel):
    level: JurisdictionLevel
    name: ShortText


class SourceRecord(StrictModel):
    source_id: SourceId
    publisher: ShortText
    title: ShortText
    url: HttpUrl
    retrieved_at: datetime
    official_updated_date: date | None = None
    sha256: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")] | None = None
    source_type: SourceType

    @field_validator("url")
    @classmethod
    def require_https(cls, value: HttpUrl) -> HttpUrl:
        if value.scheme != "https":
            raise ValueError("official source URLs must use HTTPS")
        return value

    @field_validator("retrieved_at")
    @classmethod
    def require_aware_timestamp(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("retrieved_at must include a timezone")
        return value


class CitedFact(StrictModel):
    fact_id: Identifier
    text: LongText
    source_ids: SourceIds


class DocumentGuidance(StrictModel):
    document_id: Identifier
    name: ShortText
    guidance: LongText
    source_ids: SourceIds


class FeeClaim(StrictModel):
    amount: Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)]
    currency: Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]
    qualifier: ShortText
    source_ids: SourceIds


class FeeInformation(StrictModel):
    verification_status: FeeVerificationStatus
    amount: Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)] | None
    currency: Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")] | None
    display_message: ShortText
    claims: Annotated[list[FeeClaim], Field(max_length=8)]
    resolution_guidance: ShortText | None = None
    source_ids: SourceIds

    @model_validator(mode="after")
    def validate_status(self) -> FeeInformation:
        status = self.verification_status
        claim_values = {(claim.amount, claim.currency) for claim in self.claims}
        claim_sources = {source_id for claim in self.claims for source_id in claim.source_ids}

        if status is FeeVerificationStatus.CONFIRMED:
            if self.amount is None or self.currency is None or not self.claims:
                raise ValueError("confirmed fee requires a canonical amount, currency, and at least one claim")
            if self.amount == 0:
                raise ValueError("a zero fee must use free verification status")
            if claim_values != {(self.amount, self.currency)}:
                raise ValueError("confirmed fee claims must agree with the canonical amount and currency")
        elif status is FeeVerificationStatus.CONFLICTING:
            if self.amount is not None or self.currency is not None:
                raise ValueError("conflicting fee must not expose a canonical amount or currency")
            if len(self.claims) < 2 or len(claim_values) < 2:
                raise ValueError("conflicting fee requires at least two distinct claims with different values")
            if self.resolution_guidance is None:
                raise ValueError("conflicting fee requires resolution guidance")
        elif status is FeeVerificationStatus.FREE:
            if self.amount != 0 or self.currency is None or not self.claims:
                raise ValueError("free fee requires a zero canonical amount, currency, and at least one claim")
            if claim_values != {(Decimal("0"), self.currency)}:
                raise ValueError("free fee claims must state zero in the canonical currency")
        elif self.amount is not None or self.currency is not None or self.claims:
            raise ValueError("not_stated fee must not include an amount, currency, or claims")

        if self.claims and claim_sources != set(self.source_ids):
            raise ValueError("fee source_ids must match the sources referenced by its claims")
        return self


class ProcedureStep(StrictModel):
    step_id: Identifier
    order: Annotated[int, Field(ge=1, le=50)]
    title: ShortText
    instruction: LongText
    source_ids: SourceIds


class SubmissionChannel(StrictModel):
    channel_id: Identifier
    mode: InteractionMode
    name: ShortText
    guidance: LongText
    source_ids: SourceIds


class RuleExpression(StrictModel):
    op: RuleOperator
    expressions: Annotated[list[RuleExpression], Field(min_length=1, max_length=MAX_RULE_LIST_SIZE)] | None = None
    expression: RuleExpression | None = None
    question_id: Identifier | None = None
    value: StrictBool | StrictInt | ShortText | None = None
    values: Annotated[list[StrictBool | StrictInt | ShortText], Field(min_length=1, max_length=MAX_RULE_LIST_SIZE)] | None = None

    @model_validator(mode="after")
    def validate_shape(self) -> RuleExpression:
        allowed = {
            RuleOperator.ALL: {"op", "expressions"},
            RuleOperator.ANY: {"op", "expressions"},
            RuleOperator.NOT: {"op", "expression"},
            RuleOperator.KNOWN: {"op", "question_id"},
            RuleOperator.EQUALS: {"op", "question_id", "value"},
            RuleOperator.IN: {"op", "question_id", "values"},
            RuleOperator.LT: {"op", "question_id", "value"},
            RuleOperator.LTE: {"op", "question_id", "value"},
            RuleOperator.GT: {"op", "question_id", "value"},
            RuleOperator.GTE: {"op", "question_id", "value"},
        }[self.op]
        supplied = self.model_fields_set
        if supplied != allowed:
            raise ValueError(f"{self.op} expression requires exactly: {', '.join(sorted(allowed))}")
        return self


class ReadinessOption(StrictModel):
    option_id: Identifier
    label: LocalizedText

    @field_validator("label")
    @classmethod
    def require_english_label(cls, value: dict[str, str]) -> dict[str, str]:
        return _validate_localized_text(value)


class ReadinessQuestion(StrictModel):
    question_id: Identifier
    prompt: LocalizedText
    help_text: LocalizedText | None = None
    answer_type: QuestionAnswerType
    options: Annotated[list[ReadinessOption], Field(min_length=2, max_length=12)] | None = None
    minimum: Annotated[StrictInt, Field(ge=-1000, le=1000)] | None = None
    maximum: Annotated[StrictInt, Field(ge=-1000, le=1000)] | None = None
    required: StrictBool
    sensitivity: QuestionSensitivity
    source_ids: SourceIds
    visible_when: RuleExpression | None = None

    @field_validator("prompt", "help_text")
    @classmethod
    def require_english_text(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        return _validate_localized_text(value) if value is not None else None

    @model_validator(mode="after")
    def validate_answer_contract(self) -> ReadinessQuestion:
        if self.answer_type is QuestionAnswerType.SINGLE_CHOICE:
            if self.options is None or self.minimum is not None or self.maximum is not None:
                raise ValueError("single_choice questions require options and no numeric bounds")
            option_ids = [option.option_id for option in self.options]
            if len(option_ids) != len(set(option_ids)):
                raise ValueError("question option IDs must be unique")
        elif self.answer_type is QuestionAnswerType.INTEGER:
            if self.options is not None or self.minimum is None or self.maximum is None:
                raise ValueError("integer questions require numeric bounds and no options")
            if self.minimum > self.maximum:
                raise ValueError("integer question minimum must not exceed maximum")
        elif self.options is not None or self.minimum is not None or self.maximum is not None:
            raise ValueError("boolean questions cannot define options or numeric bounds")
        return self


class ReadinessOutcome(StrictModel):
    outcome_id: Identifier
    status: ReadinessStatus
    title: LocalizedText
    explanation: LocalizedText
    recommended_next_steps: Annotated[list[LocalizedText], Field(min_length=1, max_length=12)]
    official_handoff_url: HttpUrl
    source_ids: SourceIds
    disclaimer: LocalizedText
    is_default: StrictBool = False

    @field_validator("title", "explanation", "disclaimer")
    @classmethod
    def require_english_text(cls, value: dict[str, str]) -> dict[str, str]:
        return _validate_localized_text(value)

    @field_validator("recommended_next_steps")
    @classmethod
    def require_english_steps(cls, value: list[dict[str, str]]) -> list[dict[str, str]]:
        return [_validate_localized_text(item) for item in value]

    @field_validator("official_handoff_url")
    @classmethod
    def require_https_handoff(cls, value: HttpUrl) -> HttpUrl:
        if value.scheme != "https":
            raise ValueError("official handoff URL must use HTTPS")
        return value


class ReadinessRule(StrictModel):
    rule_id: Identifier
    priority: Annotated[StrictInt, Field(ge=1, le=10000)]
    expression: RuleExpression
    outcome_id: Identifier
    source_ids: SourceIds


class ReadinessDefinition(StrictModel):
    questions: Annotated[list[ReadinessQuestion], Field(min_length=1, max_length=30)]
    additional_review_items: Annotated[list[CitedFact], Field(default_factory=list, max_length=20)]
    outcomes: Annotated[list[ReadinessOutcome], Field(min_length=2, max_length=30)]
    rules: Annotated[list[ReadinessRule], Field(min_length=1, max_length=60)]

    @model_validator(mode="after")
    def validate_definition(self) -> ReadinessDefinition:
        _require_unique([question.question_id for question in self.questions], "question IDs")
        _require_unique([outcome.outcome_id for outcome in self.outcomes], "outcome IDs")
        _require_unique([rule.rule_id for rule in self.rules], "rule IDs")
        _require_unique([rule.priority for rule in self.rules], "rule priorities")

        defaults = [outcome for outcome in self.outcomes if outcome.is_default]
        if len(defaults) != 1 or defaults[0].status is not ReadinessStatus.NEEDS_INFORMATION:
            raise ValueError("readiness requires exactly one needs_information default outcome")

        questions = {question.question_id: question for question in self.questions}
        outcomes = {outcome.outcome_id for outcome in self.outcomes}
        earlier: set[str] = set()
        total_nodes = 0
        for question in self.questions:
            if question.visible_when is not None:
                nodes, referenced = _validate_expression(question.visible_when, questions)
                total_nodes += nodes
                if not referenced <= earlier:
                    raise ValueError("question visibility may reference only earlier questions")
            earlier.add(question.question_id)
        for rule in self.rules:
            if rule.outcome_id not in outcomes:
                raise ValueError(f"unknown outcome reference: {rule.outcome_id}")
            nodes, _ = _validate_expression(rule.expression, questions)
            total_nodes += nodes
        if total_nodes > MAX_RULE_NODES:
            raise ValueError(f"readiness expressions exceed {MAX_RULE_NODES} total nodes")
        return self


def _validate_localized_text(value: dict[str, str]) -> dict[str, str]:
    if "en" not in value:
        raise ValueError("English content is required")
    if any(not re.fullmatch(r"[a-z]{2}(?:-[A-Z]{2})?", locale) for locale in value):
        raise ValueError("invalid locale key")
    return value


def _require_unique(values: list[Any], label: str) -> None:
    if len(values) != len(set(values)):
        raise ValueError(f"{label} must be unique")


def _validate_expression(
    expression: RuleExpression,
    questions: dict[str, ReadinessQuestion],
    depth: int = 1,
) -> tuple[int, set[str]]:
    if depth > MAX_RULE_DEPTH:
        raise ValueError(f"rule expression exceeds maximum depth {MAX_RULE_DEPTH}")
    if expression.op in {RuleOperator.ALL, RuleOperator.ANY}:
        nodes, references = 1, set()
        for child in expression.expressions or []:
            child_nodes, child_references = _validate_expression(child, questions, depth + 1)
            nodes += child_nodes
            references.update(child_references)
        return nodes, references
    if expression.op is RuleOperator.NOT:
        child_nodes, references = _validate_expression(expression.expression, questions, depth + 1)  # type: ignore[arg-type]
        return child_nodes + 1, references

    question = questions.get(expression.question_id or "")
    if question is None:
        raise ValueError(f"unknown question reference: {expression.question_id}")
    value = expression.value
    if expression.op is RuleOperator.IN:
        if question.answer_type is not QuestionAnswerType.SINGLE_CHOICE:
            raise ValueError("in operator requires a single_choice question")
        valid_options = {option.option_id for option in question.options or []}
        if any(not isinstance(item, str) or item not in valid_options for item in expression.values or []):
            raise ValueError("in operator contains an invalid option")
    elif expression.op in {RuleOperator.LT, RuleOperator.LTE, RuleOperator.GT, RuleOperator.GTE}:
        if question.answer_type is not QuestionAnswerType.INTEGER or type(value) is not int:
            raise ValueError("comparison operators require an integer question and integer value")
    elif expression.op is RuleOperator.EQUALS:
        if question.answer_type is QuestionAnswerType.BOOLEAN and type(value) is not bool:
            raise ValueError("boolean equals requires a boolean value")
        if question.answer_type is QuestionAnswerType.INTEGER and type(value) is not int:
            raise ValueError("integer equals requires an integer value")
        if question.answer_type is QuestionAnswerType.SINGLE_CHOICE:
            valid_options = {option.option_id for option in question.options or []}
            if not isinstance(value, str) or value not in valid_options:
                raise ValueError("single_choice equals requires a valid option")
    return 1, {question.question_id}


class ProcedurePack(StrictModel):
    schema_version: Literal["1.0"]
    service_id: Identifier
    pack_version: Annotated[str, StringConstraints(pattern=r"^[1-9]\d*\.\d+\.\d+$", max_length=32)]
    status: LifecycleStatus
    jurisdiction: Jurisdiction
    department: ShortText
    publisher: ShortText
    title: Annotated[dict[str, ShortText], Field(min_length=1, max_length=12)]
    short_description: Annotated[dict[str, ShortText], Field(min_length=1, max_length=12)]
    intent_phrases: Annotated[list[ShortText], Field(min_length=1, max_length=30)]
    category: Identifier
    interaction_modes: Annotated[list[InteractionMode], Field(min_length=1, max_length=4)]
    sources: Annotated[list[SourceRecord], Field(min_length=1, max_length=30)]
    last_verified_at: datetime
    review_due_at: datetime
    requirements: Annotated[list[CitedFact], Field(min_length=1, max_length=30)]
    required_documents: Annotated[list[DocumentGuidance], Field(min_length=1, max_length=30)]
    fee: FeeInformation
    steps: Annotated[list[ProcedureStep], Field(min_length=1, max_length=50)]
    submission_channels: Annotated[list[SubmissionChannel], Field(min_length=1, max_length=8)]
    official_handoff_url: HttpUrl
    tracking_guidance: CitedFact | None = None
    limitations: Annotated[list[CitedFact], Field(min_length=1, max_length=20)]
    readiness: ReadinessDefinition
    provenance: Annotated[dict[Identifier, SourceIds], Field(min_length=1, max_length=100)]

    @field_validator("title", "short_description")
    @classmethod
    def require_english(cls, value: dict[str, str]) -> dict[str, str]:
        if "en" not in value:
            raise ValueError("English content is required")
        if any(not re.fullmatch(r"[a-z]{2}(?:-[A-Z]{2})?", locale) for locale in value):
            raise ValueError("invalid locale key")
        return value

    @field_validator("last_verified_at", "review_due_at")
    @classmethod
    def require_aware_timestamp(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("verification timestamps must include a timezone")
        return value

    @field_validator("official_handoff_url")
    @classmethod
    def require_https_handoff(cls, value: HttpUrl) -> HttpUrl:
        if value.scheme != "https":
            raise ValueError("official handoff URL must use HTTPS")
        return value

    @model_validator(mode="after")
    def validate_pack(self) -> ProcedurePack:
        if self.review_due_at <= self.last_verified_at:
            raise ValueError("review_due_at must be after last_verified_at")

        orders = [step.order for step in self.steps]
        if orders != list(range(1, len(orders) + 1)):
            raise ValueError("steps must be ordered consecutively from 1")

        source_ids = [source.source_id for source in self.sources]
        if len(source_ids) != len(set(source_ids)):
            raise ValueError("source IDs must be unique")
        known_sources = set(source_ids)

        references: list[str] = []
        for item in [*self.requirements, *self.required_documents, self.fee, *self.fee.claims, *self.steps, *self.submission_channels, *self.limitations, *self.readiness.questions, *self.readiness.additional_review_items, *self.readiness.outcomes, *self.readiness.rules]:
            references.extend(item.source_ids)
        if self.tracking_guidance:
            references.extend(self.tracking_guidance.source_ids)
        for mapped_sources in self.provenance.values():
            references.extend(mapped_sources)
        missing = sorted(set(references) - known_sources)
        if missing:
            raise ValueError(f"unknown source references: {', '.join(missing)}")
        required_provenance = _REQUIRED_PROVENANCE | ({"tracking-guidance"} if self.tracking_guidance else set())
        unmapped = sorted(required_provenance - self.provenance.keys())
        if unmapped:
            raise ValueError(f"missing provenance mappings: {', '.join(unmapped)}")

        self._reject_html(self.model_dump(mode="json"))
        return self

    @classmethod
    def _reject_html(cls, value: object) -> None:
        if isinstance(value, str) and _HTML.search(value):
            raise ValueError("HTML content is not permitted")
        if isinstance(value, dict):
            for key, nested in value.items():
                cls._reject_html(key)
                cls._reject_html(nested)
        elif isinstance(value, list):
            for nested in value:
                cls._reject_html(nested)


class PackLoadError(RuntimeError):
    """Safe boundary error for invalid or unavailable procedure packs."""


class LoadedProcedure(StrictModel):
    pack: ProcedurePack
    digest: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]

    def trust_state(self, now: datetime | None = None) -> TrustState:
        current_time = now or datetime.now(UTC)
        if current_time.tzinfo is None or current_time.utcoffset() is None:
            raise ValueError("current time must include a timezone")
        return TrustState.STALE if current_time > self.pack.review_due_at else TrustState.CURRENT


def pack_digest(pack: ProcedurePack) -> str:
    payload = pack.model_dump(mode="json")
    # Preserve v1 digest compatibility for packs that do not use the later,
    # optional additional-review guidance.
    if not payload["readiness"]["additional_review_items"]:
        del payload["readiness"]["additional_review_items"]
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def load_procedure_registry(pack_root: Path) -> dict[str, LoadedProcedure]:
    try:
        paths = sorted(pack_root.glob("**/*.json"))
        packs = [ProcedurePack.model_validate_json(path.read_text(encoding="utf-8")) for path in paths]
    except (OSError, ValueError) as exc:
        raise PackLoadError("Procedure packs are unavailable") from exc

    versions: set[tuple[str, str]] = set()
    active_by_service: dict[str, list[ProcedurePack]] = {}
    for pack in packs:
        version_key = (pack.service_id, pack.pack_version)
        if version_key in versions:
            raise PackLoadError("Duplicate procedure pack version")
        versions.add(version_key)
        if pack.status is LifecycleStatus.ACTIVE:
            active_by_service.setdefault(pack.service_id, []).append(pack)

    if not active_by_service:
        raise PackLoadError("No active procedure packs are available")
    if any(len(active) != 1 for active in active_by_service.values()):
        raise PackLoadError("A service must have exactly one active procedure pack")

    return {
        service_id: LoadedProcedure(pack=active[0], digest=pack_digest(active[0]))
        for service_id, active in active_by_service.items()
    }


def default_pack_root() -> Path:
    return Path(__file__).resolve().parents[2] / "procedure-packs" / "packs"


class ProcedureSummary(StrictModel):
    """The intentionally small, browser-safe catalogue used for local matching."""

    service_id: Identifier
    title: ShortText
    short_description: ShortText
    intent_phrases: Annotated[list[ShortText], Field(min_length=1, max_length=30)]
    category: Identifier
    trust_state: TrustState
    attention_required: bool


class ProcedureListResponse(StrictModel):
    procedures: list[ProcedureSummary]


class ProcedureDetail(StrictModel):
    service_id: Identifier
    title: ShortText
    short_description: ShortText
    category: Identifier
    jurisdiction: Jurisdiction
    department: ShortText
    official_publisher: ShortText
    interaction_modes: list[InteractionMode]
    requirements: list[CitedFact]
    required_documents: list[DocumentGuidance]
    fee: FeeInformation
    steps: list[ProcedureStep]
    submission_channels: list[SubmissionChannel]
    official_handoff_url: HttpUrl
    tracking_guidance: CitedFact | None
    sources: list[SourceRecord]
    provenance: dict[str, list[str]]
    pack_version: str
    pack_digest: str
    last_verified_at: datetime
    review_due_at: datetime
    trust_state: TrustState
    attention_required: bool
    limitations: list[CitedFact]
    additional_review_items: list[CitedFact]


def fee_attention_required(fee: FeeInformation) -> bool:
    return fee.verification_status is FeeVerificationStatus.CONFLICTING


def summarize_procedure(loaded: LoadedProcedure, now: datetime | None = None) -> ProcedureSummary:
    pack = loaded.pack
    return ProcedureSummary(
        service_id=pack.service_id,
        title=pack.title["en"],
        short_description=pack.short_description["en"],
        intent_phrases=pack.intent_phrases,
        category=pack.category,
        trust_state=loaded.trust_state(now),
        attention_required=fee_attention_required(pack.fee),
    )


def detail_procedure(loaded: LoadedProcedure, now: datetime | None = None) -> ProcedureDetail:
    pack = loaded.pack
    return ProcedureDetail(
        service_id=pack.service_id,
        title=pack.title["en"],
        short_description=pack.short_description["en"],
        category=pack.category,
        jurisdiction=pack.jurisdiction,
        department=pack.department,
        official_publisher=pack.publisher,
        interaction_modes=pack.interaction_modes,
        requirements=pack.requirements,
        required_documents=pack.required_documents,
        fee=pack.fee,
        steps=pack.steps,
        submission_channels=pack.submission_channels,
        official_handoff_url=pack.official_handoff_url,
        tracking_guidance=pack.tracking_guidance,
        sources=pack.sources,
        provenance=pack.provenance,
        pack_version=pack.pack_version,
        pack_digest=loaded.digest,
        last_verified_at=pack.last_verified_at,
        review_due_at=pack.review_due_at,
        trust_state=loaded.trust_state(now),
        attention_required=fee_attention_required(pack.fee),
        limitations=pack.limitations,
        additional_review_items=pack.readiness.additional_review_items,
    )

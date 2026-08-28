from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, date, datetime
from decimal import Decimal
from enum import StrEnum
from pathlib import Path
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    StringConstraints,
    field_validator,
    model_validator,
)

Identifier = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1200)]
SourceId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)]
SourceIds = Annotated[list[SourceId], Field(min_length=1, max_length=12)]

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
}


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
        for item in [*self.requirements, *self.required_documents, self.fee, *self.fee.claims, *self.steps, *self.submission_channels, *self.limitations]:
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
    canonical = json.dumps(pack.model_dump(mode="json"), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
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
    service_id: Identifier
    title: ShortText
    short_description: ShortText
    category: Identifier
    interaction_modes: list[InteractionMode]
    official_publisher: ShortText
    pack_version: str
    last_verified_at: datetime
    review_due_at: datetime
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


def fee_attention_required(fee: FeeInformation) -> bool:
    return fee.verification_status is FeeVerificationStatus.CONFLICTING


def summarize_procedure(loaded: LoadedProcedure, now: datetime | None = None) -> ProcedureSummary:
    pack = loaded.pack
    return ProcedureSummary(
        service_id=pack.service_id,
        title=pack.title["en"],
        short_description=pack.short_description["en"],
        category=pack.category,
        interaction_modes=pack.interaction_modes,
        official_publisher=pack.publisher,
        pack_version=pack.pack_version,
        last_verified_at=pack.last_verified_at,
        review_due_at=pack.review_due_at,
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
    )

"""Reviewed immutable form registry. No runtime retrieval or citizen values."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from sahayi_api.procedures import StrictModel, Identifier, LoadedProcedure


class FormField(StrictModel):
    field_id: Identifier
    field_type: Literal['text', 'checkbox']
    required: bool
    source_ids: list[Identifier]
    maximum_length: int = Field(ge=1, le=500)
    pdf_field: str | None = None
    page: int | None = Field(default=None, ge=0, le=9)
    rectangle: tuple[float, float, float, float] | None = None
    leave_blank: bool = False
    signature_or_attestation: bool = False


class FormManifest(StrictModel):
    form_id: Identifier
    service_id: Identifier
    version: str
    official_title: str
    official_source_url: str
    reviewed_date: str
    output: Literal['worksheet', 'acroform', 'overlay']
    asset: str | None = None
    sha256: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')
    page_count: int = Field(ge=0, le=10)
    watermark_positions: list[tuple[int, float, float, float, float]] = Field(default_factory=list)
    fields: list[FormField]
    protected_fields: list[str]
    human_review_notes: str
    translation_limitations: str
    fallback_reason: str | None = None

    @model_validator(mode='after')
    def reviewed_pdf(self):
        if len({f.field_id for f in self.fields}) != len(self.fields):
            raise ValueError('Duplicate field')
        if self.output == 'worksheet':
            if self.asset or self.sha256 or self.page_count or not self.fallback_reason:
                raise ValueError('Worksheet cannot claim a reviewed PDF')
        else:
            if not self.asset or not self.sha256 or not self.page_count:
                raise ValueError('Reviewed bytes required')
            if Path(self.asset).name != self.asset or not self.asset.endswith('.pdf'):
                raise ValueError('Invalid artifact path')
            if len(self.watermark_positions) != self.page_count or {p[0] for p in self.watermark_positions} != set(range(self.page_count)):
                raise ValueError('Reviewed watermark placement required')
            for f in self.fields:
                if f.leave_blank or f.signature_or_attestation:
                    continue
                if f.pdf_field in self.protected_fields:
                    raise ValueError('Protected field')
                if self.output == 'acroform' and not f.pdf_field:
                    raise ValueError('Reviewed field name required')
                if self.output == 'overlay' and (f.page is None or f.page >= self.page_count or not f.rectangle or any(x < 0 for x in f.rectangle) or min(f.rectangle[2:]) <= 0):
                    raise ValueError('Reviewed rectangle required')
        return self


def load_form_registry(registry: dict[str, LoadedProcedure], root: Path | None = None) -> dict[str, FormManifest]:
    root = root or Path(__file__).resolve().parents[2] / 'form-registry'
    result = {}
    for path in sorted(root.glob('*.json')):
        manifest = FormManifest.model_validate_json(path.read_text())
        loaded = registry.get(manifest.service_id)
        if loaded is None or manifest.service_id in result:
            raise ValueError('Unknown or duplicate service')
        sources = {s.source_id: str(s.url) for s in loaded.pack.sources}
        if manifest.official_source_url not in sources.values():
            raise ValueError('Unreviewed source URL')
        fields = {f.field_id: f for f in loaded.pack.assistance.preparation_fields}
        for field in manifest.fields:
            if field.field_id not in fields or not set(field.source_ids) <= set(fields[field.field_id].source_ids):
                raise ValueError('Unreviewed field')
            if fields[field.field_id].input_type.value == 'not_collected' and not field.leave_blank:
                raise ValueError('Protected pack field')
            if manifest.output != 'worksheet' and fields[field.field_id].status.value != 'verified_official_form' and not field.leave_blank:
                raise ValueError('No official field authority')
            if not field.source_ids:
                raise ValueError('Missing field authority')
        if manifest.asset:
            data = (root / manifest.asset).read_bytes()
            if not data.startswith(b'%PDF-') or hashlib.sha256(data).hexdigest() != manifest.sha256:
                raise ValueError('Artifact checksum mismatch')
        result[manifest.service_id] = manifest
    if set(result) != set(registry):
        raise ValueError('Missing service form availability')
    return result


if __name__ == '__main__':
    from sahayi_api.procedures import load_procedure_registry, default_pack_root
    result = load_form_registry(load_procedure_registry(default_pack_root()))
    print(json.dumps({key: value.output for key, value in result.items()}, sort_keys=True))

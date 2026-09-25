from pathlib import Path
import json
import pytest
from pydantic import ValidationError
from sahayi_api.forms import FormManifest, load_form_registry
from sahayi_api.procedures import load_procedure_registry, default_pack_root


def test_registered_availability_is_explicit_worksheet_only():
    registry = load_procedure_registry(default_pack_root())
    manifests = load_form_registry(registry)
    assert set(manifests) == set(registry)
    assert all(m.output == 'worksheet' and m.fallback_reason and m.sha256 is None for m in manifests.values())


def test_official_form_cannot_activate_without_immutable_review():
    value = json.loads(Path('form-registry/kerala-ign-oap.json').read_text())
    value['output'] = 'overlay'
    with pytest.raises(ValidationError):
        FormManifest.model_validate(value)


def test_manifest_fails_closed_for_missing_registry_and_unknown_field(tmp_path):
    registry = load_procedure_registry(default_pack_root())
    with pytest.raises(ValueError):
        load_form_registry(registry, tmp_path)
    value = json.loads(Path('form-registry/kerala-ign-oap.json').read_text())
    value['fields'][0]['field_id'] = 'unreviewed-bank-value'
    (tmp_path / 'bad.json').write_text(json.dumps(value))
    with pytest.raises(ValueError, match='Unreviewed field'):
        load_form_registry(registry, tmp_path)

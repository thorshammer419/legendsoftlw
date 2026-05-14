"""
Tests for _require_auth_approved — the per-request approval gate in webhook_http.py.
Run with: cd api && .venv/bin/pytest tests/test_approval_gate.py -v
"""

import json
import base64
import pytest
from unittest.mock import patch, MagicMock
import azure.functions as func

MODULE = "functions.webhook_http"

EMAIL = "player@example.com"

PRINCIPAL = base64.b64encode(json.dumps({
    "userDetails": EMAIL,
    "identityProvider": "google",
}).encode()).decode()


def _make_req(principal=PRINCIPAL):
    req = MagicMock(spec=func.HttpRequest)
    req.headers = {"x-ms-client-principal": principal} if principal else {}
    return req


@pytest.fixture
def mocks():
    with patch(f"{MODULE}.get_player") as mock_get_player:
        yield {"get_player": mock_get_player}


# ---------------------------------------------------------------------------
# _require_auth_approved
# ---------------------------------------------------------------------------

def test_passes_through_when_approved(mocks):
    from functions.webhook_http import _require_auth_approved
    mocks["get_player"].return_value = {"email": EMAIL, "approved": True}

    email, err = _require_auth_approved(_make_req())

    assert email == EMAIL
    assert err is None


def test_returns_403_when_approved_false(mocks):
    from functions.webhook_http import _require_auth_approved
    mocks["get_player"].return_value = {"email": EMAIL, "approved": False}

    email, err = _require_auth_approved(_make_req())

    assert err is not None
    assert err.status_code == 403


def test_treats_missing_approved_field_as_approved(mocks):
    from functions.webhook_http import _require_auth_approved
    mocks["get_player"].return_value = {"email": EMAIL}  # no "approved" key

    email, err = _require_auth_approved(_make_req())

    assert email == EMAIL
    assert err is None


def test_returns_401_when_unauthenticated(mocks):
    from functions.webhook_http import _require_auth_approved

    email, err = _require_auth_approved(_make_req(principal=None))

    assert err is not None
    assert err.status_code == 401

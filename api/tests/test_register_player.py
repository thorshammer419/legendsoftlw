"""
Tests for the register_player HTTP handler (POST /me) with allowlist enforcement.
Run with: cd api && .venv/bin/pytest tests/test_register_player.py -v
"""

import json
import base64
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
import azure.functions as func

MODULE = "functions.webhook_http"

EMAIL = "player@example.com"

PRINCIPAL = base64.b64encode(json.dumps({
    "userDetails": EMAIL,
    "identityProvider": "google",
}).encode()).decode()

ALLOWED_DOC = {"id": f"allowed_user_{EMAIL}", "type": "allowed_user", "email": EMAIL}

PLAYER_DOC = {
    "id": f"player_{EMAIL}",
    "type": "player",
    "campaign_id": "players",
    "email": EMAIL,
    "approved": True,
}


def _make_req():
    req = MagicMock(spec=func.HttpRequest)
    req.headers = {"x-ms-client-principal": PRINCIPAL}
    req.get_json.return_value = {}
    return req


@pytest.fixture
def mocks():
    with (
        patch(f"{MODULE}.get_player") as mock_get_player,
        patch(f"{MODULE}.upsert_player") as mock_upsert,
        patch(f"{MODULE}.get_allowed_user") as mock_get_allowed,
    ):
        yield {
            "get_player": mock_get_player,
            "upsert_player": mock_upsert,
            "get_allowed_user": mock_get_allowed,
        }


# ---------------------------------------------------------------------------
# Allowlist enforcement
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_returns_403_when_not_on_allowlist(mocks):
    from functions.webhook_http import register_player
    mocks["get_allowed_user"].return_value = None

    response = await register_player(_make_req())

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_creates_player_with_approved_true_when_on_allowlist(mocks):
    from functions.webhook_http import register_player
    mocks["get_allowed_user"].return_value = ALLOWED_DOC
    mocks["get_player"].return_value = None
    mocks["upsert_player"].side_effect = lambda doc: doc

    response = await register_player(_make_req())

    assert response.status_code == 200
    call_args = mocks["upsert_player"].call_args
    saved_doc = call_args.args[0] if call_args.args else call_args.kwargs.get("doc")
    assert saved_doc["approved"] is True


@pytest.mark.asyncio
async def test_reinstates_player_with_approved_false(mocks):
    from functions.webhook_http import register_player
    revoked_player = {**PLAYER_DOC, "approved": False}
    mocks["get_allowed_user"].return_value = ALLOWED_DOC
    mocks["get_player"].return_value = revoked_player
    mocks["upsert_player"].side_effect = lambda doc: doc

    response = await register_player(_make_req())

    assert response.status_code == 200
    call_args = mocks["upsert_player"].call_args
    saved_doc = call_args.args[0] if call_args.args else call_args.kwargs.get("doc")
    assert saved_doc["approved"] is True


@pytest.mark.asyncio
async def test_returns_existing_player_unchanged_when_already_approved(mocks):
    from functions.webhook_http import register_player
    mocks["get_allowed_user"].return_value = ALLOWED_DOC
    mocks["get_player"].return_value = PLAYER_DOC

    response = await register_player(_make_req())

    assert response.status_code == 200
    mocks["upsert_player"].assert_not_called()

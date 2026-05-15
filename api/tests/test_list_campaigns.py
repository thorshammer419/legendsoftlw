"""
Tests for GET /campaigns handler (list_campaigns_handler).
Covers: password_hash stripped, is_member flag, is_password_protected flag, active-only player count.
"""

import json
import base64
import pytest
from unittest.mock import patch, MagicMock

MODULE = "functions.webhook_http"

CALLER_EMAIL = "adventurer@example.com"

PRINCIPAL = base64.b64encode(json.dumps({
    "userDetails": CALLER_EMAIL,
    "identityProvider": "google",
}).encode()).decode()

APPROVED_PLAYER = {"id": f"player_{CALLER_EMAIL}", "email": CALLER_EMAIL, "approved": True}


def _make_req():
    req = MagicMock()
    req.headers = {"x-ms-client-principal": PRINCIPAL}
    return req


def _campaign(campaign_id="aaa11111", password_hash=None):
    return {
        "campaign_id": campaign_id,
        "name": "Test Campaign",
        "party_name": "The Fellowship",
        "description": "An adventure",
        "status": "lobby",
        "created_by": "creator@example.com",
        "max_players": 8,
        "password_hash": password_hash,
        "invite_token": "sometoken",
    }


@pytest.fixture
def mocks():
    with (
        patch(f"{MODULE}.list_all_campaigns") as mock_list,
        patch(f"{MODULE}.get_campaign_players") as mock_players,
        patch(f"{MODULE}.get_player") as mock_get_player,
    ):
        mock_get_player.return_value = APPROVED_PLAYER
        yield {
            "list_all_campaigns": mock_list,
            "get_campaign_players": mock_players,
        }


# ---------------------------------------------------------------------------
# password_hash is never exposed
# ---------------------------------------------------------------------------

async def test_password_hash_is_not_included_in_response(mocks):
    from functions.webhook_http import list_campaigns_handler
    mocks["list_all_campaigns"].return_value = [_campaign(password_hash="$2b$hash")]
    mocks["get_campaign_players"].return_value = []

    resp = await list_campaigns_handler(_make_req())

    body = json.loads(resp.get_body())
    assert "password_hash" not in body[0]


# ---------------------------------------------------------------------------
# is_password_protected flag
# ---------------------------------------------------------------------------

async def test_is_password_protected_true_when_hash_set(mocks):
    from functions.webhook_http import list_campaigns_handler
    mocks["list_all_campaigns"].return_value = [_campaign(password_hash="$2b$hash")]
    mocks["get_campaign_players"].return_value = []

    resp = await list_campaigns_handler(_make_req())

    body = json.loads(resp.get_body())
    assert body[0]["is_password_protected"] is True


async def test_is_password_protected_false_when_no_hash(mocks):
    from functions.webhook_http import list_campaigns_handler
    mocks["list_all_campaigns"].return_value = [_campaign(password_hash=None)]
    mocks["get_campaign_players"].return_value = []

    resp = await list_campaigns_handler(_make_req())

    body = json.loads(resp.get_body())
    assert body[0]["is_password_protected"] is False


# ---------------------------------------------------------------------------
# is_member flag
# ---------------------------------------------------------------------------

async def test_is_member_true_when_caller_has_player_record(mocks):
    from functions.webhook_http import list_campaigns_handler
    mocks["list_all_campaigns"].return_value = [_campaign()]
    mocks["get_campaign_players"].return_value = [
        {"email": CALLER_EMAIL, "status": "active"},
    ]

    resp = await list_campaigns_handler(_make_req())

    body = json.loads(resp.get_body())
    assert body[0]["is_member"] is True


async def test_is_member_false_when_caller_has_no_player_record(mocks):
    from functions.webhook_http import list_campaigns_handler
    mocks["list_all_campaigns"].return_value = [_campaign()]
    mocks["get_campaign_players"].return_value = [
        {"email": "someone_else@example.com", "status": "active"},
    ]

    resp = await list_campaigns_handler(_make_req())

    body = json.loads(resp.get_body())
    assert body[0]["is_member"] is False


# ---------------------------------------------------------------------------
# player_count counts only active players
# ---------------------------------------------------------------------------

async def test_player_count_excludes_inactive_players(mocks):
    from functions.webhook_http import list_campaigns_handler
    mocks["list_all_campaigns"].return_value = [_campaign()]
    mocks["get_campaign_players"].return_value = [
        {"email": "a@example.com", "status": "active"},
        {"email": "b@example.com", "status": "active"},
        {"email": "c@example.com", "status": "inactive"},
    ]

    resp = await list_campaigns_handler(_make_req())

    body = json.loads(resp.get_body())
    assert body[0]["player_count"] == 2

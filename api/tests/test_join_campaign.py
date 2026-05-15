"""
Tests for POST /campaigns/{campaign_id}/join handler.
Covers: open join, already-member, full, deleted, password, invite token, active enqueue.
"""

import json
import base64
import bcrypt
import pytest
from unittest.mock import patch, MagicMock

MODULE = "functions.webhook_http"

PLAYER_EMAIL = "adventurer@example.com"
CAMPAIGN_ID = "abc12345"
INVITE_TOKEN = "validtoken_32chars_urlsafe_abcdef"

PRINCIPAL = base64.b64encode(json.dumps({
    "userDetails": PLAYER_EMAIL,
    "identityProvider": "google",
}).encode()).decode()

APPROVED_PLAYER = {
    "id": f"player_{PLAYER_EMAIL}",
    "email": PLAYER_EMAIL,
    "approved": True,
}


def _make_req(body=None):
    req = MagicMock()
    req.route_params = {"campaign_id": CAMPAIGN_ID}
    req.headers = {"x-ms-client-principal": PRINCIPAL}
    req.get_json.return_value = body or {}
    return req


def _open_campaign(status="lobby", player_count=2, max_players=8):
    return {
        "id": f"campaign_{CAMPAIGN_ID}",
        "campaign_id": CAMPAIGN_ID,
        "status": status,
        "max_players": max_players,
        "password_hash": None,
        "invite_token": INVITE_TOKEN,
        "creator_emails": ["creator@example.com"],
    }


def _active_players(count):
    return [{"email": f"p{i}@example.com", "status": "active"} for i in range(count)]


@pytest.fixture
def mocks():
    with (
        patch(f"{MODULE}.get_campaign") as mock_get_campaign,
        patch(f"{MODULE}.get_campaign_player") as mock_get_cp,
        patch(f"{MODULE}.get_campaign_players") as mock_get_players,
        patch(f"{MODULE}.join_campaign_as_observer") as mock_join,
        patch(f"{MODULE}.get_player") as mock_get_player,
        patch(f"{MODULE}.enqueue") as mock_enqueue,
    ):
        mock_get_player.return_value = APPROVED_PLAYER
        mock_get_cp.return_value = None          # not yet a member by default
        mock_get_players.return_value = _active_players(2)
        yield {
            "get_campaign": mock_get_campaign,
            "get_campaign_player": mock_get_cp,
            "get_campaign_players": mock_get_players,
            "join": mock_join,
            "enqueue": mock_enqueue,
        }


# ---------------------------------------------------------------------------
# Happy path — open campaign
# ---------------------------------------------------------------------------

async def test_open_lobby_campaign_returns_201(mocks):
    from functions.webhook_http import join_campaign_handler
    mocks["get_campaign"].return_value = _open_campaign()

    resp = await join_campaign_handler(_make_req())

    assert resp.status_code == 201
    body = json.loads(resp.get_body())
    assert body["status"] == "joined"
    assert body["campaign_id"] == CAMPAIGN_ID
    mocks["join"].assert_called_once()


# ---------------------------------------------------------------------------
# Already a member
# ---------------------------------------------------------------------------

async def test_already_member_returns_200_without_joining_again(mocks):
    from functions.webhook_http import join_campaign_handler
    mocks["get_campaign"].return_value = _open_campaign()
    mocks["get_campaign_player"].return_value = {"email": PLAYER_EMAIL, "status": "active"}

    resp = await join_campaign_handler(_make_req())

    assert resp.status_code == 200
    body = json.loads(resp.get_body())
    assert body["status"] == "already_member"
    mocks["join"].assert_not_called()


# ---------------------------------------------------------------------------
# Error cases
# ---------------------------------------------------------------------------

async def test_campaign_not_found_returns_404(mocks):
    from functions.webhook_http import join_campaign_handler
    mocks["get_campaign"].side_effect = Exception("not found")

    resp = await join_campaign_handler(_make_req())

    assert resp.status_code == 404


async def test_deleted_campaign_returns_404(mocks):
    from functions.webhook_http import join_campaign_handler
    mocks["get_campaign"].return_value = _open_campaign(status="deleted")

    resp = await join_campaign_handler(_make_req())

    assert resp.status_code == 404


async def test_full_campaign_returns_409(mocks):
    from functions.webhook_http import join_campaign_handler
    mocks["get_campaign"].return_value = _open_campaign(max_players=2)
    mocks["get_campaign_players"].return_value = _active_players(2)

    resp = await join_campaign_handler(_make_req())

    assert resp.status_code == 409
    body = json.loads(resp.get_body())
    assert "full" in body["error"].lower()


# ---------------------------------------------------------------------------
# Password protection
# ---------------------------------------------------------------------------

async def test_password_campaign_no_password_returns_403(mocks):
    from functions.webhook_http import join_campaign_handler
    campaign = _open_campaign()
    campaign["password_hash"] = bcrypt.hashpw(b"secret", bcrypt.gensalt()).decode()
    mocks["get_campaign"].return_value = campaign

    resp = await join_campaign_handler(_make_req(body={}))

    assert resp.status_code == 403
    body = json.loads(resp.get_body())
    assert "password" in body["error"].lower()


async def test_password_campaign_wrong_password_returns_403(mocks):
    from functions.webhook_http import join_campaign_handler
    campaign = _open_campaign()
    campaign["password_hash"] = bcrypt.hashpw(b"secret", bcrypt.gensalt()).decode()
    mocks["get_campaign"].return_value = campaign

    resp = await join_campaign_handler(_make_req(body={"password": "wrongpassword"}))

    assert resp.status_code == 403
    body = json.loads(resp.get_body())
    assert "incorrect" in body["error"].lower()


async def test_password_campaign_correct_password_returns_201(mocks):
    from functions.webhook_http import join_campaign_handler
    campaign = _open_campaign()
    campaign["password_hash"] = bcrypt.hashpw(b"secret", bcrypt.gensalt()).decode()
    mocks["get_campaign"].return_value = campaign

    resp = await join_campaign_handler(_make_req(body={"password": "secret"}))

    assert resp.status_code == 201
    mocks["join"].assert_called_once()


# ---------------------------------------------------------------------------
# Invite token
# ---------------------------------------------------------------------------

async def test_valid_invite_token_bypasses_password(mocks):
    from functions.webhook_http import join_campaign_handler
    campaign = _open_campaign()
    campaign["password_hash"] = bcrypt.hashpw(b"secret", bcrypt.gensalt()).decode()
    mocks["get_campaign"].return_value = campaign

    resp = await join_campaign_handler(_make_req(body={"invite_token": INVITE_TOKEN}))

    assert resp.status_code == 201
    mocks["join"].assert_called_once()


async def test_wrong_invite_token_returns_403(mocks):
    from functions.webhook_http import join_campaign_handler
    mocks["get_campaign"].return_value = _open_campaign()

    resp = await join_campaign_handler(_make_req(body={"invite_token": "wrongtoken"}))

    assert resp.status_code == 403
    body = json.loads(resp.get_body())
    assert "invalid" in body["error"].lower()


# ---------------------------------------------------------------------------
# Active campaign enqueues catch-up
# ---------------------------------------------------------------------------

async def test_joining_active_campaign_enqueues_player_join(mocks):
    from functions.webhook_http import join_campaign_handler
    mocks["get_campaign"].return_value = _open_campaign(status="active")

    await join_campaign_handler(_make_req())

    mocks["enqueue"].assert_called_once_with(
        "player-join", {"campaign_id": CAMPAIGN_ID, "email": PLAYER_EMAIL}
    )


async def test_joining_lobby_campaign_does_not_enqueue(mocks):
    from functions.webhook_http import join_campaign_handler
    mocks["get_campaign"].return_value = _open_campaign(status="lobby")

    await join_campaign_handler(_make_req())

    mocks["enqueue"].assert_not_called()

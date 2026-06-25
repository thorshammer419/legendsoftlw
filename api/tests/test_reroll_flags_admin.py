"""
Tests for:
  GET  /campaigns/{id}/admin/reroll-flags
  DELETE /campaigns/{id}/admin/reroll-flag/{player_email}
"""

import json
import base64
import pytest
from unittest.mock import patch, MagicMock

MODULE = "functions.webhook_http"

ADMIN_EMAIL = "admin@example.com"
PLAYER_EMAIL = "player@example.com"
CAMPAIGN_ID = "abc12345"


def _make_request(email=ADMIN_EMAIL, campaign_id=CAMPAIGN_ID, route_params=None):
    req = MagicMock()
    req.headers = {"x-ms-client-principal": base64.b64encode(json.dumps({
        "userDetails": email,
        "identityProvider": "google",
    }).encode()).decode()}
    req.route_params = route_params or {"campaign_id": campaign_id}
    return req


def _campaign():
    return {"id": CAMPAIGN_ID, "status": "lobby", "creator_emails": ["creator@example.com"]}


@pytest.fixture
def list_mocks():
    with (
        patch(f"{MODULE}.get_campaign") as mock_campaign,
        patch(f"{MODULE}.get_player") as mock_player,
        patch(f"{MODULE}.get_reroll_flags_for_campaign") as mock_flags,
        patch(f"{MODULE}.get_character") as mock_char,
        patch("functions.membership.is_system_admin") as mock_admin,
    ):
        mock_campaign.return_value = _campaign()
        mock_player.return_value = {"email": ADMIN_EMAIL, "approved": True, "display_name": "Admin"}
        mock_admin.side_effect = lambda e: e == ADMIN_EMAIL
        mock_flags.return_value = []
        mock_char.return_value = None
        yield {
            "get_campaign": mock_campaign,
            "get_player": mock_player,
            "get_reroll_flags_for_campaign": mock_flags,
            "get_character": mock_char,
            "is_system_admin": mock_admin,
        }


@pytest.fixture
def remove_mocks():
    with (
        patch(f"{MODULE}.get_campaign") as mock_campaign,
        patch(f"{MODULE}.get_player") as mock_player,
        patch(f"{MODULE}.get_reroll_flag") as mock_get_flag,
        patch(f"{MODULE}.delete_reroll_flag") as mock_delete_flag,
        patch(f"{MODULE}.get_campaign_player") as mock_cp,
        patch(f"{MODULE}.upsert_campaign_player") as mock_upsert_cp,
        patch("functions.membership.is_system_admin") as mock_admin,
    ):
        mock_campaign.return_value = _campaign()
        mock_player.return_value = {"email": ADMIN_EMAIL, "approved": True}
        mock_admin.side_effect = lambda e: e == ADMIN_EMAIL
        mock_get_flag.return_value = {"campaign_id": CAMPAIGN_ID, "email": PLAYER_EMAIL}
        mock_cp.return_value = {"id": f"campaign_player_{CAMPAIGN_ID}_{PLAYER_EMAIL}", "rerolled": True}
        yield {
            "get_campaign": mock_campaign,
            "get_reroll_flag": mock_get_flag,
            "delete_reroll_flag": mock_delete_flag,
            "get_campaign_player": mock_cp,
            "upsert_campaign_player": mock_upsert_cp,
        }


# ---------------------------------------------------------------------------
# GET /admin/reroll-flags
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_flags_returns_empty_when_none(list_mocks):
    from functions.webhook_http import admin_list_reroll_flags_handler

    req = _make_request()
    resp = await admin_list_reroll_flags_handler(req)

    body = json.loads(resp.get_body())
    assert body == []


@pytest.mark.asyncio
async def test_list_flags_returns_player_info(list_mocks):
    from functions.webhook_http import admin_list_reroll_flags_handler

    list_mocks["get_reroll_flags_for_campaign"].return_value = [
        {"campaign_id": CAMPAIGN_ID, "email": PLAYER_EMAIL},
    ]
    list_mocks["get_player"].side_effect = lambda e: (
        {"display_name": "Thandor"} if e == PLAYER_EMAIL else {"email": ADMIN_EMAIL, "approved": True}
    )
    list_mocks["get_character"].return_value = {"name": "Thandor the Bold", "class": "Fighter"}

    req = _make_request()
    resp = await admin_list_reroll_flags_handler(req)

    body = json.loads(resp.get_body())
    assert len(body) == 1
    assert body[0]["email"] == PLAYER_EMAIL
    assert body[0]["display_name"] == "Thandor"
    assert body[0]["char_name"] == "Thandor the Bold"
    assert body[0]["char_class"] == "Fighter"


@pytest.mark.asyncio
async def test_list_flags_uses_dashes_when_no_character(list_mocks):
    from functions.webhook_http import admin_list_reroll_flags_handler

    list_mocks["get_reroll_flags_for_campaign"].return_value = [
        {"campaign_id": CAMPAIGN_ID, "email": PLAYER_EMAIL},
    ]
    list_mocks["get_player"].side_effect = lambda e: (
        {"display_name": "Ghost"} if e == PLAYER_EMAIL else {"email": ADMIN_EMAIL, "approved": True}
    )
    list_mocks["get_character"].return_value = None

    req = _make_request()
    resp = await admin_list_reroll_flags_handler(req)

    body = json.loads(resp.get_body())
    assert body[0]["char_name"] == "—"
    assert body[0]["char_class"] == "—"


@pytest.mark.asyncio
async def test_list_flags_returns_403_for_non_admin(list_mocks):
    from functions.webhook_http import admin_list_reroll_flags_handler

    list_mocks["is_system_admin"].side_effect = lambda e: False
    list_mocks["get_player"].return_value = {"email": "creator@example.com", "approved": True}

    req = _make_request(email="creator@example.com")
    resp = await admin_list_reroll_flags_handler(req)

    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# DELETE /admin/reroll-flag/{player_email}
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_remove_flag_deletes_flag_doc(remove_mocks):
    from functions.webhook_http import admin_remove_reroll_flag_handler

    req = _make_request(route_params={"campaign_id": CAMPAIGN_ID, "player_email": PLAYER_EMAIL})
    await admin_remove_reroll_flag_handler(req)

    remove_mocks["delete_reroll_flag"].assert_called_once_with(CAMPAIGN_ID, PLAYER_EMAIL)


@pytest.mark.asyncio
async def test_remove_flag_clears_rerolled_on_campaign_player(remove_mocks):
    from functions.webhook_http import admin_remove_reroll_flag_handler

    req = _make_request(route_params={"campaign_id": CAMPAIGN_ID, "player_email": PLAYER_EMAIL})
    await admin_remove_reroll_flag_handler(req)

    saved_cp = remove_mocks["upsert_campaign_player"].call_args[0][0]
    assert "rerolled" not in saved_cp


@pytest.mark.asyncio
async def test_remove_flag_returns_404_when_flag_not_found(remove_mocks):
    from functions.webhook_http import admin_remove_reroll_flag_handler

    remove_mocks["get_reroll_flag"].return_value = None
    req = _make_request(route_params={"campaign_id": CAMPAIGN_ID, "player_email": PLAYER_EMAIL})
    resp = await admin_remove_reroll_flag_handler(req)

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_remove_flag_returns_403_for_non_admin(remove_mocks):
    from functions.webhook_http import admin_remove_reroll_flag_handler

    with patch("functions.membership.is_system_admin", side_effect=lambda e: False):
        remove_mocks["get_reroll_flag"].return_value = {"campaign_id": CAMPAIGN_ID, "email": PLAYER_EMAIL}
        req = _make_request(
            email="creator@example.com",
            route_params={"campaign_id": CAMPAIGN_ID, "player_email": PLAYER_EMAIL},
        )
        resp = await admin_remove_reroll_flag_handler(req)

    assert resp.status_code == 403

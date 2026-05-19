"""
Tests for DELETE /campaigns/{campaign_id} (cancel/soft-delete) handler.
Focuses on reroll flag cleanup behavior.
"""

import json
import base64
import pytest
from unittest.mock import patch, MagicMock

MODULE = "functions.webhook_http"

CREATOR_EMAIL = "creator@example.com"
CAMPAIGN_ID = "abc12345"

PRINCIPAL = base64.b64encode(json.dumps({
    "userDetails": CREATOR_EMAIL,
    "identityProvider": "google",
}).encode()).decode()


def _make_request(campaign_id=CAMPAIGN_ID, email=CREATOR_EMAIL):
    req = MagicMock()
    req.headers = {"x-ms-client-principal": base64.b64encode(json.dumps({
        "userDetails": email,
        "identityProvider": "google",
    }).encode()).decode()}
    req.route_params = {"campaign_id": campaign_id}
    return req


def _open_campaign():
    return {
        "id": CAMPAIGN_ID,
        "status": "lobby",
        "creator_emails": [CREATOR_EMAIL],
    }


@pytest.fixture
def mocks():
    with (
        patch(f"{MODULE}.get_campaign") as mock_get_campaign,
        patch(f"{MODULE}.get_campaign_players") as mock_get_players,
        patch(f"{MODULE}.update_campaign") as mock_update,
        patch(f"{MODULE}.broadcast_lobby_event") as mock_broadcast,
        patch(f"{MODULE}.get_player") as mock_get_player,
        patch(f"{MODULE}.delete_reroll_flags_for_campaign") as mock_delete_flags,
    ):
        mock_get_campaign.return_value = _open_campaign()
        mock_get_players.return_value = []
        mock_get_player.return_value = {"email": CREATOR_EMAIL, "approved": True}
        yield {
            "get_campaign": mock_get_campaign,
            "get_campaign_players": mock_get_players,
            "update_campaign": mock_update,
            "broadcast_lobby_event": mock_broadcast,
            "delete_reroll_flags_for_campaign": mock_delete_flags,
        }


@pytest.mark.asyncio
async def test_cancel_campaign_deletes_reroll_flags(mocks):
    from functions.webhook_http import delete_campaign_handler

    req = _make_request()
    await delete_campaign_handler(req)

    mocks["delete_reroll_flags_for_campaign"].assert_called_once_with(CAMPAIGN_ID)


@pytest.mark.asyncio
async def test_cancel_campaign_still_soft_deletes_campaign(mocks):
    from functions.webhook_http import delete_campaign_handler

    req = _make_request()
    await delete_campaign_handler(req)

    mocks["update_campaign"].assert_called_once()
    saved = mocks["update_campaign"].call_args[0][0]
    assert saved["status"] == "deleted"

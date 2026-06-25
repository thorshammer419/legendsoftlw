"""
Tests for DELETE /campaigns/{campaign_id} (cancel/soft-delete) handler.
Handler-level concerns: auth, broadcast, response shape.
Domain-level concerns (reroll flags, drafts, status) are tested in test_domain.py.
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
        "campaign_id": CAMPAIGN_ID,
        "status": "lobby",
        "creator_emails": [CREATOR_EMAIL],
    }


@pytest.fixture
def mocks():
    with (
        patch(f"{MODULE}.get_campaign") as mock_get_campaign,
        patch(f"{MODULE}.cancel_campaign") as mock_cancel,
        patch(f"{MODULE}.broadcast_lobby_event") as mock_broadcast,
        patch(f"{MODULE}.get_player") as mock_get_player,
    ):
        mock_get_campaign.return_value = _open_campaign()
        mock_cancel.return_value = {"player_emails": ["p1@example.com", "p2@example.com"]}
        mock_get_player.return_value = {"email": CREATOR_EMAIL, "approved": True}
        yield {
            "get_campaign": mock_get_campaign,
            "cancel_campaign": mock_cancel,
            "broadcast_lobby_event": mock_broadcast,
        }


@pytest.mark.asyncio
async def test_cancel_campaign_calls_cancel_domain_function(mocks):
    from functions.webhook_http import delete_campaign_handler

    await delete_campaign_handler(_make_request())

    mocks["cancel_campaign"].assert_called_once_with(CAMPAIGN_ID)


@pytest.mark.asyncio
async def test_cancel_campaign_returns_deleted_status(mocks):
    from functions.webhook_http import delete_campaign_handler

    resp = await delete_campaign_handler(_make_request())

    assert resp.status_code == 200
    body = json.loads(resp.get_body())
    assert body["status"] == "deleted"


@pytest.mark.asyncio
async def test_cancel_campaign_broadcasts_to_all_members(mocks):
    from functions.webhook_http import delete_campaign_handler

    await delete_campaign_handler(_make_request())

    mocks["broadcast_lobby_event"].assert_called_once()
    event = mocks["broadcast_lobby_event"].call_args[0][0]
    assert event["type"] == "campaign_deleted"
    assert event["campaign_id"] == CAMPAIGN_ID
    assert "p1@example.com" in event["player_emails"]


@pytest.mark.asyncio
async def test_cancel_campaign_skips_broadcast_when_no_members(mocks):
    from functions.webhook_http import delete_campaign_handler
    mocks["cancel_campaign"].return_value = {"player_emails": []}

    await delete_campaign_handler(_make_request())

    mocks["broadcast_lobby_event"].assert_not_called()


@pytest.mark.asyncio
async def test_non_admin_gets_403(mocks):
    from functions.webhook_http import delete_campaign_handler

    resp = await delete_campaign_handler(_make_request(email="nonmember@example.com"))

    assert resp.status_code == 403
    mocks["cancel_campaign"].assert_not_called()

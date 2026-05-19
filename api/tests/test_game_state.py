"""
Tests for GET /campaigns/{id}/state — party_status shape.
Focused on the rerolled field being present and accurate.
"""

import json
import base64
import pytest
from unittest.mock import patch, MagicMock

MODULE = "functions.webhook_http"

PLAYER_EMAIL = "player@example.com"
CAMPAIGN_ID = "abc12345"


def _make_request(email=PLAYER_EMAIL, campaign_id=CAMPAIGN_ID):
    req = MagicMock()
    req.headers = {"x-ms-client-principal": base64.b64encode(json.dumps({
        "userDetails": email,
        "identityProvider": "google",
    }).encode()).decode()}
    req.route_params = {"campaign_id": campaign_id}
    req.params = {}
    return req


def _active_player(email=PLAYER_EMAIL, rerolled=False):
    p = {"email": email, "status": "active", "character_creation_complete": True, "role": "player"}
    if rerolled:
        p["rerolled"] = True
    return p


@pytest.fixture
def mocks():
    with (
        patch(f"{MODULE}.get_campaign_player") as mock_cp,
        patch(f"{MODULE}.get_story_state") as mock_ss,
        patch(f"{MODULE}.get_character") as mock_char,
        patch(f"{MODULE}.get_action_list") as mock_al,
        patch(f"{MODULE}.get_campaign_players") as mock_players,
        patch(f"{MODULE}.get_narrative_log") as mock_log,
        patch(f"{MODULE}.get_player") as mock_player,
    ):
        mock_cp.return_value = {"email": PLAYER_EMAIL, "status": "active"}
        mock_ss.return_value = {"pending_actions": {}}
        mock_char.return_value = None
        mock_al.return_value = None
        mock_log.return_value = {"rounds": []}
        mock_player.return_value = {"email": PLAYER_EMAIL, "approved": True}
        yield {
            "get_campaign_players": mock_players,
        }


@pytest.mark.asyncio
async def test_party_status_includes_rerolled_true_when_player_has_rerolled(mocks):
    from functions.webhook_http import get_game_state_handler

    mocks["get_campaign_players"].return_value = [_active_player(rerolled=True)]

    req = _make_request()
    resp = await get_game_state_handler(req)

    body = json.loads(resp.get_body())
    assert body["party_status"][0]["rerolled"] is True


@pytest.mark.asyncio
async def test_party_status_includes_rerolled_false_when_player_has_not_rerolled(mocks):
    from functions.webhook_http import get_game_state_handler

    mocks["get_campaign_players"].return_value = [_active_player(rerolled=False)]

    req = _make_request()
    resp = await get_game_state_handler(req)

    body = json.loads(resp.get_body())
    assert body["party_status"][0]["rerolled"] is False


@pytest.mark.asyncio
async def test_party_status_rerolled_defaults_to_false_when_field_absent(mocks):
    from functions.webhook_http import get_game_state_handler

    player = {"email": PLAYER_EMAIL, "status": "active", "character_creation_complete": True, "role": "player"}
    mocks["get_campaign_players"].return_value = [player]

    req = _make_request()
    resp = await get_game_state_handler(req)

    body = json.loads(resp.get_body())
    assert body["party_status"][0]["rerolled"] is False

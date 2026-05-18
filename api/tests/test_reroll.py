"""
Tests for reroll approval endpoints:
  POST /campaigns/{id}/reroll-request  — active player requests reroll approval
  POST /campaigns/{id}/reroll-response — creator approves or denies
"""

import json
import base64
import pytest
from unittest.mock import patch, MagicMock

MODULE = "functions.webhook_http"

PLAYER_EMAIL = "player@example.com"
CREATOR_EMAIL = "creator@example.com"
CAMPAIGN_ID = "abc12345"

PLAYER_PRINCIPAL = base64.b64encode(json.dumps({
    "userDetails": PLAYER_EMAIL,
    "identityProvider": "google",
}).encode()).decode()

CREATOR_PRINCIPAL = base64.b64encode(json.dumps({
    "userDetails": CREATOR_EMAIL,
    "identityProvider": "google",
}).encode()).decode()

APPROVED_PLAYER = {"email": PLAYER_EMAIL, "display_name": "Aria", "approved": True}
APPROVED_CREATOR = {"email": CREATOR_EMAIL, "display_name": "DM", "approved": True}

ACTIVE_CP = {"campaign_id": CAMPAIGN_ID, "email": PLAYER_EMAIL, "status": "active"}
CREATOR_CP = {"campaign_id": CAMPAIGN_ID, "email": CREATOR_EMAIL, "status": "active", "role": "creator"}

CAMPAIGN = {"campaign_id": CAMPAIGN_ID, "creator_emails": [CREATOR_EMAIL]}


def _make_req(body=None, principal=None, route_params=None):
    req = MagicMock()
    req.route_params = route_params or {"campaign_id": CAMPAIGN_ID}
    req.headers = {"x-ms-client-principal": principal or PLAYER_PRINCIPAL}
    req.get_json.return_value = body or {}
    return req


# ---------------------------------------------------------------------------
# POST /campaigns/{id}/reroll-request
# ---------------------------------------------------------------------------

class TestRerollRequest:
    @pytest.fixture(autouse=True)
    def _patches(self):
        with patch(f"{MODULE}.get_player", return_value=APPROVED_PLAYER), \
             patch(f"{MODULE}.get_campaign_player", return_value=ACTIVE_CP), \
             patch(f"{MODULE}.broadcast_lobby_event") as mock_broadcast:
            self.mock_broadcast = mock_broadcast
            yield

    @pytest.mark.asyncio
    async def test_returns_200_for_active_member(self):
        from functions.webhook_http import reroll_request_handler
        req = _make_req({"old_value": 8})
        resp = await reroll_request_handler(req)
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_returns_403_for_non_member(self):
        from functions.webhook_http import reroll_request_handler
        with patch(f"{MODULE}.get_campaign_player", return_value=None):
            req = _make_req({"old_value": 8})
            resp = await reroll_request_handler(req)
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_broadcasts_reroll_request_event(self):
        from functions.webhook_http import reroll_request_handler
        req = _make_req({"old_value": 12})
        await reroll_request_handler(req)
        self.mock_broadcast.assert_called_once()
        payload = self.mock_broadcast.call_args[0][0]
        assert payload["type"] == "reroll_request"
        assert payload["player_email"] == PLAYER_EMAIL
        assert payload["old_value"] == 12

    @pytest.mark.asyncio
    async def test_broadcast_includes_display_name(self):
        from functions.webhook_http import reroll_request_handler
        req = _make_req({"old_value": 8})
        await reroll_request_handler(req)
        payload = self.mock_broadcast.call_args[0][0]
        assert payload["player_display_name"] == "Aria"


# ---------------------------------------------------------------------------
# POST /campaigns/{id}/reroll-response
# ---------------------------------------------------------------------------

class TestRerollResponse:
    @pytest.fixture(autouse=True)
    def _patches(self):
        with patch(f"{MODULE}.get_player", return_value=APPROVED_CREATOR), \
             patch(f"{MODULE}.get_campaign", return_value=CAMPAIGN), \
             patch(f"{MODULE}.broadcast_lobby_event") as mock_broadcast:
            self.mock_broadcast = mock_broadcast
            yield

    @pytest.mark.asyncio
    async def test_returns_200_for_creator(self):
        from functions.webhook_http import reroll_response_handler
        req = _make_req(
            {"player_email": PLAYER_EMAIL, "approved": True},
            principal=CREATOR_PRINCIPAL,
        )
        resp = await reroll_response_handler(req)
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_returns_403_for_non_creator(self):
        from functions.webhook_http import reroll_response_handler
        with patch(f"{MODULE}.get_campaign", return_value={"campaign_id": CAMPAIGN_ID, "creator_emails": []}):
            req = _make_req(
                {"player_email": PLAYER_EMAIL, "approved": True},
                principal=PLAYER_PRINCIPAL,
            )
            resp = await reroll_response_handler(req)
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_broadcasts_reroll_response_approved(self):
        from functions.webhook_http import reroll_response_handler
        req = _make_req(
            {"player_email": PLAYER_EMAIL, "approved": True},
            principal=CREATOR_PRINCIPAL,
        )
        await reroll_response_handler(req)
        payload = self.mock_broadcast.call_args[0][0]
        assert payload["type"] == "reroll_response"
        assert payload["player_email"] == PLAYER_EMAIL
        assert payload["approved"] is True

    @pytest.mark.asyncio
    async def test_broadcasts_reroll_response_denied(self):
        from functions.webhook_http import reroll_response_handler
        req = _make_req(
            {"player_email": PLAYER_EMAIL, "approved": False},
            principal=CREATOR_PRINCIPAL,
        )
        await reroll_response_handler(req)
        payload = self.mock_broadcast.call_args[0][0]
        assert payload["approved"] is False

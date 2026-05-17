"""
Tests for lobby chat endpoints:
  POST /campaigns/{id}/lobby/message  — persists message, includes message_id in broadcast
  GET  /campaigns/{id}/lobby/chat     — returns full message history
"""

import json
import base64
import pytest
from unittest.mock import patch, MagicMock, call

MODULE = "functions.webhook_http"

PLAYER_EMAIL = "adventurer@example.com"
CAMPAIGN_ID = "abc12345"

PRINCIPAL = base64.b64encode(json.dumps({
    "userDetails": PLAYER_EMAIL,
    "identityProvider": "google",
}).encode()).decode()

APPROVED_PLAYER = {
    "id": f"player_{PLAYER_EMAIL}",
    "email": PLAYER_EMAIL,
    "display_name": "Adventurer",
    "approved": True,
}

ACTIVE_CP = {
    "campaign_id": CAMPAIGN_ID,
    "email": PLAYER_EMAIL,
    "status": "active",
}


def _make_req(body=None, route_params=None):
    req = MagicMock()
    req.route_params = route_params or {"campaign_id": CAMPAIGN_ID}
    req.headers = {"x-ms-client-principal": PRINCIPAL}
    req.get_json.return_value = body or {}
    return req


# ---------------------------------------------------------------------------
# POST /campaigns/{id}/lobby/message
# ---------------------------------------------------------------------------

class TestLobbyMessagePost:
    @pytest.fixture(autouse=True)
    def _patches(self):
        with patch(f"{MODULE}.get_player", return_value=APPROVED_PLAYER) as mock_get_player, \
             patch(f"{MODULE}.get_campaign_player", return_value=ACTIVE_CP), \
             patch(f"{MODULE}.get_campaign_players", return_value=[ACTIVE_CP]), \
             patch(f"{MODULE}.broadcast_lobby_event") as mock_broadcast, \
             patch(f"{MODULE}.append_lobby_message") as mock_append:
            self.mock_broadcast = mock_broadcast
            self.mock_append = mock_append
            yield

    @pytest.mark.asyncio
    async def test_persists_message_to_cosmos(self):
        from functions.webhook_http import lobby_message_handler
        req = _make_req({"text": "Hello adventurers!"})
        await lobby_message_handler(req)
        self.mock_append.assert_called_once()
        saved_msg = self.mock_append.call_args[0][1]
        assert saved_msg["text"] == "Hello adventurers!"
        assert saved_msg["type"] == "chat"

    @pytest.mark.asyncio
    async def test_persisted_message_has_message_id(self):
        from functions.webhook_http import lobby_message_handler
        req = _make_req({"text": "Test"})
        await lobby_message_handler(req)
        saved_msg = self.mock_append.call_args[0][1]
        assert "message_id" in saved_msg
        assert len(saved_msg["message_id"]) > 10

    @pytest.mark.asyncio
    async def test_broadcast_includes_message_id(self):
        from functions.webhook_http import lobby_message_handler
        req = _make_req({"text": "Test"})
        await lobby_message_handler(req)
        broadcast_payload = self.mock_broadcast.call_args[0][0]
        assert "message_id" in broadcast_payload

    @pytest.mark.asyncio
    async def test_broadcast_message_id_matches_persisted_id(self):
        from functions.webhook_http import lobby_message_handler
        req = _make_req({"text": "Test"})
        await lobby_message_handler(req)
        saved_msg = self.mock_append.call_args[0][1]
        broadcast_payload = self.mock_broadcast.call_args[0][0]
        assert broadcast_payload["message_id"] == saved_msg["message_id"]

    @pytest.mark.asyncio
    async def test_non_active_player_gets_403(self):
        from functions.webhook_http import lobby_message_handler
        with patch(f"{MODULE}.get_campaign_player", return_value={"status": "inactive"}):
            req = _make_req({"text": "Test"})
            resp = await lobby_message_handler(req)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /campaigns/{id}/lobby/chat
# ---------------------------------------------------------------------------

class TestLobbyChatGet:
    @pytest.fixture(autouse=True)
    def _patches(self):
        with patch(f"{MODULE}.get_player", return_value=APPROVED_PLAYER), \
             patch(f"{MODULE}.get_campaign_player", return_value=ACTIVE_CP), \
             patch(f"{MODULE}.get_lobby_chat") as mock_get_chat:
            self.mock_get_chat = mock_get_chat
            yield

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_history(self):
        from functions.webhook_http import lobby_chat_history_handler
        self.mock_get_chat.return_value = []
        req = _make_req()
        resp = await lobby_chat_history_handler(req)
        assert resp.status_code == 200
        data = json.loads(resp.get_body())
        assert data == {"messages": []}

    @pytest.mark.asyncio
    async def test_returns_full_message_history(self):
        from functions.webhook_http import lobby_chat_history_handler
        messages = [
            {"message_id": "1", "text": "hello"},
            {"message_id": "2", "text": "world"},
        ]
        self.mock_get_chat.return_value = messages
        req = _make_req()
        resp = await lobby_chat_history_handler(req)
        data = json.loads(resp.get_body())
        assert data["messages"] == messages

    @pytest.mark.asyncio
    async def test_non_member_gets_403(self):
        from functions.webhook_http import lobby_chat_history_handler
        with patch(f"{MODULE}.get_campaign_player", return_value=None):
            req = _make_req()
            resp = await lobby_chat_history_handler(req)
        assert resp.status_code == 403

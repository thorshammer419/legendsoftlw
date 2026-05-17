"""
Tests for lobby presence endpoint and leave-announce queue handler:
  POST /campaigns/{id}/lobby/presence  — join or leave announcements
  process_lobby_leave_queue            — delayed leave announcement
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

JOIN_MSG = {
    "message_id": "uuid-join",
    "type": "system",
    "text": "⚔ Adventurer has entered the lobby — Shadowbane, Rogue, level 3",
    "timestamp": "2026-01-01T00:00:00+00:00",
}


def _make_req(body=None, route_params=None):
    req = MagicMock()
    req.route_params = route_params or {"campaign_id": CAMPAIGN_ID}
    req.headers = {"x-ms-client-principal": PRINCIPAL}
    req.get_json.return_value = body or {}
    return req


# ---------------------------------------------------------------------------
# POST /campaigns/{id}/lobby/presence  — join
# ---------------------------------------------------------------------------

class TestLobbyPresenceJoin:
    @pytest.fixture(autouse=True)
    def _patches(self):
        with patch(f"{MODULE}.get_player", return_value=APPROVED_PLAYER), \
             patch(f"{MODULE}.get_campaign_player", return_value=ACTIVE_CP), \
             patch(f"{MODULE}.get_campaign_players", return_value=[ACTIVE_CP]), \
             patch(f"{MODULE}.lobby_presence_join", return_value=JOIN_MSG) as mock_join, \
             patch(f"{MODULE}.append_lobby_message") as mock_append, \
             patch(f"{MODULE}.broadcast_lobby_event") as mock_broadcast:
            self.mock_join = mock_join
            self.mock_append = mock_append
            self.mock_broadcast = mock_broadcast
            yield

    @pytest.mark.asyncio
    async def test_returns_200_on_join(self):
        from functions.webhook_http import lobby_presence_handler
        req = _make_req({"action": "join"})
        resp = await lobby_presence_handler(req)
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_join_persists_announcement(self):
        from functions.webhook_http import lobby_presence_handler
        req = _make_req({"action": "join"})
        await lobby_presence_handler(req)
        self.mock_append.assert_called_once_with(CAMPAIGN_ID, JOIN_MSG)

    @pytest.mark.asyncio
    async def test_join_broadcasts_announcement(self):
        from functions.webhook_http import lobby_presence_handler
        req = _make_req({"action": "join"})
        await lobby_presence_handler(req)
        self.mock_broadcast.assert_called_once()
        payload = self.mock_broadcast.call_args[0][0]
        assert payload["text"] == JOIN_MSG["text"]
        assert payload["campaign_id"] == CAMPAIGN_ID

    @pytest.mark.asyncio
    async def test_non_member_gets_403(self):
        from functions.webhook_http import lobby_presence_handler
        with patch(f"{MODULE}.get_campaign_player", return_value=None):
            req = _make_req({"action": "join"})
            resp = await lobby_presence_handler(req)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /campaigns/{id}/lobby/presence  — leave
# ---------------------------------------------------------------------------

class TestLobbyPresenceLeave:
    @pytest.fixture(autouse=True)
    def _patches(self):
        with patch(f"{MODULE}.get_player", return_value=APPROVED_PLAYER), \
             patch(f"{MODULE}.get_campaign_player", return_value=ACTIVE_CP), \
             patch(f"{MODULE}.lobby_presence_leave") as mock_leave, \
             patch(f"{MODULE}.enqueue") as mock_enqueue:
            self.mock_leave = mock_leave
            self.mock_enqueue = mock_enqueue
            yield

    @pytest.mark.asyncio
    async def test_returns_200_on_leave(self):
        from functions.webhook_http import lobby_presence_handler
        req = _make_req({"action": "leave"})
        resp = await lobby_presence_handler(req)
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_leave_updates_presence_doc(self):
        from functions.webhook_http import lobby_presence_handler
        req = _make_req({"action": "leave"})
        await lobby_presence_handler(req)
        self.mock_leave.assert_called_once_with(CAMPAIGN_ID, PLAYER_EMAIL)

    @pytest.mark.asyncio
    async def test_leave_enqueues_delayed_announcement(self):
        from functions.webhook_http import lobby_presence_handler
        req = _make_req({"action": "leave"})
        await lobby_presence_handler(req)
        self.mock_enqueue.assert_called_once()
        queue_name, payload = self.mock_enqueue.call_args[0][:2]
        assert queue_name == "lobby-leave-announce"
        assert payload["campaign_id"] == CAMPAIGN_ID
        assert payload["email"] == PLAYER_EMAIL

    @pytest.mark.asyncio
    async def test_leave_uses_10s_visibility_timeout(self):
        from functions.webhook_http import lobby_presence_handler
        req = _make_req({"action": "leave"})
        await lobby_presence_handler(req)
        kwargs = self.mock_enqueue.call_args[1]
        assert kwargs.get("visibility_timeout") == 10

    @pytest.mark.asyncio
    async def test_invalid_action_returns_400(self):
        from functions.webhook_http import lobby_presence_handler
        req = _make_req({"action": "dance"})
        resp = await lobby_presence_handler(req)
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# process_lobby_leave_queue — delayed leave announcement
# ---------------------------------------------------------------------------

class TestProcessLobbyLeaveQueue:
    @pytest.fixture(autouse=True)
    def _patches(self):
        with patch(f"{MODULE}.get_lobby_presence_doc") as mock_presence, \
             patch(f"{MODULE}.get_campaign_players", return_value=[ACTIVE_CP]), \
             patch(f"{MODULE}.append_lobby_message") as mock_append, \
             patch(f"{MODULE}.broadcast_lobby_event") as mock_broadcast:
            self.mock_presence = mock_presence
            self.mock_append = mock_append
            self.mock_broadcast = mock_broadcast
            yield

    def test_broadcasts_leave_when_status_is_left(self):
        from functions.webhook_http import process_lobby_leave_queue
        self.mock_presence.return_value = {
            "status": "left",
            "display_name": "Aria",
        }
        process_lobby_leave_queue({"campaign_id": CAMPAIGN_ID, "email": PLAYER_EMAIL})
        self.mock_broadcast.assert_called_once()
        payload = self.mock_broadcast.call_args[0][0]
        assert "Aria" in payload["text"]
        assert "left" in payload["text"]

    def test_persists_leave_message_when_status_is_left(self):
        from functions.webhook_http import process_lobby_leave_queue
        self.mock_presence.return_value = {
            "status": "left",
            "display_name": "Aria",
        }
        process_lobby_leave_queue({"campaign_id": CAMPAIGN_ID, "email": PLAYER_EMAIL})
        self.mock_append.assert_called_once()
        msg = self.mock_append.call_args[0][1]
        assert msg["type"] == "system"
        assert "Aria" in msg["text"]

    def test_suppresses_announcement_when_player_rejoined(self):
        from functions.webhook_http import process_lobby_leave_queue
        self.mock_presence.return_value = {"status": "present", "display_name": "Aria"}
        process_lobby_leave_queue({"campaign_id": CAMPAIGN_ID, "email": PLAYER_EMAIL})
        self.mock_broadcast.assert_not_called()
        self.mock_append.assert_not_called()

    def test_suppresses_when_no_presence_doc(self):
        from functions.webhook_http import process_lobby_leave_queue
        self.mock_presence.side_effect = Exception("not found")
        process_lobby_leave_queue({"campaign_id": CAMPAIGN_ID, "email": PLAYER_EMAIL})
        self.mock_broadcast.assert_not_called()

    def test_leave_message_has_message_id_and_timestamp(self):
        from functions.webhook_http import process_lobby_leave_queue
        self.mock_presence.return_value = {
            "status": "left",
            "display_name": "Aria",
        }
        process_lobby_leave_queue({"campaign_id": CAMPAIGN_ID, "email": PLAYER_EMAIL})
        msg = self.mock_append.call_args[0][1]
        assert "message_id" in msg
        assert "timestamp" in msg

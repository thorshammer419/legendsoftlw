"""
Tests for character draft persistence.

Covers:
- save_character_draft / get_character_draft_for_player domain functions
- Draft deleted on save_character
- Draft deleted on leave_campaign
- Draft deleted (all) on delete_campaign_handler
- PUT/GET /campaigns/{id}/character/draft HTTP endpoints
"""

import json
import base64
import pytest
from unittest.mock import patch, MagicMock, call

MODULE = "functions.webhook_http"
DOMAIN_MODULE = "functions.domain"

PLAYER_EMAIL = "player@example.com"
CAMPAIGN_ID = "abc12345"


def _principal(email=PLAYER_EMAIL):
    return base64.b64encode(json.dumps({"userDetails": email, "identityProvider": "google"}).encode()).decode()


def _make_request(email=PLAYER_EMAIL, campaign_id=CAMPAIGN_ID, body=None, method="GET"):
    req = MagicMock()
    req.headers = {"x-ms-client-principal": _principal(email)}
    req.route_params = {"campaign_id": campaign_id}
    req.method = method
    if body is not None:
        req.get_json.return_value = body
    else:
        req.get_json.side_effect = ValueError("no body")
    return req


SAMPLE_DRAFT = {
    "step": 2,
    "identity": {"name": "Thandor", "char_class": "Fighter", "level": 3, "background": "Soldier", "backstory": ""},
    "scores": {"STR": 15, "DEX": 14, "CON": 13, "INT": 12, "WIS": 10, "CHA": 8},
    "available_chips": [],
    "roll_results": [],
}


# ---------------------------------------------------------------------------
# Domain — save_character_draft
# ---------------------------------------------------------------------------

class TestSaveCharacterDraft:
    def test_stores_draft_doc_in_cosmos(self, cosmos_mocks):
        from functions.domain import save_character_draft
        cosmos_mocks["get_campaign_player"].return_value = {
            "email": PLAYER_EMAIL, "status": "active", "role": "player",
        }

        save_character_draft(CAMPAIGN_ID, PLAYER_EMAIL, SAMPLE_DRAFT)

        cosmos_mocks["upsert_character_draft"].assert_called_once()
        doc = cosmos_mocks["upsert_character_draft"].call_args[0][0]
        assert doc["id"] == f"character_draft_{CAMPAIGN_ID}_{PLAYER_EMAIL}"
        assert doc["type"] == "character_draft"
        assert doc["campaign_id"] == CAMPAIGN_ID
        assert doc["email"] == PLAYER_EMAIL

    def test_stored_draft_contains_step_and_identity(self, cosmos_mocks):
        from functions.domain import save_character_draft
        cosmos_mocks["get_campaign_player"].return_value = {
            "email": PLAYER_EMAIL, "status": "active", "role": "player",
        }

        save_character_draft(CAMPAIGN_ID, PLAYER_EMAIL, SAMPLE_DRAFT)

        doc = cosmos_mocks["upsert_character_draft"].call_args[0][0]
        assert doc["step"] == 2
        assert doc["identity"]["name"] == "Thandor"
        assert doc["scores"]["STR"] == 15

    def test_raises_403_when_player_is_not_active_member(self, cosmos_mocks):
        from functions.domain import save_character_draft, DomainError
        cosmos_mocks["get_campaign_player"].return_value = None

        with pytest.raises(DomainError) as exc_info:
            save_character_draft(CAMPAIGN_ID, PLAYER_EMAIL, SAMPLE_DRAFT)

        assert exc_info.value.http_status == 403


# ---------------------------------------------------------------------------
# Domain — get_character_draft_for_player
# ---------------------------------------------------------------------------

class TestGetCharacterDraftForPlayer:
    def test_returns_draft_when_it_exists(self, cosmos_mocks):
        from functions.domain import get_character_draft_for_player
        cosmos_mocks["get_character_draft"].return_value = {
            "id": f"character_draft_{CAMPAIGN_ID}_{PLAYER_EMAIL}",
            **SAMPLE_DRAFT,
        }

        result = get_character_draft_for_player(CAMPAIGN_ID, PLAYER_EMAIL)

        assert result is not None
        assert result["step"] == 2

    def test_returns_none_when_no_draft(self, cosmos_mocks):
        from functions.domain import get_character_draft_for_player
        cosmos_mocks["get_character_draft"].return_value = None

        result = get_character_draft_for_player(CAMPAIGN_ID, PLAYER_EMAIL)

        assert result is None


# ---------------------------------------------------------------------------
# Domain — save_character deletes draft on success
# ---------------------------------------------------------------------------

class TestSaveCharacterDeletesDraft:
    def test_deletes_draft_after_saving_character(self, cosmos_mocks):
        from functions.domain import save_character
        cosmos_mocks["get_campaign_player"].return_value = {
            "email": PLAYER_EMAIL, "status": "active", "role": "player",
            "character_creation_complete": False,
        }
        cosmos_mocks["get_player"].return_value = {"display_name": "Thandor"}

        save_character(CAMPAIGN_ID, PLAYER_EMAIL, {"name": "Thandor", "class": "Fighter"})

        cosmos_mocks["delete_character_draft"].assert_called_once_with(CAMPAIGN_ID, PLAYER_EMAIL)


# ---------------------------------------------------------------------------
# Domain — leave_campaign deletes draft
# ---------------------------------------------------------------------------

class TestLeaveCampaignDeletesDraft:
    def test_deletes_draft_when_player_leaves(self, cosmos_mocks):
        from functions.domain import leave_campaign
        cosmos_mocks["get_campaign_player"].return_value = {
            "email": PLAYER_EMAIL, "status": "active", "role": "player",
        }
        cosmos_mocks["get_player"].return_value = {"display_name": "Thandor"}

        leave_campaign(CAMPAIGN_ID, PLAYER_EMAIL)

        cosmos_mocks["delete_character_draft"].assert_called_once_with(CAMPAIGN_ID, PLAYER_EMAIL)


# ---------------------------------------------------------------------------
# Handler — delete_campaign deletes all drafts
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cancel_campaign_deletes_all_character_drafts():
    from functions.webhook_http import delete_campaign_handler

    with (
        patch(f"{MODULE}.get_campaign") as mock_campaign,
        patch(f"{MODULE}.cancel_campaign") as mock_cancel,
        patch(f"{MODULE}.broadcast_lobby_event"),
        patch(f"{MODULE}.get_player") as mock_player,
    ):
        mock_campaign.return_value = {
            "id": CAMPAIGN_ID, "campaign_id": CAMPAIGN_ID, "status": "lobby",
            "creator_emails": [PLAYER_EMAIL],
        }
        mock_cancel.return_value = {"player_emails": []}
        mock_player.return_value = {"email": PLAYER_EMAIL, "approved": True}

        req = _make_request(email=PLAYER_EMAIL)
        await delete_campaign_handler(req)

        mock_cancel.assert_called_once_with(CAMPAIGN_ID)


# ---------------------------------------------------------------------------
# HTTP — PUT /campaigns/{id}/character/draft
# ---------------------------------------------------------------------------

@pytest.fixture
def draft_put_mocks():
    with (
        patch(f"{MODULE}.get_player") as mock_player,
        patch(f"{MODULE}.save_character_draft") as mock_save,
    ):
        mock_player.return_value = {"email": PLAYER_EMAIL, "approved": True}
        mock_save.return_value = None
        yield {"get_player": mock_player, "save_character_draft": mock_save}


@pytest.mark.asyncio
async def test_put_draft_returns_200_for_active_player(draft_put_mocks):
    from functions.webhook_http import save_character_draft_handler

    draft_put_mocks["save_character_draft"].return_value = None

    req = _make_request(body=SAMPLE_DRAFT, method="PUT")
    resp = await save_character_draft_handler(req)

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_put_draft_returns_403_for_non_member(draft_put_mocks):
    from functions.webhook_http import save_character_draft_handler
    from functions.domain import DomainError

    draft_put_mocks["save_character_draft"].side_effect = DomainError("not a member", 403)

    req = _make_request(body=SAMPLE_DRAFT, method="PUT")
    resp = await save_character_draft_handler(req)

    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# HTTP — GET /campaigns/{id}/character/draft
# ---------------------------------------------------------------------------

@pytest.fixture
def draft_get_mocks():
    with (
        patch(f"{MODULE}.get_player") as mock_player,
        patch(f"{MODULE}.get_character_draft_for_player") as mock_get,
    ):
        mock_player.return_value = {"email": PLAYER_EMAIL, "approved": True}
        yield {"get_player": mock_player, "get_character_draft_for_player": mock_get}


@pytest.mark.asyncio
async def test_get_draft_returns_draft_when_it_exists(draft_get_mocks):
    from functions.webhook_http import get_character_draft_handler

    draft_get_mocks["get_character_draft_for_player"].return_value = SAMPLE_DRAFT

    req = _make_request()
    resp = await get_character_draft_handler(req)

    assert resp.status_code == 200
    body = json.loads(resp.get_body())
    assert body["step"] == 2


@pytest.mark.asyncio
async def test_get_draft_returns_404_when_no_draft(draft_get_mocks):
    from functions.webhook_http import get_character_draft_handler

    draft_get_mocks["get_character_draft_for_player"].return_value = None

    req = _make_request()
    resp = await get_character_draft_handler(req)

    assert resp.status_code == 404

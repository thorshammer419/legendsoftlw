"""
Unit tests for functions/domain.py.

All Cosmos DB calls are mocked — no Azure connection required.
Run with: cd api && .venv/bin/pytest tests/ -v
"""

import pytest
from functions.domain import (
    DomainError,
    submit_player_action,
    create_new_campaign,
    save_character,
    join_campaign_as_observer,
)


# ---------------------------------------------------------------------------
# DomainError
# ---------------------------------------------------------------------------

class TestDomainError:
    def test_default_status_is_400(self):
        err = DomainError("bad input")
        assert err.http_status == 400

    def test_custom_status(self):
        err = DomainError("forbidden", 403)
        assert err.http_status == 403

    def test_message_is_accessible(self):
        err = DomainError("something went wrong", 409)
        assert str(err) == "something went wrong"

    def test_is_exception_subclass(self):
        assert issubclass(DomainError, Exception)


# ---------------------------------------------------------------------------
# submit_player_action
# ---------------------------------------------------------------------------

class TestSubmitPlayerAction:
    def test_stores_action_and_returns_not_ready(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player, story_state
    ):
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_story_state"].return_value = story_state
        # Two active players; only one has submitted
        cosmos_mocks["get_campaign_players"].return_value = [
            active_campaign_player,
            {"email": "other@example.com", "status": "active"},
        ]

        result = submit_player_action(campaign_id, player_email, "I attack the goblin", [])

        assert result == {"round_ready": False}
        cosmos_mocks["upsert_story_state"].assert_called_once()
        saved_state = cosmos_mocks["upsert_story_state"].call_args[0][0]
        assert player_email in saved_state["pending_actions"]
        assert saved_state["pending_actions"][player_email]["action_text"] == "I attack the goblin"

    def test_returns_round_ready_when_last_player_submits(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player, story_state
    ):
        # Other player already submitted
        story_state["pending_actions"] = {"other@example.com": {"action_text": "I hide"}}
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_story_state"].return_value = story_state
        cosmos_mocks["get_campaign_players"].return_value = [
            active_campaign_player,
            {"email": "other@example.com", "status": "active"},
        ]

        result = submit_player_action(campaign_id, player_email, "I cast fireball", [])

        assert result == {"round_ready": True}

    def test_stores_rolls_with_action(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player, story_state
    ):
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_story_state"].return_value = story_state
        cosmos_mocks["get_campaign_players"].return_value = [active_campaign_player]
        rolls = [{"description": "Attack", "result": 17}]

        submit_player_action(campaign_id, player_email, "I attack", rolls)

        saved = cosmos_mocks["upsert_story_state"].call_args[0][0]
        assert saved["pending_actions"][player_email]["rolls"] == rolls

    def test_raises_403_when_player_not_in_campaign(
        self, cosmos_mocks, campaign_id, player_email
    ):
        cosmos_mocks["get_campaign_player"].return_value = None

        with pytest.raises(DomainError) as exc:
            submit_player_action(campaign_id, player_email, "I attack", [])

        assert exc.value.http_status == 403

    def test_raises_403_when_player_inactive(
        self, cosmos_mocks, campaign_id, player_email
    ):
        cosmos_mocks["get_campaign_player"].return_value = {
            "email": player_email,
            "status": "inactive",
        }

        with pytest.raises(DomainError) as exc:
            submit_player_action(campaign_id, player_email, "I attack", [])

        assert exc.value.http_status == 403

    def test_raises_409_when_round_is_resolving(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_story_state"].return_value = {
            "campaign_id": campaign_id,
            "round_status": "resolving",
            "pending_actions": {},
        }

        with pytest.raises(DomainError) as exc:
            submit_player_action(campaign_id, player_email, "I attack", [])

        assert exc.value.http_status == 409

    def test_solo_player_immediately_ready(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player, story_state
    ):
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_story_state"].return_value = story_state
        cosmos_mocks["get_campaign_players"].return_value = [active_campaign_player]

        result = submit_player_action(campaign_id, player_email, "I explore", [])

        assert result == {"round_ready": True}

    def test_not_ready_when_no_active_players(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player, story_state
    ):
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_story_state"].return_value = story_state
        cosmos_mocks["get_campaign_players"].return_value = []

        result = submit_player_action(campaign_id, player_email, "I explore", [])

        assert result == {"round_ready": False}


# ---------------------------------------------------------------------------
# create_new_campaign
# ---------------------------------------------------------------------------

class TestCreateNewCampaign:
    def test_returns_campaign_document(self, cosmos_mocks):
        result = create_new_campaign("dm@example.com", {"name": "Dark Descent"})

        assert result["name"] == "Dark Descent"
        assert result["status"] == "lobby"
        assert result["created_by"] == "dm@example.com"
        assert result["type"] == "campaign"

    def test_creator_is_admin(self, cosmos_mocks):
        result = create_new_campaign("dm@example.com", {})

        assert "dm@example.com" in result["admin_emails"]

    def test_default_name_when_not_provided(self, cosmos_mocks):
        result = create_new_campaign("dm@example.com", {})

        assert result["name"] == "New Campaign"

    def test_custom_fields_are_applied(self, cosmos_mocks):
        body = {
            "name": "The Lost Mine",
            "description": "A classic adventure",
            "party_name": "The Fellowship",
            "max_players": 4,
        }
        result = create_new_campaign("dm@example.com", body)

        assert result["description"] == "A classic adventure"
        assert result["party_name"] == "The Fellowship"
        assert result["max_players"] == 4

    def test_default_party_name(self, cosmos_mocks):
        result = create_new_campaign("dm@example.com", {})

        assert result["party_name"] == "The Adventurers"

    def test_campaign_id_is_8_chars(self, cosmos_mocks):
        result = create_new_campaign("dm@example.com", {})

        assert len(result["campaign_id"]) == 8

    def test_persists_campaign_story_state_and_player(self, cosmos_mocks):
        create_new_campaign("dm@example.com", {"name": "Test"})

        cosmos_mocks["create_campaign"].assert_called_once()
        cosmos_mocks["upsert_story_state"].assert_called_once()
        cosmos_mocks["upsert_campaign_player"].assert_called_once()

    def test_story_state_starts_at_round_zero(self, cosmos_mocks):
        create_new_campaign("dm@example.com", {})

        state = cosmos_mocks["upsert_story_state"].call_args[0][0]
        assert state["round_number"] == 0
        assert state["round_status"] == "waiting"

    def test_creator_campaign_player_is_admin_and_active(self, cosmos_mocks):
        create_new_campaign("dm@example.com", {})

        cp = cosmos_mocks["upsert_campaign_player"].call_args[0][0]
        assert cp["email"] == "dm@example.com"
        assert cp["role"] == "admin"
        assert cp["status"] == "active"

    def test_custom_schedule_is_preserved(self, cosmos_mocks):
        custom_schedule = {"timeout_enabled": False, "round_timeout_minutes": 60}
        result = create_new_campaign("dm@example.com", {"schedule": custom_schedule})

        assert result["schedule"] == custom_schedule

    def test_each_call_generates_unique_campaign_id(self, cosmos_mocks):
        r1 = create_new_campaign("dm@example.com", {})
        r2 = create_new_campaign("dm@example.com", {})

        assert r1["campaign_id"] != r2["campaign_id"]


# ---------------------------------------------------------------------------
# save_character
# ---------------------------------------------------------------------------

class TestSaveCharacter:
    def test_first_save_returns_first_completion_true(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        active_campaign_player["character_creation_complete"] = False
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_player"].return_value = {"display_name": "Thandor"}
        body = {"name": "Thandor", "class": "Fighter"}

        result = save_character(campaign_id, player_email, body)

        assert result["first_completion"] is True
        assert result["char_name"] == "Thandor"
        assert result["char_class"] == "Fighter"
        assert result["email"] == player_email

    def test_subsequent_save_returns_first_completion_false(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        active_campaign_player["character_creation_complete"] = True
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player

        result = save_character(campaign_id, player_email, {"name": "Thandor"})

        assert result == {"first_completion": False}

    def test_display_name_falls_back_to_email_prefix(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        active_campaign_player["character_creation_complete"] = False
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_player"].return_value = None

        result = save_character(campaign_id, player_email, {"name": "Kira"})

        assert result["display_name"] == "adventurer"  # email prefix before @

    def test_display_name_from_player_profile(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        active_campaign_player["character_creation_complete"] = False
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_player"].return_value = {"display_name": "The Dark Knight"}

        result = save_character(campaign_id, player_email, {"name": "Kira"})

        assert result["display_name"] == "The Dark Knight"

    def test_returns_false_when_no_campaign_player(
        self, cosmos_mocks, campaign_id, player_email
    ):
        cosmos_mocks["get_campaign_player"].return_value = None

        result = save_character(campaign_id, player_email, {"name": "Ghost"})

        assert result == {"first_completion": False}

    def test_persists_character_with_correct_ids(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        body = {"name": "Kira", "class": "Rogue"}

        save_character(campaign_id, player_email, body)

        char = cosmos_mocks["upsert_character"].call_args[0][0]
        assert char["id"] == f"character_{campaign_id}_{player_email}"
        assert char["type"] == "character"
        assert char["campaign_id"] == campaign_id
        assert char["email"] == player_email
        assert char["name"] == "Kira"

    def test_marks_campaign_player_complete(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        active_campaign_player["character_creation_complete"] = False
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player

        save_character(campaign_id, player_email, {"name": "Kira"})

        saved_cp = cosmos_mocks["upsert_campaign_player"].call_args[0][0]
        assert saved_cp["character_creation_complete"] is True


# ---------------------------------------------------------------------------
# join_campaign_as_observer
# ---------------------------------------------------------------------------

class TestJoinCampaignAsObserver:
    def test_returns_campaign_player_document(self, cosmos_mocks, campaign_id, player_email):
        result = join_campaign_as_observer(campaign_id, player_email)

        assert result["campaign_id"] == campaign_id
        assert result["email"] == player_email
        assert result["type"] == "campaign_player"

    def test_observer_starts_active(self, cosmos_mocks, campaign_id, player_email):
        result = join_campaign_as_observer(campaign_id, player_email)

        assert result["status"] == "active"
        assert result["role"] == "player"

    def test_observer_is_not_character_complete(self, cosmos_mocks, campaign_id, player_email):
        result = join_campaign_as_observer(campaign_id, player_email)

        assert result["character_creation_complete"] is False

    def test_document_id_format(self, cosmos_mocks, campaign_id, player_email):
        result = join_campaign_as_observer(campaign_id, player_email)

        assert result["id"] == f"campaign_player_{campaign_id}_{player_email}"

    def test_persists_to_cosmos(self, cosmos_mocks, campaign_id, player_email):
        join_campaign_as_observer(campaign_id, player_email)

        cosmos_mocks["upsert_campaign_player"].assert_called_once()
        saved = cosmos_mocks["upsert_campaign_player"].call_args[0][0]
        assert saved["email"] == player_email

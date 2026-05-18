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
    leave_campaign,
    get_lobby_chat,
    append_lobby_message,
    lobby_presence_join,
    lobby_presence_leave,
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

    def test_creator_is_creator(self, cosmos_mocks):
        result = create_new_campaign("dm@example.com", {})

        assert "dm@example.com" in result["creator_emails"]

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

    def test_creator_campaign_player_is_creator_and_active(self, cosmos_mocks):
        create_new_campaign("dm@example.com", {})

        cp = cosmos_mocks["upsert_campaign_player"].call_args[0][0]
        assert cp["email"] == "dm@example.com"
        assert cp["role"] == "creator"
        assert cp["status"] == "active"

    def test_custom_schedule_is_preserved(self, cosmos_mocks):
        custom_schedule = {"timeout_enabled": False, "round_timeout_minutes": 60}
        result = create_new_campaign("dm@example.com", {"schedule": custom_schedule})

        assert result["schedule"] == custom_schedule

    def test_each_call_generates_unique_campaign_id(self, cosmos_mocks):
        r1 = create_new_campaign("dm@example.com", {})
        r2 = create_new_campaign("dm@example.com", {})

        assert r1["campaign_id"] != r2["campaign_id"]

    # invite_token
    def test_invite_token_is_generated(self, cosmos_mocks):
        result = create_new_campaign("dm@example.com", {})

        assert "invite_token" in result
        assert len(result["invite_token"]) > 20

    def test_each_campaign_gets_unique_invite_token(self, cosmos_mocks):
        r1 = create_new_campaign("dm@example.com", {})
        r2 = create_new_campaign("dm@example.com", {})

        assert r1["invite_token"] != r2["invite_token"]

    # password_hash
    def test_no_password_leaves_hash_null(self, cosmos_mocks):
        result = create_new_campaign("dm@example.com", {})

        assert result["password_hash"] is None

    def test_password_is_stored_as_bcrypt_hash_not_plaintext(self, cosmos_mocks):
        result = create_new_campaign("dm@example.com", {"password": "secret123"})

        assert result["password_hash"] is not None
        assert result["password_hash"] != "secret123"
        assert result["password_hash"].startswith("$2b$")

    def test_password_hash_verifies_against_original(self, cosmos_mocks):
        import bcrypt
        result = create_new_campaign("dm@example.com", {"password": "secret123"})

        assert bcrypt.checkpw(b"secret123", result["password_hash"].encode())

    def test_ability_score_method_defaults_to_standard_array(self, cosmos_mocks):
        result = create_new_campaign("dm@example.com", {})

        assert result["ability_score_method"] == "standard_array"

    def test_ability_score_method_point_buy_is_stored(self, cosmos_mocks):
        result = create_new_campaign("dm@example.com", {"ability_score_method": "point_buy"})

        assert result["ability_score_method"] == "point_buy"

    def test_ability_score_method_roll_is_stored(self, cosmos_mocks):
        result = create_new_campaign("dm@example.com", {"ability_score_method": "roll"})

        assert result["ability_score_method"] == "roll"

    def test_ability_score_rules_defaults_to_standard_5e_values(self, cosmos_mocks):
        result = create_new_campaign("dm@example.com", {})

        rules = result["ability_score_rules"]
        assert rules["standard_array"] == [15, 14, 13, 12, 10, 8]
        assert rules["point_buy_points"] == 27
        assert rules["roll_dice"] == 4
        assert rules["roll_keep"] == 3

    def test_ability_score_rules_stored_verbatim_when_provided(self, cosmos_mocks):
        custom_rules = {
            "standard_array": [16, 14, 13, 12, 10, 8],
            "point_buy_points": 35,
            "roll_dice": 5,
            "roll_keep": 3,
        }
        result = create_new_campaign("dm@example.com", {"ability_score_rules": custom_rules})

        assert result["ability_score_rules"] == custom_rules

    def test_ability_score_rules_partial_override_stored_verbatim(self, cosmos_mocks):
        partial_rules = {"point_buy_points": 40}
        result = create_new_campaign("dm@example.com", {"ability_score_rules": partial_rules})

        assert result["ability_score_rules"] == partial_rules

    def test_max_starting_level_defaults_to_1(self, cosmos_mocks):
        result = create_new_campaign("dm@example.com", {})

        assert result["max_starting_level"] == 1

    def test_max_starting_level_stored_when_provided(self, cosmos_mocks):
        result = create_new_campaign("dm@example.com", {"max_starting_level": 5})

        assert result["max_starting_level"] == 5


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

    def test_stores_char_class_on_campaign_player(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        active_campaign_player["character_creation_complete"] = False
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_player"].return_value = None

        save_character(campaign_id, player_email, {"name": "Kira", "class": "Rogue"})

        saved_cp = cosmos_mocks["upsert_campaign_player"].call_args[0][0]
        assert saved_cp["char_class"] == "Rogue"

    def test_stores_char_class_on_resubmission(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        active_campaign_player["character_creation_complete"] = True
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player

        save_character(campaign_id, player_email, {"name": "Kira", "class": "Wizard"})

        saved_cp = cosmos_mocks["upsert_campaign_player"].call_args[0][0]
        assert saved_cp["char_class"] == "Wizard"

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


# ---------------------------------------------------------------------------
# leave_campaign
# ---------------------------------------------------------------------------

class TestLeaveCampaign:
    def test_returns_email_and_display_name(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_player"].return_value = {"display_name": "Thandor"}

        result = leave_campaign(campaign_id, player_email)

        assert result["email"] == player_email
        assert result["display_name"] == "Thandor"

    def test_raises_403_when_not_a_member(self, cosmos_mocks, campaign_id, player_email):
        cosmos_mocks["get_campaign_player"].return_value = None

        with pytest.raises(DomainError) as exc:
            leave_campaign(campaign_id, player_email)

        assert exc.value.http_status == 403

    def test_raises_403_when_caller_is_creator(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        active_campaign_player["role"] = "creator"
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player

        with pytest.raises(DomainError) as exc:
            leave_campaign(campaign_id, player_email)

        assert exc.value.http_status == 403

    def test_deletes_campaign_player_record(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_player"].return_value = None

        leave_campaign(campaign_id, player_email)

        cosmos_mocks["delete_campaign_player"].assert_called_once_with(campaign_id, player_email)

    def test_deletes_character_record(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_player"].return_value = None

        leave_campaign(campaign_id, player_email)

        cosmos_mocks["delete_character"].assert_called_once_with(campaign_id, player_email)

    def test_display_name_falls_back_to_email_prefix(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_player"].return_value = None

        result = leave_campaign(campaign_id, player_email)

        assert result["display_name"] == "adventurer"  # prefix of adventurer@example.com


# ---------------------------------------------------------------------------
# get_lobby_chat / append_lobby_message
# ---------------------------------------------------------------------------

class TestGetLobbyChat:
    def test_returns_empty_list_when_no_history(self, cosmos_mocks, campaign_id):
        cosmos_mocks["get_lobby_chat_doc"].side_effect = Exception("not found")
        result = get_lobby_chat(campaign_id)
        assert result == []

    def test_returns_messages_from_existing_doc(self, cosmos_mocks, campaign_id):
        msg = {"message_id": "abc", "type": "chat", "text": "hello"}
        cosmos_mocks["get_lobby_chat_doc"].return_value = {"messages": [msg]}
        result = get_lobby_chat(campaign_id)
        assert result == [msg]

    def test_returns_empty_list_when_doc_has_no_messages_key(self, cosmos_mocks, campaign_id):
        cosmos_mocks["get_lobby_chat_doc"].return_value = {}
        result = get_lobby_chat(campaign_id)
        assert result == []


class TestAppendLobbyMessage:
    def test_appends_message_to_empty_history(self, cosmos_mocks, campaign_id):
        cosmos_mocks["get_lobby_chat_doc"].side_effect = Exception("not found")
        msg = {"message_id": "uuid1", "type": "chat", "text": "hi"}
        append_lobby_message(campaign_id, msg)
        cosmos_mocks["upsert_lobby_chat_doc"].assert_called_once()
        saved = cosmos_mocks["upsert_lobby_chat_doc"].call_args[0][0]
        assert saved["messages"] == [msg]
        assert saved["id"] == f"lobby_chat_{campaign_id}"
        assert saved["campaign_id"] == campaign_id

    def test_appends_to_existing_messages(self, cosmos_mocks, campaign_id):
        existing = {"message_id": "old", "text": "first"}
        cosmos_mocks["get_lobby_chat_doc"].return_value = {
            "id": f"lobby_chat_{campaign_id}",
            "campaign_id": campaign_id,
            "messages": [existing],
        }
        new_msg = {"message_id": "new", "text": "second"}
        append_lobby_message(campaign_id, new_msg)
        saved = cosmos_mocks["upsert_lobby_chat_doc"].call_args[0][0]
        assert saved["messages"] == [existing, new_msg]


# ---------------------------------------------------------------------------
# lobby_presence_join
# ---------------------------------------------------------------------------

class TestLobbyPresenceJoin:
    @pytest.fixture
    def character(self, campaign_id, player_email):
        return {
            "id": f"character_{campaign_id}_{player_email}",
            "type": "character",
            "campaign_id": campaign_id,
            "email": player_email,
            "name": "Shadowbane",
            "class": "Rogue",
            "level": 3,
        }

    def test_returns_system_message_with_join_text(
        self, cosmos_mocks, campaign_id, player_email, character
    ):
        cosmos_mocks["get_character"].return_value = character
        cosmos_mocks["get_player"].return_value = {"display_name": "Aria"}
        cosmos_mocks["get_lobby_presence_doc"].side_effect = Exception("not found")

        result = lobby_presence_join(campaign_id, player_email)

        assert result["type"] == "system"
        assert "Aria" in result["text"]
        assert "Shadowbane" in result["text"]
        assert "Rogue" in result["text"]
        assert "level 3" in result["text"]

    def test_join_text_includes_sword_emoji(
        self, cosmos_mocks, campaign_id, player_email, character
    ):
        cosmos_mocks["get_character"].return_value = character
        cosmos_mocks["get_player"].return_value = {"display_name": "Aria"}
        cosmos_mocks["get_lobby_presence_doc"].side_effect = Exception("not found")

        result = lobby_presence_join(campaign_id, player_email)

        assert result["text"].startswith("⚔")

    def test_persists_presence_doc_as_present(
        self, cosmos_mocks, campaign_id, player_email, character
    ):
        cosmos_mocks["get_character"].return_value = character
        cosmos_mocks["get_player"].return_value = {"display_name": "Aria"}
        cosmos_mocks["get_lobby_presence_doc"].side_effect = Exception("not found")

        lobby_presence_join(campaign_id, player_email)

        cosmos_mocks["upsert_lobby_presence_doc"].assert_called_once()
        saved = cosmos_mocks["upsert_lobby_presence_doc"].call_args[0][0]
        assert saved["status"] == "present"
        assert saved["campaign_id"] == campaign_id
        assert saved["email"] == player_email

    def test_stores_display_name_on_presence_doc(
        self, cosmos_mocks, campaign_id, player_email, character
    ):
        cosmos_mocks["get_character"].return_value = character
        cosmos_mocks["get_player"].return_value = {"display_name": "Aria"}
        cosmos_mocks["get_lobby_presence_doc"].side_effect = Exception("not found")

        lobby_presence_join(campaign_id, player_email)

        saved = cosmos_mocks["upsert_lobby_presence_doc"].call_args[0][0]
        assert saved["display_name"] == "Aria"

    def test_falls_back_to_email_prefix_when_no_player_doc(
        self, cosmos_mocks, campaign_id, player_email, character
    ):
        cosmos_mocks["get_character"].return_value = character
        cosmos_mocks["get_player"].return_value = None
        cosmos_mocks["get_lobby_presence_doc"].side_effect = Exception("not found")

        result = lobby_presence_join(campaign_id, player_email)

        assert "adventurer" in result["text"]

    def test_result_has_message_id_and_timestamp(
        self, cosmos_mocks, campaign_id, player_email, character
    ):
        cosmos_mocks["get_character"].return_value = character
        cosmos_mocks["get_player"].return_value = {"display_name": "Aria"}
        cosmos_mocks["get_lobby_presence_doc"].side_effect = Exception("not found")

        result = lobby_presence_join(campaign_id, player_email)

        assert "message_id" in result
        assert "timestamp" in result

    def test_suppresses_join_when_player_already_present(
        self, cosmos_mocks, campaign_id, player_email, character
    ):
        cosmos_mocks["get_character"].return_value = character
        cosmos_mocks["get_player"].return_value = {"display_name": "Aria"}
        cosmos_mocks["get_lobby_presence_doc"].return_value = {
            "status": "present",
            "display_name": "Aria",
            "updated_at": "2026-01-01T00:00:00+00:00",
        }

        result = lobby_presence_join(campaign_id, player_email)

        assert result is None

    def test_suppresses_join_on_rapid_rejoin(
        self, cosmos_mocks, campaign_id, player_email, character
    ):
        from datetime import datetime, timezone, timedelta
        cosmos_mocks["get_character"].return_value = character
        cosmos_mocks["get_player"].return_value = {"display_name": "Aria"}
        recent = (datetime.now(timezone.utc) - timedelta(seconds=3)).isoformat()
        cosmos_mocks["get_lobby_presence_doc"].return_value = {
            "status": "left",
            "display_name": "Aria",
            "updated_at": recent,
        }

        result = lobby_presence_join(campaign_id, player_email)

        assert result is None

    def test_announces_join_when_left_long_ago(
        self, cosmos_mocks, campaign_id, player_email, character
    ):
        from datetime import datetime, timezone, timedelta
        cosmos_mocks["get_character"].return_value = character
        cosmos_mocks["get_player"].return_value = {"display_name": "Aria"}
        long_ago = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
        cosmos_mocks["get_lobby_presence_doc"].return_value = {
            "status": "left",
            "display_name": "Aria",
            "updated_at": long_ago,
        }

        result = lobby_presence_join(campaign_id, player_email)

        assert result is not None
        assert "Aria" in result["text"]

    def test_still_persists_presence_doc_when_suppressed(
        self, cosmos_mocks, campaign_id, player_email, character
    ):
        cosmos_mocks["get_character"].return_value = character
        cosmos_mocks["get_player"].return_value = {"display_name": "Aria"}
        cosmos_mocks["get_lobby_presence_doc"].return_value = {
            "status": "present",
            "display_name": "Aria",
            "updated_at": "2026-01-01T00:00:00+00:00",
        }

        lobby_presence_join(campaign_id, player_email)

        cosmos_mocks["upsert_lobby_presence_doc"].assert_called_once()
        saved = cosmos_mocks["upsert_lobby_presence_doc"].call_args[0][0]
        assert saved["status"] == "present"


# ---------------------------------------------------------------------------
# lobby_presence_leave
# ---------------------------------------------------------------------------

class TestLobbyPresenceLeave:
    def test_persists_presence_doc_as_left(
        self, cosmos_mocks, campaign_id, player_email
    ):
        cosmos_mocks["get_lobby_presence_doc"].side_effect = Exception("not found")

        lobby_presence_leave(campaign_id, player_email)

        cosmos_mocks["upsert_lobby_presence_doc"].assert_called_once()
        saved = cosmos_mocks["upsert_lobby_presence_doc"].call_args[0][0]
        assert saved["status"] == "left"
        assert saved["campaign_id"] == campaign_id
        assert saved["email"] == player_email

    def test_updates_existing_presence_doc(
        self, cosmos_mocks, campaign_id, player_email
    ):
        existing = {
            "id": f"presence_{campaign_id}_{player_email}",
            "type": "lobby_presence",
            "campaign_id": campaign_id,
            "email": player_email,
            "status": "present",
            "display_name": "Aria",
        }
        cosmos_mocks["get_lobby_presence_doc"].return_value = existing

        lobby_presence_leave(campaign_id, player_email)

        saved = cosmos_mocks["upsert_lobby_presence_doc"].call_args[0][0]
        assert saved["status"] == "left"
        assert saved["display_name"] == "Aria"

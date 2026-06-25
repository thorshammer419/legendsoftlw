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
    join_campaign,
    launch_campaign,
    cancel_campaign,
    toggle_player_status,
    apply_round_state,
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

    def test_stores_rerolled_flag_on_campaign_player(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        active_campaign_player["character_creation_complete"] = False
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_player"].return_value = None

        save_character(campaign_id, player_email, {"name": "Kira", "rerolled": True})

        saved_cp = cosmos_mocks["upsert_campaign_player"].call_args[0][0]
        assert saved_cp.get("rerolled") is True

    def test_rerolled_flag_absent_when_not_sent(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        active_campaign_player["character_creation_complete"] = False
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_player"].return_value = None

        save_character(campaign_id, player_email, {"name": "Kira"})

        saved_cp = cosmos_mocks["upsert_campaign_player"].call_args[0][0]
        assert "rerolled" not in saved_cp

    def test_writes_reroll_flag_doc_when_rerolled(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        active_campaign_player["character_creation_complete"] = False
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_player"].return_value = None

        save_character(campaign_id, player_email, {"name": "Kira", "rerolled": True})

        cosmos_mocks["upsert_reroll_flag"].assert_called_once_with(campaign_id, player_email)

    def test_does_not_write_reroll_flag_doc_when_not_rerolled(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        active_campaign_player["character_creation_complete"] = False
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_player"].return_value = None

        save_character(campaign_id, player_email, {"name": "Kira"})

        cosmos_mocks["upsert_reroll_flag"].assert_not_called()

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

    def test_seeds_rerolled_when_flag_exists(self, cosmos_mocks, campaign_id, player_email):
        cosmos_mocks["get_reroll_flag"].return_value = {
            "id": f"reroll_flag_{campaign_id}_{player_email}",
            "campaign_id": campaign_id,
            "email": player_email,
        }

        result = join_campaign_as_observer(campaign_id, player_email)

        assert result.get("rerolled") is True
        saved = cosmos_mocks["upsert_campaign_player"].call_args[0][0]
        assert saved.get("rerolled") is True

    def test_does_not_set_rerolled_when_no_flag(self, cosmos_mocks, campaign_id, player_email):
        cosmos_mocks["get_reroll_flag"].return_value = None

        result = join_campaign_as_observer(campaign_id, player_email)

        assert "rerolled" not in result


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

    def test_does_not_delete_reroll_flag_on_leave(
        self, cosmos_mocks, campaign_id, player_email, active_campaign_player
    ):
        cosmos_mocks["get_campaign_player"].return_value = active_campaign_player
        cosmos_mocks["get_player"].return_value = None

        leave_campaign(campaign_id, player_email)

        cosmos_mocks["delete_reroll_flag"].assert_not_called()


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


# ---------------------------------------------------------------------------
# join_campaign
# ---------------------------------------------------------------------------

class TestJoinCampaign:
    def _campaign(self, **kwargs):
        return {
            "campaign_id": "camp1",
            "status": "lobby",
            "invite_token": "valid_token_abc",
            "password_hash": None,
            **kwargs,
        }

    def test_open_campaign_joins_without_credentials(self, cosmos_mocks):
        cosmos_mocks["get_campaign"].return_value = self._campaign()
        cosmos_mocks["get_campaign_player"].return_value = None

        result = join_campaign("camp1", "player@example.com")

        cosmos_mocks["upsert_campaign_player"].assert_called_once()
        assert result["campaign_was_active"] is False

    def test_active_campaign_returns_campaign_was_active_true(self, cosmos_mocks):
        cosmos_mocks["get_campaign"].return_value = self._campaign(status="active")
        cosmos_mocks["get_campaign_player"].return_value = None

        result = join_campaign("camp1", "player@example.com")

        assert result["campaign_was_active"] is True

    def test_wrong_invite_token_raises_403(self, cosmos_mocks):
        cosmos_mocks["get_campaign"].return_value = self._campaign()

        with pytest.raises(DomainError) as exc_info:
            join_campaign("camp1", "player@example.com", invite_token="wrong")

        assert exc_info.value.http_status == 403
        assert "invalid" in str(exc_info.value).lower()

    def test_valid_invite_token_bypasses_password(self, cosmos_mocks):
        import bcrypt
        pw_hash = bcrypt.hashpw(b"secret", bcrypt.gensalt()).decode()
        cosmos_mocks["get_campaign"].return_value = self._campaign(password_hash=pw_hash)
        cosmos_mocks["get_campaign_player"].return_value = None

        result = join_campaign("camp1", "player@example.com", invite_token="valid_token_abc")

        cosmos_mocks["upsert_campaign_player"].assert_called_once()
        assert result["campaign_was_active"] is False

    def test_missing_password_raises_403(self, cosmos_mocks):
        import bcrypt
        pw_hash = bcrypt.hashpw(b"secret", bcrypt.gensalt()).decode()
        cosmos_mocks["get_campaign"].return_value = self._campaign(password_hash=pw_hash)

        with pytest.raises(DomainError) as exc_info:
            join_campaign("camp1", "player@example.com")

        assert exc_info.value.http_status == 403
        assert "password" in str(exc_info.value).lower()

    def test_wrong_password_raises_403(self, cosmos_mocks):
        import bcrypt
        pw_hash = bcrypt.hashpw(b"secret", bcrypt.gensalt()).decode()
        cosmos_mocks["get_campaign"].return_value = self._campaign(password_hash=pw_hash)

        with pytest.raises(DomainError) as exc_info:
            join_campaign("camp1", "player@example.com", password="wrongpass")

        assert exc_info.value.http_status == 403
        assert "incorrect" in str(exc_info.value).lower()

    def test_correct_password_joins(self, cosmos_mocks):
        import bcrypt
        pw_hash = bcrypt.hashpw(b"secret", bcrypt.gensalt()).decode()
        cosmos_mocks["get_campaign"].return_value = self._campaign(password_hash=pw_hash)
        cosmos_mocks["get_campaign_player"].return_value = None

        result = join_campaign("camp1", "player@example.com", password="secret")

        cosmos_mocks["upsert_campaign_player"].assert_called_once()
        assert result["campaign_was_active"] is False


# ---------------------------------------------------------------------------
# launch_campaign
# ---------------------------------------------------------------------------

class TestLaunchCampaign:
    def _campaign(self):
        return {
            "campaign_id": "camp1",
            "id": "campaign_camp1",
            "status": "lobby",
        }

    def test_sets_campaign_status_to_active(self, cosmos_mocks):
        cosmos_mocks["get_campaign"].return_value = self._campaign()
        cosmos_mocks["get_campaign_players"].return_value = []

        launch_campaign("camp1")

        cosmos_mocks["update_campaign"].assert_called_once()
        saved = cosmos_mocks["update_campaign"].call_args[0][0]
        assert saved["status"] == "active"

    def test_returns_all_player_emails(self, cosmos_mocks):
        cosmos_mocks["get_campaign"].return_value = self._campaign()
        cosmos_mocks["get_campaign_players"].return_value = [
            {"email": "a@example.com"},
            {"email": "b@example.com"},
        ]

        result = launch_campaign("camp1")

        assert set(result["player_emails"]) == {"a@example.com", "b@example.com"}

    def test_returns_empty_list_when_no_players(self, cosmos_mocks):
        cosmos_mocks["get_campaign"].return_value = self._campaign()
        cosmos_mocks["get_campaign_players"].return_value = []

        result = launch_campaign("camp1")

        assert result["player_emails"] == []


# ---------------------------------------------------------------------------
# cancel_campaign
# ---------------------------------------------------------------------------

class TestCancelCampaign:
    def _campaign(self):
        return {
            "campaign_id": "camp1",
            "id": "campaign_camp1",
            "status": "lobby",
        }

    def test_soft_deletes_campaign(self, cosmos_mocks):
        cosmos_mocks["get_campaign"].return_value = self._campaign()
        cosmos_mocks["get_campaign_players"].return_value = []

        cancel_campaign("camp1")

        cosmos_mocks["update_campaign"].assert_called_once()
        saved = cosmos_mocks["update_campaign"].call_args[0][0]
        assert saved["status"] == "deleted"

    def test_returns_player_emails_before_deletion(self, cosmos_mocks):
        cosmos_mocks["get_campaign"].return_value = self._campaign()
        cosmos_mocks["get_campaign_players"].return_value = [
            {"email": "a@example.com"},
            {"email": "b@example.com"},
        ]

        result = cancel_campaign("camp1")

        assert set(result["player_emails"]) == {"a@example.com", "b@example.com"}

    def test_deletes_reroll_flags(self, cosmos_mocks):
        cosmos_mocks["get_campaign"].return_value = self._campaign()
        cosmos_mocks["get_campaign_players"].return_value = []

        cancel_campaign("camp1")

        cosmos_mocks["delete_reroll_flags_for_campaign"].assert_called_once_with("camp1")

    def test_deletes_character_drafts(self, cosmos_mocks):
        cosmos_mocks["get_campaign"].return_value = self._campaign()
        cosmos_mocks["get_campaign_players"].return_value = []

        cancel_campaign("camp1")

        cosmos_mocks["delete_character_drafts_for_campaign"].assert_called_once_with("camp1")


# ---------------------------------------------------------------------------
# toggle_player_status
# ---------------------------------------------------------------------------

class TestTogglePlayerStatus:
    def _cp(self, **kwargs):
        return {
            "campaign_id": "camp1",
            "email": "player@example.com",
            "status": "active",
            "consecutive_combat_skips": 2,
            "consecutive_scene_skips": 3,
            "manually_set_inactive": False,
            "inactivated_at": None,
            **kwargs,
        }

    def test_sets_status_to_inactive(self, cosmos_mocks):
        cosmos_mocks["get_campaign_player"].return_value = self._cp()

        result = toggle_player_status("camp1", "player@example.com", "inactive")

        assert result["status"] == "inactive"
        saved = cosmos_mocks["upsert_campaign_player"].call_args[0][0]
        assert saved["status"] == "inactive"
        assert saved["manually_set_inactive"] is True
        assert saved["inactivated_at"] is not None

    def test_sets_status_to_active_and_resets_skip_counts(self, cosmos_mocks):
        cosmos_mocks["get_campaign_player"].return_value = self._cp(
            status="inactive", manually_set_inactive=True,
            consecutive_combat_skips=5, consecutive_scene_skips=7,
        )

        result = toggle_player_status("camp1", "player@example.com", "active")

        assert result["status"] == "active"
        saved = cosmos_mocks["upsert_campaign_player"].call_args[0][0]
        assert saved["status"] == "active"
        assert saved["manually_set_inactive"] is False
        assert saved["consecutive_combat_skips"] == 0
        assert saved["consecutive_scene_skips"] == 0
        assert saved["inactivated_at"] is None

    def test_raises_404_when_player_not_in_campaign(self, cosmos_mocks):
        cosmos_mocks["get_campaign_player"].return_value = None

        with pytest.raises(DomainError) as exc_info:
            toggle_player_status("camp1", "ghost@example.com", "inactive")

        assert exc_info.value.http_status == 404

    def test_raises_400_for_invalid_status(self, cosmos_mocks):
        cosmos_mocks["get_campaign_player"].return_value = self._cp()

        with pytest.raises(DomainError) as exc_info:
            toggle_player_status("camp1", "player@example.com", "banned")

        assert exc_info.value.http_status == 400


# ---------------------------------------------------------------------------
# apply_round_state
# ---------------------------------------------------------------------------

class TestApplyRoundState:
    def _story_state(self, **kwargs):
        return {
            "campaign_id": "camp1",
            "round_number": 1,
            "scene_type": "exploration",
            "current_scene": {"location": "Tavern"},
            "quest": {"completed_milestones": [], "failed_milestones": []},
            "narrative_summary": "",
            "pending_actions": {"a@example.com": {"action_text": "attack"}},
            "action_economy": {},
            **kwargs,
        }

    def _char(self, email="p@example.com", hp_current=20, hp_max=20, **kwargs):
        return {
            "email": email,
            "hp": {"current": hp_current, "max": hp_max},
            "conditions": [],
            "spell_slots": {},
            "class_features": [],
            "speed": 30,
            **kwargs,
        }

    # --- Story state ---

    def test_increments_round_number(self):
        ss, _, _ = apply_round_state(self._story_state(), {}, [], [], 5)
        assert ss["round_number"] == 5

    def test_clears_pending_actions(self):
        ss, _, _ = apply_round_state(self._story_state(), {}, [], [], 2)
        assert ss["pending_actions"] == {}

    def test_applies_scene_type(self):
        ss, _, _ = apply_round_state(self._story_state(), {"scene_type": "combat"}, [], [], 2)
        assert ss["scene_type"] == "combat"

    def test_merges_current_scene(self):
        ss, _, _ = apply_round_state(
            self._story_state(),
            {"current_scene": {"location": "Forest"}},
            [], [], 2,
        )
        assert ss["current_scene"]["location"] == "Forest"

    def test_merges_quest_milestones_without_duplicates(self):
        state = self._story_state()
        state["quest"] = {
            "completed_milestones": ["A"],
            "failed_milestones": [],
        }
        ss, _, _ = apply_round_state(
            state,
            {"quest": {"completed_milestones": ["A", "B"], "failed_milestones": ["C"]}},
            [], [], 2,
        )
        assert sorted(ss["quest"]["completed_milestones"]) == ["A", "B"]
        assert ss["quest"]["failed_milestones"] == ["C"]

    def test_appends_narrative_summary(self):
        state = self._story_state(narrative_summary="Round 1.")
        ss, _, _ = apply_round_state(
            state,
            {"narrative_summary_append": "Round 2."},
            [], [], 2,
        )
        assert "Round 1." in ss["narrative_summary"]
        assert "Round 2." in ss["narrative_summary"]

    def test_resets_action_economy(self):
        state = self._story_state(action_economy={
            "p@example.com": {"action_used": True, "bonus_action_used": True,
                               "reaction_used": True, "movement_remaining": 0},
        })
        chars = [self._char(email="p@example.com", speed=35)]
        ss, _, _ = apply_round_state(state, {}, chars, [], 2)
        economy = ss["action_economy"]["p@example.com"]
        assert economy["action_used"] is False
        assert economy["bonus_action_used"] is False
        assert economy["reaction_used"] is False
        assert economy["movement_remaining"] == 35

    def test_does_not_mutate_input_story_state(self):
        state = self._story_state()
        original_round = state["round_number"]
        apply_round_state(state, {"scene_type": "combat"}, [], [], 9)
        assert state["round_number"] == original_round
        assert state["scene_type"] == "exploration"

    # --- Characters ---

    def test_applies_hp_change(self):
        chars = [self._char(hp_current=20)]
        _, updated_chars, _ = apply_round_state(
            self._story_state(),
            {"player_updates": [{"email": "p@example.com", "hp_change": -5}]},
            chars, [], 2,
        )
        assert updated_chars[0]["hp"]["current"] == 15

    def test_hp_cannot_go_below_zero(self):
        chars = [self._char(hp_current=3)]
        _, updated_chars, _ = apply_round_state(
            self._story_state(),
            {"player_updates": [{"email": "p@example.com", "hp_change": -10}]},
            chars, [], 2,
        )
        assert updated_chars[0]["hp"]["current"] == 0

    def test_adds_and_removes_conditions(self):
        chars = [self._char(conditions=["poisoned"])]
        _, updated_chars, _ = apply_round_state(
            self._story_state(),
            {"player_updates": [{
                "email": "p@example.com",
                "conditions_added": ["stunned"],
                "conditions_removed": ["poisoned"],
            }]},
            chars, [], 2,
        )
        conds = set(updated_chars[0]["conditions"])
        assert "stunned" in conds
        assert "poisoned" not in conds

    def test_consumes_spell_slots(self):
        chars = [self._char(spell_slots={"1": {"remaining": 3, "total": 4}})]
        _, updated_chars, _ = apply_round_state(
            self._story_state(),
            {"player_updates": [{"email": "p@example.com", "spell_slots_used": {"1": 2}}]},
            chars, [], 2,
        )
        assert updated_chars[0]["spell_slots"]["1"]["remaining"] == 1

    def test_spell_slots_cannot_go_below_zero(self):
        chars = [self._char(spell_slots={"1": {"remaining": 1, "total": 4}})]
        _, updated_chars, _ = apply_round_state(
            self._story_state(),
            {"player_updates": [{"email": "p@example.com", "spell_slots_used": {"1": 5}}]},
            chars, [], 2,
        )
        assert updated_chars[0]["spell_slots"]["1"]["remaining"] == 0

    def test_consumes_class_feature_uses(self):
        chars = [self._char(class_features=[{"name": "Rage", "uses": {"remaining": 3, "total": 3}}])]
        _, updated_chars, _ = apply_round_state(
            self._story_state(),
            {"player_updates": [{"email": "p@example.com", "class_feature_uses": {"Rage": 1}}]},
            chars, [], 2,
        )
        feat = next(f for f in updated_chars[0]["class_features"] if f["name"] == "Rage")
        assert feat["uses"]["remaining"] == 2

    def test_skips_update_for_unknown_player(self):
        chars = [self._char(email="p@example.com")]
        _, updated_chars, _ = apply_round_state(
            self._story_state(),
            {"player_updates": [{"email": "ghost@example.com", "hp_change": -5}]},
            chars, [], 2,
        )
        assert updated_chars == []

    def test_does_not_mutate_input_characters(self):
        chars = [self._char(hp_current=20)]
        apply_round_state(
            self._story_state(),
            {"player_updates": [{"email": "p@example.com", "hp_change": -5}]},
            chars, [], 2,
        )
        assert chars[0]["hp"]["current"] == 20

    # --- NPCs ---

    def test_applies_npc_hp_change(self):
        npc = {"id": "npc_camp1_goblin", "hp": {"current": 10, "max": 10}, "campaign_id": "camp1"}
        _, _, updated_npcs = apply_round_state(
            self._story_state(),
            {"npc_updates": [{"npc_id": "npc_camp1_goblin", "hp_change": -4}]},
            [], [npc], 2,
        )
        assert updated_npcs[0]["hp"]["current"] == 6

    def test_npc_hp_cannot_go_below_zero(self):
        npc = {"id": "npc_camp1_goblin", "hp": {"current": 2, "max": 10}, "campaign_id": "camp1"}
        _, _, updated_npcs = apply_round_state(
            self._story_state(),
            {"npc_updates": [{"npc_id": "npc_camp1_goblin", "hp_change": -10}]},
            [], [npc], 2,
        )
        assert updated_npcs[0]["hp"]["current"] == 0

    def test_applies_npc_status_change(self):
        npc = {"id": "npc_camp1_goblin", "status": "alive", "campaign_id": "camp1"}
        _, _, updated_npcs = apply_round_state(
            self._story_state(),
            {"npc_updates": [{"npc_id": "npc_camp1_goblin", "status_change": "dead"}]},
            [], [npc], 2,
        )
        assert updated_npcs[0]["status"] == "dead"

    def test_updates_npc_relationships(self):
        npc = {"id": "npc_camp1_innkeeper", "relationships": {}, "campaign_id": "camp1"}
        _, _, updated_npcs = apply_round_state(
            self._story_state(),
            {"npc_updates": [{"npc_id": "npc_camp1_innkeeper", "relationship_changes": [
                {"email": "p@example.com", "new_disposition": "friendly", "summary_update": "Helped them"},
            ]}]},
            [], [npc], 5,
        )
        rel = updated_npcs[0]["relationships"]["p@example.com"]
        assert rel["disposition"] == "friendly"
        assert rel["last_interaction_round"] == 5

    def test_skips_npc_update_when_npc_not_in_existing_list(self):
        _, _, updated_npcs = apply_round_state(
            self._story_state(),
            {"npc_updates": [{"npc_id": "npc_camp1_missing", "status_change": "dead"}]},
            [], [], 2,
        )
        assert updated_npcs == []

    def test_stamps_last_seen_round_on_updated_npc(self):
        npc = {"id": "npc_camp1_goblin", "campaign_id": "camp1"}
        _, _, updated_npcs = apply_round_state(
            self._story_state(),
            {"npc_updates": [{"npc_id": "npc_camp1_goblin", "status_change": "fleeing"}]},
            [], [npc], 7,
        )
        assert updated_npcs[0]["last_seen_round"] == 7

    def test_stamps_new_npcs_with_campaign_and_round(self):
        _, _, updated_npcs = apply_round_state(
            self._story_state(),
            {"new_npcs": [{"id": "npc_camp1_wizard", "name": "Merlin"}]},
            [], [], 3,
        )
        assert updated_npcs[0]["campaign_id"] == "camp1"
        assert updated_npcs[0]["first_appeared_round"] == 3
        assert updated_npcs[0]["last_seen_round"] == 3

    def test_returns_updated_and_new_npcs_together(self):
        npc = {"id": "npc_camp1_goblin", "campaign_id": "camp1"}
        _, _, updated_npcs = apply_round_state(
            self._story_state(),
            {
                "npc_updates": [{"npc_id": "npc_camp1_goblin", "status_change": "dead"}],
                "new_npcs": [{"id": "npc_camp1_wizard", "name": "Merlin"}],
            },
            [], [npc], 3,
        )
        assert len(updated_npcs) == 2

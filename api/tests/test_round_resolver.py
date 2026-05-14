"""
Unit tests for functions/round_resolver.py.
All external I/O (Cosmos DB, LLM calls, SignalR, email) is mocked.
Run with: cd api && .venv/bin/pytest tests/ -v
"""

import json
import pytest
from unittest.mock import patch, MagicMock
import copy

from functions.round_resolver import (
    _try,
    resolve_round,
    resolve_round_from_queue,
    campaign_intro_from_queue,
    player_join_from_queue,
    novel_export_from_queue,
)

MODULE = "functions.round_resolver"

# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

CAMPAIGN_ID = "abc12345"

WAITING_STATE = {
    "id": f"state_{CAMPAIGN_ID}",
    "campaign_id": CAMPAIGN_ID,
    "round_number": 1,
    "round_status": "waiting",
    "pending_actions": {
        "player@example.com": {"action_text": "I attack", "rolls": []}
    },
    "current_scene": {"location": "The Dungeon", "active_npcs": ["Goblin Chief"]},
    "narrative_summary": "The party entered the dungeon.",
}

RESOLVING_STATE = {**WAITING_STATE, "round_status": "resolving", "round_number": 3}

CAMPAIGN = {
    "id": CAMPAIGN_ID,
    "campaign_id": CAMPAIGN_ID,
    "name": "Dark Descent",
    "party_name": "The Fellowship",
    "schedule": {},
    "status": "active",
    "inactivity_thresholds": {"combat_encounters": 2, "scenes": 4},
}

PLAYERS = [
    {"email": "player@example.com", "status": "active"},
    {"email": "player2@example.com", "status": "active"},
]

CHARACTERS = [
    {"email": "player@example.com", "name": "Thorin", "class": "Fighter"},
    {"email": "player2@example.com", "name": "Elara", "class": "Ranger"},
]

STATE_UPDATE = {
    "scene_type": "combat",
    "current_scene": {"location": "The Dungeon"},
    "quest": {"completed_milestones": []},
    "player_updates": [],
    "npc_updates": [],
    "campaign_complete": False,
}

NARRATIVE = "The goblin lunges forward with a menacing grin..."


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------

PATCH_TARGETS = [
    "get_story_state", "upsert_story_state",
    "get_campaign", "update_campaign",
    "get_campaign_players", "get_characters",
    "get_active_npcs", "get_character",
    "get_narrative_log", "append_narrative_round",
    "generate_rag_queries", "execute_rag_queries",
    "generate_narrative", "extract_state", "apply_state_update",
    "generate_and_save_action_list", "generate_scene_image",
    "broadcast_narrative",
    "send_round_notifications", "send_round_push_notifications",
    "send_player_inactive_notification", "send_campaign_paused_notification",
    "send_novel_export_notification",
    "generate_player_introduction", "generate_catchup_summary",
    "generate_novel", "generate_campaign_intro",
    "calculate_deadline",
    "should_mark_inactive", "increment_skip_counters", "reset_skip_counters",
    "upsert_campaign_player",
]


@pytest.fixture
def mocks():
    patches = {name: patch(f"{MODULE}.{name}") for name in PATCH_TARGETS}
    m = {name: p.start() for name, p in patches.items()}

    # resolve_round calls get_story_state twice (once to read, once for new_story_state).
    # Other queue handlers call it once; the unused second item is harmless.
    m["get_story_state"].side_effect = [
        copy.deepcopy(WAITING_STATE),
        copy.deepcopy(WAITING_STATE),
    ]
    m["get_campaign"].return_value = copy.deepcopy(CAMPAIGN)
    m["get_campaign_players"].return_value = copy.deepcopy(PLAYERS)
    m["get_characters"].return_value = copy.deepcopy(CHARACTERS)
    m["get_active_npcs"].return_value = []
    m["generate_rag_queries"].return_value = []
    m["execute_rag_queries"].return_value = []
    m["generate_narrative"].return_value = NARRATIVE
    m["extract_state"].return_value = copy.deepcopy(STATE_UPDATE)
    m["generate_scene_image"].return_value = "https://example.com/scene.png"
    m["calculate_deadline"].return_value = None
    m["should_mark_inactive"].return_value = False
    m["increment_skip_counters"].side_effect = lambda cp, _: dict(cp)
    m["reset_skip_counters"].side_effect = lambda cp: dict(cp)
    m["get_narrative_log"].return_value = {"rounds": []}
    m["generate_campaign_intro"].return_value = "Welcome, adventurers!"
    m["generate_catchup_summary"].return_value = "Previously on your adventure..."
    m["generate_player_introduction"].return_value = "A new hero arrives..."
    m["generate_novel"].return_value = "https://example.com/novel.pdf"
    m["get_character"].return_value = CHARACTERS[0]

    yield m

    for p in patches.values():
        p.stop()


def make_msg(payload: dict):
    """Build a mock Azure Storage Queue message."""
    msg = MagicMock()
    msg.get_body.return_value = json.dumps(payload).encode()
    return msg


def set_single_state(mocks, state):
    """Override get_story_state to return a single value (for non-resolve_round handlers)."""
    mocks["get_story_state"].side_effect = None
    mocks["get_story_state"].return_value = state


# ---------------------------------------------------------------------------
# _try
# ---------------------------------------------------------------------------

class TestTry:
    def test_calls_function(self):
        called = []
        _try("step", lambda: called.append(True))
        assert called == [True]

    def test_swallows_exception_without_reraise(self):
        def blow_up():
            raise RuntimeError("boom")
        _try("step", blow_up)  # must not propagate

    def test_logs_warning_on_failure(self):
        with patch(f"{MODULE}.logger") as mock_logger:
            _try("my step", lambda: 1 / 0)
            mock_logger.warning.assert_called_once()
            # warning() uses %s args: ("format string", label, exc) — label is index 1
            assert "my step" in mock_logger.warning.call_args[0][1]


# ---------------------------------------------------------------------------
# resolve_round — blocking pipeline
# ---------------------------------------------------------------------------

class TestResolveRound:
    def test_increments_round_number_on_normal_round(self, mocks):
        resolve_round(CAMPAIGN_ID)

        first_upsert = mocks["upsert_story_state"].call_args_list[0][0][0]
        assert first_upsert["round_number"] == 2  # was 1
        assert first_upsert["round_status"] == "resolving"

    def test_idempotency_reuses_round_number_when_resolving(self, mocks):
        mocks["get_story_state"].side_effect = [
            copy.deepcopy(RESOLVING_STATE),
            copy.deepcopy(RESOLVING_STATE),
        ]

        resolve_round(CAMPAIGN_ID)

        apply_arg = mocks["apply_state_update"].call_args[0][0]
        assert apply_arg["round_number"] == 3  # reused, not bumped to 4

    def test_idempotency_skips_locking_upsert(self, mocks):
        mocks["get_story_state"].side_effect = [
            copy.deepcopy(RESOLVING_STATE),
            copy.deepcopy(RESOLVING_STATE),
        ]

        resolve_round(CAMPAIGN_ID)

        upserted_statuses = [
            c[0][0].get("round_status")
            for c in mocks["upsert_story_state"].call_args_list
        ]
        assert "resolving" not in upserted_statuses

    def test_all_blocking_steps_are_called(self, mocks):
        resolve_round(CAMPAIGN_ID)

        mocks["generate_rag_queries"].assert_called_once()
        mocks["execute_rag_queries"].assert_called_once()
        mocks["generate_narrative"].assert_called_once()
        mocks["extract_state"].assert_called_once()
        mocks["apply_state_update"].assert_called_once()

    def test_pending_actions_cleared_in_finalization(self, mocks):
        resolve_round(CAMPAIGN_ID)

        waiting_calls = [
            c[0][0] for c in mocks["upsert_story_state"].call_args_list
            if c[0][0].get("round_status") == "waiting"
        ]
        assert waiting_calls, "expected a finalization upsert with round_status=waiting"
        assert waiting_calls[0]["pending_actions"] == {}

    def test_broadcast_receives_narrative_and_campaign_id(self, mocks):
        resolve_round(CAMPAIGN_ID)

        mocks["broadcast_narrative"].assert_called_once()
        arg = mocks["broadcast_narrative"].call_args[0][0]
        assert arg["narrative"] == NARRATIVE
        assert arg["campaign_id"] == CAMPAIGN_ID

    def test_scene_image_url_passed_to_broadcast(self, mocks):
        mocks["generate_scene_image"].return_value = "https://example.com/scene.png"

        resolve_round(CAMPAIGN_ID)

        arg = mocks["broadcast_narrative"].call_args[0][0]
        assert arg["scene_image_url"] == "https://example.com/scene.png"

    # --- Non-blocking step isolation ---

    def test_scene_image_failure_does_not_abort_broadcast(self, mocks):
        mocks["generate_scene_image"].side_effect = RuntimeError("image API down")

        resolve_round(CAMPAIGN_ID)

        mocks["broadcast_narrative"].assert_called_once()

    def test_broadcast_failure_does_not_abort_notifications(self, mocks):
        mocks["broadcast_narrative"].side_effect = RuntimeError("SignalR down")

        resolve_round(CAMPAIGN_ID)

        mocks["send_round_notifications"].assert_called_once()

    def test_notifications_failure_does_not_abort_inactivity(self, mocks):
        mocks["send_round_notifications"].side_effect = RuntimeError("email down")

        resolve_round(CAMPAIGN_ID)

        # inactivity tracking still runs — upsert_campaign_player is called per player
        mocks["upsert_campaign_player"].assert_called()

    # --- Inactivity tracking ---

    def test_submitted_player_gets_skip_counters_reset(self, mocks):
        # player@example.com is in pending_actions
        resolve_round(CAMPAIGN_ID)

        reset_emails = [c[0][0]["email"] for c in mocks["reset_skip_counters"].call_args_list]
        assert "player@example.com" in reset_emails

    def test_non_submitted_player_gets_skip_counters_incremented(self, mocks):
        # player2@example.com is NOT in pending_actions
        resolve_round(CAMPAIGN_ID)

        incremented_emails = [c[0][0]["email"] for c in mocks["increment_skip_counters"].call_args_list]
        assert "player2@example.com" in incremented_emails

    def test_all_inactive_players_pause_campaign(self, mocks):
        # Clear pending_actions so both players are treated as non-submitters
        no_actions_state = {**WAITING_STATE, "pending_actions": {}}
        mocks["get_story_state"].side_effect = [
            copy.deepcopy(no_actions_state),
            copy.deepcopy(no_actions_state),
        ]
        mocks["should_mark_inactive"].return_value = True
        paused_players = [
            {"email": "player@example.com", "status": "inactive"},
            {"email": "player2@example.com", "status": "inactive"},
        ]
        # _track_inactivity calls get_campaign_players a second time to check all_inactive
        mocks["get_campaign_players"].side_effect = [
            copy.deepcopy(PLAYERS),
            paused_players,
        ]

        resolve_round(CAMPAIGN_ID)

        updated = mocks["update_campaign"].call_args[0][0]
        assert updated["status"] == "paused"

    def test_campaign_complete_sets_status_completed(self, mocks):
        complete_update = {**copy.deepcopy(STATE_UPDATE), "campaign_complete": True}
        mocks["extract_state"].return_value = complete_update

        resolve_round(CAMPAIGN_ID)

        updated = mocks["update_campaign"].call_args[0][0]
        assert updated["status"] == "completed"


# ---------------------------------------------------------------------------
# resolve_round_from_queue
# ---------------------------------------------------------------------------

class TestResolveRoundFromQueue:
    def test_calls_resolve_round_with_campaign_id(self, mocks):
        with patch(f"{MODULE}.resolve_round") as mock_rr:
            resolve_round_from_queue(make_msg({"campaign_id": CAMPAIGN_ID}))
            mock_rr.assert_called_once_with(CAMPAIGN_ID)

    def test_missing_campaign_id_returns_early_without_calling_resolve(self, mocks):
        with patch(f"{MODULE}.resolve_round") as mock_rr:
            resolve_round_from_queue(make_msg({}))
            mock_rr.assert_not_called()

    def test_reraises_resolve_round_exception(self, mocks):
        with patch(f"{MODULE}.resolve_round", side_effect=RuntimeError("DB error")):
            with pytest.raises(RuntimeError, match="DB error"):
                resolve_round_from_queue(make_msg({"campaign_id": CAMPAIGN_ID}))


# ---------------------------------------------------------------------------
# campaign_intro_from_queue
# ---------------------------------------------------------------------------

class TestCampaignIntroFromQueue:
    def test_skips_if_round_number_positive(self, mocks):
        set_single_state(mocks, {**WAITING_STATE, "round_number": 2})

        campaign_intro_from_queue(make_msg({"campaign_id": CAMPAIGN_ID}))

        mocks["generate_campaign_intro"].assert_not_called()

    def test_skips_if_round_zero_already_in_narrative_log(self, mocks):
        set_single_state(mocks, {**WAITING_STATE, "round_number": 0})
        mocks["get_narrative_log"].return_value = {"rounds": [{"round": 0, "narrative": "..."}]}

        campaign_intro_from_queue(make_msg({"campaign_id": CAMPAIGN_ID}))

        mocks["generate_campaign_intro"].assert_not_called()

    def test_skips_if_no_characters_yet(self, mocks):
        set_single_state(mocks, {**WAITING_STATE, "round_number": 0})
        mocks["get_characters"].return_value = []

        campaign_intro_from_queue(make_msg({"campaign_id": CAMPAIGN_ID}))

        mocks["generate_campaign_intro"].assert_not_called()

    def test_normal_generates_intro_appends_log_and_broadcasts(self, mocks):
        set_single_state(mocks, {**WAITING_STATE, "round_number": 0})

        campaign_intro_from_queue(make_msg({"campaign_id": CAMPAIGN_ID}))

        mocks["generate_campaign_intro"].assert_called_once()
        mocks["append_narrative_round"].assert_called_once()
        mocks["broadcast_narrative"].assert_called_once()
        broadcast_arg = mocks["broadcast_narrative"].call_args[0][0]
        assert broadcast_arg["round_number"] == 0

    def test_scene_image_failure_does_not_abort_broadcast(self, mocks):
        set_single_state(mocks, {**WAITING_STATE, "round_number": 0})
        mocks["generate_scene_image"].side_effect = RuntimeError("image API down")

        campaign_intro_from_queue(make_msg({"campaign_id": CAMPAIGN_ID}))

        mocks["broadcast_narrative"].assert_called_once()
        mocks["append_narrative_round"].assert_called_once()

    def test_reraises_on_unexpected_exception(self, mocks):
        set_single_state(mocks, {**WAITING_STATE, "round_number": 0})
        mocks["generate_campaign_intro"].side_effect = RuntimeError("LLM error")

        with pytest.raises(RuntimeError, match="LLM error"):
            campaign_intro_from_queue(make_msg({"campaign_id": CAMPAIGN_ID}))


# ---------------------------------------------------------------------------
# player_join_from_queue
# ---------------------------------------------------------------------------

class TestPlayerJoinFromQueue:
    def _msg(self):
        return make_msg({"campaign_id": CAMPAIGN_ID, "email": "player@example.com"})

    def test_calls_catchup_introduction_and_broadcast(self, mocks):
        set_single_state(mocks, WAITING_STATE)

        player_join_from_queue(self._msg())

        mocks["generate_catchup_summary"].assert_called_once()
        mocks["generate_player_introduction"].assert_called_once()
        mocks["broadcast_narrative"].assert_called_once()

    def test_broadcast_event_is_player_joined(self, mocks):
        set_single_state(mocks, WAITING_STATE)

        player_join_from_queue(self._msg())

        arg = mocks["broadcast_narrative"].call_args[0][0]
        assert arg["state_summary"]["event"] == "player_joined"

    def test_reraises_on_exception(self, mocks):
        set_single_state(mocks, WAITING_STATE)
        mocks["generate_catchup_summary"].side_effect = RuntimeError("LLM error")

        with pytest.raises(RuntimeError, match="LLM error"):
            player_join_from_queue(self._msg())


# ---------------------------------------------------------------------------
# novel_export_from_queue
# ---------------------------------------------------------------------------

class TestNovelExportFromQueue:
    def test_generates_novel_and_sends_notification(self, mocks):
        set_single_state(mocks, WAITING_STATE)

        novel_export_from_queue(make_msg({"campaign_id": CAMPAIGN_ID}))

        mocks["generate_novel"].assert_called_once()
        mocks["send_novel_export_notification"].assert_called_once()

    def test_notification_includes_download_url(self, mocks):
        set_single_state(mocks, WAITING_STATE)
        mocks["generate_novel"].return_value = "https://example.com/novel.pdf"

        novel_export_from_queue(make_msg({"campaign_id": CAMPAIGN_ID}))

        notify_arg = mocks["send_novel_export_notification"].call_args[0][0]
        assert notify_arg["download_url"] == "https://example.com/novel.pdf"

    def test_reraises_on_exception(self, mocks):
        set_single_state(mocks, WAITING_STATE)
        mocks["generate_novel"].side_effect = RuntimeError("LLM failed")

        with pytest.raises(RuntimeError, match="LLM failed"):
            novel_export_from_queue(make_msg({"campaign_id": CAMPAIGN_ID}))

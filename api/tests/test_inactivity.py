"""
Unit tests for helpers/inactivity.py.
Pure functions — no mocking required.
Run with: cd api && .venv/bin/pytest tests/ -v
"""

import pytest
from helpers.inactivity import should_mark_inactive, increment_skip_counters, reset_skip_counters


THRESHOLDS = {"combat_encounters": 2, "scenes": 4}


# ---------------------------------------------------------------------------
# should_mark_inactive
# ---------------------------------------------------------------------------

class TestShouldMarkInactive:
    def test_returns_false_when_under_all_thresholds(self):
        cp = {"consecutive_combat_skips": 1, "consecutive_scene_skips": 2}
        assert should_mark_inactive(cp, THRESHOLDS, "combat") is False

    def test_returns_true_when_manually_set_inactive(self):
        cp = {"manually_set_inactive": True, "consecutive_combat_skips": 0, "consecutive_scene_skips": 0}
        assert should_mark_inactive(cp, THRESHOLDS, "exploration") is True

    def test_combat_skips_at_threshold_marks_inactive(self):
        cp = {"consecutive_combat_skips": 2, "consecutive_scene_skips": 0}
        assert should_mark_inactive(cp, THRESHOLDS, "combat") is True

    def test_combat_skips_below_threshold_does_not_mark_inactive(self):
        cp = {"consecutive_combat_skips": 1, "consecutive_scene_skips": 0}
        assert should_mark_inactive(cp, THRESHOLDS, "combat") is False

    def test_combat_threshold_not_applied_outside_combat(self):
        # 2 combat skips at combat threshold, but scene_type is exploration — should not trigger
        cp = {"consecutive_combat_skips": 2, "consecutive_scene_skips": 0}
        assert should_mark_inactive(cp, THRESHOLDS, "exploration") is False

    def test_scene_skips_at_threshold_marks_inactive(self):
        cp = {"consecutive_combat_skips": 0, "consecutive_scene_skips": 4}
        assert should_mark_inactive(cp, THRESHOLDS, "exploration") is True

    def test_scene_skips_at_threshold_marks_inactive_in_combat_too(self):
        cp = {"consecutive_combat_skips": 0, "consecutive_scene_skips": 4}
        assert should_mark_inactive(cp, THRESHOLDS, "combat") is True

    def test_scene_skips_below_threshold(self):
        cp = {"consecutive_combat_skips": 0, "consecutive_scene_skips": 3}
        assert should_mark_inactive(cp, THRESHOLDS, "exploration") is False

    def test_missing_skip_counts_default_to_zero(self):
        cp = {}
        assert should_mark_inactive(cp, THRESHOLDS, "combat") is False

    def test_custom_thresholds_respected(self):
        cp = {"consecutive_combat_skips": 1, "consecutive_scene_skips": 0}
        tight = {"combat_encounters": 1, "scenes": 10}
        assert should_mark_inactive(cp, tight, "combat") is True

    def test_default_thresholds_when_not_provided(self):
        cp = {"consecutive_combat_skips": 5, "consecutive_scene_skips": 10}
        assert should_mark_inactive(cp, {}, "combat") is True


# ---------------------------------------------------------------------------
# increment_skip_counters
# ---------------------------------------------------------------------------

class TestIncrementSkipCounters:
    def test_increments_scene_skips(self):
        cp = {"consecutive_scene_skips": 1, "consecutive_combat_skips": 0}
        result = increment_skip_counters(cp, "exploration")
        assert result["consecutive_scene_skips"] == 2

    def test_increments_both_in_combat(self):
        cp = {"consecutive_scene_skips": 1, "consecutive_combat_skips": 0}
        result = increment_skip_counters(cp, "combat")
        assert result["consecutive_scene_skips"] == 2
        assert result["consecutive_combat_skips"] == 1

    def test_does_not_increment_combat_skips_outside_combat(self):
        cp = {"consecutive_scene_skips": 0, "consecutive_combat_skips": 1}
        result = increment_skip_counters(cp, "social")
        assert result["consecutive_combat_skips"] == 1  # unchanged

    def test_missing_counters_default_to_zero_then_increment(self):
        result = increment_skip_counters({}, "combat")
        assert result["consecutive_scene_skips"] == 1
        assert result["consecutive_combat_skips"] == 1

    def test_does_not_mutate_original(self):
        cp = {"consecutive_scene_skips": 2, "consecutive_combat_skips": 1}
        increment_skip_counters(cp, "combat")
        assert cp["consecutive_scene_skips"] == 2
        assert cp["consecutive_combat_skips"] == 1

    def test_preserves_other_fields(self):
        cp = {"email": "player@example.com", "status": "active", "consecutive_scene_skips": 0}
        result = increment_skip_counters(cp, "exploration")
        assert result["email"] == "player@example.com"
        assert result["status"] == "active"


# ---------------------------------------------------------------------------
# reset_skip_counters
# ---------------------------------------------------------------------------

class TestResetSkipCounters:
    def test_resets_scene_skips_to_zero(self):
        cp = {"consecutive_scene_skips": 3, "consecutive_combat_skips": 2}
        result = reset_skip_counters(cp)
        assert result["consecutive_scene_skips"] == 0

    def test_resets_combat_skips_to_zero(self):
        cp = {"consecutive_scene_skips": 3, "consecutive_combat_skips": 2}
        result = reset_skip_counters(cp)
        assert result["consecutive_combat_skips"] == 0

    def test_does_not_mutate_original(self):
        cp = {"consecutive_scene_skips": 5, "consecutive_combat_skips": 3}
        reset_skip_counters(cp)
        assert cp["consecutive_scene_skips"] == 5
        assert cp["consecutive_combat_skips"] == 3

    def test_preserves_other_fields(self):
        cp = {"email": "player@example.com", "status": "active",
              "consecutive_scene_skips": 2, "consecutive_combat_skips": 1}
        result = reset_skip_counters(cp)
        assert result["email"] == "player@example.com"
        assert result["status"] == "active"

    def test_missing_counters_become_zero(self):
        result = reset_skip_counters({})
        assert result["consecutive_scene_skips"] == 0
        assert result["consecutive_combat_skips"] == 0

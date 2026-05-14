"""
Unit tests for helpers/schedule.py.
No external dependencies — all inputs are passed as plain values.
Run with: cd api && .venv/bin/pytest tests/ -v
"""

import pytest
from datetime import datetime, timedelta, timezone, time as dtime
from zoneinfo import ZoneInfo

from helpers.schedule import (
    _parse_time,
    _is_active_day,
    _is_blackout,
    _in_quiet_hours,
    calculate_deadline,
)

UTC = timezone.utc

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def utc(year, month, day, hour=0, minute=0):
    return datetime(year, month, day, hour, minute, tzinfo=UTC)


def simple_schedule(**overrides):
    """Minimal schedule with timeout enabled, no restrictions."""
    base = {
        "timeout_enabled": True,
        "timeout_duration_hours": 24,
        "timezone": "UTC",
        "quiet_hours_enabled": False,
        "quiet_hours": {"start": "21:00", "end": "09:00"},
        "active_days": {},
        "blackout_dates": [],
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# _parse_time
# ---------------------------------------------------------------------------

class TestParseTime:
    def test_midnight(self):
        assert _parse_time("00:00") == dtime(0, 0)

    def test_morning(self):
        assert _parse_time("09:00") == dtime(9, 0)

    def test_evening(self):
        assert _parse_time("21:30") == dtime(21, 30)

    def test_noon(self):
        assert _parse_time("12:00") == dtime(12, 0)


# ---------------------------------------------------------------------------
# _is_active_day
# ---------------------------------------------------------------------------

class TestIsActiveDay:
    def test_monday_active_by_default(self):
        # Monday = weekday 0; empty dict → defaults to True
        monday = datetime(2024, 1, 15)  # known Monday
        assert _is_active_day(monday, {}) is True

    def test_monday_explicitly_inactive(self):
        monday = datetime(2024, 1, 15)
        assert _is_active_day(monday, {"monday": False}) is False

    def test_saturday_active_by_default(self):
        saturday = datetime(2024, 1, 20)  # known Saturday
        assert _is_active_day(saturday, {}) is True

    def test_saturday_explicitly_inactive(self):
        saturday = datetime(2024, 1, 20)
        assert _is_active_day(saturday, {"saturday": False}) is False

    def test_sunday_explicitly_inactive(self):
        sunday = datetime(2024, 1, 21)  # known Sunday
        assert _is_active_day(sunday, {"sunday": False}) is False

    def test_only_target_day_disabled(self):
        monday = datetime(2024, 1, 15)
        tuesday = datetime(2024, 1, 16)
        days = {"monday": False}
        assert _is_active_day(monday, days) is False
        assert _is_active_day(tuesday, days) is True


# ---------------------------------------------------------------------------
# _is_blackout
# ---------------------------------------------------------------------------

class TestIsBlackout:
    def test_date_in_list(self):
        dt = datetime(2024, 12, 25)
        assert _is_blackout(dt, ["2024-12-25"]) is True

    def test_date_not_in_list(self):
        dt = datetime(2024, 12, 26)
        assert _is_blackout(dt, ["2024-12-25"]) is False

    def test_empty_list(self):
        dt = datetime(2024, 1, 15)
        assert _is_blackout(dt, []) is False

    def test_multiple_dates_match(self):
        dt = datetime(2024, 7, 4)
        assert _is_blackout(dt, ["2024-12-25", "2024-07-04", "2024-01-01"]) is True


# ---------------------------------------------------------------------------
# _in_quiet_hours
# ---------------------------------------------------------------------------

class TestInQuietHours:
    # Normal range: quiet from 21:00 to 09:00 (overnight)
    QS = dtime(21, 0)
    QE = dtime(9, 0)

    def _dt(self, hour, minute=0):
        return datetime(2024, 1, 15, hour, minute, tzinfo=UTC)

    # --- Overnight quiet window (21:00 → 09:00) ---

    def test_during_quiet_evening(self):
        assert _in_quiet_hours(self._dt(22), self.QS, self.QE) is True

    def test_during_quiet_midnight(self):
        assert _in_quiet_hours(self._dt(0), self.QS, self.QE) is True

    def test_during_quiet_early_morning(self):
        assert _in_quiet_hours(self._dt(8, 59), self.QS, self.QE) is True

    def test_at_quiet_start_is_in_quiet(self):
        assert _in_quiet_hours(self._dt(21, 0), self.QS, self.QE) is True

    def test_at_quiet_end_is_not_in_quiet(self):
        assert _in_quiet_hours(self._dt(9, 0), self.QS, self.QE) is False

    def test_midday_not_in_quiet(self):
        assert _in_quiet_hours(self._dt(12), self.QS, self.QE) is False

    def test_afternoon_not_in_quiet(self):
        assert _in_quiet_hours(self._dt(18), self.QS, self.QE) is False

    # --- Non-overnight range: quiet from 09:00 to 17:00 ---

    def test_daytime_quiet_window_inside(self):
        qs, qe = dtime(9, 0), dtime(17, 0)
        assert _in_quiet_hours(self._dt(12), qs, qe) is True

    def test_daytime_quiet_window_outside(self):
        qs, qe = dtime(9, 0), dtime(17, 0)
        assert _in_quiet_hours(self._dt(18), qs, qe) is False

    def test_daytime_quiet_at_start(self):
        qs, qe = dtime(9, 0), dtime(17, 0)
        assert _in_quiet_hours(self._dt(9, 0), qs, qe) is True

    def test_daytime_quiet_at_end(self):
        qs, qe = dtime(9, 0), dtime(17, 0)
        assert _in_quiet_hours(self._dt(17, 0), qs, qe) is False


# ---------------------------------------------------------------------------
# calculate_deadline
# ---------------------------------------------------------------------------

class TestCalculateDeadline:
    # --- timeout_enabled=False ---

    def test_returns_none_when_timeout_disabled(self):
        schedule = simple_schedule(timeout_enabled=False)
        result = calculate_deadline(utc(2024, 1, 15, 12), schedule)
        assert result is None

    # --- No restrictions ---

    def test_simple_24h_no_restrictions(self):
        schedule = simple_schedule(timeout_duration_hours=24)
        start = utc(2024, 1, 15, 12)  # Mon Jan 15 12:00 UTC

        result = calculate_deadline(start, schedule)

        assert result == utc(2024, 1, 16, 12)

    def test_simple_1h_no_restrictions(self):
        schedule = simple_schedule(timeout_duration_hours=1)
        start = utc(2024, 1, 15, 10)

        result = calculate_deadline(start, schedule)

        assert result == utc(2024, 1, 15, 11)

    def test_result_is_utc(self):
        schedule = simple_schedule()
        result = calculate_deadline(utc(2024, 1, 15, 12), schedule)

        assert result.tzinfo == UTC

    # --- Quiet hours ---

    def test_start_during_quiet_hours_advances_first(self):
        # Start at 23:00, quiet 21:00-09:00, 1h timeout
        # Should advance to 09:00 then count 1h → 10:00 next day
        schedule = simple_schedule(
            quiet_hours_enabled=True,
            quiet_hours={"start": "21:00", "end": "09:00"},
            timeout_duration_hours=1,
        )
        start = utc(2024, 1, 15, 23)  # Mon 23:00 — inside quiet

        result = calculate_deadline(start, schedule)

        assert result == utc(2024, 1, 16, 10)  # Tue 09:00 + 1h

    def test_24h_timeout_skips_quiet_hours(self):
        # Start Mon 12:00 UTC, quiet 21:00-09:00
        # Active window Mon: 12:00→21:00 = 9h
        # Active window Tue: 09:00→21:00 = 12h  (total 21h, need 3h more)
        # Active window Wed: 09:00→09:00+3h = 12:00
        # Deadline: Wed Jan 17 12:00 UTC
        schedule = simple_schedule(
            quiet_hours_enabled=True,
            quiet_hours={"start": "21:00", "end": "09:00"},
            timeout_duration_hours=24,
        )
        start = utc(2024, 1, 15, 12)  # Mon Jan 15

        result = calculate_deadline(start, schedule)

        assert result == utc(2024, 1, 17, 12)  # Wed Jan 17

    def test_timeout_finishes_within_same_day_window(self):
        # Start Mon 09:00, quiet 21:00-09:00, 6h timeout
        # Window: 09:00→21:00 = 12h; 6h fits inside → Mon 15:00
        schedule = simple_schedule(
            quiet_hours_enabled=True,
            quiet_hours={"start": "21:00", "end": "09:00"},
            timeout_duration_hours=6,
        )
        start = utc(2024, 1, 15, 9)

        result = calculate_deadline(start, schedule)

        assert result == utc(2024, 1, 15, 15)

    # --- Inactive days ---

    def test_start_on_inactive_day_advances_to_next_active(self):
        # Start Saturday, weekends off, 1h timeout → skip to Mon 00:00 + 1h
        schedule = simple_schedule(
            active_days={"saturday": False, "sunday": False},
            timeout_duration_hours=1,
        )
        start = utc(2024, 1, 20, 12)  # Sat Jan 20

        result = calculate_deadline(start, schedule)

        assert result == utc(2024, 1, 22, 1)  # Mon Jan 22 00:00 + 1h

    def test_start_on_sunday_advances_to_monday(self):
        schedule = simple_schedule(
            active_days={"saturday": False, "sunday": False},
            timeout_duration_hours=1,
        )
        start = utc(2024, 1, 21, 15)  # Sun Jan 21

        result = calculate_deadline(start, schedule)

        assert result == utc(2024, 1, 22, 1)  # Mon Jan 22 00:00 + 1h

    # --- Blackout dates ---

    def test_start_on_blackout_date_advances(self):
        # Start Mon Jan 15 (blacked out), 1h timeout → skip to Tue Jan 16 00:00 + 1h
        schedule = simple_schedule(
            blackout_dates=["2024-01-15"],
            timeout_duration_hours=1,
        )
        start = utc(2024, 1, 15, 12)

        result = calculate_deadline(start, schedule)

        assert result == utc(2024, 1, 16, 1)  # Tue 00:00 + 1h

    def test_multiple_consecutive_blackout_dates(self):
        # Start Mon Jan 15, Tue Jan 16 also blacked out, 1h → skip to Wed Jan 17 00:00 + 1h
        schedule = simple_schedule(
            blackout_dates=["2024-01-15", "2024-01-16"],
            timeout_duration_hours=1,
        )
        start = utc(2024, 1, 15, 12)

        result = calculate_deadline(start, schedule)

        assert result == utc(2024, 1, 17, 1)  # Wed 00:00 + 1h

    # --- Custom timeout durations ---

    def test_custom_timeout_duration(self):
        schedule = simple_schedule(timeout_duration_hours=48)
        start = utc(2024, 1, 15, 6)

        result = calculate_deadline(start, schedule)

        assert result == utc(2024, 1, 17, 6)

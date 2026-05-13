"""
Schedule-aware deadline calculation.
Computes absolute UTC deadline for a round timeout, skipping quiet hours and inactive days.
"""

from datetime import datetime, timedelta, timezone, time as dtime
from zoneinfo import ZoneInfo


def _parse_time(t: str) -> dtime:
    h, m = map(int, t.split(":"))
    return dtime(h, m)


def _is_active_day(dt: datetime, active_days: dict) -> bool:
    day_names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    return active_days.get(day_names[dt.weekday()], True)


def _is_blackout(dt: datetime, blackout_dates: list[str]) -> bool:
    return dt.strftime("%Y-%m-%d") in blackout_dates


def _in_quiet_hours(dt: datetime, quiet_start: dtime, quiet_end: dtime) -> bool:
    t = dt.time().replace(second=0, microsecond=0)
    if quiet_start <= quiet_end:
        return quiet_start <= t < quiet_end
    # Overnight (e.g. 21:00 to 09:00)
    return t >= quiet_start or t < quiet_end


def _next_active_moment(dt: datetime, schedule: dict, tz: ZoneInfo) -> datetime:
    """Advance dt until it falls in a window where the timer should run."""
    quiet_enabled = schedule.get("quiet_hours_enabled", False)
    active_days = schedule.get("active_days", {})
    blackout_dates = schedule.get("blackout_dates", [])
    quiet_hours = schedule.get("quiet_hours", {})
    quiet_start = _parse_time(quiet_hours.get("start", "21:00")) if quiet_enabled else None
    quiet_end = _parse_time(quiet_hours.get("end", "09:00")) if quiet_enabled else None

    for _ in range(14 * 24 * 60):
        if _is_blackout(dt, blackout_dates):
            dt = (dt + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            continue
        if not _is_active_day(dt, active_days):
            dt = (dt + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            continue
        if quiet_enabled and _in_quiet_hours(dt, quiet_start, quiet_end):
            today_end = datetime.combine(dt.date(), quiet_end, tzinfo=tz)
            if today_end <= dt:
                today_end += timedelta(days=1)
            dt = today_end
            continue
        break

    return dt


def calculate_deadline(start_utc: datetime, schedule: dict) -> datetime | None:
    """
    Return UTC datetime when the round timer expires, pausing during quiet hours,
    inactive days, and blackout dates. Returns None if timeout_enabled is False.
    """
    if not schedule.get("timeout_enabled", True):
        return None

    timeout_hours = schedule.get("timeout_duration_hours", 24)
    tz = ZoneInfo(schedule.get("timezone", "America/Chicago"))

    remaining = timedelta(hours=timeout_hours)
    current = _next_active_moment(start_utc.astimezone(tz), schedule, tz)

    while remaining > timedelta(0):
        quiet_enabled = schedule.get("quiet_hours_enabled", False)
        quiet_hours = schedule.get("quiet_hours", {})
        quiet_start = _parse_time(quiet_hours.get("start", "21:00")) if quiet_enabled else None

        if quiet_enabled and quiet_start:
            today_qs = datetime.combine(current.date(), quiet_start, tzinfo=tz)
            if today_qs <= current:
                today_qs += timedelta(days=1)
            window = today_qs - current
        else:
            window = timedelta(hours=24)

        if remaining <= window:
            current += remaining
            remaining = timedelta(0)
        else:
            remaining -= window
            current = _next_active_moment(current + window, schedule, tz)

    return current.astimezone(timezone.utc)

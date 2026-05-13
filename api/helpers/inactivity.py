"""
Inactivity threshold evaluation for campaign players.
"""


def should_mark_inactive(campaign_player: dict, thresholds: dict, scene_type: str) -> bool:
    """
    Returns True if a player should be auto-marked inactive based on consecutive skips.
    scene_type: "combat" | "exploration" | "social" | "rest"
    """
    if campaign_player.get("manually_set_inactive"):
        return True

    combat_threshold = thresholds.get("combat_encounters", 2)
    scene_threshold = thresholds.get("scenes", 4)

    combat_skips = campaign_player.get("consecutive_combat_skips", 0)
    scene_skips = campaign_player.get("consecutive_scene_skips", 0)

    if scene_type == "combat" and combat_skips >= combat_threshold:
        return True
    if scene_skips >= scene_threshold:
        return True

    return False


def increment_skip_counters(campaign_player: dict, scene_type: str) -> dict:
    """Return updated campaign_player doc with incremented skip counters."""
    updated = dict(campaign_player)
    updated["consecutive_scene_skips"] = campaign_player.get("consecutive_scene_skips", 0) + 1
    if scene_type == "combat":
        updated["consecutive_combat_skips"] = campaign_player.get("consecutive_combat_skips", 0) + 1
    return updated


def reset_skip_counters(campaign_player: dict) -> dict:
    """Return updated campaign_player doc with reset skip counters (player submitted an action)."""
    updated = dict(campaign_player)
    updated["consecutive_scene_skips"] = 0
    updated["consecutive_combat_skips"] = 0
    return updated

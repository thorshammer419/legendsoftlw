"""
Campaign membership queries and access-control assertions.

All functions that answer "who belongs to this campaign?" or "is this person
allowed to do that?" live here. Handlers call these instead of duplicating
membership logic inline.
"""

import os

from functions.activities.cosmos import get_campaign_player, get_campaign_players
from functions.domain import DomainError


def is_system_admin(email: str) -> bool:
    admins = os.environ.get("SYSTEM_ADMIN_EMAILS", "")
    return email in [e.strip() for e in admins.split(",") if e.strip()]


def is_admin(campaign: dict, email: str) -> bool:
    """True if email is a system admin or a campaign creator."""
    return is_system_admin(email) or email in campaign.get("creator_emails", [])


def is_member(campaign_id: str, email: str) -> bool:
    """True if the player has a campaign_player record for this campaign."""
    return get_campaign_player({"campaign_id": campaign_id, "email": email}) is not None


def get_member_emails(campaign_id: str) -> list[str]:
    """Return email addresses of all campaign members (for SignalR broadcast)."""
    return [p["email"] for p in get_campaign_players(campaign_id)]


def assert_can_join(campaign: dict, email: str) -> None:
    """
    Raise DomainError if the campaign cannot accept new members.
    Checks campaign status and player capacity.
    Password/token validation is left to the caller (requires the request body).
    """
    if campaign.get("status") not in ("lobby", "active"):
        raise DomainError("Campaign is not open for new players", 400)
    players = get_campaign_players(campaign["campaign_id"])
    active_count = sum(1 for p in players if p.get("status") == "active")
    if active_count >= campaign.get("max_players", 8):
        raise DomainError("This campaign is full", 409)


def assert_is_admin(campaign: dict, email: str) -> None:
    """Raise DomainError(403) if email is not a system admin or campaign creator."""
    if not is_admin(campaign, email):
        raise DomainError("Admin access required", 403)


def assert_is_system_admin(email: str) -> None:
    """Raise DomainError(403) if email is not a system admin."""
    if not is_system_admin(email):
        raise DomainError("System admin access required", 403)

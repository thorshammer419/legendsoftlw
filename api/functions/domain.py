"""
Domain layer — business logic for campaign operations.

Each function takes plain dicts/primitives and returns a plain dict result.
No HTTP concerns. No Azure Functions imports. Independently testable.
"""

import copy
import secrets
import uuid
from datetime import datetime, timezone

import bcrypt

from functions.activities.cosmos import (
    get_campaign, update_campaign,
    get_campaign_player, get_campaign_players, get_story_state, upsert_story_state,
    upsert_character, upsert_campaign_player, upsert_player, get_player, get_character,
    create_campaign, delete_campaign_player, delete_character,
    get_lobby_chat_doc, upsert_lobby_chat_doc,
    get_lobby_presence_doc, upsert_lobby_presence_doc,
    upsert_reroll_flag, get_reroll_flag, delete_reroll_flag,
    get_reroll_flags_for_campaign, delete_reroll_flags_for_campaign,
    upsert_character_draft, get_character_draft, delete_character_draft,
    delete_character_drafts_for_campaign,
)


class DomainError(Exception):
    """Raised for expected business-rule violations. http_status guides the handler."""
    def __init__(self, message: str, http_status: int = 400):
        super().__init__(message)
        self.http_status = http_status


def submit_player_action(
    campaign_id: str,
    email: str,
    action_text: str,
    rolls: list,
) -> dict:
    """
    Store a player's action for the current round.

    Returns {"round_ready": bool} — True when all active players have now submitted.
    The caller decides whether to enqueue round resolution.
    """
    cp = get_campaign_player({"campaign_id": campaign_id, "email": email})
    if not cp or cp.get("status") != "active":
        raise DomainError("You are not an active player in this campaign", 403)

    story_state = get_story_state(campaign_id)
    if story_state.get("round_status") == "resolving":
        raise DomainError("Round is currently being resolved, please wait", 409)

    pending = story_state.get("pending_actions", {})
    pending[email] = {
        "action_text": action_text,
        "rolls": rolls,
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }
    story_state["pending_actions"] = pending
    upsert_story_state(story_state)

    campaign_players = get_campaign_players(campaign_id)
    active_emails = {p["email"] for p in campaign_players if p.get("status") == "active"}
    round_ready = bool(active_emails and active_emails.issubset(set(pending.keys())))
    return {"round_ready": round_ready}


def create_new_campaign(creator_email: str, body: dict) -> dict:
    """
    Create a campaign, its initial story state, and the creator's campaign_player record.
    Returns the campaign document.
    """
    campaign_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()
    invite_token = secrets.token_urlsafe(32)

    raw_password = body.get("password", "").strip()
    password_hash = bcrypt.hashpw(raw_password.encode(), bcrypt.gensalt()).decode() if raw_password else None

    schedule = body.get("schedule", {
        "timeout_enabled": True,
        "round_timeout_minutes": 1440,
        "quiet_hours_start": "22:00",
        "quiet_hours_end": "08:00",
        "timezone": "America/Chicago",
        "active_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        "blackout_dates": [],
    })

    campaign_doc = {
        "id": f"campaign_{campaign_id}",
        "type": "campaign",
        "campaign_id": campaign_id,
        "name": body.get("name", "New Campaign"),
        "description": body.get("description", ""),
        "party_name": body.get("party_name", "The Adventurers"),
        "status": "lobby",
        "created_by": creator_email,
        "created_at": now,
        "creator_emails": [creator_email],
        "invite_token": invite_token,
        "password_hash": password_hash,
        "max_players": body.get("max_players", 8),
        "max_starting_level": body.get("max_starting_level", 1),
        "ability_score_method": body.get("ability_score_method", "standard_array"),
        "ability_score_rules": body.get("ability_score_rules", {
            "standard_array": [15, 14, 13, 12, 10, 8],
            "point_buy_points": 27,
            "roll_dice": 4,
            "roll_keep": 3,
        }),
        "schedule": schedule,
        "inactivity_thresholds": {"combat_encounters": 2, "scenes": 4},
        "legend": {"previous_campaign_id": None, "summary": None, "key_events": []},
    }
    create_campaign(campaign_doc)

    upsert_story_state({
        "id": f"state_{campaign_id}",
        "type": "story_state",
        "campaign_id": campaign_id,
        "round_number": 0,
        "round_status": "waiting",
        "round_started_at": now,
        "round_deadline": None,
        "scene_type": "exploration",
        "current_scene": {
            "location": "Unknown",
            "description": "",
            "active_npcs": [],
            "threats": [],
            "exits": [],
        },
        "quest": {"main_objective": "", "completed_milestones": [], "failed_milestones": []},
        "narrative_summary": "",
        "pending_actions": {},
        "action_economy": {},
    })

    upsert_campaign_player({
        "id": f"campaign_player_{campaign_id}_{creator_email}",
        "type": "campaign_player",
        "campaign_id": campaign_id,
        "email": creator_email,
        "status": "active",
        "role": "creator",
        "consecutive_combat_skips": 0,
        "consecutive_scene_skips": 0,
        "manually_set_inactive": False,
        "inactivated_at": None,
        "joined_at": now,
        "character_creation_complete": False,
        "notifications": {"email": True, "push": False},
    })

    return campaign_doc


def save_character(campaign_id: str, email: str, body: dict) -> dict:
    """
    Save a character and mark the player as ready.

    Returns {"first_completion": bool, ...player info if first_completion}.
    Caller broadcasts the lobby event when first_completion is True.
    """
    char = {
        **body,
        "id": f"character_{campaign_id}_{email}",
        "type": "character",
        "campaign_id": campaign_id,
        "email": email,
    }
    upsert_character(char)

    cp = get_campaign_player({"campaign_id": campaign_id, "email": email})
    if not cp:
        return {"first_completion": False}

    was_complete = cp.get("character_creation_complete", False)
    cp["character_creation_complete"] = True
    cp["char_class"] = body.get("class", "")
    if body.get("rerolled"):
        cp["rerolled"] = True
        upsert_reroll_flag(campaign_id, email)
    upsert_campaign_player(cp)
    delete_character_draft(campaign_id, email)

    if not was_complete:
        player = get_player(email)
        display_name = player.get("display_name", email.split("@")[0]) if player else email.split("@")[0]
        return {
            "first_completion": True,
            "email": email,
            "display_name": display_name,
            "char_name": body.get("name", ""),
            "char_class": body.get("class", ""),
        }
    return {"first_completion": False}


def leave_campaign(campaign_id: str, email: str) -> dict:
    """
    Remove a player from a campaign before it starts.

    Deletes the campaign_player and character records.
    Returns {"email": email, "display_name": ...} for the caller to broadcast.
    Raises DomainError 403 if the caller is not a member or is the creator.
    """
    cp = get_campaign_player({"campaign_id": campaign_id, "email": email})
    if not cp:
        raise DomainError("You are not a member of this campaign", 403)
    if cp.get("role") == "creator":
        raise DomainError("Campaign creators cannot leave — cancel the campaign instead", 403)

    delete_campaign_player(campaign_id, email)
    delete_character(campaign_id, email)
    delete_character_draft(campaign_id, email)

    player = get_player(email)
    display_name = player.get("display_name", email.split("@")[0]) if player else email.split("@")[0]
    return {"email": email, "display_name": display_name}


def save_character_draft(campaign_id: str, email: str, body: dict) -> None:
    cp = get_campaign_player({"campaign_id": campaign_id, "email": email})
    if not cp or cp.get("status") != "active":
        raise DomainError("Not an active player in this campaign", 403)

    doc = {
        "id": f"character_draft_{campaign_id}_{email}",
        "type": "character_draft",
        "campaign_id": campaign_id,
        "email": email,
        **{k: body[k] for k in ("step", "identity", "scores", "available_chips", "roll_results") if k in body},
    }
    upsert_character_draft(doc)


def get_character_draft_for_player(campaign_id: str, email: str) -> dict | None:
    return get_character_draft(campaign_id, email)


def join_campaign_as_observer(campaign_id: str, email: str) -> dict:
    """
    Create a campaign_player record for a new observer joining via the campaign URL.
    Returns the new campaign_player document.
    """
    now = datetime.now(timezone.utc).isoformat()
    cp = {
        "id": f"campaign_player_{campaign_id}_{email}",
        "type": "campaign_player",
        "campaign_id": campaign_id,
        "email": email,
        "status": "active",
        "role": "player",
        "consecutive_combat_skips": 0,
        "consecutive_scene_skips": 0,
        "manually_set_inactive": False,
        "inactivated_at": None,
        "joined_at": now,
        "character_creation_complete": False,
        "notifications": {"email": True, "push": False},
    }
    if get_reroll_flag(campaign_id, email):
        cp["rerolled"] = True
    upsert_campaign_player(cp)
    return cp


def get_lobby_chat(campaign_id: str) -> list:
    """Return full chat message list for a campaign lobby. Returns [] if none yet."""
    try:
        doc = get_lobby_chat_doc(campaign_id)
        return doc.get("messages", [])
    except Exception:
        return []


def append_lobby_message(campaign_id: str, message: dict) -> None:
    """Persist a single message to the lobby chat document."""
    try:
        doc = get_lobby_chat_doc(campaign_id)
    except Exception:
        doc = {
            "id": f"lobby_chat_{campaign_id}",
            "type": "lobby_chat",
            "campaign_id": campaign_id,
            "messages": [],
        }
    doc.setdefault("messages", [])
    doc["messages"].append(message)
    upsert_lobby_chat_doc(doc)


_RAPID_REJOIN_SECONDS = 10


def lobby_presence_join(campaign_id: str, email: str) -> dict | None:
    """
    Mark a player as present in the lobby.
    Returns a system message dict for the join announcement, or None if the
    join should be suppressed (rapid rejoin within the suppression window, or
    player was already marked present).
    """
    char = get_character({"campaign_id": campaign_id, "email": email})
    char_name = char.get("name", "Adventurer") if char else "Adventurer"
    char_class = char.get("class", "") if char else ""
    level = char.get("level", 1) if char else 1

    player = get_player(email)
    display_name = player.get("display_name", email.split("@")[0]) if player else email.split("@")[0]

    suppress = False
    try:
        presence = get_lobby_presence_doc(campaign_id, email)
        if presence.get("status") == "present":
            # Already present — duplicate join (e.g. page refresh before leave queued)
            suppress = True
        elif presence.get("status") == "left":
            updated = presence.get("updated_at", "")
            if updated:
                left_at = datetime.fromisoformat(updated)
                elapsed = (datetime.now(timezone.utc) - left_at).total_seconds()
                if elapsed < _RAPID_REJOIN_SECONDS:
                    suppress = True
    except Exception:
        presence = {
            "id": f"presence_{campaign_id}_{email}",
            "type": "lobby_presence",
            "campaign_id": campaign_id,
            "email": email,
        }

    now = datetime.now(timezone.utc).isoformat()
    presence["status"] = "present"
    presence["display_name"] = display_name
    presence["updated_at"] = now
    upsert_lobby_presence_doc(presence)

    if suppress:
        return None

    parts = [p for p in [char_name, char_class, f"level {level}"] if p]
    text = f"⚔ {display_name} has entered the lobby — {', '.join(parts)}"

    return {
        "message_id": str(uuid.uuid4()),
        "type": "system",
        "text": text,
        "timestamp": now,
    }


def lobby_presence_leave(campaign_id: str, email: str) -> None:
    """
    Mark a player as having left the lobby.
    The caller should enqueue a delayed leave announcement.
    """
    try:
        presence = get_lobby_presence_doc(campaign_id, email)
    except Exception:
        presence = {
            "id": f"presence_{campaign_id}_{email}",
            "type": "lobby_presence",
            "campaign_id": campaign_id,
            "email": email,
        }

    presence["status"] = "left"
    presence["updated_at"] = datetime.now(timezone.utc).isoformat()
    upsert_lobby_presence_doc(presence)


def join_campaign(
    campaign_id: str,
    email: str,
    invite_token: str = "",
    password: str = "",
) -> dict:
    """
    Validate credentials and record the player as a campaign observer.
    Returns {"campaign_was_active": bool} — True when the campaign is already active,
    so the caller can enqueue a player-join catch-up event.
    Raises DomainError on invalid credentials.
    """
    campaign = get_campaign(campaign_id)
    if invite_token:
        if invite_token != campaign.get("invite_token"):
            raise DomainError("Invalid invite link", 403)
    elif campaign.get("password_hash"):
        if not password:
            raise DomainError("Password required", 403)
        if not bcrypt.checkpw(password.encode(), campaign["password_hash"].encode()):
            raise DomainError("Incorrect password", 403)
    join_campaign_as_observer(campaign_id, email)
    return {"campaign_was_active": campaign.get("status") == "active"}


def launch_campaign(campaign_id: str) -> dict:
    """
    Transition campaign status to active.
    Returns {"player_emails": list} for the caller to broadcast the launched event.
    The caller is also responsible for enqueuing the campaign-intro.
    """
    campaign = get_campaign(campaign_id)
    campaign["status"] = "active"
    update_campaign(campaign)
    player_emails = [p["email"] for p in get_campaign_players(campaign_id)]
    return {"player_emails": player_emails}


def cancel_campaign(campaign_id: str) -> dict:
    """
    Soft-delete a campaign and clean up all dependent documents.
    Member emails are collected before deletion and returned for the caller to broadcast.
    """
    player_emails = [p["email"] for p in get_campaign_players(campaign_id)]
    campaign = get_campaign(campaign_id)
    campaign["status"] = "deleted"
    update_campaign(campaign)
    delete_reroll_flags_for_campaign(campaign_id)
    delete_character_drafts_for_campaign(campaign_id)
    return {"player_emails": player_emails}


def apply_round_state(
    story_state: dict,
    state_update: dict,
    characters: list[dict],
    existing_npcs: list[dict],
    round_number: int,
) -> tuple[dict, list[dict], list[dict]]:
    """
    Apply a round's extracted state to in-memory documents.

    Returns (updated_story_state, updated_characters, updated_npcs).
    updated_characters contains only characters that were modified.
    updated_npcs contains both modified existing NPCs and newly created ones.
    No Cosmos calls — caller handles persistence.
    """
    story_state = copy.deepcopy(story_state)

    # --- Story state ---
    if state_update.get("scene_type"):
        story_state["scene_type"] = state_update["scene_type"]
    if state_update.get("current_scene"):
        story_state.setdefault("current_scene", {}).update(state_update["current_scene"])
    if state_update.get("quest"):
        q = state_update["quest"]
        existing_q = story_state.get("quest", {})
        completed = list(set(existing_q.get("completed_milestones", []) + q.get("completed_milestones", [])))
        failed = list(set(existing_q.get("failed_milestones", []) + q.get("failed_milestones", [])))
        story_state.setdefault("quest", {})["completed_milestones"] = completed
        story_state["quest"]["failed_milestones"] = failed

    summary_append = state_update.get("narrative_summary_append", "")
    if summary_append:
        existing_summary = story_state.get("narrative_summary", "")
        story_state["narrative_summary"] = (existing_summary + "\n\n" + summary_append).strip()

    story_state["round_number"] = round_number
    story_state["pending_actions"] = {}

    char_speed = {c["email"]: c.get("speed", 30) for c in characters}
    for email in (story_state.get("action_economy") or {}):
        story_state["action_economy"][email] = {
            "action_used": False,
            "bonus_action_used": False,
            "reaction_used": False,
            "movement_remaining": char_speed.get(email, 30),
        }

    # --- Characters ---
    char_by_email = {ch["email"]: copy.deepcopy(ch) for ch in characters}
    updated_characters = []
    for pu in (state_update.get("player_updates") or []):
        email = pu["email"]
        char = char_by_email.get(email)
        if not char:
            continue

        hp = char.get("hp", {})
        hp["current"] = max(0, hp.get("current", 0) + pu.get("hp_change", 0))
        char["hp"] = hp

        conditions = set(char.get("conditions", []))
        conditions.update(pu.get("conditions_added", []))
        conditions.difference_update(pu.get("conditions_removed", []))
        char["conditions"] = list(conditions)

        for level, count in (pu.get("spell_slots_used") or {}).items():
            slots = char.get("spell_slots") or {}
            slot = slots.get(level, {})
            slot["remaining"] = max(0, slot.get("remaining", 0) - count)
            slots[level] = slot
            char["spell_slots"] = slots

        for feature_name, uses in (pu.get("class_feature_uses") or {}).items():
            for feat in (char.get("class_features") or []):
                if feat.get("name") == feature_name:
                    u = feat.get("uses", {})
                    u["remaining"] = max(0, u.get("remaining", 0) - uses)
                    feat["uses"] = u

        updated_characters.append(char)

    # --- NPCs ---
    updated_npcs = []
    npc_by_id = {npc["id"]: copy.deepcopy(npc) for npc in existing_npcs}

    for nu in (state_update.get("npc_updates") or []):
        npc = npc_by_id.get(nu["npc_id"])
        if not npc:
            continue

        if nu.get("hp_change"):
            hp = npc.get("hp", {})
            hp["current"] = max(0, hp.get("current", 0) + nu["hp_change"])
            npc["hp"] = hp
        if nu.get("status_change"):
            npc["status"] = nu["status_change"]
        if nu.get("location_change"):
            npc["location"] = nu["location_change"]
        if nu.get("abilities_used"):
            npc["used_abilities"] = list(set(npc.get("used_abilities", []) + nu["abilities_used"]))
        if nu.get("legendary_resistances_used"):
            npc["legendary_resistances_remaining"] = max(
                0,
                npc.get("legendary_resistances_remaining", 0) - nu["legendary_resistances_used"],
            )
        for rc in (nu.get("relationship_changes") or []):
            rels = npc.get("relationships", {})
            rels[rc["email"]] = {
                "disposition": rc.get("new_disposition", "neutral"),
                "summary": rc.get("summary_update", ""),
                "last_interaction_round": round_number,
            }
            npc["relationships"] = rels
        if nu.get("interaction_log_entry"):
            log = npc.get("interaction_log", [])
            log.append(nu["interaction_log_entry"])
            npc["interaction_log"] = log
        npc["last_seen_round"] = round_number
        updated_npcs.append(npc)

    # --- New NPCs ---
    campaign_id = story_state["campaign_id"]
    for new_npc in (state_update.get("new_npcs") or []):
        new_npc = dict(new_npc)
        new_npc["campaign_id"] = campaign_id
        new_npc["first_appeared_round"] = round_number
        new_npc["last_seen_round"] = round_number
        updated_npcs.append(new_npc)

    return story_state, updated_characters, updated_npcs


def toggle_player_status(
    campaign_id: str,
    target_email: str,
    new_status: str,
) -> dict:
    """
    Set a campaign player's status to 'active' or 'inactive' and reset associated fields.
    Raises DomainError(404) if the player is not in the campaign.
    The caller is responsible for sending status-change notifications.
    """
    if new_status not in ("active", "inactive"):
        raise DomainError("status must be 'active' or 'inactive'")
    cp = get_campaign_player({"campaign_id": campaign_id, "email": target_email})
    if not cp:
        raise DomainError("Player not found in campaign", 404)
    cp["status"] = new_status
    cp["manually_set_inactive"] = new_status == "inactive"
    if new_status == "inactive":
        cp["inactivated_at"] = datetime.now(timezone.utc).isoformat()
    else:
        cp["consecutive_combat_skips"] = 0
        cp["consecutive_scene_skips"] = 0
        cp["inactivated_at"] = None
        cp["manually_set_inactive"] = False
    upsert_campaign_player(cp)
    return {"status": new_status}

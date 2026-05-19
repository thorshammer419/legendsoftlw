"""
HTTP request handler implementations.
All Durable Functions client references removed — round lifecycle uses queues.
"""

import json
import base64
import os
import secrets
import uuid
from datetime import datetime, timezone

import bcrypt
import azure.functions as func

from functions.activities.cosmos import (
    get_campaign, update_campaign, get_story_state, get_campaign_player, get_campaign_players,
    get_character, upsert_campaign_player, upsert_player, get_player,
    get_action_list, get_narrative_log,
    get_allowed_user, upsert_allowed_user, delete_allowed_user, list_allowed_users,
    list_all_campaigns, get_campaign_by_invite_token,
    get_lobby_presence_doc,
    delete_reroll_flags_for_campaign,
)
from functions.activities.action_validator import validate_freeform_action
from functions.activities.signalr import get_signalr_connection_info, broadcast_lobby_event
from functions.activities.email import (
    send_player_reactivated_notification,
    send_player_inactive_notification,
)
from functions.domain import (
    DomainError, submit_player_action, create_new_campaign, save_character,
    join_campaign_as_observer, leave_campaign, append_lobby_message, get_lobby_chat,
    lobby_presence_join, lobby_presence_leave,
)
from helpers.queue import enqueue
from helpers.llm import openai_client


def _json_response(data, status_code=200):
    return func.HttpResponse(
        json.dumps(data, default=str),
        status_code=status_code,
        mimetype="application/json",
    )


def _error(message: str, status_code=400):
    return _json_response({"error": message}, status_code)


def _get_user(req: func.HttpRequest) -> dict | None:
    header = req.headers.get("x-ms-client-principal")
    if not header:
        return None
    try:
        decoded = base64.b64decode(header).decode("utf-8")
        return json.loads(decoded)
    except Exception:
        return None


def _require_auth(req: func.HttpRequest):
    user = _get_user(req)
    if not user:
        return None, _error("Unauthorized", 401)
    email = user.get("userDetails")
    if not email:
        return None, _error("Unauthorized", 401)
    return email, None


def _require_auth_approved(req: func.HttpRequest):
    email, err = _require_auth(req)
    if err:
        return None, err
    player = get_player(email)
    if player and not player.get("approved", True):
        return None, _error("Account not approved", 403)
    return email, None


# ---------------------------------------------------------------------------
# SignalR negotiate
# ---------------------------------------------------------------------------

async def negotiate(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id") or req.params.get("campaign_id")
    if not campaign_id:
        return _error("campaign_id required")

    info = get_signalr_connection_info({"user_id": email, "campaign_id": campaign_id})
    return _json_response(info)


# ---------------------------------------------------------------------------
# Submit player action
# ---------------------------------------------------------------------------

async def submit_action(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    try:
        body = req.get_json()
    except ValueError:
        return _error("Invalid JSON")

    campaign_id = body.get("campaign_id")
    action_text = body.get("action_text")
    if not campaign_id or not action_text:
        return _error("campaign_id and action_text required")

    try:
        result = submit_player_action(campaign_id, email, action_text, body.get("rolls", []))
    except DomainError as e:
        return _error(str(e), e.http_status)

    if result["round_ready"]:
        enqueue("resolve-round", {"campaign_id": campaign_id, "reason": "all_submitted"})

    return _json_response({"status": "submitted"})


# ---------------------------------------------------------------------------
# Validate freeform action
# ---------------------------------------------------------------------------

async def validate_action(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    try:
        body = req.get_json()
    except ValueError:
        return _error("Invalid JSON")

    campaign_id = body.get("campaign_id")
    action_text = body.get("action_text")
    conversation_history = body.get("conversation_history", [])

    if not campaign_id or not action_text:
        return _error("campaign_id and action_text required")

    character = get_character({"campaign_id": campaign_id, "email": email})
    if not character:
        return _error("Character not found", 404)

    story_state = get_story_state(campaign_id)
    scene = story_state.get("current_scene", {})

    result = validate_freeform_action({
        "character": character,
        "scene": scene,
        "action_text": action_text,
        "conversation_history": conversation_history,
    })
    return _json_response(result)


# ---------------------------------------------------------------------------
# Campaign management
# ---------------------------------------------------------------------------

async def create_campaign_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    try:
        body = req.get_json()
    except ValueError:
        return _error("Invalid JSON")

    try:
        campaign_doc = create_new_campaign(email, body)
    except Exception as e:
        return _error(f"Failed to create campaign: {e}", 500)

    return _json_response(campaign_doc, 201)


async def get_campaign_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    try:
        campaign = get_campaign(campaign_id)
    except Exception:
        return _error("Campaign not found", 404)

    cp = get_campaign_player({"campaign_id": campaign_id, "email": email})
    if not cp and not _is_system_admin(email):
        return _error("Not a member of this campaign", 403)

    return _json_response(campaign)


async def list_campaigns_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaigns = list_all_campaigns()
    result = []
    for c in campaigns:
        cid = c["campaign_id"]
        players = get_campaign_players(cid)
        active_players = [p for p in players if p.get("status") == "active"]
        is_member = any(p["email"] == email for p in players)
        creator_email = c.get("created_by", "")
        result.append({
            "campaign_id": cid,
            "name": c.get("name", ""),
            "party_name": c.get("party_name", ""),
            "description": c.get("description", ""),
            "status": c.get("status", ""),
            "creator_display_name": creator_email.split("@")[0] if creator_email else "Unknown",
            "max_players": c.get("max_players", 8),
            "player_count": len(active_players),
            "is_password_protected": bool(c.get("password_hash")),
            "is_member": is_member,
        })
    return _json_response(result)


async def join_campaign_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    try:
        campaign = get_campaign(campaign_id)
    except Exception:
        return _error("Campaign not found", 404)

    if campaign.get("status") in ("deleted", "completed"):
        return _error("Campaign not found", 404)

    if campaign.get("status") not in ("lobby", "active"):
        return _error("Campaign is not open for new players", 400)

    cp = get_campaign_player({"campaign_id": campaign_id, "email": email})
    if cp:
        return _json_response({"status": "already_member", "campaign_id": campaign_id})

    players = get_campaign_players(campaign_id)
    active_count = sum(1 for p in players if p.get("status") == "active")
    if active_count >= campaign.get("max_players", 8):
        return _error("This campaign is full", 409)

    body = {}
    try:
        body = req.get_json() or {}
    except ValueError:
        pass

    provided_token = body.get("invite_token", "").strip()
    if provided_token:
        if provided_token != campaign.get("invite_token"):
            return _error("Invalid invite link", 403)
    elif campaign.get("password_hash"):
        provided = body.get("password", "").strip()
        if not provided:
            return _error("Password required", 403)
        if not bcrypt.checkpw(provided.encode(), campaign["password_hash"].encode()):
            return _error("Incorrect password", 403)

    join_campaign_as_observer(campaign_id, email)
    if campaign.get("status") == "active":
        enqueue("player-join", {"campaign_id": campaign_id, "email": email})

    return _json_response({"status": "joined", "campaign_id": campaign_id}, 201)


async def resolve_invite_token_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    token = req.route_params.get("token")
    campaign = get_campaign_by_invite_token(token)
    if not campaign or campaign.get("status") in ("deleted", "completed"):
        return _error("Invite link not found or expired", 404)

    cid = campaign["campaign_id"]
    players = get_campaign_players(cid)
    active_players = [p for p in players if p.get("status") == "active"]
    is_member = any(p["email"] == email for p in players)
    creator_email = campaign.get("created_by", "")

    return _json_response({
        "campaign_id": cid,
        "name": campaign.get("name", ""),
        "party_name": campaign.get("party_name", ""),
        "description": campaign.get("description", ""),
        "status": campaign.get("status", ""),
        "creator_display_name": creator_email.split("@")[0] if creator_email else "Unknown",
        "max_players": campaign.get("max_players", 8),
        "player_count": len(active_players),
        "is_password_protected": bool(campaign.get("password_hash")),
        "is_member": is_member,
    })


async def get_game_state_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    cp = get_campaign_player({"campaign_id": campaign_id, "email": email})
    if not cp:
        return _error("Not a member of this campaign", 403)

    story_state = get_story_state(campaign_id)
    character = get_character({"campaign_id": campaign_id, "email": email})
    action_list = get_action_list({"campaign_id": campaign_id, "email": email})
    campaign_players = get_campaign_players(campaign_id)
    narrative_log = get_narrative_log(campaign_id)

    pending = story_state.get("pending_actions", {})
    return _json_response({
        "story_state": story_state,
        "character": character,
        "action_list": action_list,
        "narrative_log": narrative_log.get("rounds", []),
        "party_status": [
            {
                "email": p["email"],
                "submitted": p["email"] in pending,
                "character_ready": p.get("character_creation_complete", False),
                "role": p.get("role", "player"),
            }
            for p in campaign_players if p.get("status") == "active"
        ],
    })


# ---------------------------------------------------------------------------
# Character management
# ---------------------------------------------------------------------------

async def get_character_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    char = get_character({"campaign_id": campaign_id, "email": email})
    if not char:
        return _error("Character not found", 404)
    return _json_response(char)


async def upsert_character_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    try:
        body = req.get_json()
    except ValueError:
        return _error("Invalid JSON")

    result = save_character(campaign_id, email, body)

    if result["first_completion"]:
        all_players = get_campaign_players(campaign_id)
        try:
            broadcast_lobby_event({
                "campaign_id": campaign_id,
                "type": "player_ready",
                "email": result["email"],
                "display_name": result["display_name"],
                "char_name": result["char_name"],
                "char_class": result["char_class"],
                "player_emails": [p["email"] for p in all_players],
            })
        except Exception:
            pass

    return _json_response({"status": "saved"})


# ---------------------------------------------------------------------------
# Admin actions
# ---------------------------------------------------------------------------

async def admin_toggle_player(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    campaign = get_campaign(campaign_id)

    if not _is_system_admin(email) and email not in campaign.get("creator_emails", []):
        return _error("Admin access required", 403)

    try:
        body = req.get_json()
    except ValueError:
        return _error("Invalid JSON")

    target_email = body.get("email")
    new_status = body.get("status")

    if not target_email or new_status not in ("active", "inactive"):
        return _error("email and status (active|inactive) required")

    cp = get_campaign_player({"campaign_id": campaign_id, "email": target_email})
    if not cp:
        return _error("Player not found in campaign", 404)

    cp["status"] = new_status
    cp["manually_set_inactive"] = new_status == "inactive"
    if new_status == "inactive":
        cp["inactivated_at"] = datetime.now(timezone.utc).isoformat()
        try:
            send_player_inactive_notification({
                "email": target_email,
                "campaign_name": campaign.get("name", ""),
                "campaign_id": campaign_id,
            })
        except Exception:
            pass
    else:
        cp["consecutive_combat_skips"] = 0
        cp["consecutive_scene_skips"] = 0
        cp["inactivated_at"] = None
        cp["manually_set_inactive"] = False
        try:
            send_player_reactivated_notification({
                "email": target_email,
                "campaign_name": campaign.get("name", ""),
                "campaign_id": campaign_id,
            })
        except Exception:
            pass

    upsert_campaign_player(cp)
    return _json_response({"status": new_status})


async def admin_start_round(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    campaign = get_campaign(campaign_id)

    if not _is_system_admin(email) and email not in campaign.get("creator_emails", []):
        return _error("Admin access required", 403)

    story_state = get_story_state(campaign_id)
    if story_state.get("round_status") == "resolving":
        return _error("Round is already being resolved", 409)

    enqueue("resolve-round", {"campaign_id": campaign_id, "reason": "admin_forced"})
    return _json_response({"status": "resolution_queued"})


async def admin_export_novel(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    campaign = get_campaign(campaign_id)

    if not _is_system_admin(email) and email not in campaign.get("creator_emails", []):
        return _error("Admin access required", 403)

    enqueue("novel-export", {"campaign_id": campaign_id})
    return _json_response({"status": "export_queued"})


async def admin_update_settings_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    try:
        campaign = get_campaign(campaign_id)
    except Exception:
        return _error("Campaign not found", 404)

    if not _is_system_admin(email) and email not in campaign.get("creator_emails", []):
        return _error("Admin access required", 403)

    try:
        body = req.get_json() or {}
    except ValueError:
        return _error("Invalid JSON")

    if "password" in body:
        raw = (body["password"] or "").strip()
        campaign["password_hash"] = (
            bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode() if raw else None
        )

    update_campaign(campaign)
    return _json_response({"status": "updated"})


async def admin_regenerate_invite_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    try:
        campaign = get_campaign(campaign_id)
    except Exception:
        return _error("Campaign not found", 404)

    if not _is_system_admin(email) and email not in campaign.get("creator_emails", []):
        return _error("Admin access required", 403)

    campaign["invite_token"] = secrets.token_urlsafe(32)
    update_campaign(campaign)
    return _json_response({"invite_token": campaign["invite_token"]})


# ---------------------------------------------------------------------------
# Lobby
# ---------------------------------------------------------------------------

async def lobby_message_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    cp = get_campaign_player({"campaign_id": campaign_id, "email": email})
    if not cp or cp.get("status") != "active":
        return _error("Not an active player in this campaign", 403)

    try:
        body = req.get_json()
    except ValueError:
        return _error("Invalid JSON")

    text = (body.get("text") or "").strip()
    if not text:
        return _error("text required")

    player = get_player(email)
    display_name = player.get("display_name", email.split("@")[0]) if player else email.split("@")[0]
    char_class = cp.get("char_class") or None
    rerolled = cp.get("rerolled", False)
    all_players = get_campaign_players(campaign_id)
    message_id = (body.get("message_id") or "").strip() or str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()

    message = {
        "message_id": message_id,
        "type": "chat",
        "email": email,
        "display_name": display_name,
        "char_class": char_class,
        "text": text,
        "timestamp": timestamp,
    }
    if rerolled:
        message["rerolled"] = True
    append_lobby_message(campaign_id, message)

    broadcast_lobby_event({
        **message,
        "campaign_id": campaign_id,
        "player_emails": [p["email"] for p in all_players],
    })
    return _json_response({"status": "sent"})


async def lobby_chat_history_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    cp = get_campaign_player({"campaign_id": campaign_id, "email": email})
    if not cp or cp.get("status") != "active":
        return _error("Not a member of this campaign", 403)

    messages = get_lobby_chat(campaign_id)
    return _json_response({"messages": messages})


async def lobby_launch_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    campaign = get_campaign(campaign_id)

    if not _is_system_admin(email) and email not in campaign.get("creator_emails", []):
        return _error("Admin access required", 403)

    campaign["status"] = "active"
    update_campaign(campaign)

    enqueue("campaign-intro", {"campaign_id": campaign_id})

    all_players = get_campaign_players(campaign_id)
    broadcast_lobby_event({
        "campaign_id": campaign_id,
        "type": "launched",
        "player_emails": [p["email"] for p in all_players],
    })
    return _json_response({"status": "launched"})


async def lobby_presence_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    cp = get_campaign_player({"campaign_id": campaign_id, "email": email})
    if not cp or cp.get("status") != "active":
        return _error("Not an active player in this campaign", 403)

    try:
        body = req.get_json()
    except ValueError:
        return _error("Invalid JSON")

    action = body.get("action")

    if action == "join":
        message = lobby_presence_join(campaign_id, email)
        if message:
            append_lobby_message(campaign_id, message)
            all_players = get_campaign_players(campaign_id)
            broadcast_lobby_event({
                **message,
                "campaign_id": campaign_id,
                "player_emails": [p["email"] for p in all_players],
            })
        return _json_response({"status": "joined"})

    if action == "leave":
        lobby_presence_leave(campaign_id, email)
        enqueue("lobby-leave-announce", {"campaign_id": campaign_id, "email": email},
                visibility_timeout=10)
        return _json_response({"status": "left"})

    return _error("action must be 'join' or 'leave'")


def process_lobby_leave_queue(data: dict) -> None:
    campaign_id = data["campaign_id"]
    email = data["email"]

    try:
        presence = get_lobby_presence_doc(campaign_id, email)
    except Exception:
        return

    if presence.get("status") != "left":
        return

    display_name = presence.get("display_name", email.split("@")[0])
    message = {
        "message_id": str(uuid.uuid4()),
        "type": "system",
        "text": f"{display_name} has left the lobby",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    append_lobby_message(campaign_id, message)

    all_players = get_campaign_players(campaign_id)
    broadcast_lobby_event({
        **message,
        "campaign_id": campaign_id,
        "player_emails": [p["email"] for p in all_players],
    })


async def delete_campaign_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    try:
        campaign = get_campaign(campaign_id)
    except Exception:
        return _error("Campaign not found", 404)

    if not _is_system_admin(email) and email not in campaign.get("creator_emails", []):
        return _error("Admin access required", 403)

    all_players = get_campaign_players(campaign_id)
    player_emails = [p["email"] for p in all_players]

    campaign["status"] = "deleted"
    update_campaign(campaign)
    delete_reroll_flags_for_campaign(campaign_id)

    if player_emails:
        broadcast_lobby_event({
            "type": "campaign_deleted",
            "campaign_id": campaign_id,
            "player_emails": player_emails,
        })

    return _json_response({"status": "deleted"})


async def leave_campaign_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    try:
        result = leave_campaign(campaign_id, email)
    except DomainError as e:
        return _error(str(e), e.http_status)

    remaining = get_campaign_players(campaign_id)
    remaining_emails = [p["email"] for p in remaining]
    if remaining_emails:
        broadcast_lobby_event({
            "type": "player_left",
            "campaign_id": campaign_id,
            "email": result["email"],
            "display_name": result["display_name"],
            "player_emails": remaining_emails,
        })

    return _json_response({"status": "left"})


# ---------------------------------------------------------------------------
# Player self-registration
# ---------------------------------------------------------------------------

async def register_player(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth(req)
    if err:
        return err

    if not get_allowed_user(email):
        return _error("Not on allowlist", 403)

    user = _get_user(req)
    player = get_player(email)
    if not player:
        player = {
            "id": f"player_{email}",
            "type": "player",
            "campaign_id": "players",
            "email": email,
            "display_name": user.get("userDetails", email).split("@")[0],
            "identity_provider": user.get("identityProvider", "unknown"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "notifications": {"email": True, "push": False, "push_subscription": None},
            "approved": True,
        }
        upsert_player(player)
    elif not player.get("approved", True):
        player["approved"] = True
        upsert_player(player)

    return _json_response({**player, "is_system_admin": _is_system_admin(email)})


# ---------------------------------------------------------------------------
# Allowlist management (system admin only)
# ---------------------------------------------------------------------------

def _is_system_admin(email: str) -> bool:
    admins = os.environ.get("SYSTEM_ADMIN_EMAILS", "")
    return email in [e.strip() for e in admins.split(",") if e.strip()]


async def get_allowed_users_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err
    if not _is_system_admin(email):
        return _error("System admin access required", 403)
    return _json_response(list_allowed_users())


async def add_allowed_user_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err
    if not _is_system_admin(email):
        return _error("System admin access required", 403)
    try:
        body = req.get_json()
    except ValueError:
        return _error("Invalid JSON")
    target_email = body.get("email")
    if not target_email:
        return _error("email required")
    upsert_allowed_user(target_email)
    return _json_response({"status": "added"}, 201)


async def remove_allowed_user_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err
    if not _is_system_admin(email):
        return _error("System admin access required", 403)
    try:
        body = req.get_json()
    except ValueError:
        return _error("Invalid JSON")
    target_email = body.get("email")
    if not target_email:
        return _error("email required")
    delete_allowed_user(target_email)
    player = get_player(target_email)
    if player:
        player["approved"] = False
        upsert_player(player)
    return _json_response({"status": "removed"})


async def update_push_subscription(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    try:
        body = req.get_json()
    except ValueError:
        return _error("Invalid JSON")

    player = get_player(email)
    if not player:
        return _error("Player not found", 404)

    player["notifications"]["push"] = True
    player["notifications"]["push_subscription"] = body.get("subscription")
    upsert_player(player)
    return _json_response({"status": "saved"})


_GENERATE_PROMPTS = {
    "name": (
        "You are a creative D&D 5e Dungeon Master. Generate a single evocative campaign name "
        "for a fantasy adventure. Return only the campaign name, nothing else. "
        "It should be dramatic, memorable, and 2–6 words long."
    ),
    "party_name": (
        "You are a creative D&D 5e Dungeon Master. Generate a single memorable party name "
        "for a group of adventurers. Return only the party name, nothing else. "
        "It should be bold, thematic, and 2–5 words long."
    ),
    "description": (
        "You are a creative D&D 5e Dungeon Master. Write a short campaign description "
        "of 2–4 sentences that sets the scene and hooks the players. "
        "Return only the description, nothing else."
    ),
}

VALID_GENERATE_FIELDS = set(_GENERATE_PROMPTS.keys())


async def generate_campaign_field_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    try:
        body = req.get_json()
    except ValueError:
        return _error("Invalid JSON")

    field = body.get("field", "")
    if field not in VALID_GENERATE_FIELDS:
        return _error(f"Unknown field '{field}'. Must be one of: {', '.join(sorted(VALID_GENERATE_FIELDS))}")

    context = body.get("context", {})
    ctx_name = (context.get("name") or "").strip()
    ctx_description = (context.get("description") or "").strip()

    system_prompt = _GENERATE_PROMPTS[field]
    user_parts = []
    if field == "name" and ctx_description:
        user_parts.append(f"Campaign description: {ctx_description}")
        user_parts.append("Generate a fitting campaign name.")
    elif field == "description" and ctx_name:
        user_parts.append(f"Campaign name: {ctx_name}")
        user_parts.append("Generate an evocative campaign description.")
    elif field == "party_name":
        if ctx_name:
            user_parts.append(f"Campaign name: {ctx_name}")
        if ctx_description:
            user_parts.append(f"Campaign description: {ctx_description}")
        user_parts.append("Generate a fitting party name.")
    else:
        user_parts.append(f"Generate a {field.replace('_', ' ')}.")

    user_message = "\n".join(user_parts)

    try:
        client = openai_client()
        response = client.chat.completions.create(
            model=os.environ["OPENAI_MINI_DEPLOYMENT"],
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            max_tokens=150,
            temperature=0.9,
        )
        value = response.choices[0].message.content.strip()
    except Exception as e:
        return _error(f"Generation failed: {e}", 500)

    return _json_response({"value": value})


async def reroll_request_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    cp = get_campaign_player({"campaign_id": campaign_id, "email": email})
    if not cp or cp.get("status") != "active":
        return _error("Not an active player in this campaign", 403)

    try:
        body = req.get_json()
    except ValueError:
        return _error("Invalid JSON")

    old_value = body.get("old_value")
    player = get_player(email)
    display_name = player.get("display_name", email.split("@")[0]) if player else email.split("@")[0]

    broadcast_lobby_event({
        "type": "reroll_request",
        "campaign_id": campaign_id,
        "player_email": email,
        "player_display_name": display_name,
        "old_value": old_value,
    })
    return _json_response({"status": "requested"})


async def reroll_response_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth_approved(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    campaign = get_campaign(campaign_id)
    if not _is_system_admin(email) and email not in campaign.get("creator_emails", []):
        return _error("Only campaign creators can respond to reroll requests", 403)

    try:
        body = req.get_json()
    except ValueError:
        return _error("Invalid JSON")

    player_email = body.get("player_email")
    approved = bool(body.get("approved"))

    broadcast_lobby_event({
        "type": "reroll_response",
        "campaign_id": campaign_id,
        "player_email": player_email,
        "approved": approved,
    })
    return _json_response({"status": "responded"})

"""
HTTP request handler implementations.
All Durable Functions client references removed — round lifecycle uses queues.
"""

import json
import uuid
import base64
import os
from datetime import datetime, timezone

import azure.functions as func

from functions.activities.cosmos import (
    get_campaign, update_campaign, get_story_state, get_campaign_player, get_campaign_players,
    get_character, get_characters, upsert_character, upsert_campaign_player,
    upsert_player, get_player, create_campaign, upsert_story_state,
    get_action_list, get_narrative_log,
)
from functions.activities.action_validator import validate_freeform_action
from functions.activities.signalr import get_signalr_connection_info, broadcast_lobby_event
from functions.activities.email import (
    send_player_reactivated_notification,
    send_player_inactive_notification,
)


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


def _enqueue(queue_name: str, payload: dict):
    from azure.storage.queue import QueueClient
    conn_str = os.environ["AzureWebJobsStorage"]
    q = QueueClient.from_connection_string(conn_str, queue_name)
    try:
        q.create_queue()
    except Exception:
        pass
    q.send_message(base64.b64encode(json.dumps(payload).encode()).decode())


# ---------------------------------------------------------------------------
# SignalR negotiate
# ---------------------------------------------------------------------------

async def negotiate(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth(req)
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
    email, err = _require_auth(req)
    if err:
        return err

    try:
        body = req.get_json()
    except ValueError:
        return _error("Invalid JSON")

    campaign_id = body.get("campaign_id")
    action_text = body.get("action_text")
    rolls = body.get("rolls", [])

    if not campaign_id or not action_text:
        return _error("campaign_id and action_text required")

    cp = get_campaign_player({"campaign_id": campaign_id, "email": email})
    if not cp or cp.get("status") != "active":
        return _error("You are not an active player in this campaign", 403)

    story_state = get_story_state(campaign_id)
    if story_state.get("round_status") == "resolving":
        return _error("Round is currently being resolved, please wait", 409)

    # Store action in pending_actions
    pending = story_state.get("pending_actions", {})
    pending[email] = {
        "action_text": action_text,
        "rolls": rolls,
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }
    story_state["pending_actions"] = pending
    upsert_story_state(story_state)

    # Check if all active players have now submitted
    campaign_players = get_campaign_players(campaign_id)
    active_emails = {p["email"] for p in campaign_players if p.get("status") == "active"}
    submitted_emails = set(pending.keys())

    if active_emails and active_emails.issubset(submitted_emails):
        _enqueue("resolve-round", {"campaign_id": campaign_id, "reason": "all_submitted"})

    return _json_response({"status": "submitted"})


# ---------------------------------------------------------------------------
# Validate freeform action
# ---------------------------------------------------------------------------

async def validate_action(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth(req)
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
    email, err = _require_auth(req)
    if err:
        return err

    try:
        body = req.get_json()
    except ValueError:
        return _error("Invalid JSON")

    campaign_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()

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
        "created_by": email,
        "created_at": now,
        "admin_emails": [email],
        "max_players": body.get("max_players", 8),
        "schedule": schedule,
        "inactivity_thresholds": {"combat_encounters": 2, "scenes": 4},
        "legend": {"previous_campaign_id": None, "summary": None, "key_events": []},
    }
    try:
        create_campaign(campaign_doc)
    except Exception as e:
        return _error(f"Failed to create campaign: {e}", 500)

    state_doc = {
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
    }
    upsert_story_state(state_doc)

    cp_doc = {
        "id": f"campaign_player_{campaign_id}_{email}",
        "type": "campaign_player",
        "campaign_id": campaign_id,
        "email": email,
        "status": "active",
        "role": "admin",
        "consecutive_combat_skips": 0,
        "consecutive_scene_skips": 0,
        "manually_set_inactive": False,
        "inactivated_at": None,
        "joined_at": now,
        "character_creation_complete": False,
        "notifications": {"email": True, "push": False},
    }
    upsert_campaign_player(cp_doc)

    return _json_response(campaign_doc, 201)


async def get_campaign_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    try:
        campaign = get_campaign(campaign_id)
    except Exception:
        return _error("Campaign not found", 404)

    cp = get_campaign_player({"campaign_id": campaign_id, "email": email})
    if not cp:
        # Auto-join as observer if campaign exists
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
        upsert_campaign_player(cp)
        _enqueue("player-join", {"campaign_id": campaign_id, "email": email})

    return _json_response(campaign)


async def get_game_state_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth(req)
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
    email, err = _require_auth(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    char = get_character({"campaign_id": campaign_id, "email": email})
    if not char:
        return _error("Character not found", 404)
    return _json_response(char)


async def upsert_character_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    try:
        body = req.get_json()
    except ValueError:
        return _error("Invalid JSON")

    body["id"] = f"character_{campaign_id}_{email}"
    body["type"] = "character"
    body["campaign_id"] = campaign_id
    body["email"] = email
    upsert_character(body)

    cp = get_campaign_player({"campaign_id": campaign_id, "email": email})
    if cp:
        was_complete = cp.get("character_creation_complete", False)
        cp["character_creation_complete"] = True
        upsert_campaign_player(cp)

        # Notify the lobby that this player is ready
        if not was_complete:
            player = get_player(email)
            display_name = player.get("display_name", email.split("@")[0]) if player else email.split("@")[0]
            char_name = body.get("name", "")
            char_class = body.get("class", "")
            try:
                all_players = get_campaign_players(campaign_id)
                broadcast_lobby_event({
                    "campaign_id": campaign_id,
                    "type": "player_ready",
                    "email": email,
                    "display_name": display_name,
                    "char_name": char_name,
                    "char_class": char_class,
                    "player_emails": [p["email"] for p in all_players],
                })
            except Exception:
                pass

    return _json_response({"status": "saved"})


# ---------------------------------------------------------------------------
# Admin actions
# ---------------------------------------------------------------------------

async def admin_toggle_player(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    campaign = get_campaign(campaign_id)

    if email not in campaign.get("admin_emails", []):
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
    email, err = _require_auth(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    campaign = get_campaign(campaign_id)

    if email not in campaign.get("admin_emails", []):
        return _error("Admin access required", 403)

    story_state = get_story_state(campaign_id)
    if story_state.get("round_status") == "resolving":
        return _error("Round is already being resolved", 409)

    _enqueue("resolve-round", {"campaign_id": campaign_id, "reason": "admin_forced"})
    return _json_response({"status": "resolution_queued"})


async def admin_export_novel(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    campaign = get_campaign(campaign_id)

    if email not in campaign.get("admin_emails", []):
        return _error("Admin access required", 403)

    _enqueue("novel-export", {"campaign_id": campaign_id})
    return _json_response({"status": "export_queued"})


# ---------------------------------------------------------------------------
# Lobby
# ---------------------------------------------------------------------------

async def lobby_message_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth(req)
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
    all_players = get_campaign_players(campaign_id)

    broadcast_lobby_event({
        "campaign_id": campaign_id,
        "type": "chat",
        "email": email,
        "display_name": display_name,
        "text": text,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "player_emails": [p["email"] for p in all_players],
    })
    return _json_response({"status": "sent"})


async def lobby_launch_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    campaign = get_campaign(campaign_id)

    if email not in campaign.get("admin_emails", []):
        return _error("Admin access required", 403)

    campaign["status"] = "active"
    update_campaign(campaign)

    _enqueue("campaign-intro", {"campaign_id": campaign_id})

    all_players = get_campaign_players(campaign_id)
    broadcast_lobby_event({
        "campaign_id": campaign_id,
        "type": "launched",
        "player_emails": [p["email"] for p in all_players],
    })
    return _json_response({"status": "launched"})


async def delete_campaign_handler(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth(req)
    if err:
        return err

    campaign_id = req.route_params.get("campaign_id")
    try:
        campaign = get_campaign(campaign_id)
    except Exception:
        return _error("Campaign not found", 404)

    if email not in campaign.get("admin_emails", []):
        return _error("Admin access required", 403)

    campaign["status"] = "deleted"
    update_campaign(campaign)
    return _json_response({"status": "deleted"})


# ---------------------------------------------------------------------------
# Player self-registration
# ---------------------------------------------------------------------------

async def register_player(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth(req)
    if err:
        return err

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
        }
        upsert_player(player)

    return _json_response(player)


async def update_push_subscription(req: func.HttpRequest) -> func.HttpResponse:
    email, err = _require_auth(req)
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

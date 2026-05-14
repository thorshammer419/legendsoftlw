"""
Round resolution pipeline — runs as a queue-triggered background job.
Replaces the Durable Functions orchestrator with direct sequential function calls.
"""

import json
import logging
from datetime import datetime, timezone

from helpers.inactivity import should_mark_inactive, increment_skip_counters, reset_skip_counters
from helpers.schedule import calculate_deadline
from functions.activities.cosmos import (
    get_campaign, update_campaign, get_story_state, upsert_story_state,
    get_characters, get_active_npcs, get_campaign_players, upsert_campaign_player,
    apply_state_update, get_narrative_log, get_character, append_narrative_round,
)
from functions.activities.rag_query import generate_rag_queries
from functions.activities.search import execute_rag_queries
from functions.activities.narrative import generate_narrative
from functions.activities.state_extract import extract_state
from functions.activities.action_list import generate_and_save_action_list
from functions.activities.signalr import broadcast_narrative
from functions.activities.email import (
    send_round_notifications, send_player_inactive_notification,
    send_campaign_paused_notification, send_novel_export_notification,
)
from functions.activities.push import send_round_push_notifications
from functions.activities.npc_introduction import generate_player_introduction
from functions.activities.catchup_summary import generate_catchup_summary
from functions.activities.novel_export import generate_novel
from functions.activities.campaign_intro import generate_campaign_intro
from functions.activities.scene_image import generate_scene_image
from helpers.queue import enqueue as _enqueue

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Non-blocking pipeline steps
# ---------------------------------------------------------------------------

def _try(label: str, fn) -> None:
    """Run a non-blocking pipeline step. Logs on failure, never raises."""
    try:
        fn()
    except Exception as e:
        logger.warning("Non-blocking step '%s' failed: %s", label, e)


def _generate_action_lists(ctx: dict) -> None:
    campaign_id = ctx["campaign_id"]
    new_story_state = ctx["new_story_state"]
    new_characters = ctx["new_characters"]
    active_emails = ctx["active_emails"]
    char_by_email = {c["email"]: c for c in new_characters}
    for email in active_emails:
        char = char_by_email.get(email)
        if char:
            try:
                generate_and_save_action_list({
                    "campaign_id": campaign_id,
                    "email": email,
                    "character": char,
                    "scene": new_story_state.get("current_scene", {}),
                    "action_economy": new_story_state.get("action_economy", {}).get(email, {}),
                })
            except Exception as e:
                logger.warning("Action list failed for %s: %s", email, e)


def _generate_scene_image(ctx: dict) -> None:
    """Generate scene image and mutate ctx['scene_image_url'] on success."""
    campaign_id = ctx["campaign_id"]
    narrative = ctx["narrative"]
    story_state = ctx["story_state"]
    state_update = ctx["state_update"]
    new_story_state = ctx["new_story_state"]

    new_scene = state_update.get("current_scene") or story_state.get("current_scene", {})
    url = generate_scene_image({
        "narrative": narrative,
        "scene": new_scene,
        "campaign_id": campaign_id,
    })
    ctx["scene_image_url"] = url
    new_story_state["scene_image_url"] = url
    upsert_story_state(new_story_state)


def _send_notifications(ctx: dict) -> None:
    campaign = ctx["campaign"]
    campaign_players = ctx["campaign_players"]
    campaign_id = ctx["campaign_id"]
    send_round_notifications({
        "campaign_players": campaign_players,
        "campaign_name": campaign.get("name", "Your Campaign"),
        "campaign_id": campaign_id,
    })
    send_round_push_notifications({
        "campaign_players": campaign_players,
        "campaign_name": campaign.get("name", "Your Campaign"),
    })


def _track_inactivity(ctx: dict) -> None:
    campaign = ctx["campaign"]
    campaign_id = ctx["campaign_id"]
    campaign_players = ctx["campaign_players"]
    submitted_actions = ctx["submitted_actions"]
    state_update = ctx["state_update"]
    story_state = ctx["story_state"]

    scene_type = state_update.get("scene_type", story_state.get("scene_type", "exploration"))
    thresholds = campaign.get("inactivity_thresholds", {"combat_encounters": 2, "scenes": 4})

    for cp in campaign_players:
        if cp.get("status") != "active":
            continue
        email = cp["email"]
        if email in submitted_actions:
            updated = reset_skip_counters(cp)
        else:
            updated = increment_skip_counters(cp, scene_type)
            if should_mark_inactive(updated, thresholds, scene_type):
                updated["status"] = "inactive"
                updated["inactivated_at"] = datetime.now(timezone.utc).isoformat()
                try:
                    send_player_inactive_notification({
                        "email": email,
                        "campaign_name": campaign.get("name", ""),
                        "campaign_id": campaign_id,
                    })
                except Exception as e:
                    logger.warning("Inactive notification failed for %s: %s", email, e)
        upsert_campaign_player(updated)

    refreshed = get_campaign_players(campaign_id)
    all_inactive = all(p.get("status") != "active" for p in refreshed)
    if all_inactive:
        campaign["status"] = "paused"
        update_campaign(campaign)
        try:
            send_campaign_paused_notification({
                "emails": [p["email"] for p in refreshed],
                "campaign_name": campaign.get("name", ""),
                "reason": "all players are currently inactive",
            })
        except Exception as e:
            logger.warning("Campaign paused notification failed: %s", e)

    if state_update.get("campaign_complete"):
        campaign["status"] = "completed"
        update_campaign(campaign)


# ---------------------------------------------------------------------------
# Round resolution
# ---------------------------------------------------------------------------

def resolve_round(campaign_id: str):
    story_state = get_story_state(campaign_id)

    # Idempotency: if already resolving on retry, reuse the committed round_number
    if story_state.get("round_status") == "resolving":
        round_number = story_state["round_number"]
    else:
        round_number = story_state.get("round_number", 0) + 1
        story_state["round_number"] = round_number
        story_state["round_status"] = "resolving"
        upsert_story_state(story_state)

    campaign = get_campaign(campaign_id)
    submitted_actions = {
        email: data
        for email, data in story_state.get("pending_actions", {}).items()
        if isinstance(data, dict)
    }

    campaign_players = get_campaign_players(campaign_id)
    active_emails = [p["email"] for p in campaign_players if p.get("status") == "active"]
    inactive_emails = [p["email"] for p in campaign_players if p.get("status") != "active"]

    characters = get_characters(campaign_id)
    active_npc_names = story_state.get("current_scene", {}).get("active_npcs", [])
    active_npcs = get_active_npcs({"campaign_id": campaign_id, "npc_names": active_npc_names})

    rag_queries = generate_rag_queries({
        "player_actions": submitted_actions,
        "scene": story_state.get("current_scene", {}),
    })
    srd_chunks = execute_rag_queries(rag_queries)

    narrative = generate_narrative({
        "campaign_id": campaign_id,
        "party_name": campaign.get("party_name", "The Adventurers"),
        "legend_context": campaign.get("legend", {}),
        "story_state": story_state,
        "active_npcs": active_npcs,
        "characters": characters,
        "narrative_summary": story_state.get("narrative_summary", ""),
        "srd_chunks": srd_chunks,
        "player_actions": submitted_actions,
        "active_player_emails": active_emails,
        "inactive_player_emails": inactive_emails,
    })

    state_update = extract_state({
        "narrative": narrative,
        "current_state": story_state,
    })

    apply_state_update({
        "campaign_id": campaign_id,
        "round_number": round_number,
        "narrative": narrative,
        "state_update": state_update,
        "characters": characters,
    })

    new_story_state = get_story_state(campaign_id)
    new_characters = get_characters(campaign_id)

    # Finalize round: clear pending_actions, set deadline, mark waiting
    schedule = campaign.get("schedule", {})
    deadline = calculate_deadline(datetime.now(timezone.utc), schedule)
    new_story_state["pending_actions"] = {}
    new_story_state["round_status"] = "waiting"
    new_story_state["round_started_at"] = datetime.now(timezone.utc).isoformat()
    new_story_state["round_deadline"] = deadline.isoformat() if deadline else None
    upsert_story_state(new_story_state)

    scene_type = state_update.get("scene_type", story_state.get("scene_type", "exploration"))

    ctx = {
        "campaign_id": campaign_id,
        "round_number": round_number,
        "campaign": campaign,
        "story_state": story_state,
        "campaign_players": campaign_players,
        "active_emails": active_emails,
        "inactive_emails": inactive_emails,
        "submitted_actions": submitted_actions,
        "characters": characters,
        "narrative": narrative,
        "state_update": state_update,
        "new_story_state": new_story_state,
        "new_characters": new_characters,
        "scene_image_url": None,
    }

    _try("action lists",  lambda: _generate_action_lists(ctx))
    _try("scene image",   lambda: _generate_scene_image(ctx))
    _try("broadcast",     lambda: broadcast_narrative({
        "campaign_id": campaign_id,
        "round_number": round_number,
        "narrative": narrative,
        "scene_image_url": ctx.get("scene_image_url"),
        "player_emails": [p["email"] for p in campaign_players],
        "state_summary": {
            "scene_type": scene_type,
            "current_scene": state_update.get("current_scene", {}),
            "quest": state_update.get("quest", {}),
        },
    }))
    _try("notifications", lambda: _send_notifications(ctx))
    _try("inactivity",    lambda: _track_inactivity(ctx))

    logger.info("Round %d resolved for campaign %s (%d/%d submitted)",
                round_number, campaign_id, len(submitted_actions), len(active_emails))


# ---------------------------------------------------------------------------
# Queue trigger handlers
# ---------------------------------------------------------------------------

def resolve_round_from_queue(msg) -> None:
    payload = json.loads(msg.get_body().decode("utf-8"))
    campaign_id = payload.get("campaign_id")
    if not campaign_id:
        logger.error("No campaign_id in resolve-round queue message")
        return
    try:
        resolve_round(campaign_id)
    except Exception as e:
        logger.error("Round resolution failed for %s: %s", campaign_id, e)
        raise


def player_join_from_queue(msg) -> None:
    payload = json.loads(msg.get_body().decode("utf-8"))
    campaign_id = payload.get("campaign_id")
    email = payload.get("email")
    try:
        story_state = get_story_state(campaign_id)
        character = get_character({"campaign_id": campaign_id, "email": email})
        narrative_log = get_narrative_log(campaign_id)
        narrative_history = "\n\n".join(
            r["narrative"] for r in (narrative_log.get("rounds") or [])
        )

        catchup = generate_catchup_summary({
            "story_state": story_state,
            "narrative_history": narrative_history,
            "character": character,
        })

        all_chars = get_characters(campaign_id)
        existing_party = [c for c in all_chars if c["email"] != email]

        introduction = generate_player_introduction({
            "scene": story_state.get("current_scene", {}),
            "new_character": character,
            "existing_party": existing_party,
            "recent_narrative": story_state.get("narrative_summary", "")[-500:],
        })

        round_number = story_state.get("round_number", 0)
        all_players = get_campaign_players(campaign_id)
        broadcast_narrative({
            "campaign_id": campaign_id,
            "round_number": round_number,
            "narrative": introduction,
            "player_emails": [p["email"] for p in all_players],
            "state_summary": {"event": "player_joined", "email": email},
        })
        logger.info("Player join flow complete for %s in %s", email, campaign_id)
    except Exception as e:
        logger.error("Player join flow failed for %s in %s: %s", email, campaign_id, e)
        raise


def campaign_intro_from_queue(msg) -> None:
    payload = json.loads(msg.get_body().decode("utf-8"))
    campaign_id = payload.get("campaign_id")
    try:
        story_state = get_story_state(campaign_id)
        if story_state.get("round_number", 0) > 0:
            logger.info("Campaign %s already has rounds — skipping intro", campaign_id)
            return

        narrative_log = get_narrative_log(campaign_id)
        if any(r.get("round") == 0 for r in narrative_log.get("rounds", [])):
            logger.info("Intro already sent for campaign %s", campaign_id)
            return

        campaign = get_campaign(campaign_id)
        characters = get_characters(campaign_id)
        if not characters:
            logger.info("No characters yet for campaign %s — skipping intro", campaign_id)
            return

        narrative = generate_campaign_intro({
            "campaign_name": campaign.get("name", ""),
            "party_name": campaign.get("party_name", "The Adventurers"),
            "story_state": story_state,
            "characters": characters,
        })

        scene_image_url = None
        try:
            scene_image_url = generate_scene_image({
                "narrative": narrative,
                "scene": story_state.get("current_scene", {}),
                "campaign_id": campaign_id,
            })
            story_state["scene_image_url"] = scene_image_url
            upsert_story_state(story_state)
        except Exception as e:
            logger.warning("Intro scene image failed: %s", e)

        append_narrative_round(campaign_id, 0, narrative)

        all_players = get_campaign_players(campaign_id)
        broadcast_narrative({
            "campaign_id": campaign_id,
            "round_number": 0,
            "narrative": narrative,
            "scene_image_url": scene_image_url,
            "player_emails": [p["email"] for p in all_players],
            "state_summary": {"event": "campaign_intro"},
        })
        logger.info("Campaign intro sent for %s", campaign_id)
    except Exception as e:
        logger.error("Campaign intro failed for %s: %s", campaign_id, e)
        raise


def novel_export_from_queue(msg) -> None:
    payload = json.loads(msg.get_body().decode("utf-8"))
    campaign_id = payload.get("campaign_id")
    try:
        campaign = get_campaign(campaign_id)
        story_state = get_story_state(campaign_id)
        characters = get_characters(campaign_id)
        narrative_log = get_narrative_log(campaign_id)
        narrative_history = "\n\n".join(r["narrative"] for r in narrative_log.get("rounds", []))

        download_url = generate_novel({
            "campaign_id": campaign_id,
            "party_name": campaign.get("party_name", ""),
            "campaign_name": campaign.get("name", ""),
            "character_names": [c.get("name", "") for c in characters],
            "narrative_history": narrative_history,
            "quest_milestones": story_state.get("quest", {}).get("completed_milestones", []),
        })

        campaign_players = get_campaign_players(campaign_id)
        send_novel_export_notification({
            "emails": [p["email"] for p in campaign_players],
            "campaign_name": campaign.get("name", ""),
            "download_url": download_url,
        })
        logger.info("Novel export complete for campaign %s", campaign_id)
    except Exception as e:
        logger.error("Novel export failed for %s: %s", campaign_id, e)
        raise

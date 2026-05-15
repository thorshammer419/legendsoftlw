"""
All Cosmos DB read/write operations.

Container: "game"  (single container, partition key: /campaign_id)
Player-global documents use campaign_id = "players".

Each public function is the implementation called by an activity trigger in function_app.py.
Input is always a dict so Durable Functions can serialize it cleanly.
"""

import os
from datetime import datetime, timezone
from azure.cosmos import CosmosClient, exceptions


def _container():
    client = CosmosClient.from_connection_string(os.environ["COSMOS_CONNECTION_STRING"])
    db = client.get_database_client(os.environ["COSMOS_DATABASE_NAME"])
    return db.get_container_client("game")


# ---------------------------------------------------------------------------
# Campaign
# ---------------------------------------------------------------------------

def get_campaign(campaign_id: str) -> dict:
    c = _container()
    return c.read_item(item=f"campaign_{campaign_id}", partition_key=campaign_id)


def get_all_active_campaigns() -> list:
    c = _container()
    return list(c.query_items(
        query="SELECT * FROM c WHERE c.type = 'campaign' AND c.status = 'active'",
        enable_cross_partition_query=True,
    ))


def list_all_campaigns() -> list:
    """All non-deleted campaigns (lobby + active) for the campaign browser."""
    c = _container()
    return list(c.query_items(
        query="SELECT * FROM c WHERE c.type = 'campaign' AND c.status IN ('lobby', 'active')",
        enable_cross_partition_query=True,
    ))


def get_campaign_by_invite_token(token: str) -> dict | None:
    c = _container()
    results = list(c.query_items(
        query="SELECT * FROM c WHERE c.type = 'campaign' AND c.invite_token = @token",
        parameters=[{"name": "@token", "value": token}],
        enable_cross_partition_query=True,
    ))
    return results[0] if results else None


def create_campaign(doc: dict) -> dict:
    c = _container()
    campaign_id = doc["id"].removeprefix("campaign_")
    doc["campaign_id"] = campaign_id
    return c.create_item(body=doc)


def update_campaign(doc: dict) -> dict:
    c = _container()
    return c.replace_item(item=doc["id"], body=doc)


# ---------------------------------------------------------------------------
# Story State
# ---------------------------------------------------------------------------

def get_story_state(campaign_id: str) -> dict:
    c = _container()
    return c.read_item(item=f"state_{campaign_id}", partition_key=campaign_id)


def upsert_story_state(doc: dict) -> dict:
    c = _container()
    return c.upsert_item(body=doc)


def apply_state_update(input_data: dict) -> None:
    """
    Apply the state_extract output to Cosmos:
    - Update story_state
    - Update character HP/conditions/spell slots
    - Update or create NPC documents
    - Append narrative round entry
    """
    campaign_id = input_data["campaign_id"]
    round_number = input_data["round_number"]
    narrative = input_data["narrative"]
    state_update = input_data["state_update"]
    characters = input_data["characters"]

    c = _container()

    # --- Story state ---
    state = get_story_state(campaign_id)
    if state_update.get("scene_type"):
        state["scene_type"] = state_update["scene_type"]
    if state_update.get("current_scene"):
        state["current_scene"].update(state_update["current_scene"])
    if state_update.get("quest"):
        q = state_update["quest"]
        existing = state.get("quest", {})
        completed = list(set(existing.get("completed_milestones", []) + q.get("completed_milestones", [])))
        failed = list(set(existing.get("failed_milestones", []) + q.get("failed_milestones", [])))
        state["quest"]["completed_milestones"] = completed
        state["quest"]["failed_milestones"] = failed

    # Append to rolling narrative summary (keep last ~3 rounds worth of text)
    append = state_update.get("narrative_summary_append", "")
    if append:
        existing_summary = state.get("narrative_summary", "")
        state["narrative_summary"] = (existing_summary + "\n\n" + append).strip()

    state["round_number"] = round_number
    state["pending_actions"] = {}

    # Reset action economy for all active players
    for email in (state.get("action_economy") or {}):
        state["action_economy"][email] = {
            "action_used": False,
            "bonus_action_used": False,
            "reaction_used": False,
            "movement_remaining": _get_speed(characters, email),
        }

    c.upsert_item(body=state)

    # --- Characters ---
    char_by_email = {ch["email"]: ch for ch in characters}
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

        # Spell slots
        for level, count in (pu.get("spell_slots_used") or {}).items():
            slots = char.get("spell_slots") or {}
            slot = slots.get(level, {})
            slot["remaining"] = max(0, slot.get("remaining", 0) - count)
            slots[level] = slot
            char["spell_slots"] = slots

        # Class feature uses
        for feature_name, uses in (pu.get("class_feature_uses") or {}).items():
            for feat in (char.get("class_features") or []):
                if feat.get("name") == feature_name:
                    u = feat.get("uses", {})
                    u["remaining"] = max(0, u.get("remaining", 0) - uses)
                    feat["uses"] = u

        c.upsert_item(body=char)

    # --- NPCs ---
    for nu in (state_update.get("npc_updates") or []):
        try:
            npc = c.read_item(item=nu["npc_id"], partition_key=campaign_id)
        except exceptions.CosmosResourceNotFoundError:
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
            used = list(set(npc.get("used_abilities", []) + nu["abilities_used"]))
            npc["used_abilities"] = used
        if nu.get("legendary_resistances_used"):
            npc["legendary_resistances_remaining"] = max(
                0,
                npc.get("legendary_resistances_remaining", 0) - nu["legendary_resistances_used"]
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
        c.upsert_item(body=npc)

    # --- New NPCs ---
    for new_npc in (state_update.get("new_npcs") or []):
        new_npc["campaign_id"] = campaign_id
        new_npc["first_appeared_round"] = round_number
        new_npc["last_seen_round"] = round_number
        c.upsert_item(body=new_npc)

    # --- Narrative round log ---
    _append_narrative_round(c, campaign_id, round_number, narrative)


def _get_speed(characters: list[dict], email: str) -> int:
    for c in characters:
        if c.get("email") == email:
            return c.get("speed", 30)
    return 30


def append_narrative_round(campaign_id: str, round_number: int, narrative: str) -> None:
    c = _container()
    _append_narrative_round(c, campaign_id, round_number, narrative)


def _append_narrative_round(container, campaign_id: str, round_number: int, narrative: str):
    doc_id = f"narrative_{campaign_id}"
    try:
        doc = container.read_item(item=doc_id, partition_key=campaign_id)
    except exceptions.CosmosResourceNotFoundError:
        doc = {"id": doc_id, "type": "narrative_log", "campaign_id": campaign_id, "rounds": []}

    doc["rounds"].append({
        "round": round_number,
        "narrative": narrative,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    container.upsert_item(body=doc)


# ---------------------------------------------------------------------------
# Player
# ---------------------------------------------------------------------------

def get_player(email: str) -> dict | None:
    c = _container()
    try:
        return c.read_item(item=f"player_{email}", partition_key="players")
    except exceptions.CosmosResourceNotFoundError:
        return None


def upsert_player(doc: dict) -> dict:
    c = _container()
    doc["campaign_id"] = "players"
    return c.upsert_item(body=doc)


# ---------------------------------------------------------------------------
# Campaign Player
# ---------------------------------------------------------------------------

def get_campaign_player(input_data: dict) -> dict | None:
    campaign_id = input_data["campaign_id"]
    email = input_data["email"]
    c = _container()
    try:
        return c.read_item(
            item=f"campaign_player_{campaign_id}_{email}",
            partition_key=campaign_id
        )
    except exceptions.CosmosResourceNotFoundError:
        return None


def get_campaign_players(campaign_id: str) -> list[dict]:
    c = _container()
    query = "SELECT * FROM c WHERE c.campaign_id = @cid AND c.type = 'campaign_player'"
    return list(c.query_items(
        query=query,
        parameters=[{"name": "@cid", "value": campaign_id}],
        enable_cross_partition_query=False,
    ))


def upsert_campaign_player(doc: dict) -> dict:
    c = _container()
    return c.upsert_item(body=doc)


# ---------------------------------------------------------------------------
# Character
# ---------------------------------------------------------------------------

def get_character(input_data: dict) -> dict | None:
    campaign_id = input_data["campaign_id"]
    email = input_data["email"]
    c = _container()
    try:
        return c.read_item(
            item=f"character_{campaign_id}_{email}",
            partition_key=campaign_id
        )
    except exceptions.CosmosResourceNotFoundError:
        return None


def get_characters(campaign_id: str) -> list[dict]:
    """Return all character documents for a campaign."""
    c = _container()
    query = "SELECT * FROM c WHERE c.campaign_id = @cid AND c.type = 'character'"
    return list(c.query_items(
        query=query,
        parameters=[{"name": "@cid", "value": campaign_id}],
        enable_cross_partition_query=False,
    ))


def upsert_character(doc: dict) -> dict:
    c = _container()
    return c.upsert_item(body=doc)


# ---------------------------------------------------------------------------
# NPC
# ---------------------------------------------------------------------------

def get_npc(input_data: dict) -> dict | None:
    c = _container()
    try:
        return c.read_item(item=input_data["npc_id"], partition_key=input_data["campaign_id"])
    except exceptions.CosmosResourceNotFoundError:
        return None


def get_active_npcs(input_data: dict) -> list[dict]:
    """Fetch NPC docs for the NPCs listed in current_scene.active_npcs."""
    campaign_id = input_data["campaign_id"]
    npc_names = input_data.get("npc_names", [])
    if not npc_names:
        return []

    c = _container()
    results = []
    for name in npc_names:
        npc_id = f"npc_{campaign_id}_{name.lower().replace(' ', '_')}"
        try:
            results.append(c.read_item(item=npc_id, partition_key=campaign_id))
        except exceptions.CosmosResourceNotFoundError:
            pass
    return results


def upsert_npc(doc: dict) -> dict:
    c = _container()
    return c.upsert_item(body=doc)


# ---------------------------------------------------------------------------
# Action list cache
# ---------------------------------------------------------------------------

def save_action_list(input_data: dict) -> None:
    campaign_id = input_data["campaign_id"]
    email = input_data["email"]
    action_list = input_data["action_list"]
    c = _container()
    doc = {
        "id": f"actions_{campaign_id}_{email}",
        "type": "action_list_cache",
        "campaign_id": campaign_id,
        "email": email,
        "actions": action_list,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    c.upsert_item(body=doc)


def get_action_list(input_data: dict) -> list:
    campaign_id = input_data["campaign_id"]
    email = input_data["email"]
    c = _container()
    try:
        doc = c.read_item(
            item=f"actions_{campaign_id}_{email}",
            partition_key=campaign_id
        )
        return doc.get("actions", [])
    except exceptions.CosmosResourceNotFoundError:
        return []


# ---------------------------------------------------------------------------
# Allowlist
# ---------------------------------------------------------------------------

def get_allowed_user(email: str) -> dict | None:
    c = _container()
    try:
        return c.read_item(item=f"allowed_user_{email}", partition_key="allowed_users")
    except exceptions.CosmosResourceNotFoundError:
        return None


def upsert_allowed_user(email: str) -> dict:
    c = _container()
    doc = {
        "id": f"allowed_user_{email}",
        "type": "allowed_user",
        "campaign_id": "allowed_users",
        "email": email,
    }
    return c.upsert_item(body=doc)


def delete_allowed_user(email: str) -> None:
    c = _container()
    try:
        c.delete_item(item=f"allowed_user_{email}", partition_key="allowed_users")
    except exceptions.CosmosResourceNotFoundError:
        pass


def list_allowed_users() -> list[dict]:
    c = _container()
    return list(c.query_items(
        query="SELECT * FROM c WHERE c.type = 'allowed_user'",
        partition_key="allowed_users",
    ))


# ---------------------------------------------------------------------------
# Narrative history (for novel export / catch-up)
# ---------------------------------------------------------------------------

def get_narrative_log(campaign_id: str) -> dict:
    c = _container()
    try:
        return c.read_item(item=f"narrative_{campaign_id}", partition_key=campaign_id)
    except exceptions.CosmosResourceNotFoundError:
        return {"rounds": []}

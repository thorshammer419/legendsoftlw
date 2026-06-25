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


def delete_campaign_player(campaign_id: str, email: str) -> None:
    c = _container()
    try:
        c.delete_item(item=f"campaign_player_{campaign_id}_{email}", partition_key=campaign_id)
    except exceptions.CosmosResourceNotFoundError:
        pass


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


def delete_character(campaign_id: str, email: str) -> None:
    c = _container()
    try:
        c.delete_item(item=f"character_{campaign_id}_{email}", partition_key=campaign_id)
    except exceptions.CosmosResourceNotFoundError:
        pass


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


# ---------------------------------------------------------------------------
# Lobby chat history
# ---------------------------------------------------------------------------

def get_lobby_chat_doc(campaign_id: str) -> dict:
    c = _container()
    return c.read_item(item=f"lobby_chat_{campaign_id}", partition_key=campaign_id)


def upsert_lobby_chat_doc(doc: dict) -> dict:
    c = _container()
    return c.upsert_item(body=doc)


# ---------------------------------------------------------------------------
# Lobby presence
# ---------------------------------------------------------------------------

def get_lobby_presence_doc(campaign_id: str, email: str) -> dict:
    c = _container()
    return c.read_item(item=f"presence_{campaign_id}_{email}", partition_key=campaign_id)


def upsert_lobby_presence_doc(doc: dict) -> dict:
    c = _container()
    return c.upsert_item(body=doc)


def upsert_reroll_flag(campaign_id: str, email: str) -> None:
    c = _container()
    doc = {
        "id": f"reroll_flag_{campaign_id}_{email}",
        "type": "reroll_flag",
        "campaign_id": campaign_id,
        "email": email,
    }
    c.upsert_item(body=doc)


def get_reroll_flag(campaign_id: str, email: str) -> dict | None:
    c = _container()
    try:
        return c.read_item(
            item=f"reroll_flag_{campaign_id}_{email}",
            partition_key=campaign_id,
        )
    except exceptions.CosmosResourceNotFoundError:
        return None


def delete_reroll_flag(campaign_id: str, email: str) -> None:
    c = _container()
    try:
        c.delete_item(item=f"reroll_flag_{campaign_id}_{email}", partition_key=campaign_id)
    except exceptions.CosmosResourceNotFoundError:
        pass


def get_reroll_flags_for_campaign(campaign_id: str) -> list[dict]:
    c = _container()
    query = "SELECT * FROM c WHERE c.campaign_id = @cid AND c.type = 'reroll_flag'"
    return list(c.query_items(
        query=query,
        parameters=[{"name": "@cid", "value": campaign_id}],
        enable_cross_partition_query=False,
    ))


def delete_reroll_flags_for_campaign(campaign_id: str) -> None:
    for flag in get_reroll_flags_for_campaign(campaign_id):
        delete_reroll_flag(campaign_id, flag["email"])


# ---------------------------------------------------------------------------
# Character draft
# ---------------------------------------------------------------------------

def upsert_character_draft(doc: dict) -> None:
    c = _container()
    c.upsert_item(body=doc)


def get_character_draft(campaign_id: str, email: str) -> dict | None:
    c = _container()
    try:
        return c.read_item(
            item=f"character_draft_{campaign_id}_{email}",
            partition_key=campaign_id,
        )
    except exceptions.CosmosResourceNotFoundError:
        return None


def delete_character_draft(campaign_id: str, email: str) -> None:
    c = _container()
    try:
        c.delete_item(item=f"character_draft_{campaign_id}_{email}", partition_key=campaign_id)
    except exceptions.CosmosResourceNotFoundError:
        pass


def get_character_drafts_for_campaign(campaign_id: str) -> list[dict]:
    c = _container()
    query = "SELECT * FROM c WHERE c.campaign_id = @cid AND c.type = 'character_draft'"
    return list(c.query_items(
        query=query,
        parameters=[{"name": "@cid", "value": campaign_id}],
        enable_cross_partition_query=False,
    ))


def delete_character_drafts_for_campaign(campaign_id: str) -> None:
    for draft in get_character_drafts_for_campaign(campaign_id):
        delete_character_draft(campaign_id, draft["email"])

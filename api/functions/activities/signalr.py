"""
SignalR broadcast activity.
Uses the Azure SignalR Service REST management API with JWT auth.
Players join a group named after their campaign_id when they connect.
"""

import json
import logging
import os
import time
import urllib.parse
import urllib.request
import jwt

logger = logging.getLogger(__name__)


def _parse_connection_string(conn_str: str) -> tuple[str, str]:
    parts = dict(kv.split("=", 1) for kv in conn_str.split(";") if "=" in kv)
    endpoint = parts["Endpoint"].rstrip("/")
    key = parts["AccessKey"]
    return endpoint, key


def _make_token(key: str, url: str) -> str:
    # Azure SignalR requires aud = exact URL being called, key used as raw string
    now = int(time.time())
    return jwt.encode({"aud": url, "iat": now, "exp": now + 3600}, key, algorithm="HS256")


def _post(url: str, token: str, body: dict) -> int:
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.status


def _send_to_users(endpoint: str, key: str, hub: str, user_ids: list, payload: dict) -> dict:
    """Send a SignalR message to each user individually by their userId (email).
    Returns {"sent": [...], "failed": [...]} so callers can log or retry."""
    sent, failed = [], []
    for user_id in user_ids:
        try:
            encoded = urllib.parse.quote(user_id, safe="")
            url = f"{endpoint}/api/v1/hubs/{hub}/users/{encoded}"
            token = _make_token(key, url)
            _post(url, token, payload)
            sent.append(user_id)
        except Exception as e:
            logger.warning("SignalR delivery failed for %s: %s", user_id, e)
            failed.append(user_id)
    return {"sent": sent, "failed": failed}


def broadcast_narrative(input_data: dict) -> None:
    """
    Broadcasts the completed round narrative to all players in the campaign.
    input_data: campaign_id, round_number, narrative, state_summary, player_emails
    """
    conn_str = os.environ["SIGNALR_CONNECTION_STRING"]
    hub = "LegendsHub"
    endpoint, key = _parse_connection_string(conn_str)

    payload = {
        "target": "narrativeUpdate",
        "arguments": [{
            "round_number": input_data["round_number"],
            "narrative": input_data["narrative"],
            "state_summary": input_data.get("state_summary", {}),
            "scene_image_url": input_data.get("scene_image_url"),
        }],
    }
    result = _send_to_users(endpoint, key, hub, input_data.get("player_emails", []), payload)
    if result["failed"]:
        logger.warning(
            "broadcast_narrative: %d of %d deliveries failed — round %s, failed: %s",
            len(result["failed"]),
            len(result["sent"]) + len(result["failed"]),
            input_data.get("round_number"),
            result["failed"],
        )
    return result


def broadcast_lobby_event(input_data: dict) -> None:
    """
    Broadcasts a lobby event (chat message, player ready, campaign launched) to
    all players in the campaign.
    input_data: campaign_id, player_emails, type, + any event fields
    """
    conn_str = os.environ["SIGNALR_CONNECTION_STRING"]
    hub = "LegendsHub"
    endpoint, key = _parse_connection_string(conn_str)

    payload = {
        "target": "lobbyEvent",
        "arguments": [input_data],
    }
    result = _send_to_users(endpoint, key, hub, input_data.get("player_emails", []), payload)
    if result["failed"]:
        logger.warning(
            "broadcast_lobby_event(%s): %d of %d deliveries failed — failed: %s",
            input_data.get("type"),
            len(result["failed"]),
            len(result["sent"]) + len(result["failed"]),
            result["failed"],
        )
    return result


def get_signalr_connection_info(input_data: dict) -> dict:
    """
    Returns the connection URL and access token for a client to connect to SignalR.
    input_data: {user_id, campaign_id}
    Called from the HTTP negotiate endpoint (not a Durable activity).
    """
    conn_str = os.environ["SIGNALR_CONNECTION_STRING"]
    hub = "LegendsHub"
    endpoint, key = _parse_connection_string(conn_str)

    user_id = input_data["user_id"]

    client_url = f"{endpoint}/client/?hub={hub}"
    now = int(time.time())
    payload = {
        "aud": client_url,
        "iat": now,
        "exp": now + 3600,
        "nameid": user_id,
    }
    access_token = jwt.encode(payload, key, algorithm="HS256")

    return {"url": client_url, "accessToken": access_token}

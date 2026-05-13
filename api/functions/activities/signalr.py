"""
SignalR broadcast activity.
Uses the Azure SignalR Service REST management API with JWT auth.
Players join a group named after their campaign_id when they connect.
"""

import json
import os
import time
import urllib.request
import jwt


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


def broadcast_narrative(input_data: dict) -> None:
    """
    Broadcasts the completed round narrative to all players in the campaign group.
    input_data:
      campaign_id, round_number, narrative, state_summary (dict)
    """
    conn_str = os.environ["SIGNALR_CONNECTION_STRING"]
    hub = "LegendsHub"
    endpoint, key = _parse_connection_string(conn_str)

    campaign_id = input_data["campaign_id"]
    url = f"{endpoint}/api/v1/hubs/{hub}/groups/{campaign_id}"
    token = _make_token(key, url)

    payload = {
        "target": "narrativeUpdate",
        "arguments": [{
            "round_number": input_data["round_number"],
            "narrative": input_data["narrative"],
            "state_summary": input_data.get("state_summary", {}),
            "scene_image_url": input_data.get("scene_image_url"),
        }],
    }
    _post(url, token, payload)


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
    campaign_id = input_data["campaign_id"]

    client_url = f"{endpoint}/client/?hub={hub}"
    now = int(time.time())
    payload = {
        "aud": client_url,
        "iat": now,
        "exp": now + 3600,
        "nameid": user_id,
        # Puts the client into their campaign group automatically on connect
        "role": [f"webpubsub.joinLeaveGroup.{campaign_id}", f"webpubsub.sendToGroup.{campaign_id}"],
    }
    access_token = jwt.encode(payload, key, algorithm="HS256")

    return {"url": client_url, "accessToken": access_token}

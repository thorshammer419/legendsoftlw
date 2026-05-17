"""
Azure Functions entry point — queue-based architecture (no Durable Functions).

Round lifecycle:
  submit-action HTTP  → stores action in Cosmos pending_actions
                      → if all players submitted: enqueues "resolve-round"
  check-timeouts      → timer every 15 min, enqueues "resolve-round" for expired deadlines
  resolve-round queue → full narrative pipeline (round_resolver.py)
  player-join queue   → catch-up + introduction flow
  novel-export queue  → PDF generation + email
"""

import azure.functions as func

from functions import webhook_http as wh
from functions.round_resolver import (
    resolve_round_from_queue,
    player_join_from_queue,
    novel_export_from_queue,
    campaign_intro_from_queue,
)

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


# ===========================================================================
# HTTP triggers
# ===========================================================================

@app.route(route="logout", methods=["GET"])
async def logout_route(req: func.HttpRequest) -> func.HttpResponse:
    # Clear the SWA session cookie directly so the browser lands on the login
    # page without being redirected through the identity provider's sign-out page.
    return func.HttpResponse(
        status_code=302,
        headers={
            "Location": "/",
            "Set-Cookie": (
                "StaticWebAppsAuthContextCookie=; "
                "path=/; domain=legendsoftlw.app; "
                "expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; "
                "Secure; HttpOnly; SameSite=None"
            ),
        },
    )


@app.route(route="me", methods=["POST", "GET"])
async def register_player(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.register_player(req)


@app.route(route="me/push-subscription", methods=["PUT"])
async def update_push_subscription(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.update_push_subscription(req)


@app.route(route="campaigns", methods=["GET"])
async def list_campaigns_route(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.list_campaigns_handler(req)


@app.route(route="campaigns", methods=["POST"])
async def create_campaign_route(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.create_campaign_handler(req)


@app.route(route="campaigns/generate-field", methods=["POST"])
async def generate_campaign_field_route(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.generate_campaign_field_handler(req)


@app.route(route="campaigns/{campaign_id}/join", methods=["POST"])
async def join_campaign_route(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.join_campaign_handler(req)


@app.route(route="campaigns/invite/{token}", methods=["GET"])
async def resolve_invite_token_route(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.resolve_invite_token_handler(req)


@app.route(route="campaigns/{campaign_id}", methods=["GET"])
async def get_campaign_route(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.get_campaign_handler(req)


@app.route(route="campaigns/{campaign_id}/state", methods=["GET"])
async def get_game_state(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.get_game_state_handler(req)


@app.route(route="campaigns/{campaign_id}/character", methods=["GET"])
async def get_character_route(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.get_character_handler(req)


@app.route(route="campaigns/{campaign_id}/character", methods=["PUT"])
async def upsert_character_route(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.upsert_character_handler(req)


@app.route(route="campaigns/{campaign_id}/submit-action", methods=["POST"])
async def submit_action(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.submit_action(req)


@app.route(route="campaigns/{campaign_id}/validate-action", methods=["POST"])
async def validate_action(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.validate_action(req)


@app.route(route="campaigns/{campaign_id}/negotiate", methods=["GET", "POST"])
async def negotiate(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.negotiate(req)


@app.route(route="campaigns/{campaign_id}/admin/start-round", methods=["POST"])
async def admin_start_round(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.admin_start_round(req)


@app.route(route="campaigns/{campaign_id}/admin/toggle-player", methods=["POST"])
async def admin_toggle_player(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.admin_toggle_player(req)


@app.route(route="campaigns/{campaign_id}/admin/export-novel", methods=["POST"])
async def admin_export_novel(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.admin_export_novel(req)


@app.route(route="campaigns/{campaign_id}/admin/settings", methods=["PATCH"])
async def admin_update_settings(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.admin_update_settings_handler(req)


@app.route(route="campaigns/{campaign_id}/admin/regenerate-invite", methods=["POST"])
async def admin_regenerate_invite(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.admin_regenerate_invite_handler(req)


@app.route(route="campaigns/{campaign_id}/lobby/message", methods=["POST"])
async def lobby_message(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.lobby_message_handler(req)


@app.route(route="campaigns/{campaign_id}/lobby/chat", methods=["GET"])
async def lobby_chat_history(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.lobby_chat_history_handler(req)


@app.route(route="campaigns/{campaign_id}/lobby/launch", methods=["POST"])
async def lobby_launch(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.lobby_launch_handler(req)


@app.route(route="campaigns/{campaign_id}/lobby/presence", methods=["POST"])
async def lobby_presence(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.lobby_presence_handler(req)


@app.route(route="campaigns/{campaign_id}", methods=["DELETE"])
async def delete_campaign(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.delete_campaign_handler(req)


@app.route(route="campaigns/{campaign_id}/leave", methods=["DELETE"])
async def leave_campaign_route(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.leave_campaign_handler(req)


@app.route(route="allowlist", methods=["GET"])
async def get_allowed_users(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.get_allowed_users_handler(req)


@app.route(route="allowlist", methods=["POST"])
async def add_allowed_user(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.add_allowed_user_handler(req)


@app.route(route="allowlist", methods=["DELETE"])
async def remove_allowed_user(req: func.HttpRequest) -> func.HttpResponse:
    return await wh.remove_allowed_user_handler(req)


# ===========================================================================
# Timer trigger — checks for expired round deadlines every 15 minutes
# ===========================================================================

@app.timer_trigger(schedule="0 */15 * * * *", arg_name="timer", run_on_startup=False)
def check_round_timeouts(timer: func.TimerRequest) -> None:
    import logging
    import json
    import base64
    import os
    from datetime import datetime, timezone
    from functions.activities.cosmos import get_all_active_campaigns, get_story_state

    logger = logging.getLogger(__name__)
    now = datetime.now(timezone.utc)

    def enqueue(campaign_id: str):
        from azure.storage.queue import QueueClient
        conn_str = os.environ["AzureWebJobsStorage"]
        q = QueueClient.from_connection_string(conn_str, "resolve-round")
        try:
            q.create_queue()
        except Exception:
            pass
        msg = base64.b64encode(json.dumps({"campaign_id": campaign_id, "reason": "timeout"}).encode()).decode()
        q.send_message(msg)

    try:
        campaigns = get_all_active_campaigns()
    except Exception as e:
        logger.error("Failed to get active campaigns: %s", e)
        return

    for campaign in campaigns:
        cid = campaign.get("campaign_id")
        try:
            state = get_story_state(cid)
            if state.get("round_status") == "resolving":
                continue
            deadline_str = state.get("round_deadline")
            if not deadline_str:
                continue
            deadline = datetime.fromisoformat(deadline_str.replace("Z", "+00:00"))
            if now >= deadline:
                logger.info("Timeout expired for campaign %s, triggering resolution", cid)
                enqueue(cid)
        except Exception as e:
            logger.error("Timeout check failed for campaign %s: %s", cid, e)


# ===========================================================================
# Queue triggers — background processing
# ===========================================================================

@app.queue_trigger(arg_name="msg", queue_name="resolve-round",
                   connection="AzureWebJobsStorage")
def process_round_queue(msg: func.QueueMessage) -> None:
    resolve_round_from_queue(msg)


@app.queue_trigger(arg_name="msg", queue_name="player-join",
                   connection="AzureWebJobsStorage")
def process_join_queue(msg: func.QueueMessage) -> None:
    player_join_from_queue(msg)


@app.queue_trigger(arg_name="msg", queue_name="novel-export",
                   connection="AzureWebJobsStorage")
def process_novel_queue(msg: func.QueueMessage) -> None:
    novel_export_from_queue(msg)


@app.queue_trigger(arg_name="msg", queue_name="campaign-intro",
                   connection="AzureWebJobsStorage")
def process_intro_queue(msg: func.QueueMessage) -> None:
    campaign_intro_from_queue(msg)


@app.queue_trigger(arg_name="msg", queue_name="lobby-leave-announce",
                   connection="AzureWebJobsStorage")
def process_lobby_leave_queue(msg: func.QueueMessage) -> None:
    import json, base64
    data = json.loads(base64.b64decode(msg.get_body()).decode())
    wh.process_lobby_leave_queue(data)

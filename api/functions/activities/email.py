"""
Email notification activity via Azure Communication Services.
"""

import os
from azure.communication.email import EmailClient


def _client():
    return EmailClient.from_connection_string(os.environ["COMMS_CONNECTION_STRING"])


def send_round_notifications(input_data: dict) -> None:
    """
    Sends "new round" email to all active players who have email notifications enabled.
    input_data:
      campaign_players: list[dict]  (full campaign_player docs)
      campaign_name: str
      campaign_id: str
    """
    campaign_name = input_data["campaign_name"]
    campaign_id = input_data["campaign_id"]
    recipients = [
        cp["email"] for cp in input_data["campaign_players"]
        if cp.get("status") == "active" and cp.get("notifications", {}).get("email", True)
    ]
    if not recipients:
        return

    _send_email(
        to=recipients,
        subject=f"[{campaign_name}] A new round has begun!",
        body=(
            f"Your party awaits your next move in {campaign_name}.\n\n"
            f"Head to https://legendsoftlw.app/game/{campaign_id} to submit your action."
        ),
    )


def send_reminder_notification(input_data: dict) -> None:
    """2-hour warning to players who haven't submitted yet."""
    campaign_name = input_data["campaign_name"]
    campaign_id = input_data["campaign_id"]
    recipients = input_data.get("emails", [])
    if not recipients:
        return

    _send_email(
        to=recipients,
        subject=f"[{campaign_name}] Round resolves in 2 hours — submit your action!",
        body=(
            f"The round in {campaign_name} resolves in approximately 2 hours.\n\n"
            f"Submit your action at https://legendsoftlw.app/game/{campaign_id}"
        ),
    )


def send_player_inactive_notification(input_data: dict) -> None:
    email = input_data["email"]
    campaign_name = input_data["campaign_name"]
    campaign_id = input_data["campaign_id"]
    _send_email(
        to=[email],
        subject=f"[{campaign_name}] You've been marked inactive",
        body=(
            f"You've been marked inactive in {campaign_name} due to missed rounds.\n\n"
            f"Ask the campaign admin to reactivate you, or visit "
            f"https://legendsoftlw.app/game/{campaign_id}"
        ),
    )


def send_player_reactivated_notification(input_data: dict) -> None:
    email = input_data["email"]
    campaign_name = input_data["campaign_name"]
    campaign_id = input_data["campaign_id"]
    _send_email(
        to=[email],
        subject=f"[{campaign_name}] You've been reactivated — welcome back!",
        body=(
            f"Great news — you've been reactivated in {campaign_name}.\n\n"
            f"Rejoin the adventure at https://legendsoftlw.app/game/{campaign_id}"
        ),
    )


def send_novel_export_notification(input_data: dict) -> None:
    recipients = input_data["emails"]
    campaign_name = input_data["campaign_name"]
    download_url = input_data["download_url"]
    _send_email(
        to=recipients,
        subject=f"[{campaign_name}] Your campaign novel is ready!",
        body=(
            f"The {campaign_name} campaign has been transformed into a fantasy novel.\n\n"
            f"Download your novel here:\n{download_url}\n\n"
            f"(Link expires in 7 days)"
        ),
    )


def send_campaign_paused_notification(input_data: dict) -> None:
    recipients = input_data["emails"]
    campaign_name = input_data["campaign_name"]
    reason = input_data.get("reason", "all players are inactive")
    _send_email(
        to=recipients,
        subject=f"[{campaign_name}] Campaign paused",
        body=f"The {campaign_name} campaign has been paused because {reason}.\n\nThe adventure will resume when a player reactivates.",
    )


def _send_email(to: list[str], subject: str, body: str) -> None:
    sender = os.environ["COMMS_SENDER_EMAIL"]
    client = _client()

    message = {
        "senderAddress": sender,
        "recipients": {"to": [{"address": addr} for addr in to]},
        "content": {"subject": subject, "plainText": body},
    }

    poller = client.begin_send(message)
    poller.result()

"""
Web Push notification activity using VAPID keys.
Requires VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY in environment variables.
These are generated once with: python -c "from pywebpush import Vapid; v=Vapid(); v.generate_keys(); print(v.private_key, v.public_key)"
"""

import json
import os
from pywebpush import webpush, WebPushException


def _vapid_claims():
    return {"sub": f"mailto:{os.environ.get('COMMS_SENDER_EMAIL', 'noreply@legendsoftlw.app')}"}


def send_push(input_data: dict) -> None:
    """
    input_data:
      subscription: {endpoint, keys: {p256dh, auth}}
      title: str
      body: str
    """
    subscription = input_data["subscription"]
    if not subscription or not subscription.get("endpoint"):
        return

    private_key = os.environ.get("VAPID_PRIVATE_KEY")
    if not private_key:
        return

    payload = json.dumps({"title": input_data["title"], "body": input_data["body"]})

    try:
        webpush(
            subscription_info=subscription,
            data=payload,
            vapid_private_key=private_key,
            vapid_claims=_vapid_claims(),
        )
    except WebPushException:
        pass


def send_round_push_notifications(input_data: dict) -> None:
    """
    input_data:
      campaign_players: list[dict]
      campaign_name: str
    """
    campaign_name = input_data["campaign_name"]
    for cp in input_data["campaign_players"]:
        notif = cp.get("notifications", {})
        sub = notif.get("push_subscription") if notif.get("push") else None
        if not sub:
            continue
        send_push({
            "subscription": sub,
            "title": campaign_name,
            "body": "A new round has begun — submit your action!",
        })

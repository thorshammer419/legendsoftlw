"""
Contextual action list generation activity — GPT-4.1-mini.
Generates up to 5 situational action suggestions per player per round.
"""

import json
import os
from openai import AzureOpenAI
from helpers.prompt_builder import build_action_list_prompt
from functions.activities.cosmos import save_action_list


def _openai():
    return AzureOpenAI(
        azure_endpoint=os.environ["OPENAI_ENDPOINT"],
        api_key=os.environ["OPENAI_API_KEY"],
        api_version="2024-02-01",
    )


def generate_and_save_action_list(input_data: dict) -> list:
    """
    input_data:
      campaign_id, email, character, scene, action_economy
    Generates action list, saves to Cosmos, and returns it.
    """
    character = input_data["character"]
    scene = input_data.get("scene", {})
    action_economy = input_data.get("action_economy", {})
    conditions = character.get("conditions", [])

    messages = build_action_list_prompt(character, scene, conditions, action_economy)

    client = _openai()
    response = client.chat.completions.create(
        model=os.environ["OPENAI_MINI_DEPLOYMENT"],
        messages=messages,
        temperature=0.3,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content.strip()
    parsed = json.loads(raw)

    if isinstance(parsed, list):
        action_list = parsed
    else:
        action_list = list(parsed.values())[0] if parsed else []

    action_list = action_list[:5]

    save_action_list({
        "campaign_id": input_data["campaign_id"],
        "email": input_data["email"],
        "action_list": action_list,
    })

    return action_list

"""
NPC / player introduction narrative — GPT-4.1.
Generates a cinematic introduction when a new player joins mid-campaign.
"""

import os
from openai import AzureOpenAI
from helpers.prompt_builder import build_npc_introduction_prompt


def _openai():
    return AzureOpenAI(
        azure_endpoint=os.environ["OPENAI_ENDPOINT"],
        api_key=os.environ["OPENAI_API_KEY"],
        api_version="2024-02-01",
    )


def generate_player_introduction(input_data: dict) -> str:
    """
    input_data:
      scene: dict
      new_character: dict  (full character doc)
      existing_party: list[dict]
      recent_narrative: str
    Returns the introduction narrative string (broadcast to all players).
    """
    messages = build_npc_introduction_prompt(
        scene=input_data.get("scene", {}),
        new_character=input_data["new_character"],
        existing_party=input_data.get("existing_party", []),
        recent_narrative=input_data.get("recent_narrative", ""),
    )

    client = _openai()
    response = client.chat.completions.create(
        model=os.environ["OPENAI_NARRATIVE_DEPLOYMENT"],
        messages=messages,
        temperature=0.85,
        max_tokens=600,
    )
    return response.choices[0].message.content.strip()

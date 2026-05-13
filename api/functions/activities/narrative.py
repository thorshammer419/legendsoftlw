"""
Narrative generation activity — GPT-4.1.
"""

import os
from openai import AzureOpenAI
from helpers.prompt_builder import build_narrative_prompt


def _openai():
    return AzureOpenAI(
        azure_endpoint=os.environ["OPENAI_ENDPOINT"],
        api_key=os.environ["OPENAI_API_KEY"],
        api_version="2024-02-01",
    )


def generate_narrative(input_data: dict) -> str:
    """
    input_data:
      campaign_id, party_name, legend_context, story_state,
      active_npcs, characters, srd_chunks, player_actions,
      active_player_emails, inactive_player_emails
    Returns the full DM narrative string.
    """
    messages = build_narrative_prompt(
        party_name=input_data["party_name"],
        legend_context=input_data.get("legend_context", {}),
        story_state=input_data["story_state"],
        active_npcs=input_data.get("active_npcs", []),
        characters=input_data["characters"],
        narrative_summary=input_data.get("narrative_summary", ""),
        srd_chunks=input_data.get("srd_chunks", ""),
        player_actions=input_data["player_actions"],
        active_player_emails=input_data["active_player_emails"],
        inactive_player_emails=input_data.get("inactive_player_emails", []),
    )

    client = _openai()
    response = client.chat.completions.create(
        model=os.environ["OPENAI_NARRATIVE_DEPLOYMENT"],
        messages=messages,
        temperature=0.85,
        max_tokens=1500,
    )
    return response.choices[0].message.content.strip()

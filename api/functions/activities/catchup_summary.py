"""
Catch-up summary — GPT-4.1-mini.
"Previously in your adventure..." shown only to the joining/returning player.
"""

import json
import os

from helpers.llm import openai_client


def generate_catchup_summary(input_data: dict) -> str:
    """
    input_data:
      story_state: dict
      narrative_history: str
      character: dict
    Returns the catch-up summary string.
    """
    story_state = input_data["story_state"]
    narrative_history = input_data.get("narrative_history", "")
    character = input_data["character"]

    system = """You are a D&D 5e storyteller writing a "Previously in your adventure..." summary for a player who is joining or returning to an ongoing campaign. Write 2-3 paragraphs in an engaging narrative style. Cover the most important events, the current situation, and what the party is trying to accomplish. Do not reference game mechanics. Write as if narrating a fantasy story."""

    user = f"""[STORY STATE]
{json.dumps(story_state, indent=2)}

[NARRATIVE HISTORY]
{narrative_history}

[CHARACTER JOINING]
{character.get('name')} — {character.get('class')} — {character.get('backstory_summary', '')}"""

    response = openai_client().chat.completions.create(
        model=os.environ["OPENAI_MINI_DEPLOYMENT"],
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.7,
        max_tokens=500,
    )
    return response.choices[0].message.content.strip()

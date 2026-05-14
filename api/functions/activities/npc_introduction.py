"""
Player introduction narrative — GPT-4.1.
Cinematic introduction when a new player joins mid-campaign.
"""

import json
import os

from helpers.character import abbreviated_sheet
from helpers.llm import openai_client


def generate_player_introduction(input_data: dict) -> str:
    """
    input_data:
      scene: dict
      new_character: dict
      existing_party: list[dict]
      recent_narrative: str
    Returns the introduction narrative string.
    """
    scene = input_data.get("scene", {})
    new_character = input_data["new_character"]
    existing_party = input_data.get("existing_party", [])
    recent_narrative = input_data.get("recent_narrative", "")

    scene_str = json.dumps(scene, indent=2) if scene else "{}"
    new_char_sheet = json.dumps(abbreviated_sheet(new_character), indent=2)
    party_sheets = json.dumps([abbreviated_sheet(c) for c in existing_party], indent=2)

    system = """You are a Dungeon Master narrating a D&D 5e campaign. A new character is joining the party mid-adventure. Write a cinematic 2-3 paragraph introduction in the style of a fantasy novel. The introduction should:
- Fit naturally into the current scene
- Reveal the character through action and detail, not just description
- End with the character making contact with the existing party
- Feel like a chapter opening in a Tolkien or George R.R. Martin novel
- Never break immersion or reference game mechanics"""

    user = f"""[CURRENT SCENE]
{scene_str}

[NEW CHARACTER]
{new_char_sheet}

[EXISTING PARTY]
{party_sheets}

[RECENT NARRATIVE]
{recent_narrative}"""

    response = openai_client().chat.completions.create(
        model=os.environ["OPENAI_NARRATIVE_DEPLOYMENT"],
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.85,
        max_tokens=600,
    )
    return response.choices[0].message.content.strip()

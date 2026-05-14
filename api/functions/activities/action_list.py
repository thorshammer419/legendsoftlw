"""
Contextual action list generation — GPT-4.1-mini.
Generates up to 5 situational action suggestions per player per round.
"""

import json
import os

from helpers.character import abbreviated_sheet
from helpers.llm import openai_client
from functions.activities.cosmos import save_action_list


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

    sheet = abbreviated_sheet(character)
    scene_str = json.dumps(scene, indent=2) if scene else "{}"

    system = """You are a D&D 5e rules assistant. Given a player's character sheet and the current scene, generate a list of situationally relevant actions available to this player this round.

Rules:
- Only suggest actions the character can actually perform given their class, level, remaining spell slots, and current conditions
- Only suggest actions relevant to the current scene
- Do not include basic actions already in the static list (Attack, Dodge, Dash, Disengage, Help, Hide, Grapple, Shove, Investigate, Perception, Persuasion, Deception, Intimidation, Athletics, Stealth)
- Maximum 5 suggestions
- Respond ONLY with a JSON array, no preamble

[FORMAT]
[
  {
    "action": "Cast Fireball",
    "type": "spell",
    "dice": [{"die": "d6", "count": 8, "purpose": "damage"}],
    "spell_slot": 3,
    "description": "8d6 fire damage in 20ft radius, DEX save DC 15",
    "requires_target": true,
    "target_type": "area"
  }
]"""

    user = f"""[CHARACTER SHEET]
{json.dumps(sheet, indent=2)}

[CURRENT SCENE]
{scene_str}

[CURRENT CONDITIONS]
{json.dumps(conditions)}

[ACTION ECONOMY]
{json.dumps(action_economy, indent=2)}"""

    response = openai_client().chat.completions.create(
        model=os.environ["OPENAI_MINI_DEPLOYMENT"],
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.3,
        response_format={"type": "json_object"},
    )

    parsed = json.loads(response.choices[0].message.content.strip())
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

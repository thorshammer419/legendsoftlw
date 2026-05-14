"""
Freeform action pre-validation — GPT-4.1-mini.
Called synchronously from an HTTP trigger. Supports multi-turn DM back-and-forth.
"""

import json
import os

from helpers.character import abbreviated_sheet
from helpers.llm import openai_client


def validate_freeform_action(input_data: dict) -> dict:
    """
    input_data:
      character: dict
      scene: dict
      action_text: str
      conversation_history: list[dict]  (prior turns, may be empty)
    Returns {valid, dm_response, required_rolls}.
    """
    character = input_data["character"]
    scene = input_data.get("scene", {})
    action_text = input_data["action_text"]
    conversation_history = input_data.get("conversation_history")

    sheet = abbreviated_sheet(character)
    scene_str = json.dumps(scene, indent=2) if scene else "{}"

    system = f"""You are a D&D 5e Dungeon Master validating a player's intended action before the round resolves. Determine if the action is valid given the character's abilities and the current scene. If valid, determine what dice rolls are required. Respond ONLY with a JSON object.

[FORMAT — Valid action]
{{
  "valid": true,
  "dm_response": "Narrative response explaining what rolls are needed",
  "required_rolls": [
    {{
      "description": "Roll description",
      "die": "d20",
      "count": 1,
      "modifier_type": "strength",
      "dc": 15
    }}
  ]
}}

[FORMAT — Invalid action]
{{
  "valid": false,
  "dm_response": "Explanation of why this action is not possible",
  "required_rolls": []
}}

[CHARACTER SHEET]
{json.dumps(sheet, indent=2)}

[CURRENT SCENE]
{scene_str}"""

    messages = [{"role": "system", "content": system}]
    if conversation_history:
        messages.extend(conversation_history)
    messages.append({"role": "user", "content": f"[PROPOSED ACTION]\n{action_text}"})

    response = openai_client().chat.completions.create(
        model=os.environ["OPENAI_MINI_DEPLOYMENT"],
        messages=messages,
        temperature=0,
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content.strip())

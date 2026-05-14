"""
State extraction — GPT-4.1-mini.
Owns the state-extraction prompt, LLM call, and JSON parsing.
"""

import json
import os

from helpers.llm import openai_client


def extract_state(input_data: dict) -> dict:
    """
    input_data:
      narrative: str
      current_state: dict
    Returns the parsed state update dict.
    """
    narrative = input_data["narrative"]
    current_state = input_data["current_state"]

    system = """You are a D&D 5e rules assistant. Extract all game state changes from the provided DM narrative. Respond ONLY with a valid JSON object. No preamble, no markdown, no explanation.

[FORMAT]
{
  "scene_type": "combat | exploration | social | rest",
  "current_scene": {
    "location": "updated location if changed",
    "description": "updated scene description",
    "active_npcs": ["list of npcs still present"],
    "threats": ["updated threat list"],
    "exits": ["updated exits"]
  },
  "quest": {
    "completed_milestones": ["any newly completed milestones"],
    "failed_milestones": ["any newly failed milestones"]
  },
  "player_updates": [
    {
      "email": "player@example.com",
      "hp_change": 0,
      "conditions_added": [],
      "conditions_removed": [],
      "spell_slots_used": {},
      "class_feature_uses": {}
    }
  ],
  "npc_updates": [
    {
      "npc_id": "npc_campaign123_name",
      "hp_change": 0,
      "status_change": null,
      "location_change": null,
      "abilities_used": [],
      "legendary_resistances_used": 0,
      "relationship_changes": [],
      "interaction_log_entry": {
        "round": 0,
        "scene": "",
        "scene_type": "",
        "summary": "",
        "players_involved": [],
        "outcome": ""
      }
    }
  ],
  "new_npcs": [],
  "narrative_summary_append": "One paragraph prose summary of this round",
  "campaign_complete": false
}"""

    user = f"""[NARRATIVE]
{narrative}

[CURRENT STATE]
{json.dumps(current_state, indent=2)}"""

    response = openai_client().chat.completions.create(
        model=os.environ["OPENAI_MINI_DEPLOYMENT"],
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0,
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content.strip())

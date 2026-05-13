"""
Builds message lists for every LLM call in the system.
All templates mirror docs/llm-prompts.md exactly.
"""

import json


def _abbreviated_sheet(char: dict) -> dict:
    return {
        "name": char.get("name"),
        "race": char.get("race"),
        "class": char.get("class"),
        "level": char.get("level"),
        "hp": char.get("hp"),
        "armor_class": char.get("armor_class"),
        "ability_scores": char.get("ability_scores"),
        "saving_throws": {
            k: v["bonus"] for k, v in (char.get("saving_throws") or {}).items()
            if v.get("proficient")
        },
        "skill_bonuses": {
            k: v["bonus"] for k, v in (char.get("skills") or {}).items()
            if v.get("proficient")
        },
        "attack_bonus": char.get("attack_bonus"),
        "damage_dice": char.get("damage_dice"),
        "spell_slots": char.get("spell_slots"),
        "spells_known": [s.get("name") for s in (char.get("spells_known") or [])],
        "class_features": [f.get("name") for f in (char.get("class_features") or [])],
        "conditions": char.get("conditions", []),
        "equipment": [e["name"] for e in (char.get("equipment") or []) if e.get("equipped")],
        "backstory_summary": char.get("backstory_summary"),
    }


def _format_action(email: str, char: dict, action: dict) -> str:
    name = char.get("name", email)
    race = char.get("race", "")
    cls = char.get("class", "")
    text = action.get("text", "")
    rolls = action.get("rolls", [])
    roll_str = ", ".join(
        f"{r['description']}: {r['result']}" for r in rolls
    ) if rolls else ""
    if roll_str:
        return f"- {name} ({race} {cls}): \"{text}\" [{roll_str}]"
    return f"- {name} ({race} {cls}): \"{text}\""


def build_narrative_prompt(
    party_name: str,
    legend_context: dict,
    story_state: dict,
    active_npcs: list[dict],
    characters: list[dict],
    narrative_summary: str,
    srd_chunks: str,
    player_actions: dict,
    active_player_emails: list[str],
    inactive_player_emails: list[str],
) -> list[dict]:
    char_by_email = {c["email"]: c for c in characters}

    legend_block = ""
    if legend_context and legend_context.get("previous_campaign_name"):
        events = "\n".join(f"- {e}" for e in legend_context.get("key_events", []))
        legend_block = (
            f"The party previously completed {legend_context['previous_campaign_name']}.\n"
            f"Key events:\n{events}"
        )

    npc_block = ""
    if active_npcs:
        npc_parts = []
        for npc in active_npcs:
            log = npc.get("interaction_log", [])[-3:]
            log_str = "\n".join(
                f"  Round {e['round']}: {e['summary']}" for e in log
            )
            npc_parts.append(
                f"{npc['name']} ({npc.get('npc_type', 'npc')}, {npc.get('status', 'alive')}):\n{log_str}"
            )
        npc_block = "\n\n".join(npc_parts)

    sheet_block = json.dumps(
        [_abbreviated_sheet(c) for c in characters if c["email"] in active_player_emails],
        indent=2
    )

    action_lines = []
    for email in active_player_emails:
        char = char_by_email.get(email, {})
        if email in player_actions:
            action_lines.append(_format_action(email, char, player_actions[email]))
        else:
            name = char.get("name", email)
            action_lines.append(
                f"- {name}: [gracefully skipped — did not act this round, hangs back]"
            )
    action_block = "\n".join(action_lines)

    inactive_names = [
        char_by_email[e].get("name", e) for e in inactive_player_emails if e in char_by_email
    ]

    system = f"""You are a Dungeon Master running a D&D 5e campaign. Your tone is dramatic and immersive. You follow D&D 5e SRD 5.1 rules strictly for combat, skill checks, and spell casting. You never break character. You address players by their character names. You end every response with a clear prompt for the party's next action.

The party's adventuring group is called {party_name}.

{legend_block}

[STORY STATE]
{json.dumps(story_state, indent=2)}

[ACTIVE NPCS]
{npc_block}

[CHARACTER SHEETS]
{sheet_block}

[NARRATIVE HISTORY]
{narrative_summary}

[SRD RULES REFERENCE]
{srd_chunks}"""

    user = f"""[CURRENT ROUND ACTIONS]
{action_block}

[DM INSTRUCTIONS]
Resolve all submitted actions using the SRD rules reference provided. Narrate dice outcomes dramatically. Advance the scene. Update any conditions or quest milestones that changed. End with the new scene description and a clear prompt for what the party does next.

Inactive players: {', '.join(inactive_names) if inactive_names else 'none'}
Do not address, interact with, or make these characters important to the current scene."""

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def build_state_extract_prompt(narrative: str, current_state: dict) -> list[dict]:
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

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def build_rag_query_prompt(player_actions: dict, scene: dict) -> list[dict]:
    action_lines = "\n".join(
        f"- {email}: {action.get('text', '')}" for email, action in player_actions.items()
    )
    scene_brief = scene.get("description", "") if scene else ""

    system = """You are a D&D 5e rules assistant. Analyze the submitted player actions and identify what SRD rules, spells, monsters, or equipment need to be looked up to resolve them accurately.

Respond ONLY with a JSON array of query objects. Maximum 5 queries. No preamble, no markdown, no explanation.

[FORMAT]
[
  {
    "query": "Fireball spell description and damage",
    "category": "spell",
    "tags": ["wizard", "aoe", "fire"]
  }
]

Categories: "spell" | "monster" | "class" | "rule" | "equipment" | "condition" """

    user = f"""[PLAYER ACTIONS THIS ROUND]
{action_lines}

[CURRENT SCENE]
{scene_brief}"""

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def build_action_list_prompt(
    character: dict,
    scene: dict,
    conditions: list[str],
    action_economy: dict,
) -> list[dict]:
    sheet = _abbreviated_sheet(character)
    scene_str = json.dumps(scene, indent=2) if scene else "{}"
    economy_str = json.dumps(action_economy, indent=2)

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
{economy_str}"""

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def build_freeform_validator_prompt(
    character: dict,
    scene: dict,
    action_text: str,
    conversation_history: list[dict] | None = None,
) -> list[dict]:
    sheet = _abbreviated_sheet(character)
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
    return messages


def build_npc_introduction_prompt(
    scene: dict,
    new_character: dict,
    existing_party: list[dict],
    recent_narrative: str,
) -> list[dict]:
    scene_str = json.dumps(scene, indent=2) if scene else "{}"
    new_char_sheet = json.dumps(_abbreviated_sheet(new_character), indent=2)
    party_sheets = json.dumps([_abbreviated_sheet(c) for c in existing_party], indent=2)

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

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def build_catchup_summary_prompt(
    story_state: dict,
    narrative_history: str,
    character: dict,
) -> list[dict]:
    system = """You are a D&D 5e storyteller writing a "Previously in your adventure..." summary for a player who is joining or returning to an ongoing campaign. Write 2-3 paragraphs in an engaging narrative style. Cover the most important events, the current situation, and what the party is trying to accomplish. Do not reference game mechanics. Write as if narrating a fantasy story."""

    user = f"""[STORY STATE]
{json.dumps(story_state, indent=2)}

[NARRATIVE HISTORY]
{narrative_history}

[CHARACTER JOINING]
{character.get('name')} — {character.get('class')} — {character.get('backstory_summary', '')}"""

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def build_novel_export_prompt(
    party_name: str,
    campaign_name: str,
    character_names: list[str],
    narrative_history: str,
    quest_milestones: list[str],
    npc_logs: str,
) -> list[dict]:
    names_str = ", ".join(character_names)
    milestones_str = "\n".join(f"- {m}" for m in quest_milestones)

    system = f"""You are a fantasy novelist. Rewrite the provided D&D campaign narrative as a polished fantasy novel. Requirements:
- Organize into chapters based on major story arcs
- Write in the style of a published fantasy novel (Tolkien, Sanderson, Martin)
- Preserve all major events, character moments, and plot developments
- Remove all game mechanics references (no "rolled a 17", no "spell slots")
- Refer to characters by their names throughout
- Write an epilogue describing what became of each character after the adventure
- Generate evocative chapter titles
- Begin with a prologue that sets the world and stakes

Party name: {party_name}
Campaign name: {campaign_name}
Players (character names): {names_str}"""

    user = f"""[FULL NARRATIVE HISTORY]
{narrative_history}

[KEY EVENTS]
{milestones_str}

[NPC INTERACTION SUMMARIES]
{npc_logs}"""

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def build_welcome_back_prompt(
    scene: dict,
    narrative_summary: str,
    party_members: list[dict],
) -> list[dict]:
    party_str = ", ".join(
        f"{m.get('name')} the {m.get('class')}" for m in party_members
    )
    scene_str = json.dumps(scene, indent=2) if scene else "{}"

    system = """You are a D&D 5e Dungeon Master welcoming a group of adventurers back to a campaign that has been paused. Write a short, evocative "welcome back" narrative (1-2 paragraphs) that:
- Reminds the party where they are and what they're doing
- Sets the mood for resuming the adventure
- Does not repeat the full story history
- Ends with a clear prompt for the party's first action"""

    user = f"""[CURRENT SCENE]
{scene_str}

[NARRATIVE SUMMARY]
{narrative_summary}

[PARTY]
{party_str}"""

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]

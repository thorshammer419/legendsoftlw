"""
Narrative generation — GPT-4.1.
Owns the DM narrative prompt, LLM call, and returns the narrative string.
"""

import json
import os

from helpers.character import abbreviated_sheet, format_action
from helpers.llm import openai_client


def generate_narrative(input_data: dict) -> str:
    """
    input_data:
      campaign_id, party_name, legend_context, story_state,
      active_npcs, characters, srd_chunks, player_actions,
      active_player_emails, inactive_player_emails
    Returns the full DM narrative string.
    """
    party_name = input_data["party_name"]
    legend_context = input_data.get("legend_context", {})
    story_state = input_data["story_state"]
    active_npcs = input_data.get("active_npcs", [])
    characters = input_data["characters"]
    narrative_summary = input_data.get("narrative_summary", "")
    srd_chunks = input_data.get("srd_chunks", "")
    player_actions = input_data["player_actions"]
    active_player_emails = input_data["active_player_emails"]
    inactive_player_emails = input_data.get("inactive_player_emails", [])

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
            log_str = "\n".join(f"  Round {e['round']}: {e['summary']}" for e in log)
            npc_parts.append(
                f"{npc['name']} ({npc.get('npc_type', 'npc')}, {npc.get('status', 'alive')}):\n{log_str}"
            )
        npc_block = "\n\n".join(npc_parts)

    sheet_block = json.dumps(
        [abbreviated_sheet(c) for c in characters if c["email"] in active_player_emails],
        indent=2,
    )

    action_lines = []
    for email in active_player_emails:
        char = char_by_email.get(email, {})
        if email in player_actions:
            action_lines.append(format_action(email, char, player_actions[email]))
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

    response = openai_client().chat.completions.create(
        model=os.environ["OPENAI_NARRATIVE_DEPLOYMENT"],
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.85,
        max_tokens=1500,
    )
    return response.choices[0].message.content.strip()

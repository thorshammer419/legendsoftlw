"""
Campaign opening narrative — GPT-4.1.
Generates the DM's opening introduction when a new campaign begins.
"""

import os
from openai import AzureOpenAI


def _openai():
    return AzureOpenAI(
        azure_endpoint=os.environ["OPENAI_ENDPOINT"],
        api_key=os.environ["OPENAI_API_KEY"],
        api_version="2024-02-01",
    )


def generate_campaign_intro(input_data: dict) -> str:
    """
    input_data:
      campaign_name: str
      party_name: str
      story_state: dict
      characters: list[dict]
    Returns the opening DM narrative string.
    """
    campaign_name = input_data.get("campaign_name", "")
    party_name = input_data.get("party_name", "The Adventurers")
    story_state = input_data.get("story_state", {})
    characters = input_data.get("characters", [])

    scene = story_state.get("current_scene", {})
    quest = story_state.get("quest", {})

    char_lines = []
    for ch in characters:
        name = ch.get("name", "Unknown")
        race = ch.get("race", "")
        cls = ch.get("class", "")
        appearance = ch.get("appearance", "")
        line = f"- {name}, {race} {cls}"
        if appearance:
            line += f": {appearance}"
        char_lines.append(line)
    char_list = "\n".join(char_lines) or "The party is still assembling."

    location = scene.get("location", "an unknown place")
    scene_desc = scene.get("description", "")
    objective = quest.get("main_objective", "")

    user_prompt = f"""You are the Dungeon Master opening a new D&D 5e campaign called "{campaign_name}".

Party: {party_name}
Location: {location}
Scene context: {scene_desc}
Main objective: {objective}

Characters present:
{char_list}

Write an immersive opening narrative (3-4 paragraphs) that:
1. Sets the scene with rich sensory detail — sights, sounds, smells, atmosphere
2. Establishes the situation and what brought the party to this moment
3. Introduces each character to the group through their visible appearance and bearing only — no backstory or personal history
4. Closes with a moment of tension, wonder, or anticipation that signals adventure is about to begin

Write in second person ("You find yourselves...") or vivid third person. Be epic. Be immersive."""

    client = _openai()
    response = client.chat.completions.create(
        model=os.environ["OPENAI_NARRATIVE_DEPLOYMENT"],
        messages=[
            {"role": "system", "content": "You are a master Dungeon Master with a talent for vivid, atmospheric storytelling."},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.9,
        max_tokens=1200,
    )
    return response.choices[0].message.content.strip()

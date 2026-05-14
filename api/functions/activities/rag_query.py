"""
RAG query generation — GPT-4.1-mini.
Analyzes player actions and produces up to 5 SRD search queries.
"""

import json
import os

from helpers.llm import openai_client


def generate_rag_queries(input_data: dict) -> list[dict]:
    """
    input_data:
      player_actions: dict  {email: {text, rolls}}
      scene: dict
    Returns list of {query, category, tags} objects (max 5).
    """
    player_actions = input_data["player_actions"]
    scene = input_data.get("scene", {})

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

    response = openai_client().chat.completions.create(
        model=os.environ["OPENAI_MINI_DEPLOYMENT"],
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0,
        response_format={"type": "json_object"},
    )

    parsed = json.loads(response.choices[0].message.content.strip())
    if isinstance(parsed, list):
        queries = parsed
    else:
        queries = parsed.get("queries", list(parsed.values())[0] if parsed else [])
    return queries[:5]

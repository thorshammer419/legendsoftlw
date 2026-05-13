"""
RAG query generation activity.
GPT-4.1-mini analyzes player actions and produces up to 5 SRD search queries.
"""

import json
import os
from openai import AzureOpenAI
from helpers.prompt_builder import build_rag_query_prompt


def _openai():
    return AzureOpenAI(
        azure_endpoint=os.environ["OPENAI_ENDPOINT"],
        api_key=os.environ["OPENAI_API_KEY"],
        api_version="2024-02-01",
    )


def generate_rag_queries(input_data: dict) -> list[dict]:
    """
    input_data:
      player_actions: dict  {email: {text, rolls}}
      scene: dict
    Returns list of {query, category, tags} objects (max 5).
    """
    player_actions = input_data["player_actions"]
    scene = input_data.get("scene", {})

    messages = build_rag_query_prompt(player_actions, scene)

    client = _openai()
    response = client.chat.completions.create(
        model=os.environ["OPENAI_MINI_DEPLOYMENT"],
        messages=messages,
        temperature=0,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content.strip()
    parsed = json.loads(raw)

    # Model may return {"queries": [...]} or a bare list
    if isinstance(parsed, list):
        queries = parsed
    else:
        queries = parsed.get("queries", list(parsed.values())[0] if parsed else [])

    return queries[:5]

"""
Freeform action pre-validation — GPT-4.1-mini.
Called synchronously from an HTTP trigger (not a Durable activity).
Supports multi-turn conversation for the DM back-and-forth flow.
"""

import json
import os
from openai import AzureOpenAI
from helpers.prompt_builder import build_freeform_validator_prompt


def _openai():
    return AzureOpenAI(
        azure_endpoint=os.environ["OPENAI_ENDPOINT"],
        api_key=os.environ["OPENAI_API_KEY"],
        api_version="2024-02-01",
    )


def validate_freeform_action(input_data: dict) -> dict:
    """
    input_data:
      character: dict
      scene: dict
      action_text: str
      conversation_history: list[dict]  (prior turns, may be empty)
    Returns {valid, dm_response, required_rolls}.
    """
    messages = build_freeform_validator_prompt(
        character=input_data["character"],
        scene=input_data.get("scene", {}),
        action_text=input_data["action_text"],
        conversation_history=input_data.get("conversation_history"),
    )

    client = _openai()
    response = client.chat.completions.create(
        model=os.environ["OPENAI_MINI_DEPLOYMENT"],
        messages=messages,
        temperature=0,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content.strip()
    return json.loads(raw)

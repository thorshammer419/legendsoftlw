"""
State extraction activity — GPT-4.1-mini.
Parses the DM narrative into structured JSON state updates.
"""

import json
import os
from openai import AzureOpenAI
from helpers.prompt_builder import build_state_extract_prompt


def _openai():
    return AzureOpenAI(
        azure_endpoint=os.environ["OPENAI_ENDPOINT"],
        api_key=os.environ["OPENAI_API_KEY"],
        api_version="2024-02-01",
    )


def extract_state(input_data: dict) -> dict:
    """
    input_data:
      narrative: str
      current_state: dict
    Returns the parsed state update dict.
    """
    messages = build_state_extract_prompt(
        narrative=input_data["narrative"],
        current_state=input_data["current_state"],
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

"""
Catch-up summary generation — GPT-4.1-mini.
Private "Previously in your adventure..." shown only to the joining/returning player.
"""

import os
from openai import AzureOpenAI
from helpers.prompt_builder import build_catchup_summary_prompt


def _openai():
    return AzureOpenAI(
        azure_endpoint=os.environ["OPENAI_ENDPOINT"],
        api_key=os.environ["OPENAI_API_KEY"],
        api_version="2024-02-01",
    )


def generate_catchup_summary(input_data: dict) -> str:
    """
    input_data:
      story_state: dict
      narrative_history: str  (full narrative log text)
      character: dict
    Returns the catch-up summary string.
    """
    messages = build_catchup_summary_prompt(
        story_state=input_data["story_state"],
        narrative_history=input_data.get("narrative_history", ""),
        character=input_data["character"],
    )

    client = _openai()
    response = client.chat.completions.create(
        model=os.environ["OPENAI_MINI_DEPLOYMENT"],
        messages=messages,
        temperature=0.7,
        max_tokens=500,
    )
    return response.choices[0].message.content.strip()

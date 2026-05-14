"""
Scene image generation — DALL-E 3 + Azure Blob Storage.
Generates a dark-fantasy illustration of the current scene and stores it permanently.
"""

import os
import uuid
import urllib.request
from datetime import datetime, timezone
from openai import AzureOpenAI
from azure.storage.blob import BlobServiceClient, ContentSettings

from helpers.llm import openai_client


def _image_openai():
    return AzureOpenAI(
        azure_endpoint=os.environ["OPENAI_IMAGE_ENDPOINT"],
        api_key=os.environ["OPENAI_IMAGE_API_KEY"],
        api_version="2025-04-01-preview",
    )


def generate_scene_image(input_data: dict) -> str | None:
    """
    input_data:
      narrative: str
      scene: dict
      campaign_id: str
    Returns permanent Blob Storage URL, or None on failure.
    """
    narrative = input_data.get("narrative", "")
    scene = input_data.get("scene", {})
    campaign_id = input_data.get("campaign_id", "unknown")

    location = scene.get("location", "")
    scene_desc = scene.get("description", "")

    # Ask GPT-4.1-mini to distill a focused prompt
    mini = openai_client()
    prompt_resp = mini.chat.completions.create(
        model=os.environ["OPENAI_MINI_DEPLOYMENT"],
        messages=[{
            "role": "user",
            "content": (
                "Write a concise DALL-E 3 image prompt (max 180 words) for a D&D fantasy scene. "
                "Style: Dark fantasy digital painting, dramatic cinematic lighting, highly detailed. "
                "No text, letters, words, or UI elements in the image.\n\n"
                f"Location: {location}\n"
                f"Scene: {scene_desc}\n"
                f"Narrative excerpt: {narrative[:600]}\n\n"
                "Output only the image prompt."
            ),
        }],
        max_tokens=220,
        temperature=0.7,
    )
    image_prompt = prompt_resp.choices[0].message.content.strip()

    # Generate the image with gpt-image-1
    dalle = _image_openai()
    image_resp = dalle.images.generate(
        model=os.environ.get("OPENAI_IMAGE_DEPLOYMENT", "tlw-gpt-image-1"),
        prompt=image_prompt,
        size="1792x1024",
        quality="standard",
        n=1,
        response_format="url",
    )
    temp_url = image_resp.data[0].url

    # Download image bytes
    with urllib.request.urlopen(temp_url, timeout=30) as r:
        image_bytes = r.read()

    # Upload to Blob Storage
    conn_str = os.environ.get("STORAGE_CONNECTION_STRING") or os.environ["AzureWebJobsStorage"]
    svc = BlobServiceClient.from_connection_string(conn_str)
    container = "scene-images"
    try:
        svc.create_container(container, public_access="blob")
    except Exception:
        pass

    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    blob_name = f"{campaign_id}/{ts}_{uuid.uuid4().hex[:8]}.png"
    blob = svc.get_blob_client(container=container, blob=blob_name)
    blob.upload_blob(image_bytes, content_settings=ContentSettings(content_type="image/png"))

    return f"https://{svc.account_name}.blob.core.windows.net/{container}/{blob_name}"

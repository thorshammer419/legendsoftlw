"""
Campaign novel export — GPT-4.1 → PDF → Azure Blob Storage.
Called as a background job after admin triggers export.
"""

import io
import os
import uuid
from datetime import datetime, timezone, timedelta

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from azure.storage.blob import BlobServiceClient, BlobSasPermissions, generate_blob_sas

from helpers.llm import openai_client


def generate_novel(input_data: dict) -> str:
    """
    input_data:
      party_name, campaign_name, campaign_id
      character_names: list[str]
      narrative_history: str
      quest_milestones: list[str]
      npc_logs: str
    Generates novel text, converts to PDF, uploads to Blob, returns download URL.
    """
    party_name = input_data["party_name"]
    campaign_name = input_data["campaign_name"]
    character_names = input_data["character_names"]
    narrative_history = input_data["narrative_history"]
    quest_milestones = input_data.get("quest_milestones", [])
    npc_logs = input_data.get("npc_logs", "")

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

    response = openai_client().chat.completions.create(
        model=os.environ["OPENAI_NARRATIVE_DEPLOYMENT"],
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.8,
        max_tokens=8000,
    )
    novel_text = response.choices[0].message.content.strip()

    pdf_bytes = _text_to_pdf(novel_text, campaign_name)
    return _upload_to_blob(pdf_bytes, input_data["campaign_id"])


def _text_to_pdf(text: str, title: str) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=inch,
        rightMargin=inch,
        topMargin=inch,
        bottomMargin=inch,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("Title", parent=styles["Title"], alignment=TA_CENTER, fontSize=24, spaceAfter=30)
    body_style = ParagraphStyle("Body", parent=styles["Normal"], alignment=TA_JUSTIFY, fontSize=11, leading=16)
    heading_style = ParagraphStyle("Heading", parent=styles["Heading1"], fontSize=16, spaceBefore=20, spaceAfter=10)

    story = [Paragraph(title, title_style), Spacer(1, 0.5 * inch)]
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            story.append(Spacer(1, 0.15 * inch))
        elif stripped.startswith("# "):
            story.append(Paragraph(stripped[2:], title_style))
        elif stripped.startswith("## "):
            story.append(Paragraph(stripped[3:], heading_style))
        else:
            story.append(Paragraph(stripped, body_style))

    doc.build(story)
    buf.seek(0)
    return buf.read()


def _upload_to_blob(pdf_bytes: bytes, campaign_id: str) -> str:
    conn_str = os.environ["STORAGE_CONNECTION_STRING"]
    container = "novel-exports"
    blob_name = f"{campaign_id}/{uuid.uuid4()}.pdf"

    service = BlobServiceClient.from_connection_string(conn_str)
    blob_client = service.get_blob_client(container=container, blob=blob_name)
    blob_client.upload_blob(pdf_bytes, overwrite=True)

    parts = dict(kv.split("=", 1) for kv in conn_str.split(";") if "=" in kv)
    account_name = parts["AccountName"]
    account_key = parts["AccountKey"]

    sas = generate_blob_sas(
        account_name=account_name,
        container_name=container,
        blob_name=blob_name,
        account_key=account_key,
        permission=BlobSasPermissions(read=True),
        expiry=datetime.now(timezone.utc) + timedelta(days=7),
    )
    return f"https://{account_name}.blob.core.windows.net/{container}/{blob_name}?{sas}"

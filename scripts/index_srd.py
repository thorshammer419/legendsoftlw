"""
One-time script to chunk and index SRD content into Azure AI Search.
Run once during initial setup, or re-run to refresh the index.

Usage:
    export SEARCH_ENDPOINT=https://<your-search-resource>.search.windows.net
    export SEARCH_API_KEY=your_key
    export OPENAI_ENDPOINT=https://<your-openai-resource>.openai.azure.com/
    export OPENAI_API_KEY=your_key
    python scripts/index_srd.py
"""

import json
import os
import re
from pathlib import Path
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchIndex, SimpleField, SearchableField,
    SearchField, SearchFieldDataType, VectorSearch,
    HnswAlgorithmConfiguration, VectorSearchProfile
)
from azure.core.credentials import AzureKeyCredential
from openai import AzureOpenAI

SEARCH_ENDPOINT = os.environ["SEARCH_ENDPOINT"]
SEARCH_API_KEY = os.environ["SEARCH_API_KEY"]
SEARCH_INDEX_NAME = "srd-index"
OPENAI_ENDPOINT = os.environ["OPENAI_ENDPOINT"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
EMBEDDING_DEPLOYMENT = "tlw-text-embedding-ada-002"

CATEGORY_MAP_JSON = {
    "spells": "spell",
    "monsters": "monster",
    "classes": "class",
    "races": "class",
    "equipment": "equipment",
    "conditions": "condition",
    "magic-items": "equipment",
    "backgrounds": "class",
    "features": "class",
}

CATEGORY_MAP_MD = {
    "combat": "rule",
    "spellcasting": "rule",
    "conditions": "condition",
    "adventuring": "rule",
    "equipment": "equipment",
    "monsters": "rule",
}


def safe_key(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9_\-=]", "_", text)


def create_index(index_client: SearchIndexClient):
    fields = [
        SimpleField(name="id", type=SearchFieldDataType.String, key=True),
        SearchableField(name="content", type=SearchFieldDataType.String),
        SimpleField(name="category", type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="source", type=SearchFieldDataType.String, filterable=True),
        SearchField(
            name="embedding",
            type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
            searchable=True,
            vector_search_dimensions=1536,
            vector_search_profile_name="srd-vector-profile",
        ),
    ]
    vector_search = VectorSearch(
        algorithms=[HnswAlgorithmConfiguration(name="srd-hnsw")],
        profiles=[VectorSearchProfile(
            name="srd-vector-profile",
            algorithm_configuration_name="srd-hnsw",
        )],
    )
    index = SearchIndex(name=SEARCH_INDEX_NAME, fields=fields, vector_search=vector_search)
    index_client.create_or_update_index(index)
    print(f"Index '{SEARCH_INDEX_NAME}' ready.")


def get_embedding(text: str, client: AzureOpenAI) -> list[float]:
    response = client.embeddings.create(input=text[:8000], model=EMBEDDING_DEPLOYMENT)
    return response.data[0].embedding


def flush(batch: list, search_client: SearchClient, label: str):
    if batch:
        search_client.upload_documents(batch)
        print(f"  Uploaded {len(batch)} docs ({label})")
        batch.clear()


def index_json_files(search_client: SearchClient, openai_client: AzureOpenAI):
    json_dir = Path("data/srd_json")
    batch = []

    for json_file in sorted(json_dir.glob("*.json")):
        stem = json_file.stem
        category = CATEGORY_MAP_JSON.get(stem, "rule")
        print(f"Processing {json_file.name}...")

        with open(json_file) as f:
            data = json.load(f)

        items = data if isinstance(data, list) else data.get("results", [])

        for item in items:
            name = item.get("name", "unknown")
            content = json.dumps(item, indent=2)[:2000]
            text = f"{name}\n{content}"
            doc_id = safe_key(f"{stem}_{name.lower()}")

            batch.append({
                "id": doc_id,
                "content": text,
                "category": category,
                "source": "srd_json",
                "embedding": get_embedding(text, openai_client),
            })

            if len(batch) >= 100:
                flush(batch, search_client, stem)

    flush(batch, search_client, "json_final")


def index_markdown_files(search_client: SearchClient, openai_client: AzureOpenAI):
    md_dir = Path("data/srd_markdown")
    batch = []

    for md_file in sorted(md_dir.glob("*.md")):
        stem = md_file.stem
        category = CATEGORY_MAP_MD.get(stem, "rule")
        print(f"Processing {md_file.name}...")

        with open(md_file) as f:
            raw = f.read()

        sections = raw.split("\n## ")

        for i, section in enumerate(sections):
            if not section.strip():
                continue
            if i > 0:
                section = "## " + section

            section = section[:2000]
            heading = section.split("\n")[0].replace("#", "").strip()[:50]
            doc_id = safe_key(f"rule_{stem}_{heading.lower()}")

            batch.append({
                "id": doc_id,
                "content": section,
                "category": category,
                "source": "srd_markdown",
                "embedding": get_embedding(section, openai_client),
            })

            if len(batch) >= 100:
                flush(batch, search_client, stem)

    flush(batch, search_client, "md_final")


if __name__ == "__main__":
    openai_client = AzureOpenAI(
        azure_endpoint=OPENAI_ENDPOINT,
        api_key=OPENAI_API_KEY,
        api_version="2024-02-01",
    )
    index_client = SearchIndexClient(
        endpoint=SEARCH_ENDPOINT,
        credential=AzureKeyCredential(SEARCH_API_KEY),
    )
    search_client = SearchClient(
        endpoint=SEARCH_ENDPOINT,
        index_name=SEARCH_INDEX_NAME,
        credential=AzureKeyCredential(SEARCH_API_KEY),
    )

    print("Creating search index...")
    create_index(index_client)

    print("Indexing JSON files...")
    index_json_files(search_client, openai_client)

    print("Indexing markdown files...")
    index_markdown_files(search_client, openai_client)

    print("SRD indexing complete!")

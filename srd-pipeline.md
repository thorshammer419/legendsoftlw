# SRD Data Pipeline

## Overview
The Legends of TLW uses D&D 5e SRD 5.1 content (CC-BY 4.0) indexed into
Azure AI Search for RAG retrieval during gameplay. This document covers
downloading, chunking, and indexing the SRD content.

## Legal Note
All content used must be from the SRD 5.1 (CC-BY 4.0 licensed).
Do NOT include:
- Specific campaign settings (Forgotten Realms, Ravenloft, etc.)
- Named characters owned by WotC
- Content from non-SRD sourcebooks
- Artwork or flavor text from published adventures

## Data Sources

### Source 1: 5e-database (Structured JSON)
Repository: https://github.com/5e-bits/5e-database
License: MIT
Contains: Spells, monsters, classes, races, equipment, conditions,
          magic items, backgrounds, features

```bash
cd data/srd_json
git clone https://github.com/5e-bits/5e-database.git temp
cp temp/src/*.json .
rm -rf temp
```

Key files:
- spells.json — all SRD spells with full descriptions
- monsters.json — all SRD monsters with stat blocks
- classes.json — all SRD classes with features
- races.json — all SRD races
- equipment.json — weapons, armor, gear
- conditions.json — all conditions (Poisoned, Blinded, etc.)
- magic-items.json — SRD magic items
- backgrounds.json — SRD backgrounds
- features.json — class features

### Source 2: SRD Markdown
Repository: https://github.com/BTMorton/dnd-5e-srd
License: CC-BY 4.0
Contains: Full SRD rules text in markdown format

```bash
cd data/srd_markdown
git clone https://github.com/BTMorton/dnd-5e-srd.git temp
cp temp/markdown/*.md .
rm -rf temp
```

Key files:
- combat.md — full combat rules
- spellcasting.md — spellcasting rules
- conditions.md — conditions rules text
- adventuring.md — exploration, resting, environment
- equipment.md — equipment rules
- monsters.md — monster rules, legendary actions, lair actions

## Chunking Strategy

### JSON Documents (spells, monsters, classes, etc.)
One document per entity. Natural boundaries already exist.

```python
# Example: spell document
{
  "id": "spell_fireball",
  "content": "Fireball. 3rd-level evocation. Casting Time: 1 action. 
    Range: 150 feet. Components: V, S, M (a tiny ball of bat guano and sulfur).
    Duration: Instantaneous. A bright streak flashes from your pointing finger
    to a point you choose within range and then blossoms with a low roar into
    an explosion of flame... Each creature in a 20-foot-radius sphere centered
    on that point must make a Dexterity saving throw. A target takes 8d6 fire
    damage on a failed save, or half as much damage on a successful one.",
  "category": "spell",
  "source": "srd_json",
  "tags": ["wizard", "sorcerer", "3rd-level", "evocation", "aoe", "fire", "damage"]
}
```

### Markdown Documents (rules text)
Chunk by section heading. Max ~500 tokens per chunk.
Always include the section heading in the chunk content for context.

```python
# Example: combat rule chunk
{
  "id": "rule_combat_attack_rolls",
  "content": "## Attack Rolls\nWhen you make an attack, your attack roll
    determines whether the attack hits or misses. To make an attack roll,
    roll a d20 and add the appropriate modifiers. If the total of the roll
    plus modifiers equals or exceeds the target's Armor Class (AC), the
    attack hits...",
  "category": "rule",
  "source": "srd_markdown",
  "tags": ["combat", "attack", "d20", "armor-class"]
}
```

## Indexing Script (scripts/index_srd.py)

```python
"""
One-time script to chunk and index SRD content into Azure AI Search.
Run once during initial setup, or re-run to refresh the index.

Usage:
    python scripts/index_srd.py
"""

import json
import os
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

SEARCH_ENDPOINT = os.getenv("SEARCH_ENDPOINT")
SEARCH_API_KEY = os.getenv("SEARCH_API_KEY")
SEARCH_INDEX_NAME = "srd-index"
OPENAI_ENDPOINT = os.getenv("OPENAI_ENDPOINT")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
EMBEDDING_DEPLOYMENT = "text-embedding-ada-002"

def create_index():
    """Create Azure AI Search index with vector search."""
    index_client = SearchIndexClient(
        endpoint=SEARCH_ENDPOINT,
        credential=AzureKeyCredential(SEARCH_API_KEY)
    )
    
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
            vector_search_profile_name="srd-vector-profile"
        )
    ]
    
    vector_search = VectorSearch(
        algorithms=[HnswAlgorithmConfiguration(name="srd-hnsw")],
        profiles=[VectorSearchProfile(
            name="srd-vector-profile",
            algorithm_configuration_name="srd-hnsw"
        )]
    )
    
    index = SearchIndex(
        name=SEARCH_INDEX_NAME,
        fields=fields,
        vector_search=vector_search
    )
    
    index_client.create_or_update_index(index)
    print(f"Index {SEARCH_INDEX_NAME} created/updated.")

def get_embedding(text: str, client: AzureOpenAI) -> list[float]:
    """Generate embedding for text using Azure OpenAI."""
    response = client.embeddings.create(
        input=text,
        model=EMBEDDING_DEPLOYMENT
    )
    return response.data[0].embedding

def index_json_files(search_client: SearchClient, openai_client: AzureOpenAI):
    """Index structured JSON SRD data."""
    json_dir = Path("data/srd_json")
    
    category_map = {
        "spells": "spell",
        "monsters": "monster", 
        "classes": "class",
        "races": "class",
        "equipment": "equipment",
        "conditions": "condition",
        "magic-items": "equipment",
        "backgrounds": "class",
        "features": "class"
    }
    
    documents = []
    
    for json_file in json_dir.glob("*.json"):
        file_stem = json_file.stem
        category = category_map.get(file_stem, "rule")
        
        with open(json_file) as f:
            data = json.load(f)
        
        # Handle both array and object formats
        items = data if isinstance(data, list) else data.get("results", [])
        
        for item in items:
            name = item.get("name", "Unknown")
            content = json.dumps(item, indent=2)
            
            # Truncate to ~500 tokens (rough estimate: 4 chars per token)
            if len(content) > 2000:
                content = content[:2000] + "..."
            
            doc_id = f"{file_stem}_{name.lower().replace(' ', '_')}"
            
            documents.append({
                "id": doc_id,
                "content": f"{name}\n{content}",
                "category": category,
                "source": "srd_json",
                "embedding": get_embedding(content, openai_client)
            })
            
            # Batch upload every 100 documents
            if len(documents) >= 100:
                search_client.upload_documents(documents)
                print(f"Indexed {len(documents)} documents from {file_stem}")
                documents = []
    
    if documents:
        search_client.upload_documents(documents)

def index_markdown_files(search_client: SearchClient, openai_client: AzureOpenAI):
    """Index SRD markdown rules text, chunked by section heading."""
    md_dir = Path("data/srd_markdown")
    
    category_map = {
        "combat": "rule",
        "spellcasting": "rule",
        "conditions": "condition",
        "adventuring": "rule",
        "equipment": "equipment",
        "monsters": "rule"
    }
    
    documents = []
    
    for md_file in md_dir.glob("*.md"):
        file_stem = md_file.stem
        category = category_map.get(file_stem, "rule")
        
        with open(md_file) as f:
            content = f.read()
        
        # Split on ## headings
        sections = content.split("\n## ")
        
        for i, section in enumerate(sections):
            if not section.strip():
                continue
                
            # Re-add ## prefix for non-first sections
            if i > 0:
                section = "## " + section
            
            # Truncate to ~500 tokens
            if len(section) > 2000:
                section = section[:2000] + "..."
            
            # Extract heading for ID
            heading = section.split("\n")[0].replace("#", "").strip()
            doc_id = f"rule_{file_stem}_{heading.lower().replace(' ', '_')[:50]}"
            
            documents.append({
                "id": doc_id,
                "content": section,
                "category": category,
                "source": "srd_markdown",
                "embedding": get_embedding(section, openai_client)
            })
            
            if len(documents) >= 100:
                search_client.upload_documents(documents)
                print(f"Indexed {len(documents)} markdown chunks")
                documents = []
    
    if documents:
        search_client.upload_documents(documents)

if __name__ == "__main__":
    openai_client = AzureOpenAI(
        azure_endpoint=OPENAI_ENDPOINT,
        api_key=OPENAI_API_KEY,
        api_version="2024-02-01"
    )
    
    search_client = SearchClient(
        endpoint=SEARCH_ENDPOINT,
        index_name=SEARCH_INDEX_NAME,
        credential=AzureKeyCredential(SEARCH_API_KEY)
    )
    
    print("Creating search index...")
    create_index()
    
    print("Indexing JSON files...")
    index_json_files(search_client, openai_client)
    
    print("Indexing markdown files...")
    index_markdown_files(search_client, openai_client)
    
    print("SRD indexing complete!")
```

## Requirements for indexing script
```
azure-search-documents>=11.4.0
azure-core>=1.29.0
openai>=1.0.0
```

## Note on Embeddings
The indexing script uses `text-embedding-ada-002` for generating embeddings.
You'll need to deploy this model in your Azure OpenAI instance alongside
GPT-4.1 and GPT-4.1-mini.

```bash
az cognitiveservices account deployment create \
  --name legendsoftlw-openai \
  --resource-group legends-of-tlw-rg \
  --deployment-name text-embedding-ada-002 \
  --model-name text-embedding-ada-002 \
  --model-version latest \
  --model-format OpenAI \
  --sku-capacity 10 \
  --sku-name Standard
```

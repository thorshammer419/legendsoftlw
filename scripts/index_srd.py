"""One-time SRD indexing script.

Downloads SRD content (5e-SRD JSON + markdown) and indexes it into Azure AI Search
with vector embeddings from text-embedding-ada-002.

Run once after provisioning:
  python scripts/index_srd.py

Requires SEARCH_ENDPOINT, SEARCH_API_KEY, OPENAI_ENDPOINT, OPENAI_API_KEY
set in environment or .env file.
"""
# TODO: implement

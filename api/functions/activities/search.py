"""
Azure AI Search vector retrieval activity.
Executes RAG queries against the srd-index and returns concatenated SRD chunks.
"""

import os
from azure.search.documents import SearchClient
from azure.search.documents.models import VectorizedQuery
from azure.core.credentials import AzureKeyCredential
from openai import AzureOpenAI


def _search_client() -> SearchClient:
    return SearchClient(
        endpoint=os.environ["SEARCH_ENDPOINT"],
        index_name=os.environ["SEARCH_INDEX_NAME"],
        credential=AzureKeyCredential(os.environ["SEARCH_API_KEY"]),
    )


def _openai() -> AzureOpenAI:
    return AzureOpenAI(
        azure_endpoint=os.environ["OPENAI_ENDPOINT"],
        api_key=os.environ["OPENAI_API_KEY"],
        api_version="2024-02-01",
    )


def _embed(text: str) -> list[float]:
    client = _openai()
    response = client.embeddings.create(
        input=text[:8000],
        model="tlw-text-embedding-ada-002",
    )
    return response.data[0].embedding


def execute_rag_queries(queries: list[dict]) -> str:
    """
    queries: list of {query, category, tags}
    Returns a single string of concatenated SRD chunks for LLM injection.
    """
    if not queries:
        return ""

    client = _search_client()
    seen_ids = set()
    chunks = []

    for q in queries:
        query_text = q.get("query", "")
        category = q.get("category")

        vector = _embed(query_text)
        vector_query = VectorizedQuery(
            vector=vector,
            k_nearest_neighbors=3,
            fields="embedding",
        )

        filter_expr = f"category eq '{category}'" if category else None

        results = client.search(
            search_text=query_text,
            vector_queries=[vector_query],
            filter=filter_expr,
            select=["id", "content", "category"],
            top=3,
        )

        for doc in results:
            if doc["id"] not in seen_ids:
                seen_ids.add(doc["id"])
                chunks.append(f"[{doc['category'].upper()}]\n{doc['content']}")

    return "\n\n---\n\n".join(chunks)

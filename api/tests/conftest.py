"""
Shared fixtures for the domain layer test suite.
All Cosmos DB calls are patched at the module level so no Azure connection is needed.
"""

import pytest
from unittest.mock import patch, MagicMock


COSMOS_MODULE = "functions.domain"


@pytest.fixture
def campaign_id():
    return "abc12345"


@pytest.fixture
def player_email():
    return "adventurer@example.com"


@pytest.fixture
def active_campaign_player(campaign_id, player_email):
    return {
        "id": f"campaign_player_{campaign_id}_{player_email}",
        "campaign_id": campaign_id,
        "email": player_email,
        "status": "active",
        "role": "player",
        "character_creation_complete": False,
    }


@pytest.fixture
def story_state(campaign_id):
    return {
        "id": f"state_{campaign_id}",
        "campaign_id": campaign_id,
        "round_number": 1,
        "round_status": "waiting",
        "pending_actions": {},
    }


@pytest.fixture
def cosmos_mocks():
    """Patch all Cosmos DB functions used by domain.py. Returns the mock namespace."""
    targets = [
        "get_campaign_player",
        "get_campaign_players",
        "get_story_state",
        "upsert_story_state",
        "upsert_character",
        "upsert_campaign_player",
        "upsert_player",
        "get_player",
        "get_character",
        "create_campaign",
        "delete_campaign_player",
        "delete_character",
        "get_lobby_chat_doc",
        "upsert_lobby_chat_doc",
        "get_lobby_presence_doc",
        "upsert_lobby_presence_doc",
    ]
    patches = {name: patch(f"{COSMOS_MODULE}.{name}") for name in targets}
    mocks = {name: p.start() for name, p in patches.items()}
    yield mocks
    for p in patches.values():
        p.stop()

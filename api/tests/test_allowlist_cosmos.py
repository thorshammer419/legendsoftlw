"""
Unit tests for allowlist functions in functions/activities/cosmos.py.
All Cosmos I/O is mocked — pure unit tests.
Run with: cd api && .venv/bin/pytest tests/test_allowlist_cosmos.py -v
"""

import pytest
from unittest.mock import patch, MagicMock
from azure.cosmos import exceptions

MODULE = "functions.activities.cosmos"

ALLOWED_DOC = {
    "id": "allowed_user_player@example.com",
    "type": "allowed_user",
    "campaign_id": "allowed_users",
    "email": "player@example.com",
}


@pytest.fixture
def container():
    with patch(f"{MODULE}._container") as mock_container_fn:
        mock_c = MagicMock()
        mock_container_fn.return_value = mock_c
        yield mock_c


# ---------------------------------------------------------------------------
# get_allowed_user
# ---------------------------------------------------------------------------

class TestGetAllowedUser:
    def test_returns_doc_when_present(self, container):
        from functions.activities.cosmos import get_allowed_user
        container.read_item.return_value = ALLOWED_DOC

        result = get_allowed_user("player@example.com")

        assert result == ALLOWED_DOC
        container.read_item.assert_called_once_with(
            item="allowed_user_player@example.com",
            partition_key="allowed_users",
        )

    def test_returns_none_when_absent(self, container):
        from functions.activities.cosmos import get_allowed_user
        container.read_item.side_effect = exceptions.CosmosResourceNotFoundError(404, "Not found")

        result = get_allowed_user("unknown@example.com")

        assert result is None


# ---------------------------------------------------------------------------
# upsert_allowed_user
# ---------------------------------------------------------------------------

class TestUpsertAllowedUser:
    def test_writes_doc_with_correct_fields(self, container):
        from functions.activities.cosmos import upsert_allowed_user
        container.upsert_item.return_value = ALLOWED_DOC

        upsert_allowed_user("player@example.com")

        call_args = container.upsert_item.call_args
        body = call_args.kwargs.get("body") or call_args.args[0]
        assert body["id"] == "allowed_user_player@example.com"
        assert body["type"] == "allowed_user"
        assert body["campaign_id"] == "allowed_users"
        assert body["email"] == "player@example.com"


# ---------------------------------------------------------------------------
# delete_allowed_user
# ---------------------------------------------------------------------------

class TestDeleteAllowedUser:
    def test_deletes_existing_doc(self, container):
        from functions.activities.cosmos import delete_allowed_user

        delete_allowed_user("player@example.com")

        container.delete_item.assert_called_once_with(
            item="allowed_user_player@example.com",
            partition_key="allowed_users",
        )

    def test_no_op_when_doc_not_found(self, container):
        from functions.activities.cosmos import delete_allowed_user
        container.delete_item.side_effect = exceptions.CosmosResourceNotFoundError(404, "Not found")

        delete_allowed_user("unknown@example.com")  # must not raise


# ---------------------------------------------------------------------------
# list_allowed_users
# ---------------------------------------------------------------------------

class TestListAllowedUsers:
    def test_returns_all_allowed_user_docs(self, container):
        from functions.activities.cosmos import list_allowed_users
        docs = [ALLOWED_DOC, {**ALLOWED_DOC, "email": "other@example.com", "id": "allowed_user_other@example.com"}]
        container.query_items.return_value = iter(docs)

        result = list_allowed_users()

        assert result == docs
        call_args = container.query_items.call_args
        query = call_args.kwargs.get("query") or call_args.args[0]
        assert "allowed_user" in query

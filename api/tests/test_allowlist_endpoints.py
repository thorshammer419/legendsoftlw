"""
Tests for allowlist management API endpoints:
  GET  /admin/users/allowed
  POST /admin/users/allowed
  DELETE /admin/users/allowed
Run with: cd api && .venv/bin/pytest tests/test_allowlist_endpoints.py -v
"""

import json
import base64
import os
import pytest
from unittest.mock import patch, MagicMock
import azure.functions as func

MODULE = "functions.webhook_http"

ADMIN_EMAIL = "admin@example.com"
USER_EMAIL = "player@example.com"

ADMIN_PRINCIPAL = base64.b64encode(json.dumps({
    "userDetails": ADMIN_EMAIL,
    "identityProvider": "yahoo",
}).encode()).decode()

USER_PRINCIPAL = base64.b64encode(json.dumps({
    "userDetails": USER_EMAIL,
    "identityProvider": "google",
}).encode()).decode()

ALLOWED_DOC = {
    "id": f"allowed_user_{USER_EMAIL}",
    "type": "allowed_user",
    "campaign_id": "allowed_users",
    "email": USER_EMAIL,
}

PLAYER_DOC = {
    "id": f"player_{ADMIN_EMAIL}",
    "email": ADMIN_EMAIL,
    "approved": True,
}


def _make_req(principal, body=None, method="GET"):
    req = MagicMock(spec=func.HttpRequest)
    req.method = method
    req.headers = {"x-ms-client-principal": principal}
    req.get_json.return_value = body or {}
    return req


@pytest.fixture(autouse=True)
def set_system_admin_emails(monkeypatch):
    monkeypatch.setenv("SYSTEM_ADMIN_EMAILS", ADMIN_EMAIL)


@pytest.fixture
def mocks():
    with (
        patch(f"{MODULE}.get_player") as mock_get_player,
        patch(f"{MODULE}.list_allowed_users") as mock_list,
        patch(f"{MODULE}.upsert_allowed_user") as mock_upsert,
        patch(f"{MODULE}.delete_allowed_user") as mock_delete,
        patch(f"{MODULE}.get_allowed_user") as mock_get_allowed,
    ):
        mock_get_player.return_value = PLAYER_DOC
        yield {
            "get_player": mock_get_player,
            "list_allowed_users": mock_list,
            "upsert_allowed_user": mock_upsert,
            "delete_allowed_user": mock_delete,
            "get_allowed_user": mock_get_allowed,
        }


# ---------------------------------------------------------------------------
# GET /admin/users/allowed
# ---------------------------------------------------------------------------

class TestGetAllowedUsers:
    async def test_returns_list_for_system_admin(self, mocks):
        from functions.webhook_http import get_allowed_users_handler
        mocks["list_allowed_users"].return_value = [ALLOWED_DOC]

        response = await get_allowed_users_handler(_make_req(ADMIN_PRINCIPAL))

        assert response.status_code == 200
        data = json.loads(response.get_body())
        assert data == [ALLOWED_DOC]

    async def test_returns_403_for_non_admin(self, mocks):
        from functions.webhook_http import get_allowed_users_handler

        response = await get_allowed_users_handler(_make_req(USER_PRINCIPAL))

        assert response.status_code == 403


# ---------------------------------------------------------------------------
# POST /admin/users/allowed
# ---------------------------------------------------------------------------

class TestAddAllowedUser:
    async def test_adds_email_for_system_admin(self, mocks):
        from functions.webhook_http import add_allowed_user_handler

        response = await add_allowed_user_handler(
            _make_req(ADMIN_PRINCIPAL, body={"email": USER_EMAIL}, method="POST")
        )

        assert response.status_code == 201
        mocks["upsert_allowed_user"].assert_called_once_with(USER_EMAIL)

    async def test_returns_403_for_non_admin(self, mocks):
        from functions.webhook_http import add_allowed_user_handler

        response = await add_allowed_user_handler(
            _make_req(USER_PRINCIPAL, body={"email": USER_EMAIL}, method="POST")
        )

        assert response.status_code == 403


# ---------------------------------------------------------------------------
# DELETE /admin/users/allowed
# ---------------------------------------------------------------------------

class TestRemoveAllowedUser:
    async def test_removes_email_and_revokes_player_for_system_admin(self, mocks):
        from functions.webhook_http import remove_allowed_user_handler
        player_doc = {**PLAYER_DOC, "email": USER_EMAIL, "approved": True}
        mocks["get_player"].side_effect = lambda e: player_doc if e == USER_EMAIL else PLAYER_DOC

        with patch(f"{MODULE}.upsert_player"):
            response = await remove_allowed_user_handler(
                _make_req(ADMIN_PRINCIPAL, body={"email": USER_EMAIL}, method="DELETE")
            )

        assert response.status_code == 200
        mocks["delete_allowed_user"].assert_called_once_with(USER_EMAIL)

    async def test_sets_approved_false_on_player_when_present(self, mocks):
        from functions.webhook_http import remove_allowed_user_handler
        player_doc = {**PLAYER_DOC, "email": USER_EMAIL, "approved": True}
        mocks["get_player"].side_effect = lambda e: player_doc if e == USER_EMAIL else PLAYER_DOC

        with patch(f"{MODULE}.upsert_player") as mock_upsert_player:
            response = await remove_allowed_user_handler(
                _make_req(ADMIN_PRINCIPAL, body={"email": USER_EMAIL}, method="DELETE")
            )

        saved = mock_upsert_player.call_args.args[0]
        assert saved["approved"] is False

    async def test_returns_403_for_non_admin(self, mocks):
        from functions.webhook_http import remove_allowed_user_handler

        response = await remove_allowed_user_handler(
            _make_req(USER_PRINCIPAL, body={"email": USER_EMAIL}, method="DELETE")
        )

        assert response.status_code == 403

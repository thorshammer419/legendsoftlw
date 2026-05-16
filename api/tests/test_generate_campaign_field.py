"""
Tests for POST /campaigns/generate-field handler.
OpenAI client is mocked — no Azure connection required.
"""

import json
import base64
import pytest
from unittest.mock import patch, MagicMock

MODULE = "functions.webhook_http"

CALLER_EMAIL = "adventurer@example.com"

PRINCIPAL = base64.b64encode(json.dumps({
    "userDetails": CALLER_EMAIL,
    "identityProvider": "google",
}).encode()).decode()

APPROVED_PLAYER = {"email": CALLER_EMAIL, "approved": True}


def _make_req(body=None, authenticated=True):
    req = MagicMock()
    req.headers = {"x-ms-client-principal": PRINCIPAL} if authenticated else {}
    req.get_json.return_value = body or {}
    return req


def _openai_mock(text="The Shadow Keep"):
    """Return a mock openai_client that produces a fixed completion."""
    choice = MagicMock()
    choice.message.content = text
    completion = MagicMock()
    completion.choices = [choice]
    client = MagicMock()
    client.chat.completions.create.return_value = completion
    return client


@pytest.fixture(autouse=True)
def set_env(monkeypatch):
    monkeypatch.setenv("OPENAI_MINI_DEPLOYMENT", "tlw-gpt-4.1-mini")


@pytest.fixture
def handler_mocks():
    with (
        patch(f"{MODULE}.get_player") as mock_player,
        patch(f"{MODULE}.openai_client") as mock_oc,
    ):
        mock_player.return_value = APPROVED_PLAYER
        mock_oc.return_value = _openai_mock()
        yield {"get_player": mock_player, "openai_client": mock_oc}


class TestGenerateCampaignFieldAuth:
    async def test_returns_401_when_unauthenticated(self, handler_mocks):
        from functions.webhook_http import generate_campaign_field_handler
        req = _make_req({"field": "name"}, authenticated=False)

        resp = await generate_campaign_field_handler(req)

        assert resp.status_code == 401

    async def test_returns_400_for_unknown_field(self, handler_mocks):
        from functions.webhook_http import generate_campaign_field_handler
        req = _make_req({"field": "backstory"})

        resp = await generate_campaign_field_handler(req)

        assert resp.status_code == 400
        body = json.loads(resp.get_body())
        assert "backstory" in body["error"]


class TestGenerateCampaignFieldValues:
    async def test_returns_value_for_name_field(self, handler_mocks):
        from functions.webhook_http import generate_campaign_field_handler
        handler_mocks["openai_client"].return_value = _openai_mock("The Shadow Keep")
        req = _make_req({"field": "name", "context": {}})

        resp = await generate_campaign_field_handler(req)

        assert resp.status_code == 200
        body = json.loads(resp.get_body())
        assert body["value"] == "The Shadow Keep"

    async def test_returns_value_for_party_name_field(self, handler_mocks):
        from functions.webhook_http import generate_campaign_field_handler
        handler_mocks["openai_client"].return_value = _openai_mock("The Ironclad Vanguard")
        req = _make_req({"field": "party_name", "context": {}})

        resp = await generate_campaign_field_handler(req)

        assert resp.status_code == 200
        body = json.loads(resp.get_body())
        assert body["value"] == "The Ironclad Vanguard"

    async def test_returns_value_for_description_field(self, handler_mocks):
        from functions.webhook_http import generate_campaign_field_handler
        handler_mocks["openai_client"].return_value = _openai_mock("Dark forces stir in the north.")
        req = _make_req({"field": "description", "context": {}})

        resp = await generate_campaign_field_handler(req)

        assert resp.status_code == 200
        body = json.loads(resp.get_body())
        assert body["value"] == "Dark forces stir in the north."


class TestGenerateCampaignFieldContext:
    async def test_description_context_forwarded_when_generating_name(self, handler_mocks):
        from functions.webhook_http import generate_campaign_field_handler
        client_mock = _openai_mock("Flames of Eternity")
        handler_mocks["openai_client"].return_value = client_mock
        req = _make_req({
            "field": "name",
            "context": {"description": "A tale of dragon fire and ancient ruins"},
        })

        await generate_campaign_field_handler(req)

        call_kwargs = client_mock.chat.completions.create.call_args
        messages = call_kwargs.kwargs.get("messages") or call_kwargs.args[1]
        user_content = next(m["content"] for m in messages if m["role"] == "user")
        assert "dragon fire and ancient ruins" in user_content

    async def test_name_context_forwarded_when_generating_description(self, handler_mocks):
        from functions.webhook_http import generate_campaign_field_handler
        client_mock = _openai_mock("An ancient evil awakens...")
        handler_mocks["openai_client"].return_value = client_mock
        req = _make_req({
            "field": "description",
            "context": {"name": "The Shadow Keep"},
        })

        await generate_campaign_field_handler(req)

        call_kwargs = client_mock.chat.completions.create.call_args
        messages = call_kwargs.kwargs.get("messages") or call_kwargs.args[1]
        user_content = next(m["content"] for m in messages if m["role"] == "user")
        assert "The Shadow Keep" in user_content

    async def test_empty_context_values_not_forwarded(self, handler_mocks):
        from functions.webhook_http import generate_campaign_field_handler
        client_mock = _openai_mock("Iron Wolf")
        handler_mocks["openai_client"].return_value = client_mock
        req = _make_req({
            "field": "party_name",
            "context": {"name": "", "description": "  "},
        })

        await generate_campaign_field_handler(req)

        call_kwargs = client_mock.chat.completions.create.call_args
        messages = call_kwargs.kwargs.get("messages") or call_kwargs.args[1]
        user_content = next(m["content"] for m in messages if m["role"] == "user")
        assert "Campaign name:" not in user_content
        assert "Campaign description:" not in user_content

"""
Tests for functions/membership.py.

All Cosmos DB calls are mocked — no Azure connection required.
Run with: cd api && .venv/bin/pytest tests/test_membership.py -v
"""

import pytest
from unittest.mock import patch

from functions.domain import DomainError
from functions.membership import (
    is_system_admin,
    is_admin,
    is_member,
    get_member_emails,
    assert_can_join,
    assert_is_admin,
    assert_is_system_admin,
)

MODULE = "functions.membership"

CAMPAIGN_ID = "camp0001"
ADMIN_EMAIL = "creator@example.com"
PLAYER_EMAIL = "player@example.com"
SYSADMIN_EMAIL = "sysadmin@example.com"

CAMPAIGN = {
    "campaign_id": CAMPAIGN_ID,
    "status": "lobby",
    "max_players": 4,
    "creator_emails": [ADMIN_EMAIL],
}

PLAYERS = [
    {"email": ADMIN_EMAIL, "status": "active"},
    {"email": PLAYER_EMAIL, "status": "active"},
]


# ---------------------------------------------------------------------------
# is_system_admin
# ---------------------------------------------------------------------------

class TestIsSystemAdmin:
    def test_email_in_env_var_is_admin(self, monkeypatch):
        monkeypatch.setenv("SYSTEM_ADMIN_EMAILS", f"{SYSADMIN_EMAIL},other@x.com")
        assert is_system_admin(SYSADMIN_EMAIL) is True

    def test_email_not_in_env_var_is_not_admin(self, monkeypatch):
        monkeypatch.setenv("SYSTEM_ADMIN_EMAILS", "other@x.com")
        assert is_system_admin(SYSADMIN_EMAIL) is False

    def test_empty_env_var_returns_false(self, monkeypatch):
        monkeypatch.setenv("SYSTEM_ADMIN_EMAILS", "")
        assert is_system_admin(SYSADMIN_EMAIL) is False

    def test_whitespace_trimmed_in_env_var(self, monkeypatch):
        monkeypatch.setenv("SYSTEM_ADMIN_EMAILS", f"  {SYSADMIN_EMAIL}  ")
        assert is_system_admin(SYSADMIN_EMAIL) is True


# ---------------------------------------------------------------------------
# is_admin
# ---------------------------------------------------------------------------

class TestIsAdmin:
    def test_creator_email_is_admin(self, monkeypatch):
        monkeypatch.setenv("SYSTEM_ADMIN_EMAILS", "")
        assert is_admin(CAMPAIGN, ADMIN_EMAIL) is True

    def test_system_admin_is_admin_even_without_creator_role(self, monkeypatch):
        monkeypatch.setenv("SYSTEM_ADMIN_EMAILS", SYSADMIN_EMAIL)
        assert is_admin(CAMPAIGN, SYSADMIN_EMAIL) is True

    def test_plain_player_is_not_admin(self, monkeypatch):
        monkeypatch.setenv("SYSTEM_ADMIN_EMAILS", "")
        assert is_admin(CAMPAIGN, PLAYER_EMAIL) is False


# ---------------------------------------------------------------------------
# is_member
# ---------------------------------------------------------------------------

class TestIsMember:
    def test_returns_true_when_campaign_player_exists(self):
        cp = {"email": PLAYER_EMAIL, "campaign_id": CAMPAIGN_ID}
        with patch(f"{MODULE}.get_campaign_player", return_value=cp):
            assert is_member(CAMPAIGN_ID, PLAYER_EMAIL) is True

    def test_returns_false_when_no_campaign_player(self):
        with patch(f"{MODULE}.get_campaign_player", return_value=None):
            assert is_member(CAMPAIGN_ID, PLAYER_EMAIL) is False


# ---------------------------------------------------------------------------
# get_member_emails
# ---------------------------------------------------------------------------

class TestGetMemberEmails:
    def test_returns_list_of_all_player_emails(self):
        with patch(f"{MODULE}.get_campaign_players", return_value=PLAYERS):
            emails = get_member_emails(CAMPAIGN_ID)
        assert emails == [ADMIN_EMAIL, PLAYER_EMAIL]

    def test_returns_empty_list_when_no_players(self):
        with patch(f"{MODULE}.get_campaign_players", return_value=[]):
            emails = get_member_emails(CAMPAIGN_ID)
        assert emails == []


# ---------------------------------------------------------------------------
# assert_can_join
# ---------------------------------------------------------------------------

class TestAssertCanJoin:
    def test_passes_for_open_lobby_with_capacity(self):
        with patch(f"{MODULE}.get_campaign_players", return_value=PLAYERS):
            assert_can_join(CAMPAIGN, "new@example.com")  # no exception

    def test_raises_when_campaign_not_open(self):
        closed = {**CAMPAIGN, "status": "deleted"}
        with pytest.raises(DomainError) as exc:
            assert_can_join(closed, PLAYER_EMAIL)
        assert exc.value.http_status == 400

    def test_raises_when_campaign_completed(self):
        completed = {**CAMPAIGN, "status": "completed"}
        with pytest.raises(DomainError) as exc:
            assert_can_join(completed, PLAYER_EMAIL)
        assert exc.value.http_status == 400

    def test_raises_when_campaign_full(self):
        full_players = [{"email": f"p{i}@x.com", "status": "active"} for i in range(4)]
        with patch(f"{MODULE}.get_campaign_players", return_value=full_players):
            with pytest.raises(DomainError) as exc:
                assert_can_join(CAMPAIGN, "new@example.com")
        assert exc.value.http_status == 409
        assert "full" in str(exc.value).lower()

    def test_inactive_players_do_not_count_toward_capacity(self):
        mixed = [
            {"email": "a@x.com", "status": "active"},
            {"email": "b@x.com", "status": "inactive"},
            {"email": "c@x.com", "status": "inactive"},
            {"email": "d@x.com", "status": "inactive"},
        ]
        with patch(f"{MODULE}.get_campaign_players", return_value=mixed):
            assert_can_join(CAMPAIGN, "new@example.com")  # 1 active < 4 max, no exception

    def test_active_campaign_is_joinable(self):
        active = {**CAMPAIGN, "status": "active"}
        with patch(f"{MODULE}.get_campaign_players", return_value=PLAYERS):
            assert_can_join(active, "new@example.com")  # no exception


# ---------------------------------------------------------------------------
# assert_is_admin
# ---------------------------------------------------------------------------

class TestAssertIsAdmin:
    def test_passes_for_creator(self, monkeypatch):
        monkeypatch.setenv("SYSTEM_ADMIN_EMAILS", "")
        assert_is_admin(CAMPAIGN, ADMIN_EMAIL)  # no exception

    def test_passes_for_system_admin(self, monkeypatch):
        monkeypatch.setenv("SYSTEM_ADMIN_EMAILS", SYSADMIN_EMAIL)
        assert_is_admin(CAMPAIGN, SYSADMIN_EMAIL)  # no exception

    def test_raises_403_for_plain_player(self, monkeypatch):
        monkeypatch.setenv("SYSTEM_ADMIN_EMAILS", "")
        with pytest.raises(DomainError) as exc:
            assert_is_admin(CAMPAIGN, PLAYER_EMAIL)
        assert exc.value.http_status == 403


# ---------------------------------------------------------------------------
# assert_is_system_admin
# ---------------------------------------------------------------------------

class TestAssertIsSystemAdmin:
    def test_passes_for_system_admin(self, monkeypatch):
        monkeypatch.setenv("SYSTEM_ADMIN_EMAILS", SYSADMIN_EMAIL)
        assert_is_system_admin(SYSADMIN_EMAIL)  # no exception

    def test_raises_403_for_non_system_admin(self, monkeypatch):
        monkeypatch.setenv("SYSTEM_ADMIN_EMAILS", "other@x.com")
        with pytest.raises(DomainError) as exc:
            assert_is_system_admin(SYSADMIN_EMAIL)
        assert exc.value.http_status == 403

    def test_raises_for_campaign_creator_who_is_not_system_admin(self, monkeypatch):
        monkeypatch.setenv("SYSTEM_ADMIN_EMAILS", "")
        with pytest.raises(DomainError):
            assert_is_system_admin(ADMIN_EMAIL)

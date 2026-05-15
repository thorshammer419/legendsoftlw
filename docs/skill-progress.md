# Skill Progress Log

---

## to-prd — Campaign Browser & Access Control

| Step | Status | Notes |
|---|---|---|
| 1. Explore repo | ✅ Done | Read domain.py, cosmos.py, webhook_http.py, Dashboard.jsx, Admin.jsx, Lobby.jsx, CreateCampaign.jsx, App.jsx, api.js, conftest.py, CONTEXT.md, data-models.md |
| 2. Sketch modules | ✅ Done | See prd-campaign-browser.md — Implementation Decisions section |
| 3. Write PRD | ✅ Done | Written to docs/prd-campaign-browser.md (Q1–Q13 decisions, role hierarchy, full implementation plan) |
| 4. Publish to tracker | ⏭ Skipped | No issue tracker configured — markdown file is the artifact |
| 5. Session handoff | ✅ Done | prd-campaign-browser.md is the authoritative handoff doc — point new sessions here |

---

## Implementation — Issue #13: Role rename + system admin helper

| File | Change |
|---|---|
| `api/functions/domain.py` | `admin_emails` → `creator_emails`; `role:"admin"` → `role:"creator"` |
| `api/functions/webhook_http.py` | All 5 creator-gate checks: `admin_emails` → `creator_emails` + `_is_system_admin()` bypass |
| `web/src/hooks/useAuth.js` | `isAdmin()`: checks `creator_emails` + `user.is_system_admin` |
| `web/src/pages/Lobby.jsx` | `admin_emails` → `creator_emails`; role badge; waiting text |
| `web/src/pages/Admin.jsx` | Access-denied message copy |
| `web/src/components/admin/PlayerCard.jsx` | Role badge: `"admin"` → `"creator"` |
| `docs/data-models.md` | Schema updated to match |

---

## Implementation — Issue #14: Campaign creation: invite token, password, creator_emails

| File | Change |
|---|---|
| `api/requirements.txt` | Added `bcrypt` |
| `api/functions/activities/cosmos.py` | Added `list_all_campaigns()` (lobby+active, for browser); `get_campaign_by_invite_token(token)` (for magic link flow) |
| `api/functions/domain.py` | `create_new_campaign()` now generates `invite_token` (32-char URL-safe token) and hashes optional `password` via bcrypt into `password_hash`; both stored on campaign doc |
| `web/src/pages/CreateCampaign.jsx` | Added optional password field (leaves blank = open campaign) |

---

## Implementation — Issue #15: Campaign browser + open-campaign join + unified Dashboard

| File | Change |
|---|---|
| `api/functions/webhook_http.py` | Added `list_campaigns_handler` (GET /campaigns — public info, is_member flag, no password_hash); added `join_campaign_handler` (POST /campaigns/{id}/join — open campaigns; returns 403 "Password required" for locked ones, placeholder for #16); `get_campaign_handler` stops auto-joining (returns 403 for non-members) |
| `api/function_app.py` | Registered GET /campaigns and POST /campaigns/{id}/join routes |
| `web/src/services/api.js` | Added `listAllCampaigns()` and `joinCampaign(campaignId, opts)` |
| `web/src/components/campaign/CampaignCard.jsx` | New — renders member cards (click-to-navigate + gear) and browse cards (join button, lock icon, player count) |
| `web/src/pages/Dashboard.jsx` | Rewritten — fetches from API, splits into "My Campaigns" + "Join a Campaign" sections; no more localStorage |
| `web/src/pages/CreateCampaign.jsx` | Removed localStorage campaign caching (Dashboard now API-driven) |

---

## Implementation — Issue #16: Password-protected join + JoinModal

| File | Change |
|---|---|
| `api/functions/webhook_http.py` | Added `import bcrypt`; `join_campaign_handler` now parses body password, returns 403 "Password required" if missing, 403 "Incorrect password" on bcrypt mismatch |
| `web/src/components/campaign/JoinModal.jsx` | New — modal with password input, error display, auto-focus; calls `api.joinCampaign` with `{ password }`; navigates on success |
| `web/src/pages/Dashboard.jsx` | Password-protected join now opens `JoinModal` instead of inline error; modal closes on cancel or backdrop click |

---

## Implementation — Issue #17: Magic invite link flow

| File | Change |
|---|---|
| `api/functions/webhook_http.py` | Added `resolve_invite_token_handler` (GET /campaigns/invite/{token} — returns public campaign info from token); `join_campaign_handler` now checks `invite_token` in body first — if valid, skips password; falls through to password check if no token provided |
| `api/function_app.py` | Registered `GET /campaigns/invite/{token}` |
| `web/src/services/api.js` | Added `resolveInviteToken(token)` |
| `web/src/pages/JoinCampaign.jsx` | New — landing page for invite links; resolves token, shows campaign info, joins with token bypass, handles already-member and full-campaign states |
| `web/src/App.jsx` | Added `/campaigns/invite/:token` route |
| `web/src/pages/Admin.jsx` | Invite URL now uses `campaign.invite_token` → real magic link; updated helper text; removed stale localStorage removal from deleteCampaign |
| `web/src/pages/Lobby.jsx` | Added invite link card (copy button) visible to creator/system-admin |

---

## Implementation — Issue #18: Password management in Admin page

| File | Change |
|---|---|
| `api/functions/webhook_http.py` | Added `admin_update_settings_handler` (PATCH /campaigns/{id}/admin/settings — bcrypt-hashes new password or sets to null to clear) |
| `api/function_app.py` | Registered `PATCH /campaigns/{id}/admin/settings` |
| `web/src/services/api.js` | Added `updateCampaignPassword(campaignId, password)` |
| `web/src/pages/Admin.jsx` | Campaign Settings card: shows current password status, Set password input + button, Remove Password button (visible only when password is set) |

---

## Implementation — Issue #19: Invite token regeneration in Admin + Lobby

| File | Change |
|---|---|
| `api/functions/webhook_http.py` | Added `admin_regenerate_invite_handler` (POST /campaigns/{id}/admin/regenerate-invite — generates new 32-char token, old link immediately invalid) |
| `api/function_app.py` | Registered `POST /campaigns/{id}/admin/regenerate-invite` |
| `web/src/services/api.js` | Added `regenerateInviteToken(campaignId)` |
| `web/src/pages/Admin.jsx` | Regenerate button added to invite link row; calls `refresh()` on success so token updates in place |
| `web/src/pages/Lobby.jsx` | Regenerate button added to invite link card; calls `refresh()` on success |

# PRD: Campaign Browser & Access Control

**Status:** Design complete — implementation not started  
**Date:** 2026-05-15  
**Author:** Mark Erickson  

---

## Purpose of This Document

This document is a complete session handoff. If the conversation that produced this design is lost, point a new Claude session here to resume implementation with full context. It covers: what the feature is, every design decision and its rationale, the role model, and the full implementation plan broken down by file.

---

## What We're Building

Currently, joining a campaign requires the admin to manually share the campaign URL, and any allowlisted user who navigates to that URL is auto-joined with no friction. We are replacing this with:

1. **Campaign browser** — all lobby and active campaigns are visible to all allowlisted users on the Dashboard
2. **Campaign passwords** — campaign creators can optionally set a bcrypt-hashed password to restrict access
3. **Magic invite links** — a separate 32-char token that bypasses the password (the link = trust)
4. **Explicit join flow** — users click "Join" from the browser; password-protected campaigns prompt in a modal
5. **Password management** — creators can update or clear the password after creation, and regenerate the invite token, from both the Admin page and the Lobby

---

## Role Hierarchy

| Role | Who | Scope | Data model value |
|---|---|---|---|
| System admin | Mark (static, `SYSTEM_ADMIN_EMAILS` env var) | All campaigns, no barriers, overrides everything | checked via env var — NOT stored in campaign_player |
| Campaign creator | User who created a campaign | Full authority over their specific campaign | `role: "creator"` in `campaign_player` |
| Player | Everyone else in a campaign | That campaign only | `role: "player"` in `campaign_player` |

**Critical:** The current codebase stores `role: "admin"` for campaign creators in `campaign_player`. This must be renamed to `role: "creator"` everywhere — in the data model, all auth checks, and all UI labels. "Admin" now unambiguously refers to the system admin (Mark).

The system admin has no barriers: they can see and modify any campaign's settings, access any Admin page, and perform any creator action on any campaign, regardless of whether they created it.

---

## Design Decisions (Q1–Q13)

### Q1 — Core problem
Joining should require explicit intent. Auto-join-on-URL is too implicit.

### Q2 — Magic link behavior ✅ A
The magic link **bypasses the password**. The link is the trust mechanism. Anyone with the link gets in frictionlessly. The password only applies when joining from the campaign browser without a link.

### Q3 — Link token structure ✅ A
Campaign keeps its short 8-char ID internally (used in all lobby/game URLs). The shareable invite link contains a **separate 32-char random token**: `/campaigns/invite/{token}`. This token is distinct from the campaign ID, can be regenerated, and grants bypass access.

### Q4 — Campaign full ✅ A
Hard block: "This campaign is full." No waitlist. Admin can raise `max_players` if needed.

### Q5 — Campaign visibility ✅ B
The browser shows **both lobby and active** campaigns. Both are joinable. The codebase already supports mid-campaign joins with a catch-up summary and cinematic intro.

### Q6 — Password storage ✅ A
Passwords are **bcrypt-hashed**. Never stored in plaintext. One bcrypt call on creation/update, one on verification.

### Q7 — Password management after creation ✅ A
Admin (creator or system admin) can **update or clear the password** from the Admin page at any time.

### Q8 — Role rename ✅ A
Campaign creator role renamed from `"admin"` to `"creator"` throughout — data model, backend auth checks, UI labels. "Admin" now means system admin only.

### Q9 — Invite token regeneration ✅ A
**"Regenerate link"** button available to campaign creator and system admin. Generates new 32-char token; old token stops working immediately.

### Q10 — Dashboard layout ✅ A
**Unified Dashboard**: "My Campaigns" section at top (campaigns the user belongs to), "Join a Campaign" browse section below (all other lobby + active campaigns). Single page, no tabs, no separate route.

### Q11 — Campaign card content ✅ Confirmed
Each campaign card in the browser shows:
- Campaign name + party name
- Description
- Creator display name (not full email — show first part before @ for privacy)
- Player count (e.g., "3/8 players")
- Status badge (Lobby / Active)
- Lock icon if password-protected
- Join button

### Q12 — Password prompt UX ✅ A
**Modal**: clicking "Join" on a password-protected campaign opens a password dialog modal. Wrong password → error in modal, user stays on browser. Correct password → navigate to character creation.

### Q13 — Magic link location ✅ C
Magic link (copy + regenerate) is available in **both** the Lobby page and the Admin page. During lobby the creator sits on the Lobby page waiting for players, so the link must be accessible there without navigating away. Admin page is for management and regeneration later.

---

## Data Model Changes

### Campaign document — new fields

```json
{
  "invite_token": "xK9mP2...32chars",
  "password_hash": "$2b$12$...",
  "creator_emails": ["mark@example.com"]
}
```

- `invite_token`: 32-char random string, generated at campaign creation
- `password_hash`: bcrypt hash of creator-set password, or `null` if open
- `creator_emails`: rename from `admin_emails` — same semantics, new name

### Campaign Player document — role rename

```json
{
  "role": "creator"
}
```

Previously `"admin"`. All code that checks `role == "admin"` must change to `role == "creator"`.

---

## Implementation Plan

### Backend — `api/`

#### `shared/domain.py`
- `create_new_campaign()`:
  - Add `invite_token = secrets.token_urlsafe(32)`
  - Add optional `password` param → bcrypt hash if provided, else `None`
  - Replace `admin_emails` with `creator_emails`
  - Set `role: "creator"` instead of `role: "admin"` for the creator's campaign_player doc
- Add helper `_is_system_admin(email)` — checks against `SYSTEM_ADMIN_EMAILS` env var
- Add helper `_is_campaign_creator(campaign, email)` — checks `creator_emails` list

#### `shared/cosmos.py`
- `list_all_campaigns()` — returns all non-deleted campaigns (status in lobby/active)
- `get_campaign_by_invite_token(token)` — resolves 32-char token → campaign doc

#### `webhook_http.py`
- All `role == "admin"` checks → `role == "creator"` + `_is_system_admin()` bypass
- `get_campaign_handler`: stop auto-joining new users (only return campaign data; joining is now explicit)
- New: `GET /campaigns` — list all non-deleted campaigns for the browser; returns public info only (no `password_hash` exposed)
- New: `POST /campaigns/{id}/join` — explicit join endpoint
  - Checks campaign exists, not full, status is lobby or active
  - If campaign has `password_hash`: verify provided password with bcrypt; reject if wrong
  - If campaign has `invite_token` in request header/body: skip password check (magic link bypass)
  - Creates `campaign_player` doc with `role: "player"`
- New: `POST /campaigns/{id}/admin/regenerate-invite` — generate new token, overwrite old; creator/system-admin only
- New: `PATCH /campaigns/{id}/admin/settings` — update or clear password; creator/system-admin only
- New: `GET /campaigns/invite/{token}` — resolve token → campaign public info (name, party name, description, player count, status, is_password_protected); used by the frontend invite landing page

#### `function_app.py`
- Register 4 new HTTP routes

---

### Frontend — `web/src/`

#### `pages/Dashboard.jsx`
- Rewrite to unified view:
  - Top section: "My Campaigns" — campaigns where user has a `campaign_player` doc
  - Bottom section: "Join a Campaign" — all campaigns the user is NOT in, shown as campaign cards
- Fetch both user's campaigns (`GET /campaigns/mine` or filter from `GET /campaigns`) and all campaigns
- Render `<CampaignCard>` for browse section

#### `pages/CreateCampaign.jsx`
- Add optional password field (plaintext entry, sent to backend, bcrypt'd server-side)
- Password field is optional — leaving it empty creates an open campaign

#### `pages/Admin.jsx`
- Rename "Admin" role references in UI to "Creator" where shown to campaign creator
- System admin sees Admin page for ANY campaign (not just their own)
- Add "Campaign Settings" card with:
  - Current password status (set / not set)
  - Update password field + Save button
  - Clear password button
- Add "Invite Link" card with:
  - Display invite URL (`/campaigns/invite/{token}`)
  - Copy button
  - Regenerate button (calls `POST /campaigns/{id}/admin/regenerate-invite`)

#### `pages/Lobby.jsx`
- Add invite link section (visible to campaign creator and system admin):
  - Display invite URL
  - Copy button
  - Regenerate button

#### New: `components/campaign/CampaignCard.jsx`
- Displays: campaign name, party name, description, creator display name, player count, status badge, lock icon, Join button
- Join button behavior:
  - Open campaign: calls join API directly, navigates to character creation on success
  - Password-protected: opens `<JoinModal>`

#### New: `components/campaign/JoinModal.jsx`
- Modal with password input field
- Submit calls `POST /campaigns/{id}/join` with password
- Error message on wrong password
- Navigates to character creation on success

#### New: `pages/JoinCampaign.jsx`
- Route: `/campaigns/invite/:token`
- Calls `GET /campaigns/invite/{token}` to resolve token → campaign info
- Shows campaign card info
- Calls `POST /campaigns/{id}/join` with the token (bypasses password)
- Navigates to character creation on success

#### `services/api.js`
- `listAllCampaigns()` — `GET /campaigns`
- `joinCampaign(campaignId, { password?, inviteToken? })` — `POST /campaigns/{id}/join`
- `regenerateInviteToken(campaignId)` — `POST /campaigns/{id}/admin/regenerate-invite`
- `updateCampaignPassword(campaignId, newPassword)` — `PATCH /campaigns/{id}/admin/settings`
- `resolveInviteToken(token)` — `GET /campaigns/invite/{token}`

#### `App.jsx`
- Add route: `/campaigns/invite/:token` → `<JoinCampaign />`

---

## Files to Modify (summary)

| File | Change |
|---|---|
| `api/shared/domain.py` | Add invite_token, password_hash, rename admin_emails→creator_emails, role:"admin"→"creator" |
| `api/shared/cosmos.py` | Add list_all_campaigns(), get_campaign_by_invite_token() |
| `api/webhook_http.py` | 4 new routes, auth check renames, stop auto-joining |
| `api/function_app.py` | Register 4 new routes |
| `web/src/pages/Dashboard.jsx` | Unified view with browse section |
| `web/src/pages/CreateCampaign.jsx` | Add optional password field |
| `web/src/pages/Admin.jsx` | Password management UI, invite link UI, system admin bypass |
| `web/src/pages/Lobby.jsx` | Invite link section for creator/system-admin |
| `web/src/services/api.js` | 5 new API calls |
| `web/src/App.jsx` | Add /campaigns/invite/:token route |
| `web/src/components/campaign/CampaignCard.jsx` | New file |
| `web/src/components/campaign/JoinModal.jsx` | New file |
| `web/src/pages/JoinCampaign.jsx` | New file |
| `docs/data-models.md` | Update campaign doc schema, campaign_player role |

---

## Current Codebase Key Files (for orientation)

| File | What it does |
|---|---|
| `api/shared/domain.py` | Campaign creation, player join, state management |
| `api/shared/cosmos.py` | All Cosmos DB read/write operations |
| `api/webhook_http.py` | All HTTP endpoint handlers |
| `api/function_app.py` | Azure Functions route registration |
| `web/src/pages/Dashboard.jsx` | Current "My Campaigns" only view |
| `web/src/pages/Admin.jsx` | Campaign admin panel (creator-only currently) |
| `web/src/pages/Lobby.jsx` | Pre-launch waiting room |
| `web/src/pages/CreateCampaign.jsx` | Campaign creation form |
| `web/src/services/api.js` | Frontend API call wrappers |
| `web/src/App.jsx` | React router + auth guard |

## Key Existing Patterns

- Auth check pattern: `get_user_info(req)` returns `{email, name, ...}`; compare against `campaign["creator_emails"]` or `os.environ["SYSTEM_ADMIN_EMAILS"].split(",")`
- Cosmos writes: `cosmos.upsert_document(container, doc)` 
- All campaign_player docs partitioned under campaign_id
- SignalR broadcast: `await broadcast_to_campaign(campaign_id, event_type, payload)`
- Frontend auth: `useAuth()` hook returns `{user, loading}`; `user.userDetails` is the email
- API calls: `apiFetch(path, options)` wrapper in `api.js` handles auth headers

---

## What Is NOT Changing

- The email allowlist (`allowed_user` docs + `SYSTEM_ADMIN_EMAILS`) — still required to access the app at all
- The campaign lifecycle state machine (`lobby` → `active` → `completed/paused/deleted`)
- Character creation flow after joining
- SignalR real-time delivery
- Azure Functions deployment process (`func azure functionapp publish legendsoftlw-functions --python`)
- SWA frontend CI/CD (`.github/workflows/deploy.yml`)

# Architecture Overview

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Azure Static Web Apps |
| Auth | Azure Static Web Apps social login (Google, Facebook, Microsoft) |
| Real-time | Azure SignalR Service |
| Backend | Azure Functions (Python) |
| Orchestration | Azure Storage Queues (resolve-round, player-join, novel-export, campaign-intro) |
| Database | Azure Cosmos DB |
| Search/RAG | Azure AI Search |
| Email | Azure Communication Services |
| File Storage | Azure Blob Storage (novel exports + scene images) |
| LLM (text) | Azure OpenAI — GPT-4.1 + GPT-4.1-mini (Central US) |
| LLM (images) | Azure OpenAI — gpt-image-1 (East US 2, separate resource) |
| Hosting | Azure Static Web Apps (legendsoftlw.app) |

## Campaign Status State Machine

```
lobby → active → completed
                → paused     (all players inactive)
                → deleted    (soft-deleted by admin)
```

- Campaigns are created with `status: "lobby"`
- Admin clicks "Launch Campaign" in the lobby → sets `status: "active"`, enqueues `campaign-intro`
- `status: "lobby"` campaigns are excluded from the round-timeout timer check

## Lobby Flow

```
1. Admin creates campaign → goes to character creation → lands in Lobby
2. Other players join via invite link → auto-joined → create character → land in Lobby
3. Lobby shows:
   - Party roster with checkmark per player who has created their character
   - Real-time chat (SignalR "lobbyEvent" events, type: "chat")
   - A "player_ready" event fires on character save and appears as a system message
4. Admin clicks "Launch Campaign" →
   POST /campaigns/:id/lobby/launch →
   campaign.status = "active" →
   enqueue "campaign-intro" →
   broadcast SignalR "lobbyEvent" {type: "launched"} →
   all players on lobby page navigate to /game/:id
```

SignalR event types used by the lobby: `chat`, `player_ready`, `launched`

## SignalR Broadcast Pattern

**Important:** Azure SignalR Service does NOT support auto-joining groups via JWT claims
(the `webpubsub.*` role syntax is Web PubSub only — it's silently ignored here).

All broadcasts use **per-user targeting** via the REST API:
```
POST /api/v1/hubs/{hub}/users/{url-encoded-email}
```
Each caller looks up `get_campaign_players(campaign_id)` and passes `player_emails` to
`broadcast_narrative` / `broadcast_lobby_event`. The broadcast function iterates over
each email and sends individually. This means delivery is guaranteed to any connected
client regardless of group membership.

JWT tokens returned from the `/negotiate` endpoint only need `nameid` (email) and `aud`.

## Round Pipeline (Implemented)

The pipeline has two phases: **blocking** (any failure aborts and re-queues the
message) and **non-blocking** (failures are logged and the round continues).

```
0. Campaign opening (fires once, triggered by admin launching from lobby):
   "campaign-intro" queue → GPT-4.1 opening narrative + gpt-image-1 scene image
   → Broadcast to all players via SignalR
        ↓
1. Players submit actions via web UI
   (character sheet action OR freeform text)
        ↓
2. Freeform actions: GPT-4.1-mini pre-validates
   privately in action panel before submission
   Character sheet actions: no validation needed
        ↓
3. submit_action HTTP handler (domain.submit_player_action):
   - Stores action in story_state.pending_actions
   - If all active players submitted → enqueues "resolve-round"
   Timer (every 15 min): checks round_deadline → enqueues "resolve-round"
        ↓
4. resolve-round queue trigger (round_resolver.py) — BLOCKING PHASE:
   - Idempotency check: if round_status == "resolving", this is a retry —
     reuse the locked round_number; otherwise increment + lock
        ↓
5. GPT-4.1-mini: RAG query generation
   - Analyzes submitted player actions
   - Outputs JSON list of max 5 SRD queries
        ↓
6. Azure AI Search: SRD retrieval
   - Vector search with category filter
   - Returns relevant SRD chunks
        ↓
7. GPT-4.1: Narrative generation
   - System prompt (DM persona + rules)
   - Story state, character sheets, NPC context
   - Rolling narrative summary + player actions
   - Retrieved SRD chunks
        ↓
8. GPT-4.1-mini: State extraction
   - Outputs JSON: scene_type, HP changes, conditions,
     quest milestones, NPC updates, spell slots used
        ↓
   — NON-BLOCKING PHASE (failures logged, round not aborted) —
        ↓
9. GPT-4.1-mini: Contextual action list generation (per active player)
        ↓
10. gpt-image-1: Scene image generation
    - GPT-4.1-mini first distills a DALL-E prompt from narrative + scene
    - gpt-image-1 generates 1792×1024 image
    - Stored permanently in Blob Storage "scene-images" container
    - URL saved in story_state.scene_image_url
        ↓
11. SignalR broadcast: narrative + scene_image_url → all players
    - Per-user delivery failures are logged with user ID + reason
        ↓
12. Email + push notifications to players
        ↓
13. Inactivity tracking, deadline reset, pending_actions cleared
```

## New Player / Returning Player Flow (joining mid-campaign)
```
GET /campaigns/{id} → auto-join if not a member → "player-join" queue
  → GPT-4.1-mini: catch-up summary ("Previously on your adventure...")
  → GPT-4.1: cinematic introduction of new character to existing party
  → SignalR broadcast to all players
```

## Access Control

The app uses a two-layer auth model:

1. **SWA authentication** — `staticwebapp.config.json` requires `authenticated` on `/api/*`. Direct API calls without a session are blocked at the SWA edge. The app routes (`/*`) are intentionally left open so unauthenticated visitors land on the branded Login.jsx page and can choose their login provider.
2. **Allowlist** — every authenticated user must also be on the allowlist in Cosmos DB before they can use the app. `POST /me` checks the allowlist and returns 403 if absent. All other endpoints use `_require_auth_approved`, which additionally checks `player.approved` (defaults to `True` when missing — backward compatible with pre-allowlist players).

**Allowlist documents** are stored in the `game` container with `campaign_id = "allowed_users"` (a reserved partition key, like `"players"` for global player docs).

**System admins** (identified by the `SYSTEM_ADMIN_EMAILS` env var) can manage the allowlist via `GET/POST/DELETE /admin/users/allowed`. The Admin page shows an Access Control card to system admin users only. Removing a user sets `player.approved = False` immediately, blocking their next API call even if still authenticated.

**Frontend 403 handling** — `useAuth` detects `err.status === 403` from `registerPlayer` and sets `unauthorized = true`, which routes to the `Unauthorized` page with a contact email.

**First deployment:** run `api/scripts/seed_allowlist.py` to seed the initial allowlist. Set `SYSTEM_ADMIN_EMAILS` in Azure Functions app configuration.

## HTTP API Surface

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | /me | authenticated | Register player (allowlist-gated); sets approved:True |
| PUT | /me/push-subscription | approved | Save push notification subscription |
| POST | /campaigns | approved | Create campaign (status: lobby) |
| GET | /campaigns/:id | approved | Get campaign (auto-joins new players) |
| DELETE | /campaigns/:id | campaign admin | Soft-delete campaign |
| GET | /campaigns/:id/state | approved | Get story state, character, action list, party status, narrative log |
| GET | /campaigns/:id/character | approved | Get own character |
| PUT | /campaigns/:id/character | approved | Save character (broadcasts player_ready to lobby) |
| POST | /campaigns/:id/submit-action | approved | Submit round action |
| POST | /campaigns/:id/validate-action | approved | Pre-validate freeform action text |
| GET/POST | /campaigns/:id/negotiate | approved | SignalR connection negotiation |
| POST | /campaigns/:id/lobby/message | approved | Send lobby chat message |
| POST | /campaigns/:id/lobby/launch | campaign admin | Launch campaign (lobby → active) |
| POST | /campaigns/:id/admin/start-round | campaign admin | Force-resolve current round |
| POST | /campaigns/:id/admin/toggle-player | campaign admin | Activate/deactivate a player |
| POST | /campaigns/:id/admin/export-novel | campaign admin | Queue novel PDF export |
| GET | /admin/users/allowed | system admin | List all allowlisted emails |
| POST | /admin/users/allowed | system admin | Add email to allowlist |
| DELETE | /admin/users/allowed | system admin | Remove email; sets player.approved=False |

## Domain Layer

Business logic lives in `api/functions/domain.py`, separate from HTTP handling.
Each function takes plain dicts/primitives and returns a plain dict — no Azure
Functions imports, no HTTP concerns, independently testable.

| Function | Owned logic |
|----------|-------------|
| `submit_player_action` | Store action, check if all players submitted. Returns `{"round_ready": bool}` — handler enqueues resolution. |
| `create_new_campaign` | Build campaign + story state + campaign_player docs atomically. |
| `save_character` | Upsert character, mark player ready. Returns `{"first_completion": bool, ...}` — handler broadcasts lobby event. |
| `join_campaign_as_observer` | Create campaign_player record for new observer. |

`DomainError(message, http_status)` signals expected business-rule violations;
handlers map it to the appropriate HTTP response without knowing the rule.

## Game Screen

- Background: `tlw_campaign_bg.png` (full-bleed cover) with semi-transparent dark overlays on each panel (left/center/right) so text remains readable against the image.
- Narrative feed is seeded from the `narrative_log` on initial page load so the campaign intro (round 0) and any previous round narratives are visible immediately — players don't need to wait for a live SignalR event to see past content.
- The current `scene_image_url` from `story_state` is attached to the most recent narrative log entry in the feed.

## Error Handling
- Queue poison-message queues catch repeated failures (Azure default: 5 retries)
- Scene image failure is non-blocking — round proceeds without image
- Campaign pauses gracefully if all players go inactive

## LLM Call Summary Per Round

| Call | Model | Purpose |
|------|-------|---------|
| Pre-validation (freeform only) | GPT-4.1-mini | Validate freeform action, determine required rolls |
| RAG query generation | GPT-4.1-mini | Generate SRD search queries from player actions |
| Narrative generation | GPT-4.1 | Generate immersive DM narrative |
| State extraction | GPT-4.1-mini | Extract structured state updates from narrative |
| Action list generation | GPT-4.1-mini | Generate contextual action suggestions per player |
| NPC introduction (on join) | GPT-4.1 | Cinematic introduction for new/returning players |
| Catch-up summary (on join) | GPT-4.1-mini | "Previously in your adventure..." for new player |
| Campaign intro | GPT-4.1 | Opening DM narrative when campaign begins |
| Image prompt distillation | GPT-4.1-mini | Condenses scene + narrative into focused DALL-E prompt |
| Scene image | gpt-image-1 | 1792×1024 dark fantasy illustration, each round |
| Novel export | GPT-4.1 | Rewrite full campaign as polished fantasy novel |

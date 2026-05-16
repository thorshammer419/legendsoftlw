# The Legends of TLW — Claude Code Context

## Project Overview
AI-powered D&D 5e collaborative storytelling web app where an LLM acts as the
Dungeon Master for a group of players. Players interact via a shared web
interface, submit actions each round, and the LLM generates immersive narrative
responses grounded in D&D 5e SRD 5.1 rules.

## App Identity
- **Name:** The Legends of TLW
- **Tagline:** "Where adventurers become legends"
- **Domain:** legendsoftlw.app (registered on Cloudflare)
- **Repo:** legends-of-tlw (private GitHub repo)
- **Tech Stack:** Azure + Python (backend), React (frontend)

## Current Status
- [x] Design phase complete
- [x] GitHub repo created
- [x] Domain registered (legendsoftlw.app) on Cloudflare
- [x] Facebook Messenger webhook validated (throwaway — abandoned in favor of web app)
- [x] Folder structure created in repo
- [x] Azure infrastructure provisioned
- [x] Azure OpenAI access requested (already had access — deployed directly)
- [x] SRD data downloaded and indexed (1924 docs in srd-index)
- [x] Full React frontend built and deployed (legendsoftlw.app)
- [x] Full Azure Functions backend built and deployed
- [x] Microsoft login working (Azure SWA V1 auth mode)
- [x] Round lifecycle working end-to-end (queue-based, not Durable Functions)
- [x] Campaign lobby — pre-game gathering room with real-time chat; admin launches campaign
- [x] Campaign intro fires on admin launch (NOT on first character save — admin controls the start)
- [x] Scene image generation per round (gpt-image-1, East US 2)
- [x] Login page with logo + stone-gray title styling
- [x] Delete campaign (soft delete, two-step confirmation in Admin page)
- [x] Create campaign form includes Party Name field; errors displayed at top of page
- [x] Bug fixes: delete campaign (missing import), create campaign error handling, SignalR broadcast delivery
- [x] Tested end-to-end: create → character → lobby → launch navigates to game ✓
- [x] Game screen: campaign background image (tlw_campaign_bg.png) with semi-transparent panel overlays
- [x] Game screen: narrative feed seeded from narrative log on page load (campaign intro now visible on entry)
- [x] Email allowlist — invite-only access control; system admin management UI in Admin page; Unauthorized page for blocked users
- [x] Auth: replaced Facebook login with Google (custom OIDC via staticwebapp.config.json); Microsoft login retained; credentials in Azure SWA env vars GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
- [x] CI/CD: GitHub Actions auto-deploy on push to main (.github/workflows/deploy.yml); builds React app with Node 24, deploys by calling StaticSitesClient binary directly (SWA CLI wrapper is unreliable — bypassed); deployment token in GitHub secret AZURE_STATIC_WEB_APPS_API_TOKEN
- [x] Microsoft login fixed: adding customOpenIdConnectProviders disables SWA built-in AAD; fixed by adding explicit azureActiveDirectory config (app reg: f23a2db9-b671-4c2d-a86f-2d8539a37687, tenant: common, creds in SWA env vars AAD_CLIENT_ID / AAD_CLIENT_SECRET)
- [x] Auth config deployment fixed: staticwebapp.config.json must live in web/public/ (not web/) so npm run build copies it into web/build/ and CI deploys it; without this the identity service cannot find the Google OIDC config
- [x] Login page redesigned: provider image buttons (web/public/tlw_login_google.png, tlw_login_microsoft.png) with rounded corners and layered black glow; replaces generic purple gradient buttons
- [x] Auth overhaul: Google via custom OIDC (prompt=select_account); Microsoft via built-in azureActiveDirectory (prompt=select_account); both show account picker after sign-out; AAD app reg has enableIdTokenIssuance=true and /.auth/logout/complete registered as post-logout redirect URI
- [x] Sign-out: /.auth/logout?post_logout_redirect_uri=/ — clears SWA session; Microsoft shows a brief sign-out interstitial (~1s, no click) then auto-redirects back via /.auth/logout/complete; cannot be bypassed (SWA proxy strips Set-Cookie from function responses; custom OIDC fails on /common issuer mismatch)
- [x] Azure Functions deployed separately via `func azure functionapp publish legendsoftlw-functions --python` (NOT via SWA CI — the CI only deploys the static frontend; --api flag would conflict with the existing standalone Functions app)
- [x] Access control UI: long emails now truncate with ellipsis; Remove button stays anchored via flexShrink:0 + overflow:hidden on the row container
- [x] Role hierarchy: campaign creator renamed from `role:"admin"` to `role:"creator"`; `creator_emails` replaces `admin_emails` on campaign doc; system admin (env var `SYSTEM_ADMIN_EMAILS`) bypasses all creator gates
- [x] Campaign browser: GET /campaigns returns all lobby+active campaigns with `is_member`, `is_password_protected`, `player_count`; `password_hash` never exposed; auto-join on GET /campaigns/:id removed (non-members get 403)
- [x] Campaign creation: generates `invite_token` (32-char URL-safe secret) and optional bcrypt `password_hash` on campaign doc; password field in CreateCampaign.jsx
- [x] Explicit join flow: POST /campaigns/:id/join — checks invite_token first (bypasses password), then password (bcrypt), then open join; returns 201/200/403/404/409 as appropriate; active campaigns enqueue `player-join` on success
- [x] Password-protected join UI: JoinModal.jsx opens for locked campaigns; handles wrong-password and success states; Dashboard routes open/locked join through handleJoin
- [x] Magic invite links: GET /campaigns/invite/:token resolves token → public campaign info; JoinCampaign.jsx landing page joins with token bypass; route added to App.jsx
- [x] Password management (Admin): PATCH /campaigns/:id/admin/settings sets or clears bcrypt password; Campaign Settings card in Admin.jsx
- [x] Invite token regeneration: POST /campaigns/:id/admin/regenerate-invite generates new token (old link immediately invalid); Regenerate button in Admin.jsx and Lobby.jsx
- [x] Dashboard rewritten: API-driven via GET /campaigns; splits into "My Campaigns" (is_member=true) and "Join a Campaign" (is_member=false); no more localStorage
- [x] TDD: pytest-asyncio installed (asyncio_mode=auto was already set); 18 new tests covering domain.py (invite token, password hash) and handlers (list_campaigns_handler, join_campaign_handler); all tests pass
- [x] Background images: Dashboard uses `tlw_campaign_bg.png`, Lobby uses `tlw_lobby_bg.png`; both use `position:fixed; inset:0; overflow-y:auto` wrapper with 55% black overlay, matching Login screen pattern
- [x] Cinematic D20 class picker (CharacterCreate step 1): Shadowreaver die frame (`tlw_d20_frame.png`) composited over class portraits (`/class/{name}/{name}_create.png`); left/right arrows cycle all 12 classes with Y-axis flip animation (350ms, swap at 90° midpoint); class title above, SRD description below; `tlw_character_select.png` background; class `<select>` removed; step 2 (ability scores) unchanged. Class data in `src/data/classData.js`; component at `src/components/character/ClassDiePicker.jsx`. Note: paladin image is `.jpg`, sorcerer folder/file spells `sorceror`.
- [x] ClassDiePicker mobile layout fixes: die container responsive (`min(320px, 88vw)`); arrows repositioned as absolute overlays on die edges with semi-transparent dark background; portrait `borderRadius:50%` removed (die frame masks naturally); portrait inset `12%` to fit within die face window.
- [x] Frontend test infrastructure: `src/setupTests.js` created to load `@testing-library/jest-dom`; 11 tests for classData module and ClassDiePicker (navigation, wrap-around, onChange, accessibility)
- [x] Persistent background music (`MusicPlayer` component): plays `unconventional_wisdom.mp3` on all authenticated pre-game screens; song → 60s silence → song loop; pauses automatically on `/game/` routes, resumes on return; inline SVG mute toggle (gold, `var(--gold)`) fixed top-right; muted state resets to playing each session. 5 tests covering mute toggle and loop timing.
- [x] MusicPlayer overlap fix: inline SVG icons replace emoji (now properly gold); `ContentWrapper` in `App.jsx` adds `paddingTop:48` on all non-game routes for normal-flow screens; fixed-background screens (Dashboard, Lobby, CharacterCreate) get `paddingTop:48` on their inner content div directly. Game screen excluded — padding will apply when music is added there later.

## Immediate Next Steps
- Test full round lifecycle with real players: submit actions → resolve → narrative delivered via SignalR

## Key Design Decisions (Summary)
See individual docs files for full detail on each system.

- **No human GM** — LLM is the DM entirely
- **Shared party** — all players in same story
- **Consensus round model** — each player submits action, round resolves when
  all submit OR timeout expires (whichever first)
- **Soft death** — characters never permanently die
- **Full D&D 5e SRD 5.1** — no 2024 revised ruleset
- **Client-side dice rolling** — cryptographic randomness via crypto.getRandomValues()
- **RAG-grounded LLM** — Azure AI Search indexes SRD content
- **Hybrid action system** — character sheet actions + freeform text
- **Queue-based round lifecycle** — Azure Storage Queues replace Durable Functions (simpler, no orchestrator overhead)
- **Lobby before launch** — campaigns start in `lobby` status; admin explicitly launches which fires the opening narrative
- **Azure SignalR** — real-time broadcast for both game narrative and lobby chat/presence events
- **gpt-image-1** — scene image generation each round (separate East US 2 OpenAI resource)
- **Campaign status state machine** — `lobby` → `active` → (`completed` | `paused` | `deleted`)

## Developer Notes
- Owner/initial player group: "The Lord's Wrath" (3-9 players, max 8-9)
- Role hierarchy: System admin (env var `SYSTEM_ADMIN_EMAILS`, no barriers) → Campaign Creator (`role:"creator"`, owns the campaign) → Player (`role:"player"`)
- No player is ever permanently removed from a campaign
- All infrastructure on Azure
- Python for all backend/function code
- GPT-4.1 for narrative generation (`tlw-gpt-4.1`, Central US resource `oai-thorshammer419-centralus`)
- GPT-4.1-mini for all other LLM calls — RAG queries, state extraction, action validation, action lists, summaries, introductions, DALL-E prompt distillation (`tlw-gpt-4.1-mini`)
- gpt-image-1 for scene images (`tlw-gpt-image-1`, East US 2 resource `tlw-openai-images`)
- text-embedding-ada-002 for SRD indexing (`tlw-text-embedding-ada-002`)
- DALL-E 3 was deprecated March 2026; gpt-image-1 is the replacement (only available East US 2 / Sweden Central)

## Deployment Gotchas

### staticwebapp.config.json — two copies, must stay in sync
There are two copies of this file:
- `web/public/staticwebapp.config.json` — **the deployed copy**; `npm run build` copies it into `web/build/` which CI uploads
- `web/staticwebapp.config.json` — reference copy at the web root; not deployed but kept in sync manually

Always edit BOTH. If only `web/public/` is updated the root copy drifts and causes confusion.

### Azure Functions — deployed separately, NOT via CI
The Azure Functions app (`legendsoftlw-functions`) is a **standalone resource**, not SWA-managed. The CI workflow (`deploy.yml`) only deploys the static frontend. Functions must be deployed manually:
```
cd api && func azure functionapp publish legendsoftlw-functions --python
```
Do NOT add `--api` to the StaticSitesClient CI command — it would conflict with the existing standalone Functions app and break API routing.

### Microsoft sign-out interstitial — cannot be bypassed
Sign-out calls `/.auth/logout` which for the built-in `azureActiveDirectory` provider always redirects through `login.microsoftonline.com` before returning. Three approaches were tried and failed:
1. `fetch` with `redirect:manual` — opaque responses don't process `Set-Cookie` headers
2. Azure Function setting `Set-Cookie: Max-Age=0` — SWA proxy strips `Set-Cookie` from function responses
3. Custom OIDC for Microsoft — fails because `/common` issuer uses `{tenantid}` placeholder that doesn't match real tokens
The interstitial is ~1 second and auto-redirects back via `/.auth/logout/complete` (registered in the AAD app). This is a platform limit.

### Auth config provider routing
- Google: `customOpenIdConnectProviders.google` in `staticwebapp.config.json`; login URL `/.auth/login/google`
- Microsoft: built-in `azureActiveDirectory` in `staticwebapp.config.json`; login URL `/.auth/login/aad`
- Both use `prompt=select_account` so the account picker appears after sign-out

## Skills

### /in-progress — live session context document
Invoke `/in-progress` at the start of a working session to create `in-progress.md` in the project root. A Stop hook (registered in `~/.claude/settings.json`) automatically rewrites the file after every response, keeping it current. When a session disconnects, start a new session and read `in-progress.md` to be fully oriented — no other context needed.

- **Skill definition**: `.claude/skills/in-progress/SKILL.md`
- **Hook script**: `.claude/skills/in-progress/update_hook.py`
- **Tests**: `.claude/skills/in-progress/tests/test_update_hook.py` (`cd .claude/skills/in-progress && python3 -m pytest tests/ -v`)
- **Activation**: file existence — hook is a no-op when `in-progress.md` is absent
- **Lifecycle**: invoke `/in-progress` to start → hook keeps it updated → delete the file when the feature is done
- **Hook fires in**: local CLI (`claude` terminal) only — not in bridge/web mode

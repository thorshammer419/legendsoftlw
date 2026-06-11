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
- [x] Microsoft login fixed: adding customOpenIdConnectProviders disables SWA built-in AAD; fixed by adding explicit azureActiveDirectory config (app reg: [APP_REGISTRATION_ID], tenant: common, creds in SWA env vars AAD_CLIENT_ID / AAD_CLIENT_SECRET)
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
- [x] ClassDiePicker portrait overflow fix: die container enlarged to `min(560px, 90vw)` (was `min(320px, 88vw)`) for a larger die on desktop while keeping arrows on-screen on mobile; portrait `objectFit` changed from `cover` to `contain` so tall/wide images never bleed past the d20 frame polygon edges.
- [x] ClassDiePicker d20 frame removed: `tlw_d20_frame.png` overlay removed due to persistent layout issues; arrows and character portraits unchanged.
- [x] Frontend test infrastructure: `src/setupTests.js` created to load `@testing-library/jest-dom`; 11 tests for classData module and ClassDiePicker (navigation, wrap-around, onChange, accessibility)
- [x] Persistent background music (`MusicPlayer` component): plays `unconventional_wisdom.mp3` on all authenticated pre-game screens; song → 60s silence → song loop; pauses automatically on `/game/` routes, resumes on return; inline SVG mute toggle (gold, `var(--gold)`) fixed top-right; muted state resets to playing each session. 5 tests covering mute toggle and loop timing.
- [x] MusicPlayer overlap fix: inline SVG icons replace emoji (now properly gold); `ContentWrapper` in `App.jsx` adds `paddingTop:48` on all non-game routes for normal-flow screens; fixed-background screens (Dashboard, Lobby, CharacterCreate) get `paddingTop:48` on their inner content div directly. Game screen excluded — padding will apply when music is added there later.
- [x] New Campaign page improvements: mobile scroll fixed (removed broken `height:100%`/`overflowY:auto` from outer div); Max Players expanded to 1–10; "Character Rules" card added (ability score method: Standard Array default, Point Buy, Roll for Stats) stored as `ability_score_method` on campaign doc; AI generation buttons (`tlw_d20_roll.png` placeholder) inline with labels for Campaign Name, Party Name, Description — calls `POST /api/campaigns/generate-field` (new Azure Function, GPT-4.1-mini); per-field loading state; populated fields used as cross-context (name↔description, both for party name). CharacterCreate enforcement of ability_score_method is a follow-up task. 15 new frontend tests + 11 new backend tests (206 Python / 67 JS total).
- [x] New Campaign page — mobile scroll fix (real fix: `position:fixed; inset:0; overflow-y:auto` pattern matching Dashboard/Lobby, overcoming global `overflow:hidden` on html/body/#root); granular ability score rules: Standard Array (6 editable inputs, 3–18 soft warning), Point Buy (point budget 1–72), Roll for Stats (dice total + keep count, auto-adjust with 3s inline message); all stored as `ability_score_rules` nested object on campaign doc; sub-settings revealed on method selection. 12 new frontend tests + 3 new backend tests (209 Python / 79 JS total).
- [x] Max starting level: campaign creator sets level cap (1–20 dropdown, default 1) on New Campaign; CharacterCreate fetches campaign on mount (spinner while loading), replaces free-form level input with dropdown limited to allowed levels, defaults to max, falls back to 20 for old campaigns or fetch errors. 3 new CreateCampaign frontend tests + 9 new CharacterCreate frontend tests + 2 new backend tests (211 Python / 91 JS total).
- [x] Cancel/Leave campaign: creator sees "Cancel Campaign" button (full soft-delete + SignalR `campaign_deleted` broadcast to all members) and players see "Leave Campaign" button (hard-remove of campaign_player + character records + SignalR `player_left` for silent lobby refresh); both on CharacterCreate and Lobby header rows; confirmation modal on both; navigation to Dashboard after action; CharacterCreate wired up to `useSignalR` to handle `campaign_deleted` redirect even when creator cancels from elsewhere. New Cosmos functions `delete_campaign_player` + `delete_character`; new `leave_campaign` domain function; new `DELETE /campaigns/{id}/leave` endpoint. 6 new domain tests + 10 new Lobby tests + 6 new CharacterCreate tests (217 Python / 107 JS total).
- [x] Shared Navbar: globally rendered in `App.jsx` via `AppShell` (hidden on game routes); three slots — left: app logo on `/`, `tlw_nav_back.png` back button (calls `navigate(-1)`) on all other routes; center: page-specific content via `NavbarContext` (`setCenterContent`/`centerContent`); right: mute toggle (gold inline SVG). Music player audio logic extracted to `useMusicPlayer` custom hook (in `src/hooks/useMusicPlayer.js`). All authenticated pre-game pages (`Dashboard`, `CharacterCreate`, `Lobby`, `CreateCampaign`, `Admin`, `CampaignArchive`) updated: inline back buttons removed (Navbar handles navigation); Cancel/Leave and Enter Game action buttons registered as center content; page `h1` titles remain on-page below the navbar. Test helpers updated to use real `NavbarProvider` + `NavbarCenterSlot` pattern so center-slot buttons remain testable. 217 Python / 107 JS total (no new tests, all green).
- [x] Navbar polish: left slot shows `tlw_logo.jpg` (36px) on Dashboard instead of text; three slots are equal-width (`flex:1` each) so mute button is always fully visible; role-aware step indicator in center slot (New Campaign = Step 1 of 3; CharacterCreate = Step 2 of 3 for creators / Step 1 of 2 for players; Lobby = Step 3 of 3 / Step 2 of 2); Cancel/Leave buttons shortened to "Cancel"/"Leave" with compact padding to fit mobile; sub-step tracker removed from CharacterCreate navbar. All page titles sit below the navbar at 84px top padding (52px navbar + 32px air), centered by screen width. Admin page switched to `position:fixed; inset:0; overflow-y:auto` scroll pattern (was using `height:100%` which broke scrolling). Admin access-control email rows now truncate long addresses with ellipsis and keep Remove button anchored (`flex:1; minWidth:0; overflow:hidden; textOverflow:ellipsis` on span, `flexShrink:0` on button) — matching Dashboard pattern.
- [x] Lobby chat fix — full persistence, history, and MMO-style UI: messages stored in `lobby_chat_{campaignId}` Cosmos document; `GET /campaigns/{id}/lobby/chat` returns full history; `POST /campaigns/{id}/lobby/message` now persists each message with a UUID `message_id` (client-supplied or server-generated) and echoes it in the SignalR broadcast; frontend loads full history on mount; SignalR and polling events deduplicated by `message_id`; sender sees message immediately (optimistic UI), removed on failure; MMO-style rendering: `[HH:MM] DisplayName: text`, class-based name colors (12 classes), gold fallback for no class, system messages remain italic gray; `crypto.randomUUID` polyfill added to `setupTests.js`. 5 new domain tests + 8 new endpoint tests + 13 new frontend tests (230 Python / 117 JS total).
- [x] Launch redirect fix: Lobby `useEffect` redirect condition changed from `status === 'active' && round_number > 0` to just `status === 'active'`; non-creator players were stuck in lobby after launch because `round_number` is 0 until the first player-action round resolves (the campaign intro does not increment it). 3 new frontend tests.
- [x] Lobby chat class colors fix: `char_class` now stored on `campaign_player` document when character is saved (`save_character` domain function); `lobby_message_handler` reads `char_class` from `cp` (already fetched for the active-player check) instead of the global player doc where it was never written. 2 new domain tests + 2 new endpoint tests (234 Python / 120 JS total).
- [x] Lobby presence announcements: join/leave system messages persisted to Cosmos and broadcast via SignalR; join format `"⚔ {display_name} has entered the lobby — {char_name}, {char_class}, level {level}"`; leave via `useEffect` cleanup + `navigator.sendBeacon` on tab close; 10-second rapid-rejoin suppression via `lobby-leave-announce` queue with visibility timeout (player rejoins within 10s → leave announcement dropped); join also suppressed when player was already "present" or left < 10s ago — prevents duplicate announcements on page refresh; presence doc (`presence_{campaignId}_{email}`) tracks current status + display_name; `POST /campaigns/{id}/lobby/presence` HTTP endpoint; `lobby-leave-announce` queue trigger; chat window resized to `calc(50vh - 120px)` with scrollbar. `enqueue` helper gains optional `visibility_timeout` param. 13 new domain tests + 15 new endpoint tests + 3 new frontend tests (261 Python / 128 JS total).

- [x] Issue #63 — DiceRoller utility + useAbilityScoreEngine hook (TDD): `rollDice` pure function (`web/src/utils/diceRoller.js`); `useAbilityScoreEngine` hook covering Standard Array chip assignment, Point Buy point tracking, Roll for Stats chip generation, rerollChip, markRerolled. `crypto.getRandomValues` polyfill added to `setupTests.js`. 4 new DiceRoller tests + 16 new engine tests (261 Python / 148 JS total).
- [x] Issue #64 — Standard Array picker UI (chip-based assignment in CharacterCreate step 2): chips show from campaign rules (fallback [15,14,13,12,10,8]); click slot → aria-pressed focus; click chip → assigns to focused slot; click assigned slot → unassigns; save button disabled until all 6 filled; `character_name` label gets `htmlFor` for a11y. 7 new frontend tests (261 Python / 155 JS total).
- [x] Issue #65 — Point Buy picker UI: +/− buttons per ability (8–15); SRD non-linear cost table; live "pts left" counter; + disabled at budget limit or score 15; − disabled at 8; save enabled at all times (budget enforced via button disabling); `isComplete` always true for point_buy in engine. 9 new frontend tests (261 Python / 164 JS total).
- [x] Issue #66 — Roll for Stats picker — roll + assign phase: Roll All + individual Roll buttons; dice display (kept=gold, dropped=line-through); transitions to chip-assign UI after all 6 rolled; same assign/unassign pattern as Standard Array; save locked until all 6 placed; `isValid` logic unified across all three methods in engine. 8 new frontend tests (261 Python / 172 JS total).
- [x] Issue #67 — Reroll request/response + approval card: two stateless endpoints (`POST /reroll-request` + `POST /reroll-response`); `useRerollApproval` hook (idle→pending→approved/denied, 60s timeout); non-creator chips show Request Reroll/Pending/Denied; creator chips show plain Reroll (no approval); global floating approval card in AppShell via NavbarContext `pendingRerollRequest`; `rerolled` flag set via `engine.markRerolled` on approval. 8 new backend tests + 8 new hook tests + 4 new frontend tests (269 Python / 184 JS total).
- [x] Issue #68 — 🎲 rerolled badge in lobby: `save_character` persists `rerolled:True` on `campaign_player` when character payload includes it; `lobby_message_handler` includes `rerolled` flag from campaign_player in chat message; `CharacterCreate` tracks `hasRerolled` state (set on creator direct-reroll or approved non-creator reroll), passes `rerolled:true` in saveCharacter payload; `Lobby.jsx` shows 🎲 emoji after player name in Adventurers roster and after sender name in chat when `rerolled` is true. 4 new domain tests + 2 new lobby chat tests + 3 new CharacterCreate tests + 4 new Lobby tests (273 Python / 191 JS total).
- [x] Ability score rules polish (no issue): Roll for Stats method value bug fixed (`'roll'` → `'roll_for_stats'` in CreateCampaign); Standard Array values now hard-clamped to 1–20 (removed 3–18 soft warning); Point Buy gains Min Score + Max Score controls (stored as `point_buy_min` / `point_buy_max` in `ability_score_rules`); `useAbilityScoreEngine` extended: dynamic cost table covers any min/max range (SRD costs for 8–15, refund 1pt/step below, 2pt/step above), exposes `minScore`, `maxScore`, `pointBuyCostIncrement`; `CharacterCreate` point buy UI uses engine-exposed values instead of hardcoded constants. (273 Python / 190 JS total).
- [x] Bug fix: RFS chip pool seeded from SA defaults before campaign loads — `useAbilityScoreEngine` `availableChips` initialized with Standard Array defaults before API response arrived (method started as 'standard_array' default); added `useEffect` to reset all engine state when method or SA array values change; also fixed `assign()` using `filter` (removed ALL chips with same value) → `indexOf+slice` (removes only first occurrence), preventing duplicate roll sums from wiping the pool.
- [x] Bug fix: custom Standard Array values not propagating to step 2 — `useEffect` only depended on `[method]`; for SA campaigns method never changes so the effect didn't re-fire when custom values arrived; added `standardArrayKey` (JSON-serialized array) as second dep so chips reset to campaign's configured values.
- [x] Issue #70 — Persistent reroll flag Cosmos doc: `upsert_reroll_flag`, `get_reroll_flag`, `delete_reroll_flag`, `get_reroll_flags_for_campaign`, `delete_reroll_flags_for_campaign` in cosmos.py; `save_character` writes flag when `rerolled:True` in payload; `join_campaign_as_observer` seeds `rerolled` on campaign_player from flag doc (persists across leave/rejoin); flag docs cleaned up on campaign cancel (`delete_campaign_handler`). 7 new domain tests + 2 new delete-campaign tests (288 Python total).
- [x] Issue #71 — REROLL label in Lobby roster: `<span>` after creator label, red (`var(--danger)`), bold, all-caps, 11px; shown when `p.rerolled` is true. 3 new Lobby frontend tests (193 JS total).
- [x] Issue #72 — Admin Reroll Flags card: `GET /campaigns/{id}/admin/reroll-flags` returns `[{email, display_name, char_name, char_class}]`; `DELETE /campaigns/{id}/admin/reroll-flag/{player_email}` deletes flag + clears `rerolled` from campaign_player; system-admin-only (403 otherwise, 404 if flag missing); routes registered in `function_app.py`; `getRerollFlags`/`removeRerollFlag` added to `services/api.js`; Admin.jsx loads flags on mount and shows card (null = hidden, [] = "No active reroll flags"); inline confirm/cancel buttons per row. 8 new backend tests (288 Python / 193 JS total).
- [x] Issues #74–#78 (PRD #73) — Roll-for-stats reroll + character draft polish: #74 `rerolled` in `party_status` endpoint; #75 `reroll_request` SignalR handled in Lobby (creator sees approval card); #76 per-chip confirm/cancel flow (by index, not value — handles duplicate sums); #77 `backOverride` in NavbarContext + `?step=2` query param to restore step; #78 server-side character draft — `character_draft` Cosmos doc, `PUT/GET /campaigns/{id}/character/draft` endpoints, `save_character_draft`/`get_character_draft_for_player` domain functions, draft cleared on save/leave/cancel, `restoreFromDraft` added to `useAbilityScoreEngine`, CharacterCreate silently restores draft on mount and saves on Next/Back/beforeunload. 12 new backend tests + 6 new frontend tests (301 Python / 210 JS total).
- [x] Issues #80–#83 (PRD #79) — Navigation polish + form persistence: #80 `backOverride` in NavbarContext extended to support function callbacks (Navbar back arrow calls function if `typeof backOverride === 'function'`); key bug fixed: `setBackOverride(fn)` must use `setBackOverride(() => fn)` to avoid React's functional-updater trap; `NavbarContext` exported for direct test injection. #81 CharacterCreate falls back to `getCharacter` when draft is absent — restores identity + ability scores (synthetic rollResults for roll_for_stats to satisfy `isValid`). #82 New Campaign form persists to `sessionStorage` on every change, restores on mount, clears on successful create. #83 CharacterCreate step 2 registers `handleBack` as `backOverride` so Navbar arrow goes to step 1 (not browser history). 3 Navbar tests + 4 CharacterCreate restore tests + 3 CreateCampaign sessionStorage tests (301 Python / 221 JS total).
- [x] Bug fixes (post #80–#83 deploy): ClassDiePicker gains `value` prop — syncs displayed class when identity restored from draft or saved character (fixes class resetting to Barbarian on Back and on lobby→character navigation); `rerollChip` in `useAbilityScoreEngine` had a `setScores` loop that unassigned ANY ability matching the old chip value by value, incorrectly wiping an assigned score when two roll results shared the same sum — loop removed (reroll buttons only appear on unassigned pool chips); CharacterCreate draft-restore effect gains a `cancelled` flag to discard stale async callbacks from React Strict Mode double-invocation. 2 new ClassDiePicker tests, 1 new engine test replacing the incorrect "unassigns by value" test (223 JS total).

## Immediate Next Steps
- Issue #84: Next feature TBD

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

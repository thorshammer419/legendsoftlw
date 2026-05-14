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
- [x] CI/CD: GitHub Actions auto-deploy on push to main (.github/workflows/deploy.yml); builds React app with Node 24, deploys via SWA CLI 1.1.9; deployment token in GitHub secret AZURE_STATIC_WEB_APPS_API_TOKEN

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
- Campaign creator is admin by default
- No player is ever permanently removed from a campaign
- All infrastructure on Azure
- Python for all backend/function code
- GPT-4.1 for narrative generation (`tlw-gpt-4.1`, Central US resource `oai-thorshammer419-centralus`)
- GPT-4.1-mini for all other LLM calls — RAG queries, state extraction, action validation, action lists, summaries, introductions, DALL-E prompt distillation (`tlw-gpt-4.1-mini`)
- gpt-image-1 for scene images (`tlw-gpt-image-1`, East US 2 resource `tlw-openai-images`)
- text-embedding-ada-002 for SRD indexing (`tlw-text-embedding-ada-002`)
- DALL-E 3 was deprecated March 2026; gpt-image-1 is the replacement (only available East US 2 / Sweden Central)

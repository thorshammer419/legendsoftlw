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
- [ ] Folder structure created in repo
- [ ] Azure infrastructure provisioned
- [ ] Azure OpenAI access requested
- [ ] SRD data downloaded and indexed
- [ ] Any application code written

## Immediate Next Steps
1. Create folder structure in repo (see docs/project-structure.md)
2. Set up GitHub Codespaces as primary dev environment
3. Register domain legendsoftlw.app DNS with Cloudflare
4. Provision Azure infrastructure (see docs/azure-infrastructure.md)
5. Submit Azure OpenAI access request (GPT-4.1 + GPT-4.1-mini)
6. Download and index SRD content (see docs/srd-pipeline.md)
7. Build React frontend (see docs/frontend.md)
8. Build Azure Functions backend (see docs/backend.md)

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
- **Azure Durable Functions** — orchestrates round lifecycle
- **Azure SignalR** — real-time narrative broadcast to all players

## Developer Notes
- Owner/initial player group: "The Lord's Wrath" (3-9 players, max 8-9)
- Campaign creator is admin by default
- No player is ever permanently removed from a campaign
- All infrastructure on Azure
- Python for all backend/function code
- GPT-4.1 for narrative generation
- GPT-4.1-mini for all other LLM calls (RAG queries, state extraction,
  action validation, action lists, summaries, introductions)

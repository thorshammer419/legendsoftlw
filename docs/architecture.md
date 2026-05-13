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

## Round Pipeline (Implemented)

```
0. Campaign start:
   First character save → "campaign-intro" queue message
   → GPT-4.1 opening narrative + gpt-image-1 scene image
   → Broadcast to all players via SignalR
        ↓
1. Players submit actions via web UI
   (character sheet action OR freeform text)
        ↓
2. Freeform actions: GPT-4.1-mini pre-validates
   privately in action panel before submission
   Character sheet actions: no validation needed
        ↓
3. submit_action HTTP handler:
   - Stores action in story_state.pending_actions
   - If all active players submitted → enqueues "resolve-round"
   Timer (every 15 min): checks round_deadline → enqueues "resolve-round"
        ↓
4. resolve-round queue trigger (round_resolver.py):
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
9. GPT-4.1-mini: Contextual action list generation (per active player)
        ↓
10. gpt-image-1: Scene image generation
    - GPT-4.1-mini first distills a DALL-E prompt from narrative + scene
    - gpt-image-1 generates 1792×1024 image
    - Stored permanently in Blob Storage "scene-images" container
    - URL saved in story_state.scene_image_url
        ↓
11. SignalR broadcast: narrative + scene_image_url → all players
        ↓
12. Email + push notifications to players
        ↓
13. Inactivity tracking, deadline reset, pending_actions cleared
```

## New Player / Returning Player Flow
```
GET /campaigns/{id} → auto-join if not a member → "player-join" queue
  → GPT-4.1-mini: catch-up summary ("Previously on your adventure...")
  → GPT-4.1: cinematic introduction of new character to existing party
  → SignalR broadcast to all players
```

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

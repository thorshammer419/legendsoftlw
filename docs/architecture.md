# Architecture Overview

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Azure Static Web Apps |
| Auth | Azure Static Web Apps social login (Google, Facebook, Microsoft) |
| Real-time | Azure SignalR Service |
| Backend | Azure Functions (Python) |
| Orchestration | Azure Durable Functions |
| Database | Azure Cosmos DB |
| Search/RAG | Azure AI Search |
| Email | Azure Communication Services |
| File Storage | Azure Blob Storage (novel exports) |
| LLM | Azure OpenAI (GPT-4.1 + GPT-4.1-mini) |
| Hosting | Azure Static Web Apps (legendsoftlw.app) |

## Round Pipeline (Complete)

```
1. Players submit actions via web UI
   (character sheet action OR freeform text)
        ↓
2. Freeform actions: GPT-4.1-mini pre-validates
   privately in action panel before submission
   Character sheet actions: no validation needed
        ↓
3. Azure Durable Function collects actions
   - wait_for_external_event per player
   - Race against configurable timeout timer
   - Timeout respects schedule settings
     (quiet hours, active days, blackout dates)
   - Absent players get graceful narrative skip
        ↓
4. GPT-4.1-mini: RAG query generation
   - Analyzes submitted player actions
   - Outputs JSON list of max 5 SRD queries
   - Each query has: query text, category, tags
        ↓
5. Azure AI Search: SRD retrieval
   - Vector search with category filter
   - Returns relevant SRD chunks
        ↓
6. GPT-4.1: Narrative generation
   - System prompt (DM persona + rules)
   - Story state document
   - Abbreviated character sheets (active players)
   - Last 3 interactions for relevant major NPCs
   - Rolling narrative summary (last 3 rounds)
   - Player actions this round + dice results
   - Retrieved SRD chunks
   - Outputs: immersive DM narrative
        ↓
7. GPT-4.1-mini: State extraction
   - Outputs JSON state update including:
     scene_type, HP changes, conditions,
     quest milestones, NPC updates,
     interaction log entries, spell slots used
        ↓
8. GPT-4.1-mini: Contextual action list generation
   - Per player, based on character sheet + scene
   - Max 5 situational suggestions per player
   - Pre-generated and cached in Cosmos DB
        ↓
9. Azure Functions:
   - Write updated story state to Cosmos DB
   - Write updated NPC documents to Cosmos DB
   - Update player action economy + spell slots
   - Check inactivity thresholds
   - Broadcast narrative via Azure SignalR
        ↓
10. Web app:
    - Narrative appears in all players' feeds
    - Party status panel resets for new round
    - Action panels repopulate with new
      contextual action suggestions
    - Players submit next round actions
```

## Error Handling
- Azure Durable Functions checkpointing after each activity
- 3 retries with exponential backoff on any activity failure
- Admin notified via email if all retries exhausted
- Campaign pauses gracefully on unrecoverable failure
- Monthly Azure spend cap — admin notified at 80%, pauses at 100%

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
| Novel export | GPT-4.1 | Rewrite full campaign as polished fantasy novel |

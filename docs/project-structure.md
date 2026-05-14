# Project Structure

## Repository: legends-of-tlw

```
legends-of-tlw/
│
├── CLAUDE.md                          # Claude Code context (start here)
│
├── api/                               # Azure Functions backend (Python)
│   ├── function_app.py                # Main Functions entry point
│   ├── requirements.txt               # Python dependencies
│   ├── host.json                      # Functions host configuration
│   ├── local.settings.json            # Local env vars (gitignored)
│   │
│   ├── functions/
│   │   ├── webhook_http.py            # HTTP handlers — thin: parse → domain → respond
│   │   ├── round_resolver.py          # Queue-triggered round pipeline coordinator
│   │   ├── domain.py                  # Business logic layer (no HTTP/Azure imports)
│   │   │                              # submit_player_action, create_new_campaign,
│   │   │                              # save_character, join_campaign_as_observer
│   │   │
│   │   └── activities/
│   │       ├── rag_query.py           # GPT-4.1-mini RAG query generation
│   │       ├── search.py              # Azure AI Search SRD retrieval
│   │       ├── narrative.py           # GPT-4.1 narrative generation
│   │       ├── state_extract.py       # GPT-4.1-mini state extraction
│   │       ├── action_validator.py    # GPT-4.1-mini freeform action validation
│   │       ├── action_list.py         # GPT-4.1-mini contextual action list
│   │       ├── npc_introduction.py    # GPT-4.1 new player introduction
│   │       ├── catchup_summary.py     # GPT-4.1-mini catch-up for new players
│   │       ├── campaign_intro.py      # GPT-4.1 opening narrative on launch
│   │       ├── novel_export.py        # GPT-4.1 campaign novel → PDF → Blob
│   │       ├── scene_image.py         # gpt-image-1 scene illustration
│   │       ├── cosmos.py              # Cosmos DB read/write helpers
│   │       ├── signalr.py             # Azure SignalR broadcast (logs delivery failures)
│   │       ├── email.py               # Azure Communication Services email
│   │       └── push.py                # Web push notifications (VAPID)
│   │
│   └── helpers/
│       ├── character.py               # abbreviated_sheet(), format_action() — shared LLM serializers
│       ├── llm.py                     # openai_client() factory (shared by all text activities)
│       ├── queue.py                   # enqueue() — shared Azure Storage Queue helper
│       ├── dice.py                    # Server-side dice utilities
│       ├── schedule.py                # Round timeout + quiet hours logic
│       ├── inactivity.py              # Player inactivity tracking
│       └── srd_loader.py              # SRD chunking + indexing utilities
│
├── web/                               # React frontend
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── index.jsx
│   │   ├── App.jsx
│   │   │
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── GameLayout.jsx     # Main 3-panel desktop layout
│   │   │   │   └── MobileLayout.jsx   # Story-first + drawers mobile layout
│   │   │   │
│   │   │   ├── narrative/
│   │   │   │   ├── NarrativeFeed.jsx  # Scrolling DM narrative display
│   │   │   │   └── RoundMarker.jsx    # Visual separator between rounds
│   │   │   │
│   │   │   ├── action/
│   │   │   │   ├── ActionPanel.jsx    # Container for action submission
│   │   │   │   ├── ActionSelector.jsx # Character sheet action list
│   │   │   │   ├── FreeformAction.jsx # Freeform text + DM dialogue
│   │   │   │   ├── TargetSelector.jsx # NPC + party member target picker
│   │   │   │   └── AbilityConfig.jsx  # Per-ability configuration UI
│   │   │   │
│   │   │   ├── dice/
│   │   │   │   └── DiceRoller.jsx     # All 7 dice, animated, crypto random
│   │   │   │
│   │   │   ├── character/
│   │   │   │   ├── CharacterPanel.jsx # Full character sheet left panel
│   │   │   │   ├── SpellList.jsx      # Spells organized by slot level
│   │   │   │   ├── ActionList.jsx     # Actions, bonus actions, reactions
│   │   │   │   ├── ConditionBadge.jsx # Active condition indicator
│   │   │   │   └── ResourceTracker.jsx# HP, spell slots, class features
│   │   │   │
│   │   │   ├── quest/
│   │   │   │   ├── QuestLog.jsx       # Quest objectives + milestones
│   │   │   │   └── PartyStatus.jsx    # Who has submitted this round
│   │   │   │
│   │   │   └── admin/
│   │   │       ├── AdminDrawer.jsx    # Quick-access in-game admin panel
│   │   │       └── PlayerCard.jsx     # Per-player admin controls
│   │   │
│   │   ├── pages/
│   │   │   ├── Login.jsx              # Social login page
│   │   │   ├── Dashboard.jsx          # Campaign list + create button
│   │   │   ├── CreateCampaign.jsx     # New campaign setup form
│   │   │   ├── CharacterCreate.jsx    # Full D&D 5e character creation form
│   │   │   ├── Game.jsx               # Main game UI (hybrid layout)
│   │   │   ├── Admin.jsx              # Full admin settings page
│   │   │   └── CampaignArchive.jsx    # Completed campaign viewer
│   │   │
│   │   ├── hooks/
│   │   │   ├── useSignalR.js          # Azure SignalR connection + events
│   │   │   ├── useGame.js             # Coordinator: composes useGameState + useNarrativeFeed
│   │   │   ├── useGameState.js        # Fetches/refreshes game state and campaign
│   │   │   ├── useNarrativeFeed.js    # Feed state: seed from log, append live updates
│   │   │   ├── useCampaign.js         # Campaign + party_status loading (Lobby, Admin)
│   │   │   ├── useActionPanel.js      # Action submission state
│   │   │   ├── useAuth.js             # Static Web Apps auth helpers
│   │   │   └── useDice.js             # Dice rolling + crypto random
│   │   │
│   │   └── services/
│   │       ├── api.js                 # All API calls to Azure Functions
│   │       ├── auth.js                # SWA auth token helpers
│   │       └── notifications.js       # Push notification registration
│   │
│   ├── package.json
│   └── staticwebapp.config.json       # SWA routing + auth provider config
│
├── data/                              # SRD source data (not deployed)
│   ├── srd_markdown/                  # Raw SRD markdown files
│   │   ├── combat.md
│   │   ├── conditions.md
│   │   ├── spellcasting.md
│   │   └── ...
│   └── srd_json/                      # Structured 5e-database JSON
│       ├── spells.json
│       ├── monsters.json
│       ├── classes.json
│       ├── races.json
│       ├── equipment.json
│       └── ...
│
├── scripts/
│   ├── index_srd.py                   # One-time SRD indexing into Azure AI Search
│   ├── provision.sh                   # Azure infrastructure provisioning script
│   └── seed_campaign.py               # Optional: seed test campaign data
│
├── docs/
│   ├── architecture.md                # Full system architecture
│   ├── data-models.md                 # All Cosmos DB document schemas
│   ├── llm-prompts.md                 # All LLM prompt templates
│   ├── azure-infrastructure.md        # Azure provisioning guide
│   ├── project-structure.md           # This file
│   ├── frontend.md                    # Frontend build guide
│   ├── backend.md                     # Backend build guide
│   ├── srd-pipeline.md                # SRD data pipeline guide
│   └── game-design.md                 # Full game design decisions
│
├── .env                               # Local secrets (gitignored)
├── .gitignore
└── README.md
```

## Setup Commands (from repo root in Codespaces or local)

```bash
# Install Python dependencies
cd api
pip install -r requirements.txt

# Install Node dependencies
cd ../web
npm install

# Start Functions locally
cd ../api
func start

# Start React dev server
cd ../web
npm start
```

## .gitignore additions needed
```
# Secrets
.env
api/local.settings.json

# Python
__pycache__/
*.pyc
.venv/

# Node
node_modules/
web/build/

# Data (large files)
data/srd_json/*.json
data/srd_markdown/*.md
```

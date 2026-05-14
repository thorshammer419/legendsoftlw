# Data Models

All data stored in Azure Cosmos DB.

---

## Campaign Document

```json
{
  "id": "campaign_123",
  "type": "campaign",
  "name": "The Sunken Tomb of Valdris",
  "party_name": "The Lord's Wrath",
  "theme": "Dark gothic horror in ancient ruins",
  "status": "active",
  "campaign_type": "finite",
  "created_by": "mark@example.com",
  "created_at": "2026-01-01T00:00:00Z",
  "admin_emails": ["mark@example.com"],
  "max_players": null,
  "schedule": {
    "timeout_enabled": true,
    "timeout_duration_hours": 24,
    "quiet_hours_enabled": true,
    "quiet_hours": {
      "start": "21:00",
      "end": "09:00"
    },
    "timezone": "America/Chicago",
    "active_days": {
      "monday": true,
      "tuesday": true,
      "wednesday": true,
      "thursday": true,
      "friday": true,
      "saturday": true,
      "sunday": true
    },
    "blackout_dates": []
  },
  "inactivity_thresholds": {
    "combat_encounters": 2,
    "scenes": 4
  },
  "legend": {
    "previous_campaign_id": null,
    "previous_campaign_name": null,
    "summary": null,
    "key_events": [],
    "returning_characters": [],
    "new_characters": []
  }
}
```

---

## Story State Document

```json
{
  "id": "state_campaign_123",
  "type": "story_state",
  "campaign_id": "campaign_123",
  "round_number": 14,
  "scene_type": "combat",
  "current_scene": {
    "location": "The Sunken Tomb of Valdris — Throne Room Level 3",
    "description": "A vast chamber of black obsidian, lit by cold purple fire in iron sconces. The air smells of decay and old magic.",
    "active_npcs": ["Valdris the Lich", "Two skeleton guards"],
    "threats": ["Valdris has cast Blight twice", "Skeleton guards blocking north exit"],
    "exits": ["North corridor (blocked)", "Sealed stone door to east"]
  },
  "quest": {
    "main_objective": "Retrieve the Amulet of Valdris",
    "completed_milestones": [
      "Found the tomb entrance",
      "Defeated the guardian construct",
      "Discovered the phylactery chamber location"
    ],
    "failed_milestones": []
  },
  "party": {
    "members": ["mark@example.com", "player2@example.com"],
    "conditions": {
      "mark@example.com": ["Poisoned"],
      "player2@example.com": []
    },
    "position": "Together in throne room"
  },
  "narrative_summary": "Rolling prose summary of the last 3 rounds of narrative...",
  "round_number": 14,
  "pending_actions": {},
  "action_economy": {
    "mark@example.com": {
      "action_used": false,
      "bonus_action_used": false,
      "reaction_used": false,
      "movement_remaining": 30
    }
  }
}
```

---

## Player Document

```json
{
  "id": "player_mark@example.com",
  "type": "player",
  "campaign_id": "players",
  "email": "mark@example.com",
  "display_name": "Mark",
  "identity_provider": "google",
  "created_at": "2026-01-01T00:00:00Z",
  "approved": true,
  "notifications": {
    "email": true,
    "push": true,
    "push_subscription": {
      "endpoint": "https://fcm.googleapis.com/...",
      "keys": {
        "p256dh": "...",
        "auth": "..."
      }
    }
  }
}
```

`approved` defaults to `True` when absent (backward compatible). Set to `False` by the allowlist removal endpoint to block access immediately.

---

## Allowed User Document

Stored in the `game` container, partitioned under `"allowed_users"`.

```json
{
  "id": "allowed_user_mark@example.com",
  "type": "allowed_user",
  "campaign_id": "allowed_users",
  "email": "mark@example.com"
}
```

Presence of this document is the gate for `POST /me`. Only system admins (see `SYSTEM_ADMIN_EMAILS` env var) can create or delete these. See `api/scripts/seed_allowlist.py` for initial seeding.

---

## Campaign Player Document (per player per campaign)

```json
{
  "id": "campaign_player_campaign123_mark",
  "type": "campaign_player",
  "campaign_id": "campaign_123",
  "email": "mark@example.com",
  "status": "active",
  "role": "admin",
  "consecutive_combat_skips": 0,
  "consecutive_scene_skips": 0,
  "manually_set_inactive": false,
  "inactivated_at": null,
  "joined_at": "2026-01-01T00:00:00Z",
  "character_creation_token": "abc123",
  "character_creation_complete": true,
  "notifications": {
    "email": true,
    "push": false
  }
}
```

---

## Character Sheet Document

```json
{
  "id": "character_campaign123_mark",
  "type": "character",
  "campaign_id": "campaign_123",
  "email": "mark@example.com",
  "name": "Thorin Ironforge",
  "race": "Dwarf",
  "class": "Fighter",
  "subclass": "Battle Master",
  "level": 5,
  "background": "Soldier",
  "alignment": "Neutral Good",
  "hp": {
    "current": 45,
    "max": 52,
    "temp": 0
  },
  "armor_class": 18,
  "initiative": 1,
  "speed": 25,
  "ability_scores": {
    "strength": 18,
    "dexterity": 12,
    "constitution": 16,
    "intelligence": 8,
    "wisdom": 10,
    "charisma": 10
  },
  "saving_throws": {
    "strength": {"bonus": 7, "proficient": true},
    "dexterity": {"bonus": 1, "proficient": false},
    "constitution": {"bonus": 6, "proficient": true},
    "intelligence": {"bonus": -1, "proficient": false},
    "wisdom": {"bonus": 0, "proficient": false},
    "charisma": {"bonus": 0, "proficient": false}
  },
  "skills": {
    "athletics": {"bonus": 7, "proficient": true},
    "intimidation": {"bonus": 3, "proficient": true},
    "perception": {"bonus": 2, "proficient": false}
  },
  "proficiency_bonus": 3,
  "attack_bonus": 7,
  "actions": [
    {
      "name": "Longsword Attack",
      "type": "attack",
      "attack_bonus": 7,
      "damage_dice": "1d8",
      "damage_bonus": 4,
      "damage_type": "slashing",
      "properties": ["versatile"]
    }
  ],
  "bonus_actions": [
    {
      "name": "Second Wind",
      "type": "ability",
      "dice": [{"die": "d10", "count": 1, "purpose": "healing"}],
      "bonus": 5,
      "uses": {"total": 1, "remaining": 1},
      "recharge": "short_rest"
    }
  ],
  "reactions": [
    {
      "name": "Opportunity Attack",
      "type": "attack"
    }
  ],
  "spell_slots": null,
  "spells_known": [],
  "class_features": [
    {
      "name": "Action Surge",
      "uses": {"total": 1, "remaining": 1},
      "recharge": "short_rest"
    },
    {
      "name": "Extra Attack",
      "description": "Attack twice when taking Attack action"
    },
    {
      "name": "Battle Master Maneuvers",
      "superiority_dice": {"die": "d8", "total": 4, "remaining": 4}
    }
  ],
  "equipment": [
    {"name": "Longsword", "equipped": true},
    {"name": "Shield", "equipped": true},
    {"name": "Chain Mail", "equipped": true},
    {"name": "Handaxe", "equipped": false, "quantity": 2}
  ],
  "proficiencies": {
    "armor": ["light", "medium", "heavy", "shields"],
    "weapons": ["simple", "martial"],
    "tools": ["smiths_tools"],
    "languages": ["Common", "Dwarvish"]
  },
  "conditions": ["Poisoned"],
  "death_saves": {
    "successes": 0,
    "failures": 0
  },
  "backstory": "A grizzled dwarf blacksmith seeking revenge for his clan's destruction at the hands of a lich.",
  "backstory_summary": "Grizzled dwarf blacksmith, revenge-driven, lost clan to undead."
}
```

---

## NPC Document

```json
{
  "id": "npc_campaign123_valdris",
  "type": "npc",
  "campaign_id": "campaign_123",
  "name": "Valdris the Lich",
  "npc_type": "antagonist",
  "status": "alive",
  "description": "An ancient lich who once ruled the region. Gaunt, robed in tattered black silk, eyes burning with cold purple flame.",
  "motivations": [
    "Protect his phylactery at all costs",
    "Complete the ritual of eternal dominion",
    "Destroy anyone who enters his tomb"
  ],
  "relationships": {
    "mark@example.com": {
      "disposition": "hostile",
      "summary": "Personal grudge — Thorin destroyed his favorite construct",
      "last_interaction_round": 14
    },
    "player2@example.com": {
      "disposition": "neutral",
      "summary": "Not yet noticed her",
      "last_interaction_round": null
    }
  },
  "interaction_log": [
    {
      "round": 3,
      "scene": "Throne Room entrance",
      "scene_type": "combat",
      "summary": "Valdris emerged from the shadows and cast Blight on Thorin, dealing 45 necrotic damage",
      "players_involved": ["mark@example.com"],
      "outcome": "Thorin survived, party retreated to corridor"
    }
  ],
  "known_abilities": ["Blight", "Finger of Death", "Legendary Resistance x3"],
  "used_abilities": ["Blight (cast twice)"],
  "legendary_resistances_remaining": 2,
  "hp": {
    "current": 135,
    "max": 195
  },
  "armor_class": 17,
  "location": "Throne Room, Level 3",
  "notes": "Players don't know about the phylactery yet",
  "first_appeared_round": 3,
  "last_seen_round": 14,
  "is_minor": false
}
```

---

## Abbreviated Character Sheet (LLM prompt injection only — not stored)

```json
{
  "name": "Thorin Ironforge",
  "race": "Dwarf",
  "class": "Fighter",
  "level": 5,
  "hp": {"current": 45, "max": 52},
  "armor_class": 18,
  "ability_scores": {
    "strength": 18, "dexterity": 12, "constitution": 16,
    "intelligence": 8, "wisdom": 10, "charisma": 10
  },
  "saving_throws": {"strength": 7, "constitution": 6},
  "skill_bonuses": {"athletics": 7, "intimidation": 3, "perception": 2},
  "attack_bonus": 7,
  "damage_dice": "1d8",
  "spell_slots": null,
  "spells_known": [],
  "class_features": ["Action Surge", "Second Wind", "Extra Attack"],
  "conditions": ["Poisoned"],
  "equipment": ["Longsword", "Shield", "Chain Mail"],
  "backstory_summary": "Grizzled dwarf blacksmith, revenge-driven, lost clan to undead."
}
```

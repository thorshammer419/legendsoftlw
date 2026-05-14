def abbreviated_sheet(char: dict) -> dict:
    return {
        "name": char.get("name"),
        "race": char.get("race"),
        "class": char.get("class"),
        "level": char.get("level"),
        "hp": char.get("hp"),
        "armor_class": char.get("armor_class"),
        "ability_scores": char.get("ability_scores"),
        "saving_throws": {
            k: v["bonus"] for k, v in (char.get("saving_throws") or {}).items()
            if v.get("proficient")
        },
        "skill_bonuses": {
            k: v["bonus"] for k, v in (char.get("skills") or {}).items()
            if v.get("proficient")
        },
        "attack_bonus": char.get("attack_bonus"),
        "damage_dice": char.get("damage_dice"),
        "spell_slots": char.get("spell_slots"),
        "spells_known": [s.get("name") for s in (char.get("spells_known") or [])],
        "class_features": [f.get("name") for f in (char.get("class_features") or [])],
        "conditions": char.get("conditions", []),
        "equipment": [e["name"] for e in (char.get("equipment") or []) if e.get("equipped")],
        "backstory_summary": char.get("backstory_summary"),
    }


def format_action(email: str, char: dict, action: dict) -> str:
    name = char.get("name", email)
    race = char.get("race", "")
    cls = char.get("class", "")
    text = action.get("text", "")
    rolls = action.get("rolls", [])
    roll_str = ", ".join(f"{r['description']}: {r['result']}" for r in rolls) if rolls else ""
    if roll_str:
        return f"- {name} ({race} {cls}): \"{text}\" [{roll_str}]"
    return f"- {name} ({race} {cls}): \"{text}\""

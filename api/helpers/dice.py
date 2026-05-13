"""
Server-side dice utilities.
All in-game rolling happens client-side (crypto.getRandomValues).
This module handles modifier calculation from character sheet data.
"""


def get_modifier(score: int) -> int:
    return (score - 10) // 2


def get_ability_modifier(character: dict, ability: str) -> int:
    scores = character.get("ability_scores", {})
    return get_modifier(scores.get(ability, 10))


def resolve_modifier(character: dict, modifier_type: str) -> int:
    """
    Resolve a modifier_type string from the validator prompt into an integer.
    modifier_type values: "strength", "dexterity", ..., "attack_bonus", "spell_save_dc"
    """
    ability_map = {
        "strength": "strength", "dexterity": "dexterity",
        "constitution": "constitution", "intelligence": "intelligence",
        "wisdom": "wisdom", "charisma": "charisma",
    }
    if modifier_type in ability_map:
        return get_ability_modifier(character, ability_map[modifier_type])
    if modifier_type == "attack_bonus":
        return character.get("attack_bonus", 0)
    if modifier_type == "proficiency":
        return character.get("proficiency_bonus", 2)
    return 0

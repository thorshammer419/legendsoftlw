"""
Unit tests for helpers/character.py.
Pure functions — no mocking required.
Run with: cd api && .venv/bin/pytest tests/ -v
"""

from helpers.character import abbreviated_sheet, format_action


# ---------------------------------------------------------------------------
# Fixtures / shared data
# ---------------------------------------------------------------------------

def full_char():
    return {
        "name": "Thorin Ironforge",
        "race": "Dwarf",
        "class": "Fighter",
        "level": 5,
        "hp": 52,
        "armor_class": 18,
        "ability_scores": {"STR": 18, "DEX": 12, "CON": 16, "INT": 10, "WIS": 10, "CHA": 8},
        "saving_throws": {
            "STR": {"bonus": 6, "proficient": True},
            "CON": {"bonus": 5, "proficient": True},
            "DEX": {"bonus": 1, "proficient": False},
        },
        "skills": {
            "Athletics": {"bonus": 6, "proficient": True},
            "Perception": {"bonus": 0, "proficient": False},
            "Intimidation": {"bonus": 3, "proficient": True},
        },
        "attack_bonus": 6,
        "damage_dice": "1d8+4",
        "spell_slots": None,
        "spells_known": [],
        "class_features": [
            {"name": "Second Wind"},
            {"name": "Action Surge"},
        ],
        "conditions": ["Poisoned"],
        "equipment": [
            {"name": "Battleaxe", "equipped": True},
            {"name": "Shield", "equipped": True},
            {"name": "Backpack", "equipped": False},
        ],
        "backstory_summary": "Exiled prince seeking redemption.",
    }


# ---------------------------------------------------------------------------
# abbreviated_sheet — field presence and values
# ---------------------------------------------------------------------------

class TestAbbreviatedSheet:
    def test_copies_basic_identity_fields(self):
        sheet = abbreviated_sheet(full_char())

        assert sheet["name"] == "Thorin Ironforge"
        assert sheet["race"] == "Dwarf"
        assert sheet["class"] == "Fighter"
        assert sheet["level"] == 5

    def test_copies_combat_stats(self):
        sheet = abbreviated_sheet(full_char())

        assert sheet["hp"] == 52
        assert sheet["armor_class"] == 18
        assert sheet["attack_bonus"] == 6
        assert sheet["damage_dice"] == "1d8+4"

    def test_copies_ability_scores(self):
        sheet = abbreviated_sheet(full_char())

        assert sheet["ability_scores"]["STR"] == 18
        assert sheet["ability_scores"]["CON"] == 16

    def test_saving_throws_includes_only_proficient(self):
        sheet = abbreviated_sheet(full_char())

        assert "STR" in sheet["saving_throws"]
        assert "CON" in sheet["saving_throws"]
        assert "DEX" not in sheet["saving_throws"]

    def test_saving_throw_values_are_bonuses(self):
        sheet = abbreviated_sheet(full_char())

        assert sheet["saving_throws"]["STR"] == 6
        assert sheet["saving_throws"]["CON"] == 5

    def test_skill_bonuses_includes_only_proficient(self):
        sheet = abbreviated_sheet(full_char())

        assert "Athletics" in sheet["skill_bonuses"]
        assert "Intimidation" in sheet["skill_bonuses"]
        assert "Perception" not in sheet["skill_bonuses"]

    def test_skill_bonus_values(self):
        sheet = abbreviated_sheet(full_char())

        assert sheet["skill_bonuses"]["Athletics"] == 6
        assert sheet["skill_bonuses"]["Intimidation"] == 3

    def test_spells_known_extracts_names(self):
        char = full_char()
        char["spells_known"] = [{"name": "Fireball"}, {"name": "Magic Missile"}]
        sheet = abbreviated_sheet(char)

        assert sheet["spells_known"] == ["Fireball", "Magic Missile"]

    def test_spells_known_empty_list_when_none(self):
        sheet = abbreviated_sheet(full_char())

        assert sheet["spells_known"] == []

    def test_class_features_extracts_names(self):
        sheet = abbreviated_sheet(full_char())

        assert sheet["class_features"] == ["Second Wind", "Action Surge"]

    def test_conditions_copied_as_list(self):
        sheet = abbreviated_sheet(full_char())

        assert sheet["conditions"] == ["Poisoned"]

    def test_conditions_defaults_to_empty_list(self):
        char = full_char()
        del char["conditions"]
        sheet = abbreviated_sheet(char)

        assert sheet["conditions"] == []

    def test_equipment_includes_only_equipped_items(self):
        sheet = abbreviated_sheet(full_char())

        assert "Battleaxe" in sheet["equipment"]
        assert "Shield" in sheet["equipment"]
        assert "Backpack" not in sheet["equipment"]

    def test_backstory_summary_copied(self):
        sheet = abbreviated_sheet(full_char())

        assert sheet["backstory_summary"] == "Exiled prince seeking redemption."

    def test_missing_optional_fields_return_none(self):
        sheet = abbreviated_sheet({})

        assert sheet["name"] is None
        assert sheet["race"] is None
        assert sheet["hp"] is None
        assert sheet["spell_slots"] is None

    def test_saving_throws_none_becomes_empty_dict(self):
        char = full_char()
        char["saving_throws"] = None
        sheet = abbreviated_sheet(char)

        assert sheet["saving_throws"] == {}

    def test_skills_none_becomes_empty_dict(self):
        char = full_char()
        char["skills"] = None
        sheet = abbreviated_sheet(char)

        assert sheet["skill_bonuses"] == {}

    def test_equipment_none_becomes_empty_list(self):
        char = full_char()
        char["equipment"] = None
        sheet = abbreviated_sheet(char)

        assert sheet["equipment"] == []

    def test_class_features_none_becomes_empty_list(self):
        char = full_char()
        char["class_features"] = None
        sheet = abbreviated_sheet(char)

        assert sheet["class_features"] == []


# ---------------------------------------------------------------------------
# format_action
# ---------------------------------------------------------------------------

class TestFormatAction:
    def test_basic_format_no_rolls(self):
        char = {"name": "Thorin", "race": "Dwarf", "class": "Fighter"}
        action = {"text": "I attack the goblin", "rolls": []}

        result = format_action("thorin@example.com", char, action)

        assert result == '- Thorin (Dwarf Fighter): "I attack the goblin"'

    def test_includes_rolls_in_brackets(self):
        char = {"name": "Thorin", "race": "Dwarf", "class": "Fighter"}
        action = {
            "text": "I attack the goblin",
            "rolls": [{"description": "Attack", "result": 17}],
        }

        result = format_action("thorin@example.com", char, action)

        assert result == '- Thorin (Dwarf Fighter): "I attack the goblin" [Attack: 17]'

    def test_multiple_rolls_comma_separated(self):
        char = {"name": "Elara", "race": "Elf", "class": "Ranger"}
        action = {
            "text": "I fire two arrows",
            "rolls": [
                {"description": "First attack", "result": 21},
                {"description": "Second attack", "result": 14},
            ],
        }

        result = format_action("elara@example.com", char, action)

        assert "First attack: 21" in result
        assert "Second attack: 14" in result
        assert result.count(",") == 1

    def test_falls_back_to_email_when_no_name(self):
        char = {"race": "Human", "class": "Cleric"}
        action = {"text": "I heal the party", "rolls": []}

        result = format_action("sera@example.com", char, action)

        assert result.startswith("- sera@example.com")

    def test_missing_rolls_key_treated_as_no_rolls(self):
        char = {"name": "Kira", "race": "Halfling", "class": "Rogue"}
        action = {"text": "I sneak past the guard"}

        result = format_action("kira@example.com", char, action)

        assert "[" not in result
        assert result == '- Kira (Halfling Rogue): "I sneak past the guard"'

    def test_empty_race_and_class(self):
        char = {"name": "Mystery"}
        action = {"text": "I wait", "rolls": []}

        result = format_action("m@example.com", char, action)

        assert result == '- Mystery ( ): "I wait"'

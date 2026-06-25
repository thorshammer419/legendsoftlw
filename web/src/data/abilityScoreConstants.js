export const ABILITY_KEYS = [
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
];

export const ABILITY_SHORT = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

export function mod(score) {
  return Math.floor((score - 10) / 2);
}

export function useDice() {
  function roll(sides, count = 1) {
    const buf = new Uint32Array(count);
    crypto.getRandomValues(buf);
    return Array.from(buf).map((n) => (n % sides) + 1);
  }

  function rollWithModifier(sides, count, modifier = 0) {
    const rolls = roll(sides, count);
    const total = rolls.reduce((a, b) => a + b, 0) + modifier;
    return { rolls, total, modifier };
  }

  function rollAction(action) {
    const results = [];
    for (const die of action.dice || []) {
      const rolls = roll(parseInt(die.die.replace('d', '')), die.count);
      const total = rolls.reduce((a, b) => a + b, 0);
      results.push({ ...die, rolls, total });
    }
    return results;
  }

  return { roll, rollWithModifier, rollAction };
}

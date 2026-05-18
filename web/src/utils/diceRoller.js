export function rollDice({ sides, count, keep }) {
  const buf = new Uint32Array(count);
  crypto.getRandomValues(buf);
  const rolls = Array.from(buf).map((n) => (n % sides) + 1);
  const sorted = [...rolls].sort((a, b) => b - a);
  const kept = sorted.slice(0, keep);
  const dropped = sorted.slice(keep);
  const sum = kept.reduce((a, b) => a + b, 0);
  return { rolls, kept, dropped, sum };
}

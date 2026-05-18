import { rollDice } from '../diceRoller';

describe('rollDice', () => {
  it('returns the requested number of rolls', () => {
    const result = rollDice({ sides: 6, count: 4, keep: 3 });
    expect(result.rolls).toHaveLength(4);
  });

  it('keeps the highest dice', () => {
    jest.spyOn(global.crypto, 'getRandomValues').mockImplementationOnce((buf) => {
      buf[0] = 0; buf[1] = 1; buf[2] = 2; buf[3] = 5; // % 6 + 1 → 1, 2, 3, 6
      return buf;
    });
    const result = rollDice({ sides: 6, count: 4, keep: 3 });
    expect(result.kept).toEqual([6, 3, 2]);
    expect(result.dropped).toEqual([1]);
  });

  it('sum equals the sum of kept dice', () => {
    jest.spyOn(global.crypto, 'getRandomValues').mockImplementationOnce((buf) => {
      buf[0] = 4; buf[1] = 4; buf[2] = 4; buf[3] = 4; // % 6 + 1 → 5,5,5,5
      return buf;
    });
    const result = rollDice({ sides: 6, count: 4, keep: 3 });
    expect(result.sum).toBe(15);
  });

  it('rolls are within 1–sides range', () => {
    const result = rollDice({ sides: 6, count: 100, keep: 3 });
    result.rolls.forEach((r) => {
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(6);
    });
  });
});

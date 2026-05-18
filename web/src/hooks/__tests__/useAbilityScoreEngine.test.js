import { renderHook, act } from '@testing-library/react';
import { useAbilityScoreEngine } from '../useAbilityScoreEngine';

const STANDARD_ARRAY_RULES = {
  ability_score_method: 'standard_array',
  ability_score_rules: { standard_array: [15, 14, 13, 12, 10, 8] },
};

const POINT_BUY_RULES = {
  ability_score_method: 'point_buy',
  ability_score_rules: { point_buy_points: 27 },
};

const ROLL_RULES = {
  ability_score_method: 'roll_for_stats',
  ability_score_rules: { roll_dice: 4, roll_keep: 3 },
};

describe('useAbilityScoreEngine — initialization', () => {
  it('starts with all scores null (unassigned)', () => {
    const { result } = renderHook(() => useAbilityScoreEngine(STANDARD_ARRAY_RULES));
    const { scores } = result.current;
    Object.values(scores).forEach((v) => expect(v).toBeNull());
  });

  it('standard array: availableChips contains all 6 values', () => {
    const { result } = renderHook(() => useAbilityScoreEngine(STANDARD_ARRAY_RULES));
    expect(result.current.availableChips).toEqual([15, 14, 13, 12, 10, 8]);
  });

  it('isComplete is false before all scores assigned', () => {
    const { result } = renderHook(() => useAbilityScoreEngine(STANDARD_ARRAY_RULES));
    expect(result.current.isComplete).toBe(false);
  });
});

describe('useAbilityScoreEngine — Standard Array', () => {
  it('assign removes chip from available pool', () => {
    const { result } = renderHook(() => useAbilityScoreEngine(STANDARD_ARRAY_RULES));
    act(() => result.current.assign('strength', 15));
    expect(result.current.availableChips).not.toContain(15);
    expect(result.current.scores.strength).toBe(15);
  });

  it('unassign returns chip to available pool', () => {
    const { result } = renderHook(() => useAbilityScoreEngine(STANDARD_ARRAY_RULES));
    act(() => result.current.assign('strength', 15));
    act(() => result.current.unassign('strength'));
    expect(result.current.availableChips).toContain(15);
    expect(result.current.scores.strength).toBeNull();
  });

  it('reassigning swaps chips correctly', () => {
    const { result } = renderHook(() => useAbilityScoreEngine(STANDARD_ARRAY_RULES));
    act(() => result.current.assign('strength', 15));
    act(() => result.current.assign('strength', 14));
    expect(result.current.scores.strength).toBe(14);
    expect(result.current.availableChips).toContain(15);
    expect(result.current.availableChips).not.toContain(14);
  });

  it('isComplete when all 6 assigned', () => {
    const { result } = renderHook(() => useAbilityScoreEngine(STANDARD_ARRAY_RULES));
    const keys = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
    const chips = [15, 14, 13, 12, 10, 8];
    keys.forEach((k, i) => act(() => result.current.assign(k, chips[i])));
    expect(result.current.isComplete).toBe(true);
    expect(result.current.isValid).toBe(true);
  });
});

describe('useAbilityScoreEngine — Point Buy', () => {
  it('pointsRemaining starts at budget', () => {
    const { result } = renderHook(() => useAbilityScoreEngine(POINT_BUY_RULES));
    expect(result.current.pointsRemaining).toBe(27);
  });

  it('adjustScore increases score and deducts points', () => {
    const { result } = renderHook(() => useAbilityScoreEngine(POINT_BUY_RULES));
    act(() => result.current.adjustScore('strength', 1)); // 8→9, cost 1
    expect(result.current.scores.strength).toBe(9);
    expect(result.current.pointsRemaining).toBe(26);
  });

  it('cannot adjust below 8', () => {
    const { result } = renderHook(() => useAbilityScoreEngine(POINT_BUY_RULES));
    act(() => result.current.adjustScore('strength', -1));
    expect(result.current.scores.strength).toBeNull(); // still null (base is 8, delta makes it 7)
  });

  it('cannot adjust above 15', () => {
    const { result } = renderHook(() => useAbilityScoreEngine(POINT_BUY_RULES));
    // Bring to 15 first
    for (let i = 0; i < 8; i++) act(() => result.current.adjustScore('strength', 1));
    act(() => result.current.adjustScore('strength', 1)); // should be rejected
    expect(result.current.scores.strength).toBe(15);
  });

  it('isComplete when all scores have been adjusted at least once', () => {
    const { result } = renderHook(() => useAbilityScoreEngine(POINT_BUY_RULES));
    const keys = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
    keys.forEach((k) => act(() => result.current.adjustScore(k, 1)));
    expect(result.current.isComplete).toBe(true);
  });
});

describe('useAbilityScoreEngine — Roll for Stats', () => {
  it('recordRoll adds a chip', () => {
    const { result } = renderHook(() => useAbilityScoreEngine(ROLL_RULES));
    act(() => result.current.recordRoll({ rolls: [6, 5, 4, 1], kept: [6, 5, 4], dropped: [1], sum: 15 }));
    expect(result.current.availableChips).toContain(15);
    expect(result.current.rollResults).toHaveLength(1);
  });

  it('rerollChip replaces old chip value', () => {
    const { result } = renderHook(() => useAbilityScoreEngine(ROLL_RULES));
    act(() => result.current.recordRoll({ rolls: [4, 3, 2, 1], kept: [4, 3, 2], dropped: [1], sum: 9 }));
    act(() => result.current.rerollChip(9, { rolls: [6, 5, 4, 1], kept: [6, 5, 4], dropped: [1], sum: 15 }));
    expect(result.current.availableChips).not.toContain(9);
    expect(result.current.availableChips).toContain(15);
  });

  it('rerollChip unassigns ability that held the old value', () => {
    const { result } = renderHook(() => useAbilityScoreEngine(ROLL_RULES));
    act(() => result.current.recordRoll({ rolls: [4, 3, 2, 1], kept: [4, 3, 2], dropped: [1], sum: 9 }));
    act(() => result.current.assign('strength', 9));
    act(() => result.current.rerollChip(9, { rolls: [6, 5, 4, 1], kept: [6, 5, 4], dropped: [1], sum: 15 }));
    expect(result.current.scores.strength).toBeNull();
  });
});

describe('useAbilityScoreEngine — rerolled badge', () => {
  it('markRerolled sets flag for that ability', () => {
    const { result } = renderHook(() => useAbilityScoreEngine(STANDARD_ARRAY_RULES));
    act(() => result.current.markRerolled('charisma'));
    expect(result.current.rerolledFlags.charisma).toBe(true);
  });
});

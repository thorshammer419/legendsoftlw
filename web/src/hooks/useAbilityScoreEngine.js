import { useState, useCallback } from 'react';

const ABILITY_KEYS = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

// SRD costs for scores 8–15; extended below 8 (each step refunds 1pt)
// and above 15 (each step costs 2 more, following the 13→14→15 pattern).
const SRD_COSTS = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

function pointBuyCost(score) {
  if (score <= 8) return score - 8; // 0 at 8, negative below
  if (score <= 15) return SRD_COSTS[score];
  return SRD_COSTS[15] + (score - 15) * 2; // 2 pts per step above 15
}

function pointBuyCostIncrement(score) {
  return pointBuyCost(score + 1) - pointBuyCost(score);
}

const NULL_SCORES = Object.fromEntries(ABILITY_KEYS.map((k) => [k, null]));

export function useAbilityScoreEngine({ ability_score_method, ability_score_rules = {} }) {
  const method = ability_score_method || 'standard_array';
  const rules = ability_score_rules;

  const [scores, setScores] = useState({ ...NULL_SCORES });
  const [availableChips, setAvailableChips] = useState(
    method === 'standard_array'
      ? [...(rules.standard_array ?? [15, 14, 13, 12, 10, 8])]
      : []
  );
  const [rollResults, setRollResults] = useState([]);
  const [rerolledFlags, setRerolledFlags] = useState({});

  // ── Standard Array & Roll: assign a chip value to an ability ──────────────
  const assign = useCallback((ability, value) => {
    setScores((prev) => {
      const old = prev[ability];
      const next = { ...prev, [ability]: value };
      setAvailableChips((chips) => {
        let updated = chips.filter((c) => c !== value);
        if (old !== null) updated = [...updated, old].sort((a, b) => b - a);
        return updated;
      });
      return next;
    });
  }, []);

  // ── Standard Array & Roll: unassign ───────────────────────────────────────
  const unassign = useCallback((ability) => {
    setScores((prev) => {
      const old = prev[ability];
      if (old === null) return prev;
      setAvailableChips((chips) => [...chips, old].sort((a, b) => b - a));
      return { ...prev, [ability]: null };
    });
  }, []);

  // ── Point Buy: nudge a score up or down by delta ──────────────────────────
  const minScore = rules.point_buy_min ?? 8;
  const maxScore = rules.point_buy_max ?? 15;

  const adjustScore = useCallback((ability, delta) => {
    setScores((prev) => {
      const current = prev[ability] ?? minScore;
      const next = current + delta;
      if (next < minScore || next > maxScore) return prev;
      return { ...prev, [ability]: next };
    });
  }, [minScore, maxScore]);

  // ── Roll for Stats: record a new roll result, add chip ───────────────────
  const recordRoll = useCallback((rollResult) => {
    setRollResults((prev) => [...prev, rollResult]);
    setAvailableChips((prev) => [...prev, rollResult.sum].sort((a, b) => b - a));
  }, []);

  // ── Roll for Stats: reroll an existing chip (needs approval outside hook) ─
  const rerollChip = useCallback((oldValue, newResult) => {
    setAvailableChips((prev) => {
      const idx = prev.indexOf(oldValue);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = newResult.sum;
      return updated.sort((a, b) => b - a);
    });
    setRollResults((prev) => [...prev, newResult]);
    // If any ability had the old value assigned, unassign it
    setScores((prev) => {
      const next = { ...prev };
      for (const key of ABILITY_KEYS) {
        if (next[key] === oldValue) next[key] = null;
      }
      return next;
    });
  }, []);

  // ── Mark an ability as rerolled (badge flag) ──────────────────────────────
  const markRerolled = useCallback((ability) => {
    setRerolledFlags((prev) => ({ ...prev, [ability]: true }));
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────
  const assigned = ABILITY_KEYS.filter((k) => scores[k] !== null);
  // Point buy: all scores effectively set (null → 8), so always complete
  const isComplete = method === 'point_buy' || assigned.length === 6;

  let pointsRemaining = null;
  let isValid = isComplete;
  let validationMessage = '';

  if (method === 'point_buy') {
    const budget = rules.point_buy_points ?? 27;
    const spent = ABILITY_KEYS.reduce((sum, k) => {
      const s = scores[k] ?? minScore;
      return sum + pointBuyCost(s) - pointBuyCost(minScore);
    }, 0);
    pointsRemaining = budget - spent;
    isValid = isComplete && pointsRemaining >= 0;
    if (pointsRemaining < 0) validationMessage = `Over budget by ${-pointsRemaining} points`;
  } else if (method === 'standard_array') {
    isValid = isComplete && availableChips.length === 0;
    if (!isValid) validationMessage = 'Assign all ability scores to continue';
  } else if (method === 'roll_for_stats') {
    isValid = isComplete && rollResults.length >= 6;
    if (!isValid) validationMessage = rollResults.length < 6 ? 'Roll all six scores first' : 'Assign all rolled scores to continue';
  }

  return {
    scores,
    availableChips,
    rollResults,
    pointsRemaining,
    rerolledFlags,
    isComplete,
    isValid,
    validationMessage,
    minScore,
    maxScore,
    pointBuyCostIncrement,
    assign,
    unassign,
    adjustScore,
    recordRoll,
    rerollChip,
    markRerolled,
  };
}

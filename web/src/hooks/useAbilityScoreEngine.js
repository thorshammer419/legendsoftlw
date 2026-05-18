import { useState, useCallback } from 'react';
import { rollDice } from '../utils/diceRoller';

const ABILITY_KEYS = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

const POINT_BUY_COSTS = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

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
  const adjustScore = useCallback((ability, delta) => {
    setScores((prev) => {
      const current = prev[ability] ?? 8;
      const next = current + delta;
      if (next < 8 || next > 15) return prev;
      return { ...prev, [ability]: next };
    });
  }, []);

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
  const isComplete = assigned.length === 6;

  let pointsRemaining = null;
  let isValid = isComplete;
  let validationMessage = '';

  if (method === 'point_buy') {
    const budget = rules.point_buy_points ?? 27;
    const spent = ABILITY_KEYS.reduce((sum, k) => {
      const s = scores[k] ?? 8;
      return sum + (POINT_BUY_COSTS[s] ?? 0);
    }, 0);
    pointsRemaining = budget - spent;
    isValid = isComplete && pointsRemaining >= 0;
    if (pointsRemaining < 0) validationMessage = `Over budget by ${-pointsRemaining} points`;
  } else if (method === 'standard_array') {
    isValid = isComplete && availableChips.length === 0;
  } else if (method === 'roll_for_stats') {
    const needed = rules.roll_dice !== undefined ? 6 : 6;
    isValid = isComplete && rollResults.length >= needed;
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
    assign,
    unassign,
    adjustScore,
    recordRoll,
    rerollChip,
    markRerolled,
  };
}

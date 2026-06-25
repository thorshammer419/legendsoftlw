import { useState } from 'react';
import { rollDice } from '../../utils/diceRoller';
import { ABILITY_KEYS, ABILITY_SHORT, mod } from '../../data/abilityScoreConstants';

export default function AbilityScorePanel({
  method,
  engine,
  reroll,
  iAmCreator,
  rollDiceCount = 4,
  rollKeepCount = 3,
  onRerolled,
  manualScores,
  onManualScoreChange,
}) {
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [confirmingChipIdx, setConfirmingChipIdx] = useState(null);

  const isStandardArray = method === 'standard_array' || !method;
  const isPointBuy = method === 'point_buy';
  const isRollForStats = method === 'roll_for_stats';

  const doRoll = () => {
    const result = rollDice({ sides: 6, count: rollDiceCount, keep: rollKeepCount });
    engine.recordRoll(result);
  };

  const doRollAll = async () => {
    for (let i = 0; i < 6; i++) {
      doRoll();
      if (i < 5) await new Promise((r) => setTimeout(r, 150));
    }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ margin: 0, color: 'var(--gold)' }}>Ability Scores</h3>

      {isStandardArray ? (
        <StandardArrayUI
          engine={engine}
          selectedSlot={selectedSlot}
          setSelectedSlot={setSelectedSlot}
        />
      ) : isPointBuy ? (
        <PointBuyUI engine={engine} />
      ) : isRollForStats ? (
        <RollForStatsUI
          engine={engine}
          reroll={reroll}
          iAmCreator={iAmCreator}
          rollDiceCount={rollDiceCount}
          rollKeepCount={rollKeepCount}
          selectedSlot={selectedSlot}
          setSelectedSlot={setSelectedSlot}
          confirmingChipIdx={confirmingChipIdx}
          setConfirmingChipIdx={setConfirmingChipIdx}
          doRoll={doRoll}
          doRollAll={doRollAll}
          onRerolled={onRerolled}
        />
      ) : (
        <ManualUI scores={manualScores} onScoreChange={onManualScoreChange} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function AbilitySlotGrid({ engine, selectedSlot, setSelectedSlot }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {ABILITY_KEYS.map((key) => {
        const val = engine.scores[key];
        const isSelected = selectedSlot === key;
        const m = mod(val ?? 10);
        return (
          <button
            key={key}
            aria-pressed={isSelected}
            onClick={() => {
              if (val !== null) { engine.unassign(key); setSelectedSlot(null); }
              else { setSelectedSlot(isSelected ? null : key); }
            }}
            style={{
              textAlign: 'center', padding: '10px 8px',
              background: isSelected ? 'rgba(212,175,55,0.1)' : 'var(--card-bg)',
              border: `2px solid ${isSelected ? 'var(--gold)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'inherit',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
              {ABILITY_SHORT[key]}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: val !== null ? 'var(--text-primary)' : 'var(--text-muted)', minHeight: 27 }}>
              {val !== null ? val : '—'}
            </div>
            <div style={{ fontSize: 14, color: m >= 0 ? 'var(--gold)' : 'var(--danger)', fontWeight: 600 }}>
              {val !== null ? (m >= 0 ? `+${m}` : m) : ''}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standard Array
// ---------------------------------------------------------------------------

function StandardArrayUI({ engine, selectedSlot, setSelectedSlot }) {
  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
        Click a slot, then click a value to assign it. Click an assigned slot to return it to the pool.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {engine.availableChips.map((chip, i) => (
          <button
            key={`${chip}-${i}`}
            onClick={() => {
              if (selectedSlot) { engine.assign(selectedSlot, chip); setSelectedSlot(null); }
            }}
            style={{
              padding: '6px 14px', borderRadius: 6,
              border: `2px solid ${selectedSlot ? 'var(--gold)' : 'var(--border)'}`,
              background: selectedSlot ? 'rgba(212,175,55,0.15)' : 'var(--card-bg)',
              color: 'var(--text-primary)', fontWeight: 700, fontSize: 16,
              cursor: selectedSlot ? 'pointer' : 'default',
            }}
          >
            {chip}
          </button>
        ))}
        {engine.availableChips.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>All values assigned</span>
        )}
      </div>
      <AbilitySlotGrid engine={engine} selectedSlot={selectedSlot} setSelectedSlot={setSelectedSlot} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Point Buy
// ---------------------------------------------------------------------------

function PointBuyUI({ engine }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          Spend points to raise scores ({engine.minScore}–{engine.maxScore}).
        </p>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: engine.pointsRemaining >= 0 ? 'var(--gold)' : 'var(--danger)' }}>
            {engine.pointsRemaining}
          </span>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>pts left</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {ABILITY_KEYS.map((key) => {
          const displayScore = engine.scores[key] ?? engine.minScore;
          const m = mod(displayScore);
          const costIncrement = engine.pointBuyCostIncrement(displayScore);
          const plusDisabled = displayScore >= engine.maxScore || engine.pointsRemaining < costIncrement;
          const minusDisabled = displayScore <= engine.minScore;
          return (
            <div key={key} className="card" style={{ textAlign: 'center', padding: '10px 8px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                {ABILITY_SHORT[key]}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <button
                  aria-label={`Decrease ${key}`}
                  onClick={() => engine.adjustScore(key, -1)}
                  disabled={minusDisabled}
                  style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', cursor: minusDisabled ? 'not-allowed' : 'pointer', opacity: minusDisabled ? 0.4 : 1, fontWeight: 700, fontSize: 16, lineHeight: 1 }}
                >−</button>
                <span style={{ fontSize: 18, fontWeight: 700, minWidth: 24 }}>{displayScore}</span>
                <button
                  aria-label={`Increase ${key}`}
                  onClick={() => engine.adjustScore(key, 1)}
                  disabled={plusDisabled}
                  style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', cursor: plusDisabled ? 'not-allowed' : 'pointer', opacity: plusDisabled ? 0.4 : 1, fontWeight: 700, fontSize: 16, lineHeight: 1 }}
                >+</button>
              </div>
              <div style={{ fontSize: 14, color: m >= 0 ? 'var(--gold)' : 'var(--danger)', fontWeight: 600 }}>
                {m >= 0 ? `+${m}` : m}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Roll for Stats
// ---------------------------------------------------------------------------

function RollForStatsUI({
  engine, reroll, iAmCreator,
  rollDiceCount, rollKeepCount,
  selectedSlot, setSelectedSlot,
  confirmingChipIdx, setConfirmingChipIdx,
  doRoll, doRollAll, onRerolled,
}) {
  if (engine.rollResults.length < 6) {
    return (
      <RollPhase
        engine={engine}
        rollDiceCount={rollDiceCount}
        rollKeepCount={rollKeepCount}
        doRoll={doRoll}
        doRollAll={doRollAll}
      />
    );
  }
  return (
    <AssignPhase
      engine={engine}
      reroll={reroll}
      iAmCreator={iAmCreator}
      rollDiceCount={rollDiceCount}
      rollKeepCount={rollKeepCount}
      selectedSlot={selectedSlot}
      setSelectedSlot={setSelectedSlot}
      confirmingChipIdx={confirmingChipIdx}
      setConfirmingChipIdx={setConfirmingChipIdx}
      onRerolled={onRerolled}
    />
  );
}

function RollPhase({ engine, rollDiceCount, rollKeepCount, doRoll, doRollAll }) {
  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
        Roll {rollDiceCount}d6, keep highest {rollKeepCount}. Roll each slot individually or all at once.
      </p>
      <button
        className="btn btn-secondary btn-full"
        onClick={doRollAll}
        disabled={engine.rollResults.length > 0}
      >
        Roll All
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: 6 }, (_, i) => {
          const result = engine.rollResults[i];
          const sortedDice = result ? [...result.rolls].sort((a, b) => b - a) : [];
          return (
            <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 28, flexShrink: 0 }}>#{i + 1}</span>
              {result ? (
                <>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {sortedDice.map((die, j) => (
                      <span
                        key={j}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 26, height: 26, borderRadius: 4,
                          border: `1px solid ${j < rollKeepCount ? 'var(--gold)' : 'var(--border)'}`,
                          color: j < rollKeepCount ? 'var(--gold)' : 'var(--text-muted)',
                          textDecoration: j < rollKeepCount ? 'none' : 'line-through',
                          fontSize: 13, fontWeight: 600,
                        }}
                      >
                        {die}
                      </span>
                    ))}
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 700, color: 'var(--gold)' }}>
                    = {result.sum}
                  </span>
                </>
              ) : (
                <button className="btn btn-sm btn-secondary" onClick={doRoll} style={{ marginLeft: 'auto' }}>
                  Roll
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function AssignPhase({
  engine, reroll, iAmCreator,
  rollDiceCount, rollKeepCount,
  selectedSlot, setSelectedSlot,
  confirmingChipIdx, setConfirmingChipIdx,
  onRerolled,
}) {
  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
        All scores rolled! Click a slot, then click a value to assign it.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {engine.availableChips.map((chip, i) => (
          <div key={`${chip}-${i}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => {
                if (selectedSlot) { engine.assign(selectedSlot, chip); setSelectedSlot(null); }
              }}
              style={{
                padding: '6px 14px', borderRadius: 6,
                border: `2px solid ${selectedSlot ? 'var(--gold)' : 'var(--border)'}`,
                background: selectedSlot ? 'rgba(212,175,55,0.15)' : 'var(--card-bg)',
                color: 'var(--text-primary)', fontWeight: 700, fontSize: 16,
                cursor: selectedSlot ? 'pointer' : 'default',
              }}
            >
              {chip}
            </button>
            <RerollControl
              chip={chip}
              chipIdx={i}
              iAmCreator={iAmCreator}
              reroll={reroll}
              engine={engine}
              rollDiceCount={rollDiceCount}
              rollKeepCount={rollKeepCount}
              confirmingChipIdx={confirmingChipIdx}
              setConfirmingChipIdx={setConfirmingChipIdx}
              onRerolled={onRerolled}
            />
          </div>
        ))}
        {engine.availableChips.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>All values assigned</span>
        )}
      </div>
      <AbilitySlotGrid engine={engine} selectedSlot={selectedSlot} setSelectedSlot={setSelectedSlot} />
    </>
  );
}

function RerollControl({
  chip, chipIdx, iAmCreator, reroll, engine,
  rollDiceCount, rollKeepCount,
  confirmingChipIdx, setConfirmingChipIdx, onRerolled,
}) {
  const isConfirming = confirmingChipIdx === chipIdx;

  if (iAmCreator) {
    if (isConfirming) {
      return (
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn btn-sm"
            style={{ fontSize: 10, padding: '2px 6px', background: 'var(--danger)', color: '#fff' }}
            onClick={() => {
              const result = rollDice({ sides: 6, count: rollDiceCount, keep: rollKeepCount });
              engine.rerollChip(chip, result);
              onRerolled();
              setConfirmingChipIdx(null);
            }}
          >
            Confirm
          </button>
          <button
            className="btn btn-sm"
            style={{ fontSize: 10, padding: '2px 6px' }}
            onClick={() => setConfirmingChipIdx(null)}
          >
            Cancel
          </button>
        </div>
      );
    }
    return (
      <button
        className="btn btn-sm"
        style={{ fontSize: 10, padding: '2px 6px' }}
        onClick={() => setConfirmingChipIdx(chipIdx)}
      >
        Reroll
      </button>
    );
  }

  // Non-creator
  if (reroll.status === 'pending' || reroll.status === 'denied') {
    return (
      <button
        className="btn btn-sm"
        style={{ fontSize: 10, padding: '2px 6px' }}
        disabled={reroll.status === 'pending'}
        onClick={() => { if (reroll.status === 'denied') reroll.clearDenied(); }}
      >
        {reroll.status === 'pending' ? 'Pending approval…' : 'Denied — request again'}
      </button>
    );
  }
  if (isConfirming) {
    return (
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          className="btn btn-sm"
          style={{ fontSize: 10, padding: '2px 6px', background: 'var(--danger)', color: '#fff' }}
          onClick={() => { reroll.requestReroll(chip); setConfirmingChipIdx(null); }}
        >
          Confirm
        </button>
        <button
          className="btn btn-sm"
          style={{ fontSize: 10, padding: '2px 6px' }}
          onClick={() => setConfirmingChipIdx(null)}
        >
          Cancel
        </button>
      </div>
    );
  }
  return (
    <button
      className="btn btn-sm"
      style={{ fontSize: 10, padding: '2px 6px' }}
      onClick={() => setConfirmingChipIdx(chipIdx)}
    >
      Request Reroll
    </button>
  );
}

// ---------------------------------------------------------------------------
// Manual (fallback — campaigns with no ability_score_method)
// ---------------------------------------------------------------------------

function ManualUI({ scores = {}, onScoreChange }) {
  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
        Enter scores 1–30.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {ABILITY_KEYS.map((key) => {
          const score = scores[key] ?? 10;
          const m = mod(score);
          return (
            <div key={key} className="card" style={{ textAlign: 'center', padding: '10px 8px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                {ABILITY_SHORT[key]}
              </div>
              <input
                type="number"
                min={1}
                max={30}
                value={score}
                onChange={(e) => onScoreChange?.(key, e.target.value)}
                style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, width: '100%', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }}
              />
              <div style={{ fontSize: 14, color: m >= 0 ? 'var(--gold)' : 'var(--danger)', fontWeight: 600 }}>
                {m >= 0 ? `+${m}` : m}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

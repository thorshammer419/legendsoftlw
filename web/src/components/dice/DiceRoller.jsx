import { useState } from 'react';
import { useDice } from '../../hooks/useDice';

const DICE = [4, 6, 8, 10, 12, 20, 100];

export default function DiceRoller({ requiredDice, onRollComplete }) {
  const { roll } = useDice();
  const [results, setResults] = useState([]);
  const [rolled, setRolled] = useState(false);
  const [manualDice, setManualDice] = useState([]);

  const rollRequired = () => {
    const diceResults = requiredDice.map((d) => {
      const sides = parseInt(d.die.replace('d', ''));
      const rolls = roll(sides, d.count || 1);
      return { ...d, rolls, total: rolls.reduce((a, b) => a + b, 0) };
    });
    setResults(diceResults);
    setRolled(true);
  };

  const addDie = (sides) => setManualDice((prev) => [...prev, sides]);

  const rollManual = () => {
    const grouped = manualDice.reduce((acc, s) => {
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    const diceResults = Object.entries(grouped).map(([sides, count]) => {
      const rolls = roll(parseInt(sides), count);
      return { die: `d${sides}`, count, rolls, total: rolls.reduce((a, b) => a + b, 0), purpose: 'roll' };
    });
    setResults(diceResults);
    setRolled(true);
    setManualDice([]);
  };

  if (requiredDice?.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="section-header">Required Rolls</div>
        {requiredDice.map((d, i) => (
          <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {d.description}: {d.count}×{d.die}
            {d.dc && <span style={{ color: 'var(--gold)' }}> · DC {d.dc}</span>}
          </div>
        ))}
        {!rolled ? (
          <button className="btn btn-gold btn-full" onClick={rollRequired}>🎲 Roll All</button>
        ) : (
          <>
            {results.map((r, i) => (
              <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{r.description || r.purpose}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>[{r.rolls?.join(', ')}]</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)' }}>{r.total}</span>
                </div>
              </div>
            ))}
            <button className="btn btn-primary btn-full" onClick={() => onRollComplete?.(results)}>
              Confirm Rolls →
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="section-header">Dice</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {DICE.map((d) => (
          <button key={d} className="btn btn-secondary btn-sm" onClick={() => addDie(d)}>d{d}</button>
        ))}
      </div>
      {manualDice.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
            {manualDice.map((d) => `d${d}`).join(' + ')}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setManualDice([])}>Clear</button>
          <button className="btn btn-gold btn-sm" onClick={rollManual}>🎲 Roll</button>
        </div>
      )}
      {rolled && results.map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.die} ×{r.count}</span>
          <span style={{ fontWeight: 700, color: 'var(--gold)' }}>{r.total}</span>
        </div>
      ))}
    </div>
  );
}

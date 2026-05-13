import { useState } from 'react';
import TargetSelector from './TargetSelector';
import DiceRoller from '../dice/DiceRoller';

export default function AbilityConfig({ action, character, storyState, onConfirm, onBack }) {
  const [target, setTarget] = useState(null);
  const [step, setStep] = useState(action?.requires_target ? 'target' : 'roll');
  const handleTarget = (t) => {
    setTarget(t);
    setStep('roll');
  };

  const handleRoll = (results) => {
    const rollSummary = results.map((r) => `${r.description || r.purpose}: ${r.rolls?.join('+')}=${r.total}`).join(', ');
    const targetSuffix = target ? ` targeting ${target}` : '';
    onConfirm?.(`${action.action || action.name}${targetSuffix}`, results, `[${rollSummary}]`);
  };

  const handleNoRoll = () => {
    const targetSuffix = target ? ` targeting ${target}` : '';
    onConfirm?.(`${action.action || action.name}${targetSuffix}`, [], '');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <h3 style={{ margin: 0 }}>{action?.action || action?.name}</h3>
      </div>

      {action?.description && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{action.description}</p>
      )}

      {step === 'target' && (
        <TargetSelector action={action} storyState={storyState} character={character} onSelect={handleTarget} />
      )}

      {step === 'roll' && (
        <>
          {action?.dice?.length > 0 ? (
            <DiceRoller requiredDice={action.dice} onRollComplete={handleRoll} />
          ) : (
            <button className="btn btn-primary btn-full" onClick={handleNoRoll}>
              Confirm Action
            </button>
          )}
        </>
      )}
    </div>
  );
}

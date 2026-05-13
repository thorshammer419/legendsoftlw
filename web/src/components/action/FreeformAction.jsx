import { useState } from 'react';
import DiceRoller from '../dice/DiceRoller';

export default function FreeformAction({ campaignId, onValidate, onConfirm, onBack, validating, validationResult }) {
  const [text, setText] = useState('');
  const [step, setStep] = useState('input'); // input | rolling | confirmed

  const handleValidate = () => {
    if (!text.trim()) return;
    onValidate?.(text);
  };

  const handleRollComplete = (results) => {
    onConfirm?.(text, results);
  };

  const goToRoll = () => setStep('rolling');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <h3 style={{ margin: 0 }}>Freeform Action</h3>
      </div>

      {step === 'input' && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Describe what you want to do..."
            rows={3}
          />

          {validationResult && (
            <div style={{
              background: validationResult.valid ? 'rgba(76,175,80,0.1)' : 'rgba(233,69,96,0.1)',
              border: `1px solid ${validationResult.valid ? 'var(--success)' : 'var(--danger)'}`,
              borderRadius: 'var(--radius-sm)',
              padding: 10,
            }}>
              <p style={{ fontSize: 13, fontFamily: 'var(--font-display)', lineHeight: 1.6, color: 'var(--text-primary)', marginBottom: validationResult.valid ? 8 : 0 }}>
                {validationResult.dm_response}
              </p>
              {validationResult.valid && (
                <button className="btn btn-primary btn-sm" onClick={goToRoll}>
                  {validationResult.required_rolls?.length > 0 ? 'Roll Dice →' : 'Submit Action →'}
                </button>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-secondary btn-full"
              onClick={handleValidate}
              disabled={validating || !text.trim()}
            >
              {validating ? 'Checking...' : '⚔ Check with DM'}
            </button>
            {validationResult?.valid && (
              <button className="btn btn-primary" onClick={goToRoll}>
                Continue →
              </button>
            )}
          </div>
        </>
      )}

      {step === 'rolling' && validationResult?.required_rolls?.length > 0 && (
        <DiceRoller
          requiredDice={validationResult.required_rolls}
          onRollComplete={handleRollComplete}
        />
      )}

      {step === 'rolling' && !validationResult?.required_rolls?.length && (
        <button className="btn btn-primary btn-full" onClick={() => onConfirm?.(text, [])}>
          Submit Action
        </button>
      )}
    </div>
  );
}

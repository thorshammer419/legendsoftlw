import { useActionPanel, PANEL_MODES } from '../../hooks/useActionPanel';
import ActionSelector from './ActionSelector';
import AbilityConfig from './AbilityConfig';
import FreeformAction from './FreeformAction';

export default function ActionPanel({ character, storyState, actionList, campaignId, submitted, onSubmit, actionEconomy }) {
  const {
    mode, selectedAction, validationResult, validating,
    selectAction, setRolls, validateFreeform, reset, setMode,
  } = useActionPanel(campaignId, character, onSubmit);

  const handleAbilityConfirm = (actionText, diceResults) => {
    setRolls(diceResults);
    onSubmit(actionText, diceResults.map((r) => ({
      description: r.description || r.purpose || '',
      result: `${r.rolls?.join('+')}=${r.total}`,
    })));
    reset();
  };

  const handleFreeformConfirm = (text, diceResults) => {
    onSubmit(text, diceResults.map((r) => ({
      description: r.description || r.purpose || '',
      result: `${r.rolls?.join('+')}=${r.total}`,
    })));
    reset();
  };

  return (
    <div className="scroll" style={{ maxHeight: 320, padding: '12px 16px' }}>
      {mode === PANEL_MODES.SELECT && (
        <ActionSelector
          actionList={actionList}
          submitted={submitted}
          onSelect={selectAction}
          onFreeform={() => setMode(PANEL_MODES.FREEFORM)}
        />
      )}

      {mode === PANEL_MODES.ABILITY && selectedAction && (
        <AbilityConfig
          action={selectedAction}
          character={character}
          storyState={storyState}
          onConfirm={handleAbilityConfirm}
          onBack={reset}
        />
      )}

      {mode === PANEL_MODES.FREEFORM && (
        <FreeformAction
          campaignId={campaignId}
          onValidate={validateFreeform}
          onConfirm={handleFreeformConfirm}
          onBack={reset}
          validating={validating}
          validationResult={validationResult}
        />
      )}
    </div>
  );
}

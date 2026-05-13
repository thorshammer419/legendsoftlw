import { useState, useCallback } from 'react';
import { api } from '../services/api';

export const PANEL_MODES = { SELECT: 'select', ABILITY: 'ability', FREEFORM: 'freeform', CONFIRM: 'confirm' };

export function useActionPanel(campaignId, character, onSubmit) {
  const [mode, setMode] = useState(PANEL_MODES.SELECT);
  const [selectedAction, setSelectedAction] = useState(null);
  const [diceResults, setDiceResults] = useState([]);
  const [freeformText, setFreeformText] = useState('');
  const [validationHistory, setValidationHistory] = useState([]);
  const [validationResult, setValidationResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectAction = useCallback((action) => {
    setSelectedAction(action);
    setDiceResults([]);
    setMode(action.type === 'freeform' ? PANEL_MODES.FREEFORM : PANEL_MODES.ABILITY);
  }, []);

  const setRolls = useCallback((results) => {
    setDiceResults(results);
    setMode(PANEL_MODES.CONFIRM);
  }, []);

  const validateFreeform = useCallback(async (text) => {
    setValidating(true);
    try {
      const history = [
        ...validationHistory,
        { role: 'user', content: text },
      ];
      const result = await api.validateAction(campaignId, text, validationHistory);
      setValidationResult(result);
      setValidationHistory([
        ...history,
        { role: 'assistant', content: result.dm_response },
      ]);
      if (result.valid) {
        setFreeformText(text);
        setMode(PANEL_MODES.CONFIRM);
      }
      return result;
    } finally {
      setValidating(false);
    }
  }, [campaignId, validationHistory]);

  const reset = useCallback(() => {
    setMode(PANEL_MODES.SELECT);
    setSelectedAction(null);
    setDiceResults([]);
    setFreeformText('');
    setValidationHistory([]);
    setValidationResult(null);
  }, []);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      const actionText = selectedAction?.type === 'freeform'
        ? freeformText
        : selectedAction?.action || selectedAction?.name || '';

      const rolls = diceResults.map((r) => ({
        description: r.purpose || r.description || '',
        result: `${r.rolls?.join('+')} = ${r.total}`,
      }));

      await onSubmit(actionText, rolls);
      reset();
    } finally {
      setSubmitting(false);
    }
  }, [selectedAction, freeformText, diceResults, onSubmit, reset]);

  return {
    mode, selectedAction, diceResults, freeformText, setFreeformText,
    validationResult, validationHistory, validating, submitting,
    selectAction, setRolls, validateFreeform, submit, reset, setMode,
  };
}

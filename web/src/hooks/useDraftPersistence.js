import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { ABILITY_KEYS } from '../data/abilityScoreConstants';

export function useDraftPersistence({
  campaignId,
  campaignLoaded,
  abilityScoreMethod,
  getDraftData,
  onRestored,
  initialDraftRestored = false,
}) {
  const [draftRestored, setDraftRestored] = useState(initialDraftRestored);
  const skipSaveRef = useRef(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (campaignLoaded) loadedRef.current = true;
  }, [campaignLoaded]);

  // Load draft once campaign data is available; fall back to saved character
  useEffect(() => {
    if (!campaignLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const draft = await api.getDraft(campaignId);
        if (cancelled) return;
        if (!draft) {
          const char = await api.getCharacter(campaignId).catch(() => null);
          if (cancelled || !char) return;
          const rollResults = abilityScoreMethod === 'roll_for_stats'
            ? ABILITY_KEYS.map((k) => ({
                rolls: [char.ability_scores?.[k] ?? 10],
                kept: [char.ability_scores?.[k] ?? 10],
                dropped: [],
                sum: char.ability_scores?.[k] ?? 10,
              }))
            : [];
          onRestored({
            identity: {
              name: char.name || '',
              race: char.race || 'Human',
              class_name: char.class || 'Barbarian',
              background: char.background || 'Acolyte',
              alignment: char.alignment || 'True Neutral',
              level: char.level || 1,
              backstory: char.backstory || '',
            },
            step: null,
            scores: char.ability_scores,
            availableChips: [],
            rollResults,
          });
          return;
        }
        onRestored({
          identity: draft.identity || null,
          step: draft.step === 2 ? 2 : null,
          scores: draft.scores,
          availableChips: draft.available_chips,
          rollResults: draft.roll_results,
        });
      } catch {
        // ignore — leave defaults in place
      } finally {
        if (!cancelled) setDraftRestored(true);
      }
    })();
    return () => { cancelled = true; };
  }, [campaignLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save with keepalive on tab/window close (SPA is still alive; api.saveDraft won't fire)
  useEffect(() => {
    const handleBeforeUnload = () => {
      fetch(`/api/campaigns/${campaignId}/character/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getDraftData()),
        keepalive: true,
      });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save on normal SPA navigation (Navbar back, browser back within the app)
  useEffect(() => {
    return () => {
      if (skipSaveRef.current || !loadedRef.current) return;
      api.saveDraft(campaignId, getDraftData()).catch(() => {});
    };
  }, [campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveDraft = (overrides = {}) =>
    api.saveDraft(campaignId, { ...getDraftData(), ...overrides }).catch(() => {});

  const markSkipSave = () => { skipSaveRef.current = true; };

  return { draftRestored, saveDraft, markSkipSave };
}

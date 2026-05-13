import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

export function useGame(campaignId) {
  const [gameState, setGameState] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const [narrativeFeed, setNarrativeFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const fetchState = useCallback(async () => {
    if (!campaignId) return;
    try {
      const [state, camp] = await Promise.all([
        api.getGameState(campaignId),
        api.getCampaign(campaignId),
      ]);
      setGameState(state);
      setCampaign(camp);
      setSubmitted(!!state.story_state?.pending_actions?.[state.character?.email]);

      // Seed feed with current scene image if we have one and feed is empty
      const imageUrl = state.story_state?.scene_image_url;
      if (imageUrl) {
        setNarrativeFeed((prev) => {
          if (prev.length > 0) return prev;
          return [{
            round_number: state.story_state?.round_number ?? 0,
            narrative: state.story_state?.narrative_summary || '',
            scene_image_url: imageUrl,
          }];
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const onNarrativeUpdate = useCallback((update) => {
    setNarrativeFeed((prev) => [...prev, update]);
    setSubmitted(false);
    // Refresh state to get new action list, HP, conditions etc.
    fetchState();
  }, [fetchState]);

  const submitAction = useCallback(async (actionText, rolls = []) => {
    await api.submitAction(campaignId, actionText, rolls);
    setSubmitted(true);
  }, [campaignId]);

  return {
    gameState,
    campaign,
    narrativeFeed,
    loading,
    submitted,
    error,
    submitAction,
    onNarrativeUpdate,
    refresh: fetchState,
    character: gameState?.character,
    storyState: gameState?.story_state,
    actionList: gameState?.action_list ?? [],
    partyStatus: gameState?.party_status ?? [],
  };
}

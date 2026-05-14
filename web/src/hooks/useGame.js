import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useGameState } from './useGameState';
import { useNarrativeFeed } from './useNarrativeFeed';

export function useGame(campaignId) {
  const { gameState, campaign, loading, error, refresh } = useGameState(campaignId);
  const { feed, seedFeed, appendEntry } = useNarrativeFeed();
  const [submitted, setSubmitted] = useState(false);

  // Seed the narrative feed from the log on first successful load.
  useEffect(() => {
    if (gameState) {
      seedFeed(gameState.narrative_log, gameState.story_state);
    }
  }, [gameState, seedFeed]);

  // Keep submitted in sync with what the server says about pending actions.
  useEffect(() => {
    const email = gameState?.character?.email;
    if (email) {
      setSubmitted(!!gameState.story_state?.pending_actions?.[email]);
    }
  }, [gameState]);

  const onNarrativeUpdate = useCallback((update) => {
    appendEntry(update);
    setSubmitted(false);
    refresh();
  }, [appendEntry, refresh]);

  const submitAction = useCallback(async (actionText, rolls = []) => {
    await api.submitAction(campaignId, actionText, rolls);
    setSubmitted(true);
  }, [campaignId]);

  return {
    gameState,
    campaign,
    narrativeFeed: feed,
    loading,
    submitted,
    error,
    submitAction,
    onNarrativeUpdate,
    refresh,
    character: gameState?.character,
    storyState: gameState?.story_state,
    actionList: gameState?.action_list ?? [],
    partyStatus: gameState?.party_status ?? [],
  };
}

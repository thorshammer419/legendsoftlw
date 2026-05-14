import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

export function useGameState(campaignId) {
  const [gameState, setGameState] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!campaignId) return;
    try {
      const [state, camp] = await Promise.all([
        api.getGameState(campaignId),
        api.getCampaign(campaignId),
      ]);
      setGameState(state);
      setCampaign(camp);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { gameState, campaign, loading, error, refresh };
}

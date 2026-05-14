import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

export function useCampaign(campaignId) {
  const [campaign, setCampaign] = useState(null);
  const [players, setPlayers] = useState([]);
  const [storyState, setStoryState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!campaignId) return;
    try {
      const [camp, state] = await Promise.all([
        api.getCampaign(campaignId),
        api.getGameState(campaignId),
      ]);
      setCampaign(camp);
      setPlayers(state?.party_status ?? []);
      setStoryState(state?.story_state ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { campaign, players, storyState, loading, error, refresh };
}

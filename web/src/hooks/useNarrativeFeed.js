import { useState, useCallback } from 'react';

export function useNarrativeFeed() {
  const [feed, setFeed] = useState([]);

  const seedFeed = useCallback((narrativeLog, storyState) => {
    setFeed((prev) => {
      if (prev.length > 0) return prev;
      const rounds = narrativeLog || [];
      const imageUrl = storyState?.scene_image_url;
      if (rounds.length > 0) {
        return rounds.map((r, i) => ({
          round_number: r.round,
          narrative: r.narrative,
          scene_image_url: i === rounds.length - 1 ? imageUrl : undefined,
        }));
      }
      if (imageUrl) {
        return [{
          round_number: storyState?.round_number ?? 0,
          narrative: storyState?.narrative_summary || '',
          scene_image_url: imageUrl,
        }];
      }
      return prev;
    });
  }, []);

  const appendEntry = useCallback((entry) => {
    setFeed((prev) => [...prev, entry]);
  }, []);

  return { feed, seedFeed, appendEntry };
}

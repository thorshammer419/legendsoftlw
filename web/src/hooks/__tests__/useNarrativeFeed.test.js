import { renderHook, act } from '@testing-library/react';
import { useNarrativeFeed } from '../useNarrativeFeed';

const ROUNDS = [
  { round: 0, narrative: 'The campaign begins.' },
  { round: 1, narrative: 'The party enters the dungeon.' },
  { round: 2, narrative: 'A goblin attacks!' },
];

const STORY_STATE = {
  round_number: 2,
  narrative_summary: 'An adventure unfolds.',
  scene_image_url: 'https://example.com/scene.png',
};

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

test('feed starts empty', () => {
  const { result } = renderHook(() => useNarrativeFeed());
  expect(result.current.feed).toEqual([]);
});

// ---------------------------------------------------------------------------
// seedFeed
// ---------------------------------------------------------------------------

describe('seedFeed', () => {
  test('populates feed from narrative log', () => {
    const { result } = renderHook(() => useNarrativeFeed());

    act(() => result.current.seedFeed(ROUNDS, STORY_STATE));

    expect(result.current.feed).toHaveLength(3);
    expect(result.current.feed[0].narrative).toBe('The campaign begins.');
    expect(result.current.feed[1].narrative).toBe('The party enters the dungeon.');
  });

  test('maps round_number from log round field', () => {
    const { result } = renderHook(() => useNarrativeFeed());

    act(() => result.current.seedFeed(ROUNDS, STORY_STATE));

    expect(result.current.feed[0].round_number).toBe(0);
    expect(result.current.feed[2].round_number).toBe(2);
  });

  test('attaches scene_image_url only to the last entry', () => {
    const { result } = renderHook(() => useNarrativeFeed());

    act(() => result.current.seedFeed(ROUNDS, STORY_STATE));

    expect(result.current.feed[0].scene_image_url).toBeUndefined();
    expect(result.current.feed[1].scene_image_url).toBeUndefined();
    expect(result.current.feed[2].scene_image_url).toBe('https://example.com/scene.png');
  });

  test('is idempotent — does not replace existing feed', () => {
    const { result } = renderHook(() => useNarrativeFeed());

    act(() => result.current.seedFeed(ROUNDS, STORY_STATE));
    const firstFeed = result.current.feed;

    act(() => result.current.seedFeed(
      [{ round: 99, narrative: 'Different round.' }],
      STORY_STATE,
    ));

    expect(result.current.feed).toBe(firstFeed);  // same reference — not replaced
  });

  test('falls back to story_state summary when log is empty and image url exists', () => {
    const { result } = renderHook(() => useNarrativeFeed());

    act(() => result.current.seedFeed([], STORY_STATE));

    expect(result.current.feed).toHaveLength(1);
    expect(result.current.feed[0].narrative).toBe('An adventure unfolds.');
    expect(result.current.feed[0].scene_image_url).toBe('https://example.com/scene.png');
    expect(result.current.feed[0].round_number).toBe(2);
  });

  test('no-ops when log is empty and no image url', () => {
    const { result } = renderHook(() => useNarrativeFeed());

    act(() => result.current.seedFeed([], { round_number: 0, narrative_summary: '' }));

    expect(result.current.feed).toEqual([]);
  });

  test('handles null narrative log gracefully', () => {
    const { result } = renderHook(() => useNarrativeFeed());

    act(() => result.current.seedFeed(null, STORY_STATE));

    // null log → empty rounds → falls back to story_state summary (image url present)
    expect(result.current.feed).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// appendEntry
// ---------------------------------------------------------------------------

describe('appendEntry', () => {
  test('appends an entry to an empty feed', () => {
    const { result } = renderHook(() => useNarrativeFeed());
    const entry = { round_number: 3, narrative: 'A dragon appears!' };

    act(() => result.current.appendEntry(entry));

    expect(result.current.feed).toHaveLength(1);
    expect(result.current.feed[0]).toEqual(entry);
  });

  test('appends to an already-seeded feed', () => {
    const { result } = renderHook(() => useNarrativeFeed());

    act(() => result.current.seedFeed(ROUNDS, STORY_STATE));
    act(() => result.current.appendEntry({ round_number: 3, narrative: 'New round.' }));

    expect(result.current.feed).toHaveLength(4);
    expect(result.current.feed[3].narrative).toBe('New round.');
  });

  test('multiple appends accumulate in order', () => {
    const { result } = renderHook(() => useNarrativeFeed());

    act(() => result.current.appendEntry({ round_number: 1, narrative: 'First.' }));
    act(() => result.current.appendEntry({ round_number: 2, narrative: 'Second.' }));

    expect(result.current.feed[0].narrative).toBe('First.');
    expect(result.current.feed[1].narrative).toBe('Second.');
  });
});

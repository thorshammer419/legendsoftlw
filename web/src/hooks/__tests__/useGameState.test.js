import { renderHook, act, waitFor } from '@testing-library/react';
import { useGameState } from '../useGameState';
import { api } from '../../services/api';

jest.mock('../../services/api');

const GAME_STATE = {
  story_state: { round_number: 3, round_status: 'waiting' },
  character: { name: 'Thorin' },
  party_status: [{ email: 'player@example.com', status: 'active' }],
};

const CAMPAIGN = {
  campaign_id: 'abc12345',
  name: 'Dark Descent',
  status: 'active',
};

beforeEach(() => {
  api.getGameState.mockResolvedValue(GAME_STATE);
  api.getCampaign.mockResolvedValue(CAMPAIGN);
});

afterEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------

test('starts with loading=true and null data', () => {
  const { result } = renderHook(() => useGameState('abc12345'));

  expect(result.current.loading).toBe(true);
  expect(result.current.gameState).toBeNull();
  expect(result.current.campaign).toBeNull();
  expect(result.current.error).toBeNull();
});

test('sets gameState and campaign after successful fetch', async () => {
  const { result } = renderHook(() => useGameState('abc12345'));

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.gameState).toEqual(GAME_STATE);
  expect(result.current.campaign).toEqual(CAMPAIGN);
  expect(result.current.error).toBeNull();
});

test('calls api with the provided campaignId', async () => {
  const { result } = renderHook(() => useGameState('abc12345'));

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(api.getGameState).toHaveBeenCalledWith('abc12345');
  expect(api.getCampaign).toHaveBeenCalledWith('abc12345');
});

test('fetches both endpoints in parallel', async () => {
  const { result } = renderHook(() => useGameState('abc12345'));

  await waitFor(() => expect(result.current.loading).toBe(false));

  // Both called exactly once on mount
  expect(api.getGameState).toHaveBeenCalledTimes(1);
  expect(api.getCampaign).toHaveBeenCalledTimes(1);
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

test('sets error message when fetch fails', async () => {
  api.getGameState.mockRejectedValue(new Error('Network error'));

  const { result } = renderHook(() => useGameState('abc12345'));

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.error).toBe('Network error');
  expect(result.current.gameState).toBeNull();
});

test('sets loading=false even on error', async () => {
  api.getGameState.mockRejectedValue(new Error('500'));

  const { result } = renderHook(() => useGameState('abc12345'));

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.loading).toBe(false);
});

// ---------------------------------------------------------------------------
// No campaignId
// ---------------------------------------------------------------------------

test('does not fetch when campaignId is falsy', () => {
  renderHook(() => useGameState(null));

  expect(api.getGameState).not.toHaveBeenCalled();
  expect(api.getCampaign).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// refresh()
// ---------------------------------------------------------------------------

test('refresh() re-fetches and updates state', async () => {
  const { result } = renderHook(() => useGameState('abc12345'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  const updatedState = { ...GAME_STATE, story_state: { round_number: 4 } };
  api.getGameState.mockResolvedValue(updatedState);

  await act(() => result.current.refresh());

  expect(result.current.gameState.story_state.round_number).toBe(4);
});

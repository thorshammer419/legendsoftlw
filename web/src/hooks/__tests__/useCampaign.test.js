import { renderHook, act, waitFor } from '@testing-library/react';
import { useCampaign } from '../useCampaign';
import { api } from '../../services/api';

jest.mock('../../services/api');

const CAMPAIGN = {
  campaign_id: 'abc12345',
  name: 'Dark Descent',
  status: 'active',
};

const GAME_STATE = {
  party_status: [
    { email: 'player@example.com', status: 'active' },
    { email: 'player2@example.com', status: 'active' },
  ],
  story_state: { round_number: 3, round_status: 'waiting' },
};

beforeEach(() => {
  api.getCampaign.mockResolvedValue(CAMPAIGN);
  api.getGameState.mockResolvedValue(GAME_STATE);
});

afterEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------

test('starts with loading=true and empty/null data', () => {
  const { result } = renderHook(() => useCampaign('abc12345'));

  expect(result.current.loading).toBe(true);
  expect(result.current.campaign).toBeNull();
  expect(result.current.players).toEqual([]);
  expect(result.current.storyState).toBeNull();
  expect(result.current.error).toBeNull();
});

test('sets campaign, players, and storyState after fetch', async () => {
  const { result } = renderHook(() => useCampaign('abc12345'));

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.campaign).toEqual(CAMPAIGN);
  expect(result.current.players).toEqual(GAME_STATE.party_status);
  expect(result.current.storyState).toEqual(GAME_STATE.story_state);
});

test('sets loading=false after fetch completes', async () => {
  const { result } = renderHook(() => useCampaign('abc12345'));

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.loading).toBe(false);
});

test('calls both api endpoints with the campaignId', async () => {
  const { result } = renderHook(() => useCampaign('abc12345'));

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(api.getCampaign).toHaveBeenCalledWith('abc12345');
  expect(api.getGameState).toHaveBeenCalledWith('abc12345');
});

// ---------------------------------------------------------------------------
// Missing fields in response
// ---------------------------------------------------------------------------

test('players defaults to empty array when party_status missing', async () => {
  api.getGameState.mockResolvedValue({ story_state: { round_number: 1 } });

  const { result } = renderHook(() => useCampaign('abc12345'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.players).toEqual([]);
});

test('storyState defaults to null when story_state missing', async () => {
  api.getGameState.mockResolvedValue({ party_status: [] });

  const { result } = renderHook(() => useCampaign('abc12345'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.storyState).toBeNull();
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

test('sets error message when fetch fails', async () => {
  api.getCampaign.mockRejectedValue(new Error('Unauthorized'));

  const { result } = renderHook(() => useCampaign('abc12345'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.error).toBe('Unauthorized');
});

test('sets loading=false even on error', async () => {
  api.getCampaign.mockRejectedValue(new Error('500'));

  const { result } = renderHook(() => useCampaign('abc12345'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.loading).toBe(false);
});

// ---------------------------------------------------------------------------
// No campaignId
// ---------------------------------------------------------------------------

test('does not fetch when campaignId is falsy', () => {
  renderHook(() => useCampaign(null));

  expect(api.getCampaign).not.toHaveBeenCalled();
  expect(api.getGameState).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// refresh()
// ---------------------------------------------------------------------------

test('refresh() re-fetches and updates state', async () => {
  const { result } = renderHook(() => useCampaign('abc12345'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  const updatedState = {
    ...GAME_STATE,
    story_state: { round_number: 4, round_status: 'resolving' },
  };
  api.getGameState.mockResolvedValue(updatedState);

  await act(() => result.current.refresh());

  expect(result.current.storyState.round_number).toBe(4);
});

test('refresh() updates player list', async () => {
  const { result } = renderHook(() => useCampaign('abc12345'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  api.getGameState.mockResolvedValue({
    ...GAME_STATE,
    party_status: [{ email: 'player@example.com', status: 'inactive' }],
  });

  await act(() => result.current.refresh());

  expect(result.current.players[0].status).toBe('inactive');
});

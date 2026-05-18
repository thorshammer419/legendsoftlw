import { renderHook, act } from '@testing-library/react';
import { useRerollApproval } from '../useRerollApproval';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({
  api: { rerollRequest: jest.fn() },
}));

let signalRHandler = null;
jest.mock('../useSignalR', () => ({
  useSignalR: (_campaignId, handlers) => {
    signalRHandler = handlers?.onLobbyEvent ?? null;
  },
}));

jest.useFakeTimers();

beforeEach(() => {
  signalRHandler = null;
  jest.clearAllMocks();
  api.rerollRequest.mockResolvedValue({});
});

const OPTS = { campaignId: 'camp-1', myEmail: 'player@example.com' };

describe('useRerollApproval', () => {
  it('starts with status idle', () => {
    const { result } = renderHook(() => useRerollApproval(OPTS));
    expect(result.current.status).toBe('idle');
  });

  it('requestReroll sets status to pending', async () => {
    const { result } = renderHook(() => useRerollApproval(OPTS));
    await act(async () => { result.current.requestReroll(12); });
    expect(result.current.status).toBe('pending');
  });

  it('requestReroll calls api.rerollRequest with old_value', async () => {
    const { result } = renderHook(() => useRerollApproval(OPTS));
    await act(async () => { result.current.requestReroll(14); });
    expect(api.rerollRequest).toHaveBeenCalledWith('camp-1', { old_value: 14 });
  });

  it('approved reroll_response sets status to approved', async () => {
    const { result } = renderHook(() => useRerollApproval(OPTS));
    await act(async () => { result.current.requestReroll(12); });
    act(() => {
      signalRHandler({ type: 'reroll_response', player_email: 'player@example.com', approved: true });
    });
    expect(result.current.status).toBe('approved');
  });

  it('denied reroll_response sets status to denied', async () => {
    const { result } = renderHook(() => useRerollApproval(OPTS));
    await act(async () => { result.current.requestReroll(12); });
    act(() => {
      signalRHandler({ type: 'reroll_response', player_email: 'player@example.com', approved: false });
    });
    expect(result.current.status).toBe('denied');
  });

  it('ignores reroll_response for a different player', async () => {
    const { result } = renderHook(() => useRerollApproval(OPTS));
    await act(async () => { result.current.requestReroll(12); });
    act(() => {
      signalRHandler({ type: 'reroll_response', player_email: 'other@example.com', approved: true });
    });
    expect(result.current.status).toBe('pending');
  });

  it('60s timeout resets status to idle', async () => {
    const { result } = renderHook(() => useRerollApproval(OPTS));
    await act(async () => { result.current.requestReroll(12); });
    act(() => { jest.advanceTimersByTime(60000); });
    expect(result.current.status).toBe('idle');
  });

  it('clearDenied resets status to idle', async () => {
    const { result } = renderHook(() => useRerollApproval(OPTS));
    await act(async () => { result.current.requestReroll(12); });
    act(() => {
      signalRHandler({ type: 'reroll_response', player_email: 'player@example.com', approved: false });
    });
    act(() => { result.current.clearDenied(); });
    expect(result.current.status).toBe('idle');
  });
});

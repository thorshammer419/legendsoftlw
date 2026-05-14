import { renderHook, waitFor } from '@testing-library/react';
import { useAuth } from '../useAuth';
import { api } from '../../services/api';
import { getUser } from '../../services/auth';

jest.mock('../../services/api');
jest.mock('../../services/auth');

const PRINCIPAL = { userDetails: 'player@example.com', identityProvider: 'google' };
const PLAYER = { email: 'player@example.com', approved: true };

afterEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

test('unauthorized is false initially', () => {
  getUser.mockResolvedValue(null);

  const { result } = renderHook(() => useAuth());

  expect(result.current.unauthorized).toBe(false);
});

// ---------------------------------------------------------------------------
// 403 from registerPlayer
// ---------------------------------------------------------------------------

test('unauthorized becomes true on 403 from registerPlayer', async () => {
  getUser.mockResolvedValue(PRINCIPAL);
  const err = new Error('Not on allowlist');
  err.status = 403;
  api.registerPlayer.mockRejectedValue(err);

  const { result } = renderHook(() => useAuth());
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.unauthorized).toBe(true);
  expect(result.current.user).toBeNull();
});

// ---------------------------------------------------------------------------
// Success path
// ---------------------------------------------------------------------------

test('user is set and unauthorized is false on successful registration', async () => {
  getUser.mockResolvedValue(PRINCIPAL);
  api.registerPlayer.mockResolvedValue(PLAYER);

  const { result } = renderHook(() => useAuth());
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.user).toMatchObject({ userDetails: 'player@example.com' });
  expect(result.current.unauthorized).toBe(false);
});

// ---------------------------------------------------------------------------
// Non-403 error preserves fallback
// ---------------------------------------------------------------------------

test('non-403 error sets user to principal (fallback) and unauthorized stays false', async () => {
  getUser.mockResolvedValue(PRINCIPAL);
  const err = new Error('Network error');
  err.status = 500;
  api.registerPlayer.mockRejectedValue(err);

  const { result } = renderHook(() => useAuth());
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.user).toEqual(PRINCIPAL);
  expect(result.current.unauthorized).toBe(false);
});

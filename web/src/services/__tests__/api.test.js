import { api } from '../api';

global.fetch = jest.fn();

afterEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// Error includes status property
// ---------------------------------------------------------------------------

test('thrown error has status property matching HTTP status code', async () => {
  global.fetch.mockResolvedValue({
    ok: false,
    status: 403,
    statusText: 'Forbidden',
    text: async () => 'Not on allowlist',
  });

  let caughtError;
  try {
    await api.registerPlayer();
  } catch (e) {
    caughtError = e;
  }

  expect(caughtError).toBeDefined();
  expect(caughtError.status).toBe(403);
});

test('thrown error status is 401 for unauthorized response', async () => {
  global.fetch.mockResolvedValue({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    text: async () => '',
  });

  let caughtError;
  try {
    await api.registerPlayer();
  } catch (e) {
    caughtError = e;
  }

  expect(caughtError.status).toBe(401);
});

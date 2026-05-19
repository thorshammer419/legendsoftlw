const BASE = '/api';

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text || res.statusText);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  registerPlayer: () => req('/me', { method: 'POST' }),
  updatePushSubscription: (subscription) =>
    req('/me/push-subscription', { method: 'PUT', body: JSON.stringify({ subscription }) }),

  listAllCampaigns: () => req('/campaigns'),
  resolveInviteToken: (token) => req(`/campaigns/invite/${token}`),
  createCampaign: (data) => req('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  generateCampaignField: (field, context) =>
    req('/campaigns/generate-field', { method: 'POST', body: JSON.stringify({ field, context }) }),
  getCampaign: (id) => req(`/campaigns/${id}`),
  joinCampaign: (campaignId, opts = {}) =>
    req(`/campaigns/${campaignId}/join`, { method: 'POST', body: JSON.stringify(opts) }),
  getGameState: (id) => req(`/campaigns/${id}/state`),

  getCharacter: (campaignId) => req(`/campaigns/${campaignId}/character`),
  saveCharacter: (campaignId, data) =>
    req(`/campaigns/${campaignId}/character`, { method: 'PUT', body: JSON.stringify(data) }),

  saveDraft: (campaignId, data) =>
    req(`/campaigns/${campaignId}/character/draft`, { method: 'PUT', body: JSON.stringify(data) }),
  getDraft: (campaignId) => req(`/campaigns/${campaignId}/character/draft`),

  submitAction: (campaignId, actionText, rolls = []) =>
    req(`/campaigns/${campaignId}/submit-action`, {
      method: 'POST',
      body: JSON.stringify({ campaign_id: campaignId, action_text: actionText, rolls }),
    }),
  validateAction: (campaignId, actionText, conversationHistory = []) =>
    req(`/campaigns/${campaignId}/validate-action`, {
      method: 'POST',
      body: JSON.stringify({ campaign_id: campaignId, action_text: actionText, conversation_history: conversationHistory }),
    }),

  negotiate: (campaignId) => req(`/campaigns/${campaignId}/negotiate`),

  updateCampaignPassword: (campaignId, password) =>
    req(`/campaigns/${campaignId}/admin/settings`, { method: 'PATCH', body: JSON.stringify({ password }) }),
  regenerateInviteToken: (campaignId) =>
    req(`/campaigns/${campaignId}/admin/regenerate-invite`, { method: 'POST' }),
  getRerollFlags: (campaignId) =>
    req(`/campaigns/${campaignId}/admin/reroll-flags`),
  removeRerollFlag: (campaignId, playerEmail) =>
    req(`/campaigns/${campaignId}/admin/reroll-flag/${encodeURIComponent(playerEmail)}`, { method: 'DELETE' }),

  startRound: (campaignId) =>
    req(`/campaigns/${campaignId}/admin/start-round`, { method: 'POST' }),
  togglePlayer: (campaignId, email, status) =>
    req(`/campaigns/${campaignId}/admin/toggle-player`, {
      method: 'POST',
      body: JSON.stringify({ email, status }),
    }),
  exportNovel: (campaignId) =>
    req(`/campaigns/${campaignId}/admin/export-novel`, { method: 'POST' }),

  sendLobbyMessage: (campaignId, text, messageId) =>
    req(`/campaigns/${campaignId}/lobby/message`, {
      method: 'POST',
      body: JSON.stringify({ text, message_id: messageId }),
    }),
  getLobbyChatHistory: (campaignId) =>
    req(`/campaigns/${campaignId}/lobby/chat`),
  lobbyPresence: (campaignId, action) =>
    req(`/campaigns/${campaignId}/lobby/presence`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),
  lobbyPresenceBeacon: (campaignId) => {
    const blob = new Blob(
      [JSON.stringify({ action: 'leave' })],
      { type: 'application/json' }
    );
    navigator.sendBeacon(`/api/campaigns/${campaignId}/lobby/presence`, blob);
  },
  rerollRequest: (campaignId, body) =>
    req(`/campaigns/${campaignId}/reroll-request`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  rerollResponse: (campaignId, body) =>
    req(`/campaigns/${campaignId}/reroll-response`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  launchCampaign: (campaignId) =>
    req(`/campaigns/${campaignId}/lobby/launch`, { method: 'POST' }),
  deleteCampaign: (campaignId) =>
    req(`/campaigns/${campaignId}`, { method: 'DELETE' }),
  leaveCampaign: (campaignId) =>
    req(`/campaigns/${campaignId}/leave`, { method: 'DELETE' }),

  getAllowedUsers: () => req('/allowlist'),
  addAllowedUser: (email) =>
    req('/allowlist', { method: 'POST', body: JSON.stringify({ email }) }),
  removeAllowedUser: (email) =>
    req('/allowlist', { method: 'DELETE', body: JSON.stringify({ email }) }),
};

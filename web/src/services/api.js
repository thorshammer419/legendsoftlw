const BASE = '/api';

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export const api = {
  registerPlayer: () => req('/me', { method: 'POST' }),
  updatePushSubscription: (subscription) =>
    req('/me/push-subscription', { method: 'PUT', body: JSON.stringify({ subscription }) }),

  createCampaign: (data) => req('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  getCampaign: (id) => req(`/campaigns/${id}`),
  getGameState: (id) => req(`/campaigns/${id}/state`),

  getCharacter: (campaignId) => req(`/campaigns/${campaignId}/character`),
  saveCharacter: (campaignId, data) =>
    req(`/campaigns/${campaignId}/character`, { method: 'PUT', body: JSON.stringify(data) }),

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

  startRound: (campaignId) =>
    req(`/campaigns/${campaignId}/admin/start-round`, { method: 'POST' }),
  togglePlayer: (campaignId, email, status) =>
    req(`/campaigns/${campaignId}/admin/toggle-player`, {
      method: 'POST',
      body: JSON.stringify({ email, status }),
    }),
  exportNovel: (campaignId) =>
    req(`/campaigns/${campaignId}/admin/export-novel`, { method: 'POST' }),
};

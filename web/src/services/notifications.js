const VAPID_PUBLIC_KEY = 'BM9AUsgBcKINaOgiUZKj6U9MNP2VDdnDXg6eAADFUjBHn4PCRAzLzB3TyqPrNz5HQc88xutwPHZSnK9M2f03uAM';

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function registerPush(api) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    await api.updatePushSubscription(sub.toJSON());
    return sub;
  } catch (err) {
    console.warn('Push registration failed:', err);
    return null;
  }
}

export async function requestPushPermission(api) {
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    return registerPush(api);
  }
  return null;
}

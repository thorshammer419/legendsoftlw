export async function getUser() {
  try {
    const res = await fetch('/.auth/me');
    const data = await res.json();
    return data.clientPrincipal || null;
  } catch {
    return null;
  }
}

export function login(provider) {
  window.location.href = `/.auth/login/${provider}?post_login_redirect_uri=/`;
}


export function logout() {
  // fetch with redirect:manual clears the SWA session cookie from the 302
  // response headers without following the federated logout redirect to the
  // identity provider. We then navigate to / ourselves, skipping the
  // Microsoft/Google sign-out interstitial entirely.
  fetch('/.auth/logout', { redirect: 'manual' }).finally(() => {
    window.location.href = '/';
  });
}

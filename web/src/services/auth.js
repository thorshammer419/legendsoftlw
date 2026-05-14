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
  window.location.href = '/api/logout';
}

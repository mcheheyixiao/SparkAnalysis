const TOKEN_KEY = 'spark_admin_token'
const TOKEN_EXPIRY_KEY = 'spark_admin_token_expiry'
const USER_KEY = 'spark_admin_user'

export function getToken(): string | null {
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY)
  if (expiry && Date.now() > parseInt(expiry, 10)) {
    clearToken()
    return null
  }
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string, expiresInSeconds: number = 7 * 24 * 3600): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + expiresInSeconds * 1000))
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_EXPIRY_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getStoredUser(): { id: string; username: string; role: string } | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setStoredUser(user: { id: string; username: string; role: string }): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function isAuthenticated(): boolean {
  return getToken() !== null
}

/**
 * Role of the signed-in account as cached by the login flow.
 *
 * The authoritative role lives in the database, but every component that
 * fetches it renders once before the query resolves. Seeding state from this
 * cached value keeps the first paint role-correct, so support agents never see
 * a flash of admin-only navigation.
 */
export function getCachedUserRole(): string | null {
  try {
    const profile = JSON.parse(localStorage.getItem('userProfile') || '{}');
    return typeof profile?.role === 'string' && profile.role ? profile.role : null;
  } catch {
    return null;
  }
}

/** True when the cached role belongs to a chat support agent. */
export function isCachedSupportAgent(): boolean {
  return getCachedUserRole() === 'support';
}

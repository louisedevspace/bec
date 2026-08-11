import { useQuery } from "@tanstack/react-query";
import { buildApiUrl } from "@/lib/config";
import { DEFAULT_ACCENT_THEME, isAccentThemeKey, type AccentThemeKey } from "@shared/accent-themes";

export const DEFAULT_EXCHANGE_NAME = "Becxus";
const NAME_CACHE_KEY = "becxus-exchange-name";

interface AppSettingsResponse {
  exchangeName: string;
  accentTheme: string;
}

// Same flash problem the theme/accent inline scripts already solve for
// color: without a cache, every load shows DEFAULT_EXCHANGE_NAME first and
// then swaps to the real configured name once /api/settings resolves. Cache
// the last-known name so repeat loads render the correct name immediately.
function getCachedExchangeName(): string {
  try {
    return localStorage.getItem(NAME_CACHE_KEY) || DEFAULT_EXCHANGE_NAME;
  } catch {
    return DEFAULT_EXCHANGE_NAME;
  }
}

function cacheExchangeName(name: string) {
  try {
    localStorage.setItem(NAME_CACHE_KEY, name);
  } catch {}
}

// Single shared query — same queryKey as useAccentTheme, so both hooks read
// from one in-flight request/cache entry instead of double-fetching.
function useAppSettingsQuery() {
  return useQuery<AppSettingsResponse>({
    queryKey: [buildApiUrl("/settings")],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

// Reads the admin-configurable exchange display name (Settings → Branding).
// Falls back to the cached last-known name while the request is in flight
// or if it fails, so the UI never flashes the hardcoded default over a
// site that already has a real name configured.
export function useExchangeName(): string {
  const { data } = useAppSettingsQuery();
  if (data?.exchangeName) {
    cacheExchangeName(data.exchangeName);
    return data.exchangeName;
  }
  return getCachedExchangeName();
}

// Reads the admin-selected accent color variant (Settings → Branding).
export function useAccentTheme(): AccentThemeKey {
  const { data } = useAppSettingsQuery();
  return data?.accentTheme && isAccentThemeKey(data.accentTheme) ? data.accentTheme : DEFAULT_ACCENT_THEME;
}

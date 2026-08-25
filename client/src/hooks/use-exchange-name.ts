import { useQuery } from "@tanstack/react-query";
import { buildApiUrl } from "@/lib/config";
import { DEFAULT_ACCENT_THEME, isAccentThemeKey, type AccentThemeKey } from "@shared/accent-themes";

// Falls back to the deployment's own configured app name (VITE_APP_NAME)
// instead of a hardcoded brand — only used before the admin-configured
// name (Settings → Branding) has loaded from /api/settings for the first time.
export const DEFAULT_EXCHANGE_NAME = (import.meta.env.VITE_APP_NAME as string | undefined)?.trim() || "Exchange";
const NAME_CACHE_KEY = "becxus-exchange-name";
const NAV_VISIBILITY_CACHE_KEY = "becxus-nav-visibility";

interface AppSettingsResponse {
  exchangeName: string;
  accentTheme: string;
  navVisibility?: Record<string, boolean>;
  logoUpdatedAt?: string | null;
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

// Same flash problem as the exchange name above: cache the last-known nav
// visibility map so repeat loads hide/show nav items correctly immediately
// instead of flashing every item before /api/settings resolves.
function getCachedNavVisibility(): Record<string, boolean> {
  try {
    const cached = localStorage.getItem(NAV_VISIBILITY_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
}

function cacheNavVisibility(navVisibility: Record<string, boolean>) {
  try {
    localStorage.setItem(NAV_VISIBILITY_CACHE_KEY, JSON.stringify(navVisibility));
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

// Reads the admin-configured nav item visibility map (Settings → Branding).
// Falls back to the cached last-known map while the request is in flight or
// if it fails, so nav items never flash visible before disappearing.
export function useNavVisibility(): Record<string, boolean> {
  const { data } = useAppSettingsQuery();
  if (data?.navVisibility) {
    cacheNavVisibility(data.navVisibility);
    return data.navVisibility;
  }
  return getCachedNavVisibility();
}

// The 512px icon the server derives from the admin's uploaded logo (falls
// back to the bundled default logo server-side if none is uploaded yet).
// The version query param busts the browser cache the moment the admin
// uploads a new one -- same file the favicon/PWA icons come from too.
export function useBrandLogoUrl(): string {
  const { data } = useAppSettingsQuery();
  const version = data?.logoUpdatedAt ? new Date(data.logoUpdatedAt).getTime() : 0;
  return `/icons/icon-512.png?v=${version}`;
}

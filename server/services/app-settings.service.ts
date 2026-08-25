import { supabaseAdmin } from "../routes/middleware";
import { getServerConfig } from "../config";
import { DEFAULT_ACCENT_THEME, isAccentThemeKey, type AccentThemeKey } from "../../shared/accent-themes";

// Falls back to this deployment's own configured APP_NAME instead of a
// hardcoded brand — only used when the app_settings DB row is missing or
// the query errors (e.g. Supabase misconfigured for this environment).
const DEFAULT_EXCHANGE_NAME = getServerConfig().appName;
const CACHE_DURATION_MS = 60_000;

export interface AppSettings {
  exchangeName: string;
  accentTheme: AccentThemeKey;
  navVisibility: Record<string, boolean>;
  logoUpdatedAt: string | null;
}

let cachedSettings: AppSettings | null = null;
let cachedAt = 0;

export async function getAppSettings(): Promise<AppSettings> {
  if (cachedSettings && Date.now() - cachedAt < CACHE_DURATION_MS) {
    return cachedSettings;
  }

  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("exchange_name, accent_theme, nav_visibility, logo_updated_at")
    .eq("id", 1)
    .maybeSingle();

  cachedSettings = {
    exchangeName: (!error && data?.exchange_name) ? data.exchange_name : DEFAULT_EXCHANGE_NAME,
    accentTheme: (!error && data?.accent_theme && isAccentThemeKey(data.accent_theme)) ? data.accent_theme : DEFAULT_ACCENT_THEME,
    navVisibility: (!error && data?.nav_visibility && typeof data.nav_visibility === "object") ? data.nav_visibility : {},
    logoUpdatedAt: (!error && data?.logo_updated_at) ? data.logo_updated_at : null,
  };
  cachedAt = Date.now();
  return cachedSettings;
}

export async function getExchangeName(): Promise<string> {
  return (await getAppSettings()).exchangeName;
}

export function setCachedAppSettings(settings: AppSettings) {
  cachedSettings = settings;
  cachedAt = Date.now();
}

// Rewrites the legacy hardcoded "Becxus" mentions baked into static templates
// (auto-reply rules, notification copy) with the current configured name.
export function withExchangeName(text: string, exchangeName: string): string {
  return text.replace(/Becxus/g, exchangeName);
}

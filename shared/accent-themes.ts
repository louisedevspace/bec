// Shared accent-theme registry — consumed by the server (validation) and the
// client (theme picker UI + CSS variable application). Keep in sync with the
// CHECK constraint in migrations/add_app_settings_accent_theme.sql.

export const ACCENT_THEME_KEYS = ["amber", "blue", "violet", "cyan", "slate"] as const;
export type AccentThemeKey = (typeof ACCENT_THEME_KEYS)[number];

export const DEFAULT_ACCENT_THEME: AccentThemeKey = "amber";

// HSL triplets (no hsl() wrapper) matching the --primary / --ring custom
// property format already used in client/src/index.css. Hues are chosen to
// stay clear of the green (~142, profit) and red (~0, loss) semantic zones
// so the brand accent never reads as a buy/sell signal.
export const ACCENT_THEMES: Record<AccentThemeKey, { label: string; primary: string; ring: string }> = {
  amber: { label: "Amber Gold", primary: "42 78% 52%", ring: "42 78% 52%" },
  blue: { label: "Classic Blue", primary: "217 91% 60%", ring: "217 91% 60%" },
  violet: { label: "Violet", primary: "262 75% 63%", ring: "262 75% 63%" },
  cyan: { label: "Cyan Tech", primary: "190 80% 45%", ring: "190 80% 45%" },
  slate: { label: "Graphite", primary: "215 20% 55%", ring: "215 20% 55%" },
};

export function isAccentThemeKey(value: string): value is AccentThemeKey {
  return (ACCENT_THEME_KEYS as readonly string[]).includes(value);
}

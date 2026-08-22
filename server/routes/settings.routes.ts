import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import { getAppSettings, setCachedAppSettings } from "../services/app-settings.service";
import { getServerConfig } from "../config";
import { ACCENT_THEME_KEYS, DEFAULT_ACCENT_THEME, isAccentThemeKey } from "../../shared/accent-themes";

const NAV_VISIBILITY_KEYS = ["home", "markets", "futures", "staking", "support", "profile", "exchange", "wallet", "about"] as const;

export default function registerSettingsRoutes(app: Express) {
  // GET /api/settings — public, powers branding on login/signup before auth
  app.get("/api/settings", async (_req, res) => {
    try {
      const settings = await getAppSettings();
      res.json(settings);
    } catch (error) {
      console.error("Failed to load app settings:", error);
      res.json({ exchangeName: getServerConfig().appName, accentTheme: DEFAULT_ACCENT_THEME, navVisibility: {} });
    }
  });

  // PUT /api/admin/settings — admin-only update
  app.put("/api/admin/settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const exchangeName = typeof req.body?.exchangeName === "string" ? req.body.exchangeName.trim() : "";
      const accentThemeInput = typeof req.body?.accentTheme === "string" ? req.body.accentTheme.trim() : "";

      if (!exchangeName || exchangeName.length > 60) {
        return res.status(400).json({ message: "Exchange name must be 1-60 characters" });
      }
      if (!isAccentThemeKey(accentThemeInput)) {
        return res.status(400).json({ message: `Accent theme must be one of: ${ACCENT_THEME_KEYS.join(", ")}` });
      }

      let navVisibility: Record<string, boolean> | undefined;
      if (req.body?.navVisibility !== undefined) {
        const rawNavVisibility = req.body.navVisibility;
        if (typeof rawNavVisibility !== "object" || rawNavVisibility === null || Array.isArray(rawNavVisibility)) {
          return res.status(400).json({ message: "navVisibility must be an object" });
        }
        navVisibility = {};
        for (const key of NAV_VISIBILITY_KEYS) {
          if (key in rawNavVisibility) {
            navVisibility[key] = Boolean(rawNavVisibility[key]);
          }
        }
      }

      if (navVisibility === undefined) {
        const current = await getAppSettings();
        navVisibility = current.navVisibility;
      }

      const { data, error } = await supabaseAdmin
        .from("app_settings")
        .upsert({
          id: 1,
          exchange_name: exchangeName,
          accent_theme: accentThemeInput,
          nav_visibility: navVisibility,
          updated_at: new Date().toISOString(),
          updated_by: req.user.id,
        })
        .select("exchange_name, accent_theme, nav_visibility")
        .single();

      if (error) {
        return res.status(500).json({ message: "Failed to update settings" });
      }

      const updated = { exchangeName: data.exchange_name, accentTheme: data.accent_theme, navVisibility: data.nav_visibility ?? {} };
      setCachedAppSettings(updated);
      res.json(updated);
    } catch (error) {
      console.error("Failed to update app settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });
}

import type { Express } from "express";
import multer from "multer";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import { getAppSettings, setCachedAppSettings } from "../services/app-settings.service";
import { getBrandIcon, uploadLogo } from "../services/branding-logo.service";
import { getServerConfig } from "../config";
import { ACCENT_THEME_KEYS, DEFAULT_ACCENT_THEME, isAccentThemeKey } from "../../shared/accent-themes";

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image uploads are allowed"));
      return;
    }
    cb(null, true);
  },
});

const NAV_VISIBILITY_KEYS = ["home", "markets", "futures", "staking", "support", "profile", "exchange", "wallet", "about"] as const;

export default function registerSettingsRoutes(app: Express) {
  // GET /api/settings — public, powers branding on login/signup before auth
  app.get("/api/settings", async (_req, res) => {
    try {
      const settings = await getAppSettings();
      res.json(settings);
    } catch (error) {
      console.error("Failed to load app settings:", error);
      res.json({ exchangeName: getServerConfig().appName, accentTheme: DEFAULT_ACCENT_THEME, navVisibility: {}, logoUpdatedAt: null });
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
        .select("exchange_name, accent_theme, nav_visibility, logo_updated_at")
        .single();

      if (error) {
        return res.status(500).json({ message: "Failed to update settings" });
      }

      const updated = { exchangeName: data.exchange_name, accentTheme: data.accent_theme, navVisibility: data.nav_visibility ?? {}, logoUpdatedAt: data.logo_updated_at ?? null };
      setCachedAppSettings(updated);
      res.json(updated);
    } catch (error) {
      console.error("Failed to update app settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // POST /api/admin/settings/logo — admin uploads one logo image; every icon
  // (favicon, PWA icons, in-app <Logo>) is derived from it automatically.
  app.post("/api/admin/settings/logo", requireAuth, requireAdmin, logoUpload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "No image file provided" });

      await uploadLogo(file.buffer);

      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("app_settings")
        .upsert({ id: 1, logo_updated_at: now, updated_at: now, updated_by: req.user.id })
        .select("exchange_name, accent_theme, nav_visibility, logo_updated_at")
        .single();

      if (error) {
        return res.status(500).json({ message: "Failed to save logo" });
      }

      const updated = { exchangeName: data.exchange_name, accentTheme: data.accent_theme, navVisibility: data.nav_visibility ?? {}, logoUpdatedAt: data.logo_updated_at ?? null };
      setCachedAppSettings(updated);
      res.json(updated);
    } catch (error) {
      console.error("Failed to upload logo:", error);
      res.status(500).json({ message: "Failed to upload logo" });
    }
  });

  // These take priority over static-file serving for the same paths (this
  // route file is registered before Vite/static middleware), so a single
  // admin-uploaded logo is the one source every icon derives from — no
  // separate "set the favicon somewhere else" step.
  app.get("/favicon.ico", async (_req, res) => {
    try {
      const buffer = await getBrandIcon(32);
      res.set("Cache-Control", "public, max-age=300").type("image/png").send(buffer);
    } catch (error) {
      res.status(404).end();
    }
  });

  app.get("/icons/icon-192.png", async (_req, res) => {
    try {
      const buffer = await getBrandIcon(192);
      res.set("Cache-Control", "public, max-age=300").type("image/png").send(buffer);
    } catch (error) {
      res.status(404).end();
    }
  });

  app.get("/icons/icon-512.png", async (_req, res) => {
    try {
      const buffer = await getBrandIcon(512);
      res.set("Cache-Control", "public, max-age=300").type("image/png").send(buffer);
    } catch (error) {
      res.status(404).end();
    }
  });
}

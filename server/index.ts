import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes/index";
import { setupVite, serveStatic, log } from "./vite";
import LiveCryptoService from "./services/live-crypto-service";
import { recordApiMetric } from "./perf-metrics";
import { getServerConfig } from "./config";
import { getInternalTaskSecret } from "./routes/middleware";
import postgres from "postgres";

// Function to start scheduled tasks
function startScheduledTasks(port: number) {
  const internalKey = getInternalTaskSecret();
  
  // Process completed staking positions every hour
  setInterval(async () => {
    try {
      const response = await fetch(`http://localhost:${port}/api/staking/process-completed`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Internal-Key': internalKey
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.processed > 0) {
          log(`✅ Processed ${result.processed} completed staking positions`);
        }
      }
    } catch (error) {
      console.error('Error processing completed staking positions:', error);
    }
  }, 3600000); // Every hour

  // Process expired future trades every 30 seconds
  setInterval(async () => {
    try {
      const response = await fetch(`http://localhost:${port}/api/future-trades/process-expired`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Internal-Key': internalKey
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.processed > 0) {
          log(`✅ Processed ${result.processed} expired future trades`);
        }
      }
    } catch (error) {
      console.error('Error processing expired future trades:', error);
    }
  }, 30000); // Every 30 seconds
  
  log('📅 Scheduled tasks started: Staking position processing (hourly), Future trades processing (30s)');
}

const app = express();

// Trust reverse proxy (Coolify uses Traefik) — required for correct req.protocol, req.ip, and secure cookies behind HTTPS proxy
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Gzip/deflate compression — reduces response sizes by ~70%
app.use(compression({
  level: 6,           // balanced speed vs compression
  threshold: 1024,    // only compress responses > 1 KB
  filter: (req, res) => {
    // Don't compress WebSocket upgrade requests or SSE streams
    if (req.headers['upgrade']) return false;
    return compression.filter(req, res);
  },
}));

// Server-side HTTPS redirect in production (when behind a reverse proxy that sets X-Forwarded-Proto)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] === 'http') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);

      recordApiMetric({
        path,
        method: req.method,
        statusCode: res.statusCode,
        durationMs: duration,
      });
    }
  });

  next();
});

(async () => {
  async function ensureNotificationsSchema() {
    try {
      const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
      if (!connectionString) {
        console.warn('⚠️ No DATABASE_URL configured, skipping notifications schema setup');
        return;
      }
      
      // Quick connection test with timeout
      const sql = postgres(connectionString, { 
        max: 1,
        connect_timeout: 5, // 5 second timeout
        idle_timeout: 5
      });
      
      try {
        // Test connection first
        await sql`SELECT 1`;
      } catch (connError) {
        console.warn('⚠️ Database connection unavailable, skipping notifications schema setup');
        await sql.end();
        return;
      }
      
      await sql/* sql */`
        CREATE TABLE IF NOT EXISTS notification_templates (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          deeplink_url TEXT,
          channel TEXT NOT NULL DEFAULT 'push',
          variant_a_title TEXT,
          variant_a_body TEXT,
          variant_b_title TEXT,
          variant_b_body TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS notification_campaigns (
          id SERIAL PRIMARY KEY,
          template_id INTEGER REFERENCES notification_templates(id),
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          deeplink_url TEXT,
          channels TEXT[] NOT NULL DEFAULT ARRAY['push'],
          segment_role TEXT,
          segment_is_verified BOOLEAN,
          segment_is_active BOOLEAN,
          segment_min_credit_score NUMERIC,
          segment_email_search TEXT,
          scheduled_at TIMESTAMPTZ,
          status TEXT NOT NULL DEFAULT 'draft',
          variant TEXT,
          created_by UUID,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS notification_logs (
          id SERIAL PRIMARY KEY,
          campaign_id INTEGER REFERENCES notification_campaigns(id),
          user_id UUID,
          channel TEXT NOT NULL,
          status TEXT NOT NULL,
          error TEXT,
          sent_at TIMESTAMPTZ,
          delivered_at TIMESTAMPTZ,
          clicked_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          user_id UUID PRIMARY KEY,
          endpoint TEXT NOT NULL,
          keys JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS broadcast_notifications (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          target_role TEXT,
          total_users INTEGER NOT NULL DEFAULT 0,
          sent_count INTEGER NOT NULL DEFAULT 0,
          failed_count INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'pending',
          sent_by UUID,
          sent_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS broadcast_delivery_logs (
          id SERIAL PRIMARY KEY,
          broadcast_id INTEGER REFERENCES broadcast_notifications(id) ON DELETE CASCADE,
          user_id UUID,
          status TEXT NOT NULL,
          error TEXT,
          delivered_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `;
      await sql.end();
      console.log('✅ Notifications schema ready');
    } catch (err) {
      console.warn('⚠️ Notifications schema bootstrap skipped:', (err as Error).message);
    }
  }

  // Initialize live crypto service
  const cryptoService = LiveCryptoService.getInstance();
  await cryptoService.initializeCryptoTable();
  cryptoService.startAutoUpdate();
  await ensureNotificationsSchema();
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const cfg = getServerConfig();
  const port = cfg.port;
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`🚀 ${cfg.appName} server running on port ${port}`);
    log(`📱 Frontend: ${cfg.publicUrl}`);
    log(`🔌 WebSocket: ${cfg.publicUrl.replace(/^http/, "ws")}/ws`);
    log(`📊 API: ${cfg.publicUrl}/api`);
    log(`🌍 Environment: ${cfg.env}`);
    
    // Start scheduled tasks
    startScheduledTasks(port);
  });
})();

import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import WebSocket from "ws";
import LiveCryptoService from "../services/live-crypto-service";
import { clients } from "../sync-manager";
import {
  getApiMetricsSummary,
  getClientMetricsSummary,
  recordClientMetric,
} from "../perf-metrics";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { getServerConfig } from "../config";

// Route modules
import registerCryptoRoutes from "./crypto.routes";
import registerAuthRoutes from "./auth.routes";
import registerTradingRoutes from "./trading.routes";
import registerFuturesRoutes from "./futures.routes";
import registerStakingRoutes from "./staking.routes";
import registerLoansRoutes from "./loans.routes";
import registerKycRoutes from "./kyc.routes";
import registerDepositsRoutes from "./deposits.routes";
import registerWithdrawalsRoutes from "./withdrawals.routes";
import registerAdminRoutes from "./admin.routes";
import registerSupportRoutes from "./support.routes";
import { registerNewsRoutes } from "../api/news";
import registerPushRoutes from "./push.routes";
import registerNotificationsRoutes from "./notifications.routes";
import registerSimpleNotificationsRoutes from "./simple-notifications.routes";
import registerStreamlinedNotificationsRoutes from "./streamlined-notifications-fixed.routes";
import registerTradingPairsRoutes from "./trading-pairs.routes";
import registerWalletRoutes from "./wallet.routes";

// Broadcast price updates to all connected WebSocket clients
function broadcastPriceUpdate(priceData: any) {
  const message = JSON.stringify({ type: "price_update", data: priceData });
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Send initial price data to a newly connected client
async function sendPriceUpdate(ws: WebSocket) {
  try {
    const cryptoService = LiveCryptoService.getInstance();
    const prices = await cryptoService.getCurrentPrices();
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "price_update", data: prices }));
    }
  } catch (error) {
    console.error("Error sending price update:", error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Security headers
  const isProduction = process.env.NODE_ENV === 'production';
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
    // Enable HSTS in production — tells browsers to always use HTTPS
    hsts: isProduction ? {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    } : false,
  }));

  // CORS middleware
  app.use((req, res, next) => {
    const cfg = getServerConfig();
    const defaultOrigin = `${req.protocol}://${req.get("host")}`;
    const allowedOrigins = cfg.allowedOrigins.length ? cfg.allowedOrigins : [defaultOrigin];

    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
    }

    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CG-API-Key"
    );
    res.header("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Global API rate limiting (baseline)
  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api", apiLimiter);

  // Tight rate limits for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 60_000,
    max: 30,
  });
  app.use(["/api/auth/login", "/api/auth/logout", "/api/signup-profile", "/api/save-user-password", "/api/update-user-password"], authLimiter);

  // Trade submission/completion limits
  const tradeLimiter = rateLimit({
    windowMs: 60_000,
    max: 120,
  });
  app.use(["/api/future-trade/submit", "/api/future-trade/complete"], tradeLimiter);

  app.use("/api/coingecko/*", async (req, res) => {
    try {
      const targetUrl = `https://api.coingecko.com/api/v3${req.url.replace("/api/coingecko", "")}`;
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      console.error("CoinGecko proxy error:", error);
      res.status(500).json({ error: "Failed to fetch from CoinGecko API" });
    }
  });

  app.post("/api/metrics/client", (req, res) => {
    const { event, path, durationMs } = req.body || {};
    if (
      typeof event !== "string" ||
      typeof path !== "string" ||
      typeof durationMs !== "number"
    ) {
      return res
        .status(400)
        .json({ message: "Invalid client metric payload" });
    }

    recordClientMetric({ event, path, durationMs });
    res.status(204).end();
  });

  app.get("/api/metrics/perf", (_req, res) => {
    const apiSummary = getApiMetricsSummary();
    const clientSummary = getClientMetricsSummary();

    res.json({
      generatedAt: Date.now(),
      api: apiSummary,
      client: clientSummary,
    });
  });

  // WebSocket server for real-time price updates
  // Use noServer mode so we don't conflict with Vite's HMR WebSocket
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    clientTracking: true,
  });

  // Manually handle upgrade events — only intercept /ws path
  httpServer.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url!, `http://${request.headers.host}`);
    if (pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
    // Non-/ws paths (e.g. Vite HMR) are left for other handlers
  });

  wss.on("connection", (ws, req) => {
    clients.add(ws);
    sendPriceUpdate(ws);

    ws.on("close", () => {
      clients.delete(ws);
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      clients.delete(ws);
    });
  });

  wss.on("error", (error) => {
    console.error("WebSocket server error:", error);
  });

  // Register all route modules
  registerCryptoRoutes(app);
  registerAuthRoutes(app);
  registerTradingRoutes(app);
  registerFuturesRoutes(app);
  registerStakingRoutes(app);
  registerLoansRoutes(app);
  registerKycRoutes(app);
  registerDepositsRoutes(app);
  registerWithdrawalsRoutes(app);
  registerAdminRoutes(app);
  registerSupportRoutes(app);
  registerNewsRoutes(app);
  registerPushRoutes(app);
  registerStreamlinedNotificationsRoutes(app);
  registerNotificationsRoutes(app);
  registerSimpleNotificationsRoutes(app);
  registerTradingPairsRoutes(app);
  registerWalletRoutes(app);

  // Live price updates every 30 seconds
  setInterval(async () => {
    try {
      const cryptoService = LiveCryptoService.getInstance();
      const prices = await cryptoService.getCurrentPrices();
      broadcastPriceUpdate(prices);
    } catch (error) {
      console.error("Error updating live prices:", error);
    }
  }, 30000);

  // Global error handler (JSON)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const errorId = `ERR-${Date.now().toString(36)}`;
    console.error("Unhandled error:", { errorId, error: err });
    res.status(500).json({
      message: "Internal server error",
      error_id: errorId,
    });
  });

  return httpServer;
}

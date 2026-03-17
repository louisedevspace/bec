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
import {
  getRedisClient,
  createRedisSubscriber,
  isRedisConnected,
  REDIS_KEYS,
} from "../utils/redis";
import type Redis from "ioredis";

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
import registerAdminNotificationRoutes from "./admin-notifications.routes";
import registerAdminStakingRoutes from "./admin-staking.routes";
import registerAssetRoutes from "./assets.routes";
import registerLinkPreviewRoutes from "./link-preview.routes";

// Redis subscriber instance for Pub/Sub
let redisSubscriber: Redis | null = null;

// Broadcast price updates to local WebSocket clients only (no Redis publish)
function broadcastToLocalClients(message: string) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Publish price update to Redis channel for cross-instance broadcasting
// Falls back to local broadcast if Redis is unavailable
async function publishPriceUpdate(priceData: any) {
  const message = JSON.stringify({ type: "price_update", data: priceData });
  
  try {
    const redisClient = getRedisClient();
    if (redisClient && isRedisConnected()) {
      // Publish to Redis - all instances (including this one) will receive via subscription
      await redisClient.publish(REDIS_KEYS.WS_CHANNEL_PRICES, message);
      console.log("[Redis:PubSub] Published price update to channel:", REDIS_KEYS.WS_CHANNEL_PRICES);
    } else {
      // Fallback: Redis unavailable, broadcast directly to local clients
      broadcastToLocalClients(message);
    }
  } catch (error) {
    console.error("[Redis:PubSub] Error publishing price update:", error);
    // Fallback to local broadcast on error
    broadcastToLocalClients(message);
  }
}

// Initialize Redis Pub/Sub subscriber for WebSocket broadcasting
async function initWebSocketPubSub() {
  try {
    if (!isRedisConnected()) {
      console.log("[Redis:PubSub] Redis not available, skipping Pub/Sub initialization");
      return;
    }

    redisSubscriber = createRedisSubscriber();
    if (!redisSubscriber) {
      console.log("[Redis:PubSub] Failed to create subscriber");
      return;
    }

    // Handle incoming messages from subscribed channels
    redisSubscriber.on("message", (channel: string, message: string) => {
      try {
        if (channel === REDIS_KEYS.WS_CHANNEL_PRICES) {
          // Broadcast price update to local WebSocket clients
          broadcastToLocalClients(message);
          console.log("[Redis:PubSub] Received and broadcast price update from channel");
        } else if (channel === REDIS_KEYS.WS_CHANNEL_SYNC) {
          // Broadcast sync event to local WebSocket clients
          broadcastToLocalClients(message);
          console.log("[Redis:PubSub] Received and broadcast sync event from channel");
        }
      } catch (error) {
        console.error("[Redis:PubSub] Error processing message:", error);
      }
    });

    // Subscribe to price and sync channels
    await redisSubscriber.subscribe(REDIS_KEYS.WS_CHANNEL_PRICES, REDIS_KEYS.WS_CHANNEL_SYNC);
    console.log("[Redis:PubSub] Subscribed to channels:", REDIS_KEYS.WS_CHANNEL_PRICES, REDIS_KEYS.WS_CHANNEL_SYNC);

    // Handle reconnection
    redisSubscriber.on("reconnecting", () => {
      console.log("[Redis:PubSub] Subscriber reconnecting...");
    });

    redisSubscriber.on("connect", async () => {
      console.log("[Redis:PubSub] Subscriber reconnected, resubscribing to channels...");
      try {
        await redisSubscriber?.subscribe(REDIS_KEYS.WS_CHANNEL_PRICES, REDIS_KEYS.WS_CHANNEL_SYNC);
      } catch (error) {
        console.error("[Redis:PubSub] Error resubscribing after reconnect:", error);
      }
    });

  } catch (error) {
    console.error("[Redis:PubSub] Error initializing WebSocket Pub/Sub:", error);
  }
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

  // Withdrawal rate limiter — 10 requests per 15 minutes
  const withdrawLimiter = rateLimit({
    windowMs: 15 * 60_000,
    max: 10,
    message: { message: "Too many withdrawal requests. Please try again later." },
  });
  app.use("/api/withdraw-requests", withdrawLimiter);

  // Conversion rate limiter — 20 requests per minute
  const convertLimiter = rateLimit({
    windowMs: 60_000,
    max: 20,
    message: { message: "Too many conversion requests. Please slow down." },
  });
  app.use("/api/convert", convertLimiter);

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

  registerAssetRoutes(app);

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
  registerAdminNotificationRoutes(app);
  registerAdminStakingRoutes(app);
  registerLinkPreviewRoutes(app);

  // Live price updates every 30 seconds
  setInterval(async () => {
    try {
      const cryptoService = LiveCryptoService.getInstance();
      const prices = await cryptoService.getCurrentPrices();
      // Use Redis Pub/Sub to broadcast prices across all instances
      await publishPriceUpdate(prices);
    } catch (error) {
      console.error("Error updating live prices:", error);
    }
  }, 30000);

  // Initialize Redis Pub/Sub for WebSocket cross-instance broadcasting
  initWebSocketPubSub().catch((error) => {
    console.error("[Redis:PubSub] Failed to initialize:", error);
  });

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

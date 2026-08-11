import { WebSocket } from 'ws';

// Server-side fallback for live kline data — mirrors the existing MEXC price
// pipeline (live-crypto-service.ts) so browsers that can't reach Binance
// directly (regional blocks, CORS, ad-blockers flagging Binance domains)
// still get moving candles. Polled rather than a true exchange WS relay to
// keep this additive: it reuses the same MEXC REST endpoint already proven
// reliable from this server for price-history, at low complexity/risk.

export interface RelayKline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

const POLL_INTERVAL_MS = 3000;
const TEARDOWN_DEBOUNCE_MS = 5000;

// MEXC has no 1s klines — same downgrade the REST price-history endpoint
// already applies (usePriceHistory maps "1s" -> "1m" server-side).
const RELAY_INTERVALS: Record<string, string> = {
  '1s': '1m', '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h',
  '4h': '4h', '1d': '1d', '1w': '1W',
};

interface Subscription {
  key: string;
  symbol: string;
  interval: string;
  sockets: Set<WebSocket>;
  timer: ReturnType<typeof setInterval>;
  teardownTimer?: ReturnType<typeof setTimeout>;
  lastCandle: RelayKline | null;
}

const subscriptions = new Map<string, Subscription>();

function keyFor(symbol: string, interval: string): string {
  return `${symbol.toUpperCase()}:${interval}`;
}

async function fetchLatestKline(symbol: string, interval: string): Promise<RelayKline | null> {
  try {
    const mexcInterval = RELAY_INTERVALS[interval] || interval;
    const url = `https://api.mexc.com/api/v3/klines?symbol=${symbol.toUpperCase()}USDT&interval=${mexcInterval}&limit=2`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const last = rows[rows.length - 1];

    return {
      time: Math.floor(Number(last[0]) / 1000),
      open: parseFloat(last[1]),
      high: parseFloat(last[2]),
      low: parseFloat(last[3]),
      close: parseFloat(last[4]),
      volume: parseFloat(last[5]),
      isClosed: false,
    };
  } catch {
    return null;
  }
}

function broadcast(sub: Subscription, candle: RelayKline) {
  const message = JSON.stringify({ type: 'kline_relay', symbol: sub.symbol, interval: sub.interval, data: candle });
  sub.sockets.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
      } catch {
        // socket will be cleaned up via its own close/error handlers
      }
    }
  });
}

async function poll(sub: Subscription) {
  const candle = await fetchLatestKline(sub.symbol, sub.interval);
  if (!candle) return;

  const prev = sub.lastCandle;
  if (prev && prev.time === candle.time && prev.close === candle.close && prev.high === candle.high && prev.low === candle.low) {
    return; // no change since last poll — skip the send
  }
  sub.lastCandle = candle;
  broadcast(sub, candle);
}

export function subscribeKline(ws: WebSocket, symbol: string, interval: string): void {
  if (!symbol || !RELAY_INTERVALS[interval]) return;

  const key = keyFor(symbol, interval);
  let sub = subscriptions.get(key);

  if (!sub) {
    const symbolUpper = symbol.toUpperCase();
    sub = { key, symbol: symbolUpper, interval, sockets: new Set(), lastCandle: null } as Subscription;
    sub.timer = setInterval(() => poll(sub!), POLL_INTERVAL_MS);
    subscriptions.set(key, sub);
    poll(sub);
  } else if (sub.teardownTimer) {
    clearTimeout(sub.teardownTimer);
    sub.teardownTimer = undefined;
  }

  sub.sockets.add(ws);
}

export function unsubscribeKline(ws: WebSocket, symbol: string, interval: string): void {
  const sub = subscriptions.get(keyFor(symbol, interval));
  if (!sub) return;
  removeSocketFromSubscription(sub, ws);
}

// Called on socket close/error to clean up every subscription it held,
// regardless of which symbol/interval pairs it subscribed to.
export function unsubscribeAllForSocket(ws: WebSocket): void {
  subscriptions.forEach((sub) => removeSocketFromSubscription(sub, ws));
}

function removeSocketFromSubscription(sub: Subscription, ws: WebSocket) {
  if (!sub.sockets.delete(ws)) return;
  if (sub.sockets.size > 0 || sub.teardownTimer) return;

  // Debounce teardown briefly — a client switching timeframe/symbol
  // unsubscribes the old pair and resubscribes the new one almost
  // immediately; avoid tearing down and re-spinning-up the poll loop.
  sub.teardownTimer = setTimeout(() => {
    if (sub.sockets.size > 0) return;
    clearInterval(sub.timer);
    subscriptions.delete(sub.key);
  }, TEARDOWN_DEBOUNCE_MS);
}

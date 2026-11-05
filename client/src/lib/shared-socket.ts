/**
 * One shared connection to the app's own `/ws` endpoint per browser tab.
 *
 * Previously every hook instance (each useCryptoPrices consumer, the chart
 * relay, data sync, admin notifications) opened its own `/ws` socket, so a
 * single page could hold 5-15 sockets and retry all of them at once. Some
 * networks (e.g. ISP-level filtering in Pakistan) reset browsers that open
 * that many WebSockets to one host, which then killed live updates entirely.
 *
 * This module keeps exactly one socket, reference-counted by its users:
 *  - opens when the first user acquires it, closes shortly after the last
 *    user releases it (so route changes don't cause a reconnect)
 *  - reconnects with capped exponential backoff, and immediately when the
 *    network returns or the tab becomes visible again
 *  - parses each message once and fans it out to all listeners
 *  - reference-counts kline relay subscriptions, so two charts on the same
 *    symbol/interval can't unsubscribe each other on the shared socket
 *
 * Every feature that uses it also has a REST/polling path, so when the socket
 * can't connect the app keeps working, just without instant push updates.
 */
import { buildWsUrl } from "./config";
import { safeCloseWebSocket } from "./safe-close-websocket";

export interface SocketMessage {
  type: string;
  data?: any;
  [key: string]: any;
}

type MessageListener = (message: SocketMessage, event: MessageEvent) => void;
type StatusListener = (connected: boolean) => void;

const RELEASE_DELAY_MS = 3000;
const MAX_BACKOFF_MS = 30000;

let socket: WebSocket | null = null;
let connected = false;
let users = 0;
let attempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
let windowListenersAttached = false;

const messageListeners = new Set<MessageListener>();
const statusListeners = new Set<StatusListener>();
const klineRefs = new Map<string, number>();

function setConnected(value: boolean) {
  if (connected === value) return;
  connected = value;
  statusListeners.forEach((listener) => {
    try { listener(value); } catch { /* listener errors must not break others */ }
  });
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (users === 0 || reconnectTimer) return;
  const delay = Math.min(1000 * 2 ** attempts, MAX_BACKOFF_MS);
  attempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect() {
  if (users === 0 || typeof window === "undefined") return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  const url = buildWsUrl("/ws");
  if (!url || url.includes("undefined")) {
    console.error("shared-socket: invalid WebSocket URL", url);
    return;
  }

  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch (error) {
    console.warn("shared-socket: failed to create WebSocket", error);
    scheduleReconnect();
    return;
  }
  socket = ws;

  ws.onopen = () => {
    if (socket !== ws) return;
    attempts = 0;
    setConnected(true);
  };

  ws.onmessage = (event) => {
    if (socket !== ws) return;
    let message: SocketMessage;
    try {
      message = JSON.parse(event.data);
    } catch {
      return; // ignore non-JSON frames
    }
    messageListeners.forEach((listener) => {
      try { listener(message, event); } catch (error) {
        console.error("shared-socket: message listener failed", error);
      }
    });
  };

  ws.onerror = () => {
    // A close event always follows; reconnect is scheduled there.
  };

  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    // The server drops all of this socket's kline subscriptions on close.
    // Hooks re-subscribe when they see connected=true again, so reset counts.
    klineRefs.clear();
    setConnected(false);
    scheduleReconnect();
  };
}

function reconnectIfDead() {
  if (users === 0) return;
  if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
    attempts = 0;
    clearReconnect();
    connect();
  }
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") reconnectIfDead();
}

function attachWindowListeners() {
  if (windowListenersAttached || typeof window === "undefined") return;
  window.addEventListener("online", reconnectIfDead);
  document.addEventListener("visibilitychange", onVisibilityChange);
  windowListenersAttached = true;
}

function detachWindowListeners() {
  if (!windowListenersAttached) return;
  window.removeEventListener("online", reconnectIfDead);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  windowListenersAttached = false;
}

function shutdown() {
  clearReconnect();
  detachWindowListeners();
  attempts = 0;
  klineRefs.clear();
  const ws = socket;
  socket = null;
  if (ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    safeCloseWebSocket(ws);
  }
  setConnected(false);
}

/**
 * Register a user of the shared socket. Returns a release function.
 * The socket stays open while at least one user holds it.
 */
export function acquireSharedSocket(): () => void {
  users += 1;
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  attachWindowListeners();
  connect();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    users = Math.max(0, users - 1);
    if (users === 0 && !releaseTimer) {
      releaseTimer = setTimeout(() => {
        releaseTimer = null;
        if (users === 0) shutdown();
      }, RELEASE_DELAY_MS);
    }
  };
}

export function addSocketMessageListener(listener: MessageListener): () => void {
  messageListeners.add(listener);
  return () => { messageListeners.delete(listener); };
}

export function addSocketStatusListener(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => { statusListeners.delete(listener); };
}

export function isSharedSocketConnected(): boolean {
  return connected;
}

function rawSend(message: unknown) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

/**
 * Send a message on the shared socket (dropped if not connected, matching the
 * old per-hook behaviour). Kline relay (un)subscriptions are reference-counted
 * so only the first subscribe and the last unsubscribe reach the server.
 */
export function sendSharedSocketMessage(message: any) {
  if (message && (message.type === "subscribe_kline" || message.type === "unsubscribe_kline")) {
    if (!connected) return; // hooks re-subscribe once connected again
    const key = `${message.symbol}|${message.interval}`;
    const count = klineRefs.get(key) || 0;
    if (message.type === "subscribe_kline") {
      klineRefs.set(key, count + 1);
      if (count === 0) rawSend(message);
    } else if (count > 0) {
      if (count === 1) {
        klineRefs.delete(key);
        rawSend(message);
      } else {
        klineRefs.set(key, count - 1);
      }
    }
    return;
  }
  rawSend(message);
}

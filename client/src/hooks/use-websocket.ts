import { useEffect, useRef, useState, useCallback } from "react";
import { buildWsUrl } from "../lib/config";
import { safeCloseWebSocket } from "@/lib/safe-close-websocket";

interface WebSocketMessage {
  type: string;
  data: any;
}

export function useWebSocket(url: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const messageHandlers = useRef<Map<string, (data: any) => void>>(new Map());

  useEffect(() => {
    const wsUrl = buildWsUrl(url);

    // Validate URL before creating WebSocket
    if (!wsUrl || wsUrl === 'undefined' || wsUrl === undefined || wsUrl.includes('undefined')) {
      console.error('Invalid WebSocket URL:', { url, wsUrl });
      return;
    }

    let cleaned = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    // Without this, a single dropped /ws connection (phone sleep, network
    // blip, server restart) stayed dead for the rest of the session — which
    // silently killed the chart kline relay and the price-update fallback.
    const scheduleReconnect = () => {
      if (cleaned) return;
      const delay = Math.min(1000 * 2 ** attempts, 15000);
      attempts += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    function connect() {
      if (cleaned) return;
      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl);
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        scheduleReconnect();
        return;
      }
      ws.current = socket;

      socket.onopen = () => {
        if (cleaned) return;
        attempts = 0;
        setIsConnected(true);
      };

      socket.onmessage = (event) => {
        if (cleaned) return;
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);
          const handler = messageHandlers.current.get(message.type);
          if (handler) handler(message.data);
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      socket.onclose = () => {
        if (cleaned || ws.current !== socket) return;
        setIsConnected(false);
        scheduleReconnect();
      };

      socket.onerror = () => {
        // A close event follows an error — reconnect is scheduled there.
      };
    }

    connect();

    // Reconnect promptly on the common mobile cases rather than waiting out
    // the backoff: network returns, or the tab regains focus after the browser
    // suspended the socket in the background.
    const reconnectIfDead = () => {
      if (!cleaned && (!ws.current || ws.current.readyState === WebSocket.CLOSED)) {
        attempts = 0;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        connect();
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') reconnectIfDead(); };
    window.addEventListener('online', reconnectIfDead);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cleaned = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      window.removeEventListener('online', reconnectIfDead);
      document.removeEventListener('visibilitychange', onVisible);
      if (ws.current) {
        // Null handlers before closing so stale socket doesn't fire events
        ws.current.onopen = null;
        ws.current.onmessage = null;
        ws.current.onclose = null;
        ws.current.onerror = null;
        safeCloseWebSocket(ws.current);
        ws.current = null;
      }
    };
  }, [url]);

  const sendMessage = useCallback((message: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  }, []);

  const subscribe = useCallback((messageType: string, handler: (data: any) => void) => {
    messageHandlers.current.set(messageType, handler);
    
    // Return unsubscribe function
    return () => {
      messageHandlers.current.delete(messageType);
    };
  }, []);

  return {
    isConnected,
    lastMessage,
    sendMessage,
    subscribe,
  };
}

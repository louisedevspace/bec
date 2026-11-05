import { useEffect, useRef, useState, useCallback } from "react";
import {
  acquireSharedSocket,
  addSocketMessageListener,
  addSocketStatusListener,
  isSharedSocketConnected,
  sendSharedSocketMessage,
} from "@/lib/shared-socket";

/**
 * Access the app's `/ws` connection.
 *
 * All callers share ONE socket per tab (see lib/shared-socket.ts) instead of
 * each opening their own — useCryptoPrices alone is mounted in ~15 places.
 * Reconnects (backoff, network-online, tab-visible) are handled there.
 *
 * `_url` is kept for API compatibility; the only endpoint is `/ws`.
 */
export function useWebSocket(_url: string = "/ws") {
  const [isConnected, setIsConnected] = useState(isSharedSocketConnected);
  const messageHandlers = useRef<Map<string, (data: any) => void>>(new Map());

  useEffect(() => {
    const release = acquireSharedSocket();
    const removeStatus = addSocketStatusListener(setIsConnected);
    const removeMessage = addSocketMessageListener((message) => {
      const handler = messageHandlers.current.get(message.type);
      if (handler) handler(message.data);
    });
    // Status may have changed between render and this effect.
    setIsConnected(isSharedSocketConnected());

    return () => {
      removeMessage();
      removeStatus();
      release();
    };
  }, []);

  const sendMessage = useCallback((message: any) => {
    sendSharedSocketMessage(message);
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
    sendMessage,
    subscribe,
  };
}

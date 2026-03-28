import { useEffect, useRef, useState, useCallback } from "react";
import { buildWsUrl } from "../lib/config";

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
    // Use the configuration to build the WebSocket URL
    const wsUrl = buildWsUrl(url);
    
    // Validate URL before creating WebSocket
    if (!wsUrl || wsUrl === 'undefined' || wsUrl === undefined || wsUrl.includes('undefined')) {
      console.error('Invalid WebSocket URL:', { url, wsUrl });
      return;
    }
    
    let cleaned = false;

    console.log('Connecting to WebSocket:', wsUrl);
    try {
      ws.current = new WebSocket(wsUrl);
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      return;
    }

    ws.current.onopen = () => {
      if (cleaned) return;
      setIsConnected(true);
      console.log("WebSocket connected");
    };

    ws.current.onmessage = (event) => {
      if (cleaned) return;
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        setLastMessage(message);
        
        // Call registered handler for this message type
        const handler = messageHandlers.current.get(message.type);
        if (handler) {
          handler(message.data);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    ws.current.onclose = () => {
      if (cleaned) return;
      setIsConnected(false);
      console.log("WebSocket disconnected");
    };

    ws.current.onerror = (error) => {
      if (cleaned) return;
      console.error("WebSocket error:", error);
      setIsConnected(false);
    };

    return () => {
      cleaned = true;
      if (ws.current) {
        // Null handlers before closing so stale socket doesn't fire events
        ws.current.onopen = null;
        ws.current.onmessage = null;
        ws.current.onclose = null;
        ws.current.onerror = null;
        ws.current.close();
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

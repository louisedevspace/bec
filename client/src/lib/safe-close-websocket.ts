/**
 * Close a WebSocket without triggering the browser warning
 * "WebSocket is closed before the connection is established".
 *
 * If the socket is still CONNECTING, the close is deferred until it opens.
 * If the connection fails instead, the browser fires error/close on its own,
 * so nothing is left dangling. Existing handlers are kept, so callers still
 * get their normal onclose callback.
 */
export function safeCloseWebSocket(ws: WebSocket | null | undefined, code?: number, reason?: string): void {
  if (!ws) return;
  if (ws.readyState === WebSocket.CONNECTING) {
    ws.addEventListener("open", () => ws.close(code, reason), { once: true });
    return;
  }
  if (ws.readyState === WebSocket.OPEN) {
    ws.close(code, reason);
  }
}

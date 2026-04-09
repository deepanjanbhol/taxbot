import { useEffect, useRef, useCallback } from "react";
import { usePipelineStore } from "../store/pipeline";

const WS_URL = `ws://${window.location.hostname}:7329/ws`;
const RECONNECT_DELAY_MS = 2000;

let _ws: WebSocket | null = null;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleEvent = usePipelineStore(s => s.handleEvent);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    _ws = ws;

    ws.onopen = () => {
      console.debug("[TaxBot WS] connected");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as Record<string, unknown>;
        handleEvent(msg);
      } catch {
        console.warn("[TaxBot WS] unparseable message", event.data);
      }
    };

    ws.onclose = () => {
      _ws = null;
      console.debug("[TaxBot WS] disconnected — reconnecting in", RECONNECT_DELAY_MS, "ms");
      reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [handleEvent]);

  useEffect(() => {
    connect();
    return () => {
      reconnectRef.current && clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);
}

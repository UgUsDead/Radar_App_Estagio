import { apiBase } from "../constants/api";
import { getStreamToken } from "./streamToken";

type StreamHandlers = {
  onMessage?: (data: unknown) => void;
  onAlert?: (data: unknown) => void;
  onError?: (error: Error) => void;
};

let eventSource: EventSource | null = null;
let currentToken: string | null = null;
let refCount = 0;

async function ensureEventSource(): Promise<EventSource | null> {
  const token = await getStreamToken();
  if (!token) return null;

  if (eventSource && currentToken === token) {
    return eventSource;
  }

  if (eventSource) {
    eventSource.close();
  }

  currentToken = token;
  eventSource = new EventSource(`${apiBase}/monitor/stream?token=${encodeURIComponent(token)}`);
  return eventSource;
}

export async function subscribeToStream(handlers: StreamHandlers): Promise<() => void> {
  const es = await ensureEventSource();
  if (!es) return () => {};

  refCount += 1;

  const handleMessage = (event: MessageEvent) => {
    if (!handlers.onMessage) return;
    try {
      handlers.onMessage(JSON.parse(event.data));
    } catch {
      // Ignore malformed payloads
    }
  };

  const handleAlert = (event: MessageEvent) => {
    if (!handlers.onAlert) return;
    try {
      handlers.onAlert(JSON.parse(event.data));
    } catch {
      // Ignore malformed payloads
    }
  };

  const handleError = () => {
    handlers.onError?.(new Error("SSE stream error"));
  };

  es.addEventListener("message", handleMessage as EventListener);
  es.addEventListener("alert", handleAlert as EventListener);
  es.addEventListener("error", handleError as EventListener);

  return () => {
    es.removeEventListener("message", handleMessage as EventListener);
    es.removeEventListener("alert", handleAlert as EventListener);
    es.removeEventListener("error", handleError as EventListener);
    refCount -= 1;
    if (refCount <= 0) {
      es.close();
      eventSource = null;
      currentToken = null;
    }
  };
}

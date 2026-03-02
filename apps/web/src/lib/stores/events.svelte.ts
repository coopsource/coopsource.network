import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

let eventSource: EventSource | null = null;

const sseState = $state({ connected: false, count: 0 });

export function isConnected(): boolean {
  return sseState.connected;
}

export function getUnreadCount(): number {
  return sseState.count;
}

export function setUnreadCount(n: number) {
  sseState.count = n;
}

export function decrementUnreadCount() {
  if (sseState.count > 0) sseState.count--;
}

type EventHandler = (data: Record<string, unknown>) => void;
const listeners = new Map<string, Set<EventHandler>>();

export function connect() {
  if (!browser || eventSource) return;
  const base = env.PUBLIC_API_URL ?? 'http://localhost:3001';
  const es = new EventSource(`${base}/api/v1/events`, { withCredentials: true });

  es.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      if (parsed.type === 'notification.created') {
        sseState.count++;
      }
      const handlers = listeners.get(parsed.type);
      if (handlers) {
        const payload = parsed.data ?? {};
        for (const h of handlers) h(payload);
      }
    } catch {
      // ignore parse errors, keepalive comments never reach onmessage
    }
  };

  es.onerror = () => {
    sseState.connected = false;
  };
  es.onopen = () => {
    sseState.connected = true;
  };
  eventSource = es;
}

export function disconnect() {
  eventSource?.close();
  eventSource = null;
  sseState.connected = false;
}

export function on(eventType: string, handler: EventHandler) {
  if (!listeners.has(eventType)) listeners.set(eventType, new Set());
  listeners.get(eventType)!.add(handler);
  return () => {
    listeners.get(eventType)?.delete(handler);
  };
}

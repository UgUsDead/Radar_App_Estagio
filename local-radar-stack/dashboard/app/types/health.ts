export type MonitorHealth = {
  ok?: boolean;
  mqttConnected?: boolean;
  queueDepth: { events: number; summaries: number };
  flush: {
    lastFlushDurationMs: number;
    lastFlushAt: string | null;
    lastFlushEventCount: number;
    lastFlushSummaryCount: number;
    totalFlushes: number;
    totalFlushedEvents: number;
    totalFlushedSummaries: number;
  };
  heartbeat: {
    online: number;
    offline: number;
    total: number;
    oldestLastSeenSeconds: number | null;
    newestLastSeenSeconds: number | null;
  };
  messageRates: {
    intervalMs: number;
    updatedAt: string;
    rates: Array<{ radarId: string; messagesPerSecond: number }>;
  };
  ingestLag: Array<{ radarId: string; latestMs: number; averageMs: number; maxMs: number; samples: number }>;
  generatedAt: string;
};

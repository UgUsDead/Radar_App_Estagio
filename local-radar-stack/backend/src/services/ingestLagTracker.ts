export class IngestLagTracker {
  private lagByRadar = new Map<string, { count: number; totalMs: number; maxMs: number; latestMs: number }>();

  record(radarId: string, frameTimestamp: number): void {
    const lagMs = Math.max(0, Date.now() - frameTimestamp);
    const current = this.lagByRadar.get(radarId) ?? { count: 0, totalMs: 0, maxMs: 0, latestMs: 0 };
    current.count += 1;
    current.totalMs += lagMs;
    current.maxMs = Math.max(current.maxMs, lagMs);
    current.latestMs = lagMs;
    this.lagByRadar.set(radarId, current);
  }

  snapshot(): Array<{
    radarId: string;
    latestMs: number;
    averageMs: number;
    maxMs: number;
    samples: number;
  }> {
    return Array.from(this.lagByRadar.entries()).map(([radarId, lag]) => ({
      radarId,
      latestMs: lag.latestMs,
      averageMs: lag.count > 0 ? Number((lag.totalMs / lag.count).toFixed(2)) : 0,
      maxMs: lag.maxMs,
      samples: lag.count,
    }));
  }
}

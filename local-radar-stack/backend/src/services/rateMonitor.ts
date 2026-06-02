import { logger } from "../logger.js";

export class RateMonitor {
  private counters = new Map<string, number>();
  private latestRates = new Map<string, number>();
  private latestIntervalMs = 10000;
  private latestUpdatedAt = Date.now();
  private timer?: NodeJS.Timeout;

  public start(intervalMs = 10000): void {
    this.latestIntervalMs = intervalMs;
    this.timer = setInterval(() => {
      for (const [radarId, count] of this.counters.entries()) {
        const mps = count / (intervalMs / 1000);
        this.latestRates.set(radarId, Number(mps.toFixed(2)));
        logger.info({ radarId, mps: Number(mps.toFixed(2)) }, "Message rate");
      }
      this.latestUpdatedAt = Date.now();
      this.counters.clear();
    }, intervalMs);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  public mark(radarId: string): void {
    this.counters.set(radarId, (this.counters.get(radarId) ?? 0) + 1);
  }

  public snapshot(): {
    intervalMs: number;
    updatedAt: string;
    rates: Array<{ radarId: string; messagesPerSecond: number }>;
  } {
    const rates = Array.from(this.latestRates.entries())
      .map(([radarId, messagesPerSecond]) => ({ radarId, messagesPerSecond }))
      .sort((a, b) => b.messagesPerSecond - a.messagesPerSecond);

    return {
      intervalMs: this.latestIntervalMs,
      updatedAt: new Date(this.latestUpdatedAt).toISOString(),
      rates,
    };
  }
}

/**
 * radarTracker.ts — Target tracking and frame buffering.
 *
 * Accumulates decoded targets into frames and applies throttling (15fps).
 * Alert generation has been moved to the backend to ensure a single
 * source of truth.
 */

import {RadarTarget, RadarData} from '../types';
import {
  MAX_RENDER_TARGETS,
  RENDER_FPS_CAP,
  FRAME_FLUSH_DELAY_MS,
  STALE_TARGET_TIMEOUT_MS,
} from '../constants';

export interface TrackerConfig {
  onFrame: (data: RadarData) => void;
  fallZThreshold?: number;
  speedThreshold?: number;
  safeZonePoints?: { x: number; y: number }[];
  onAlert?: (type: string, message: string) => void;
}

export class RadarTracker {
  private config: TrackerConfig;

  // Frame buffer — accumulates targets for the current frame number
  private frameNum = -1;
  private frameTargets = new Map<number, RadarTarget>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  // Render throttle
  private lastProcessTime = 0;
  private renderIntervalMs = Math.floor(1000 / RENDER_FPS_CAP);

  // Stale target tracking
  private targetLastSeen = new Map<number, number>();

  constructor(config: TrackerConfig) {
    this.config = config;
  }

  updateConfig(next: Partial<TrackerConfig>) {
    this.config = { ...this.config, ...next };
  }

  /** Ingest decoded targets from a single MQTT message. */
  ingestTargets(frameNumber: number, targets: RadarTarget[]) {
    if (frameNumber !== this.frameNum) {
      // New frame number — flush previous frame if any
      this.flush();
      this.frameNum = frameNumber;
      this.frameTargets = new Map();
    }

    const now = Date.now();
    for (const target of targets) {
      let uid = target.id || 1;
      while (this.frameTargets.has(uid)) uid++;
      if (uid !== target.id) target.id = uid;
      this.frameTargets.set(uid, target);
      this.targetLastSeen.set(uid, now);
    }

    // Schedule flush in case no more messages arrive for this frame
    this.scheduleFlush();
  }

  /** Force flush and clean up. */
  destroy() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  /** Reset state (e.g. when switching radars). */
  reset() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.frameNum = -1;
    this.frameTargets = new Map();
    this.targetLastSeen.clear();
  }

  // ── Private ─────────────────────────────────────

  private scheduleFlush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FRAME_FLUSH_DELAY_MS);
  }

  private flush() {
    if (this.frameNum < 0) return;
    const frameNum = this.frameNum;
    const targets = Array.from(this.frameTargets.values());
    this.frameNum = -1;
    this.frameTargets = new Map();

    const now = Date.now();
    // Throttle render rate
    if (now - this.lastProcessTime < this.renderIntervalMs) return;
    this.lastProcessTime = now;

    // Purge stale targets from last-seen map
    this.targetLastSeen.forEach((lastSeen, id) => {
      if (now - lastSeen > STALE_TARGET_TIMEOUT_MS) {
        this.targetLastSeen.delete(id);
      }
    });

    // Limit rendered targets
    const renderTargets = targets.slice(0, MAX_RENDER_TARGETS);

    this.config.onFrame({
      frame: frameNum,
      timestamp: now,
      targets: renderTargets,
    });
  }
}

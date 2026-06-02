/**
 * radarAnalytics.ts
 *
 * Deprecated: The mobile app no longer publishes its own fallback events.
 * The backend pipeline is the sole source of truth for generating fall
 * and movement alerts. Keep a no-op API to avoid runtime crashes.
 */

import type { RadarTarget } from "../types";

export class RadarAnalytics {
  bind(_client: unknown, _radarId: string) {
    // No-op: backend owns alert generation.
  }

  unbind() {
    // No-op.
  }

  publishFall(_target: RadarTarget) {
    // No-op.
  }

  publishMovement(_target: RadarTarget) {
    // No-op.
  }
}

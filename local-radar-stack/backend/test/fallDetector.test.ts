import { describe, it, expect } from "vitest";
import { detectFall } from "../src/detectors/fallDetector.js";
import { RadarRuntimeState } from "../src/types.js";

function createMockState(): RadarRuntimeState {
  return {
    radarId: "radar-1",
    frameBuffer: [],
    lastSummaryAt: 0,
    lastDownsampleAt: 0,
    minuteDistance: 0,
    dayDistance: 0,
    minuteMovingMs: 0,
    dayMovingMs: 0,
    speedSamples: [],
    zSamples: [],
    gaitBaseline: 1.0,
    postureBaseline: 1.0,
    fallCooldownUntil: 0,
    fallCooldownByTarget: {},
    anomalyCooldownUntil: 0,
    dailySpeedSamples: [],
    dailyGaitSamples: [],
    dailyPostureSamples: [],
    dayFalls: 0,
    dayAlerts: 0,
    dayDate: "2024-01-01",
    behavioralState: {},
    droppedFrames: 0,
    processedFrames: 0
  };
}

describe("fallDetector", () => {
  it("should not detect fall with less than 4 frames", () => {
    const state = createMockState();
    const event = detectFall(state);
    expect(event).toBeNull();
  });

  it("should detect a hard fall when z drops quickly and target is inactive", () => {
    const state = createMockState();
    const now = Date.now();
    
    state.frameBuffer = [
      { radarId: "radar-1", timestamp: now - 3000, targets: [{ id: 1, x: 0, y: 0, z: 1.5, vx: 0, vy: 0, vz: -0.5, speed: 0.5 }], endianness: "little" },
      { radarId: "radar-1", timestamp: now - 2000, targets: [{ id: 1, x: 0, y: 0, z: 1.0, vx: 0, vy: 0, vz: -0.8, speed: 0.8 }], endianness: "little" },
      { radarId: "radar-1", timestamp: now - 1000, targets: [{ id: 1, x: 0, y: 0, z: 0.2, vx: 0, vy: 0, vz: -0.1, speed: 0.1 }], endianness: "little" },
      { radarId: "radar-1", timestamp: now, targets: [{ id: 1, x: 0, y: 0, z: 0.1, vx: 0, vy: 0, vz: 0, speed: 0.05 }], endianness: "little" }
    ];

    const event = detectFall(state);
    expect(event).toBeDefined();
    expect(event?.type).toBe("fall");
    expect(event?.metadata.target_id).toBe(1);
    expect(state.dayFalls).toBe(1);
  });
});

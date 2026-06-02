import { describe, it, expect } from "vitest";
import { detectBehavior } from "../src/detectors/behaviorDetector.js";
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

describe("behaviorDetector", () => {
  it("should detect arrival entry after 1000ms confirmation", () => {
    const state = createMockState();
    const zones = [{ id: "zone-1", name: "Door", behavior: "arrival" as const, polygon: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }] }];
    const targetInside = { id: 1, x: 2, y: 2, z: 1, vx: 0, vy: 0, vz: 0, speed: 0 };
    
    // Frame 1: Enters zone
    let events = detectBehavior(state, { timestamp: 1000, targets: [targetInside], endianness: "little" }, zones, { riskLevel: "low" });
    expect(events.length).toBe(0); // pending
    
    // Frame 2: Still in zone, pending duration 1000ms -> confirms entry
    events = detectBehavior(state, { timestamp: 2000, targets: [targetInside], endianness: "little" }, zones, { riskLevel: "low" });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("arrival");
  });

  it("should tolerate jitter and maintain state", () => {
    const state = createMockState();
    const zones = [{ id: "zone-1", name: "Door", behavior: "arrival" as const, polygon: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }] }];
    const targetInside = { id: 1, x: 2, y: 2, z: 1, vx: 0, vy: 0, vz: 0, speed: 0 };
    const targetOutside = { id: 1, x: 10, y: 10, z: 1, vx: 0, vy: 0, vz: 0, speed: 0 };
    
    // Frame 1: Enters zone
    detectBehavior(state, { timestamp: 1000, targets: [targetInside], endianness: "little" }, zones, { riskLevel: "low" });
    
    // Frame 2: Flickers outside (jitter)
    detectBehavior(state, { timestamp: 1200, targets: [targetOutside], endianness: "little" }, zones, { riskLevel: "low" });
    
    // Frame 3: Back inside
    let events = detectBehavior(state, { timestamp: 2000, targets: [targetInside], endianness: "little" }, zones, { riskLevel: "low" });
    expect(events.length).toBe(1); // Still fired because jitter was ignored!
  });
});

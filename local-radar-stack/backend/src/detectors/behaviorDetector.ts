import type { BehaviorZoneState, DecodedFrame, EventRecord, RadarRuntimeState } from "../types.js";
import { toIso } from "../utils/time.js";

// ── Configuration ──────────────────────────────────────────────────────────────

interface BehaviorOptions {
  riskLevel: string;
}

interface ZoneLike {
  id: string;
  name: string;
  behavior?: "none" | "departure" | "arrival" | "transition" | "dwell";
  polygon: Array<{ x: number; y: number }>;
  priority?: "low" | "medium" | "high";
  triggersAlert?: boolean;
  alertSchedule?: {
    startHour: number;
    endHour: number;
  };
  dwellMinutes?: number;
}

/**
 * Time a target must be continuously observed inside a zone before the
 * entry is "confirmed" and an alert can fire.
 */
const ENTRY_CONFIRMATION_MS = 1000;

/**
 * Time a target must be continuously observed *outside* its confirmed zone
 * before the exit is confirmed and an alert can fire.
 */
const EXIT_CONFIRMATION_MS = 1000;

/**
 * Brief grace window: if the target flickers out of (or into) a zone for
 * less than this duration, ignore the flicker and keep the current pending
 * state. This prevents boundary jitter from resetting the confirmation timer.
 */
const JITTER_GRACE_MS = 400;

/**
 * Minimum time between two events for the same target to avoid duplicates
 * caused by state oscillation.
 */
const RETRIGGER_SUPPRESSION_MS = 500;

/**
 * If a transition zone stay is shorter than this, the exit replay will
 * capture the entry too, so we only send ONE notification.
 * If the stay is longer, replay can't cover both — send TWO.
 * This must match SNAPSHOT_BEFORE_SEC in pipeline.ts (10s).
 */
const REPLAY_OVERLAP_MS = 10_000;

// ── Geometry ───────────────────────────────────────────────────────────────────

function pointInPolygon(x: number, y: number, polygon: Array<{ x: number; y: number }>): boolean {
  const pointOnSegment = (
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ): boolean => {
    const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
    if (Math.abs(cross) > 1e-9) {
      return false;
    }

    const dot = (px - ax) * (px - bx) + (py - ay) * (py - by);
    return dot <= 1e-9;
  };

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    if (pointOnSegment(x, y, xj, yj, xi, yi)) {
      return true;
    }

    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function checkAlert(zone: ZoneLike | null, currentHour: number): boolean {
  if (!zone || zone.triggersAlert === false) return false;
  if (zone.alertSchedule) {
    const { startHour, endHour } = zone.alertSchedule;
    if (startHour <= endHour) {
      return currentHour >= startHour && currentHour < endHour;
    }
    return currentHour >= startHour || currentHour < endHour;
  }
  return true;
}

function resolvePriority(zone: ZoneLike, options: BehaviorOptions): "low" | "medium" | "high" {
  if (zone.priority) return zone.priority;
  return options.riskLevel === "critical" || options.riskLevel === "high" ? "high" : "medium";
}

function initState(now: number, observedZoneId: string | null): BehaviorZoneState {
  return {
    confirmedZoneId: null,
    confirmedZoneBehavior: null,
    confirmedSince: null,
    entryAlertFired: false,
    dwellAlertFired: false,
    pendingZoneId: observedZoneId,
    pendingSince: now,
    jitterGraceUntil: 0,
    lastEventAt: 0,
  };
}

// ── Main detector ──────────────────────────────────────────────────────────────

export function detectBehavior(
  state: RadarRuntimeState,
  frame: DecodedFrame,
  zones: ZoneLike[],
  options: BehaviorOptions,
): EventRecord[] {
  const events: EventRecord[] = [];
  const now = frame.timestamp;
  const currentHour = new Date(now).getHours();

  for (const target of frame.targets) {
    // Determine which zone (if any) the target is currently inside
    const currentZone = zones.find((zone) => pointInPolygon(target.x, target.y, zone.polygon)) ?? null;
    const currentZoneId = currentZone?.id ?? null;

    // Get or create state for this target
    let ts = state.behavioralState[target.id] as BehaviorZoneState | undefined;
    if (!ts) {
      ts = initState(now, currentZoneId);
      state.behavioralState[target.id] = ts;
      // First frame for this target — just record the observation, don't act yet
      continue;
    }

    // ── Jitter-tolerant pending zone tracking ──────────────────────────────
    //
    // If the observed zone differs from what we're tracking as "pending",
    // we DON'T immediately reset. Instead, we give a brief grace period.
    // If the target returns to the pending zone within JITTER_GRACE_MS,
    // we act as if the blip never happened.

    if (currentZoneId !== ts.pendingZoneId) {
      if (ts.jitterGraceUntil === 0) {
        // No grace active — start one. We keep tracking the OLD pending zone
        // for JITTER_GRACE_MS. If the target comes back, no harm done.
        ts.jitterGraceUntil = now + JITTER_GRACE_MS;
        continue;
      } else if (now < ts.jitterGraceUntil) {
        // Grace still active — ignore the flicker
        continue;
      } else {
        // Grace expired and the target is STILL in a different zone.
        // Commit the zone change: update pending to the new zone.
        ts.pendingZoneId = currentZoneId;
        ts.pendingSince = now;
        ts.jitterGraceUntil = 0;
        // Don't continue — fall through so we can start processing
        // the new pending zone immediately (though duration will be 0).
        continue;
      }
    }

    // If we get here, currentZoneId === ts.pendingZoneId.
    // Clear any active grace timer since the observation is consistent.
    ts.jitterGraceUntil = 0;

    const pendingDuration = now - ts.pendingSince;

    // ── Case 1: Target is OUTSIDE its confirmed zone ──────────────────────
    // (exit detection)
    if (ts.confirmedZoneId !== null && currentZoneId !== ts.confirmedZoneId) {
      // Target was confirmed inside a zone but is now observed outside it.
      if (pendingDuration >= EXIT_CONFIRMATION_MS) {
        // Exit confirmed — fire exit alert if applicable
        const confirmedZone = zones.find(z => z.id === ts!.confirmedZoneId) ?? null;

        if (
          confirmedZone &&
          confirmedZone.behavior &&
          (confirmedZone.behavior === "departure" || confirmedZone.behavior === "transition") &&
          checkAlert(confirmedZone, currentHour) &&
          (now - ts.lastEventAt) >= RETRIGGER_SUPPRESSION_MS
        ) {
          const confirmedDuration = now - (ts.confirmedSince ?? now);

          if (confirmedZone.behavior === "transition" && !ts.entryAlertFired) {
            // Short stay — entry was deferred and never sent.
            // The exit replay captures the full journey. Send ONE "through" event.
            events.push({
              radar_id: state.radarId,
              type: "transition",
              timestamp: toIso(now),
              duration: Math.round(confirmedDuration / 1000),
              metadata: {
                target_id: target.id,
                from_zone: ts.confirmedZoneId,
                to_zone: currentZoneId,
                direction: "through",
                alert_priority: resolvePriority(confirmedZone, options),
                clinical_warning: `O paciente transitou pela área: ${confirmedZone.name} (${Math.round(confirmedDuration / 1000)}s).`,
                location: { x: target.x, y: target.y, z: target.z },
                behavior_start_timestamp: ts.confirmedSince,
              },
            });
          } else {
            // Departure zone, OR transition zone with long stay (entry already sent).
            // Send the exit event.
            events.push({
              radar_id: state.radarId,
              type: confirmedZone.behavior === "transition" ? "transition" : "departure",
              timestamp: toIso(now),
              duration: Math.round(confirmedDuration / 1000),
              metadata: {
                target_id: target.id,
                from_zone: ts.confirmedZoneId,
                to_zone: currentZoneId,
                direction: "exit",
                alert_priority: resolvePriority(confirmedZone, options),
                clinical_warning: `O paciente saiu da área: ${confirmedZone.name ?? "monitorizada"}.`,
                location: { x: target.x, y: target.y, z: target.z },
                behavior_start_timestamp: ts.pendingSince,
              },
            });
          }
          ts.lastEventAt = now;
        }

        // Clear confirmed zone — target is now "unconfirmed" again
        ts.confirmedZoneId = null;
        ts.confirmedZoneBehavior = null;
        ts.confirmedSince = null;
        ts.entryAlertFired = false;
        ts.dwellAlertFired = false;
        // pendingZoneId/pendingSince stay as-is (tracking the current observation)
      }
      // If exit not yet confirmed, just wait for more frames
      continue;
    }

    // ── Case 2: No confirmed zone yet, target is inside a zone ────────────
    // (entry detection)
    if (ts.confirmedZoneId === null && currentZone !== null) {
      if (pendingDuration >= ENTRY_CONFIRMATION_MS) {
        // Entry confirmed!
        ts.confirmedZoneId = currentZone.id;
        ts.confirmedZoneBehavior = currentZone.behavior ?? "none";
        ts.confirmedSince = ts.pendingSince;
        ts.entryAlertFired = false;
        ts.dwellAlertFired = false;

        // Fire entry alert if applicable.
        // For "transition" zones, we DEFER the entry notification:
        // if the patient exits quickly (≤10s), the exit replay captures
        // the full journey and we only need one notification.
        // If they stay longer, we fire the entry notification from Case 3.
        if (
          currentZone.behavior === "arrival" &&
          checkAlert(currentZone, currentHour) &&
          (now - ts.lastEventAt) >= RETRIGGER_SUPPRESSION_MS
        ) {
          events.push({
            radar_id: state.radarId,
            type: "arrival",
            timestamp: toIso(now),
            duration: 0,
            metadata: {
              target_id: target.id,
              zone_id: currentZone.id,
              direction: "entry",
              alert_priority: resolvePriority(currentZone, options),
              clinical_warning: `O paciente entrou na área: ${currentZone.name}.`,
              location: { x: target.x, y: target.y, z: target.z },
              behavior_start_timestamp: ts.pendingSince,
            },
          });
          ts.entryAlertFired = true;
          ts.lastEventAt = now;
        }
      }
      // If not yet confirmed, keep waiting
      continue;
    }

    // ── Case 3: Confirmed inside the SAME zone ────────────────────────────
    if (ts.confirmedZoneId !== null && currentZoneId === ts.confirmedZoneId && currentZone) {
      const confirmedDuration = now - (ts.confirmedSince ?? now);

      // Deferred entry alert for transition zones:
      // Fire after REPLAY_OVERLAP_MS because the patient has stayed long
      // enough that the exit replay won't capture the entry.
      if (
        currentZone.behavior === "transition" &&
        !ts.entryAlertFired &&
        confirmedDuration >= REPLAY_OVERLAP_MS &&
        checkAlert(currentZone, currentHour)
      ) {
        events.push({
          radar_id: state.radarId,
          type: "transition",
          timestamp: toIso(now),
          duration: 0,
          metadata: {
            target_id: target.id,
            zone_id: currentZone.id,
            direction: "entry",
            alert_priority: resolvePriority(currentZone, options),
            clinical_warning: `O paciente entrou na área: ${currentZone.name}.`,
            location: { x: target.x, y: target.y, z: target.z },
            behavior_start_timestamp: ts.confirmedSince,
          },
        });
        ts.entryAlertFired = true;
        ts.lastEventAt = now;
      }

      // Dwell alert
      if (
        currentZone.behavior === "dwell" &&
        !ts.dwellAlertFired &&
        confirmedDuration >= (currentZone.dwellMinutes ?? 5) * 60 * 1000 &&
        checkAlert(currentZone, currentHour)
      ) {
        events.push({
          radar_id: state.radarId,
          type: "dwell",
          timestamp: toIso(now),
          duration: Math.round(confirmedDuration / 1000),
          metadata: {
            target_id: target.id,
            zone_id: currentZone.id,
            dwell_minutes: currentZone.dwellMinutes,
            actual_duration_ms: confirmedDuration,
            alert_priority: resolvePriority(currentZone, options),
            clinical_warning: `Permanência excessiva detectada na área: ${currentZone.name} (${Math.round(confirmedDuration / 60000)} min).`,
            location: { x: target.x, y: target.y, z: target.z },
          },
        });
        ts.dwellAlertFired = true;
        ts.lastEventAt = now;
      }
    }

    // ── Case 4: No confirmed zone, target is outside all zones ────────────
    // Nothing to do — just keep tracking.
  }

  // ── Cleanup: remove stale behavioral state for targets no longer in frame ──
  const activeTargetIds = new Set(frame.targets.map(t => t.id));
  for (const targetIdStr of Object.keys(state.behavioralState)) {
    const targetId = Number(targetIdStr);
    if (!activeTargetIds.has(targetId)) {
      // Target disappeared — remove state so re-appearance starts fresh
      delete state.behavioralState[targetId];
    }
  }

  return events;
}
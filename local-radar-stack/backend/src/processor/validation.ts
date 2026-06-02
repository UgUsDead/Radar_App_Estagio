import { config } from "../config.js";
import type { DecodedFrame, RadarTarget } from "../types.js";

function validNumber(value: number): boolean {
  return Number.isFinite(value) && !Number.isNaN(value);
}

function isValidTarget(target: RadarTarget): boolean {
  if (
    !validNumber(target.x) ||
    !validNumber(target.y) ||
    !validNumber(target.z) ||
    !validNumber(target.vx) ||
    !validNumber(target.vy) ||
    !validNumber(target.vz) ||
    !validNumber(target.speed)
  ) {
    return false;
  }

  const maxPos = config.processing.maxAbsPositionMeters;
  const maxVel = config.processing.maxAbsVelocityMps;

  if (Math.abs(target.x) > maxPos || Math.abs(target.y) > maxPos || Math.abs(target.z) > maxPos) {
    return false;
  }

  if (
    Math.abs(target.vx) > maxVel ||
    Math.abs(target.vy) > maxVel ||
    Math.abs(target.vz) > maxVel ||
    target.speed > maxVel
  ) {
    return false;
  }

  return true;
}

export function validateFrame(frame: DecodedFrame): DecodedFrame | null {
  if (!Number.isFinite(frame.timestamp)) return null;
  const targets = frame.targets.filter(isValidTarget);
  if (targets.length === 0) return null;
  return { ...frame, targets };
}

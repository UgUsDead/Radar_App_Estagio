export type ZoneBehavior = "none" | "departure" | "arrival" | "transition" | "dwell";
export type ZoneType = "custom"; // Simplified as zones are now freely named
export type ZonePriority = "low" | "medium" | "high";
export type AlertPriority = "low" | "medium" | "high";

export type ZoneConfig = {
  id: string;
  name: string;
  type: ZoneType;
  behavior: ZoneBehavior;
  polygon: Array<{ x: number; y: number }>;
  priority?: ZonePriority;
  triggersAlert: boolean;
  color?: string;
  dwellMinutes?: number;
  alertSchedule?: {
    startHour: number;
    endHour: number;
  };
};

export type ZoneRoomModel = {
  roomWidthMeters: number;
  roomDepthMeters: number;
  originX: number;
  originY: number;
};

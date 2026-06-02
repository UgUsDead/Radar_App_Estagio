export type Radar = { 
  id: string; 
  status: string; 
  room_id: number | null; 
  room_name: string | null; 
  last_seen?: string | null;
  owner_id?: number | null;
  owner_name?: string | null;
};
export type RoomRow = { id: number; name: string; floor: number; notes: string | null; metadata?: Record<string, any>; patient_id: number | null; patient_name: string | null; radar_id: string | null; radar_status: string | null; safety_state?: string; occupancy?: number; last_activity_sec?: number; distance_moved_recent?: number; };
export type Patient = { id: number; name: string; room_id: number | null; room_name: string | null };
export type EventRow = {
  id: number;
  radar_id: string;
  type: string;
  timestamp: string;
  room_name: string | null;
  patient_name: string | null;
  metadata?: Record<string, unknown>;
  alert_status: "new" | "acknowledged" | "resolved" | "closed";
  escalation_level: "new" | "level_1" | "level_2" | "level_3";
  is_critical: boolean;
  alert_priority: "low" | "medium" | "high";
};
export type DailyRow = {
  radar_id: string;
  room_name: string | null;
  patient_name: string | null;
  total_distance: number;
  avg_gait_stability: number;
};
export type WatchlistRow = {
  patient_id: number;
  patient_name: string;
  room_name: string | null;
  radar_id: string | null;
  profile_level: "low" | "medium" | "high" | "critical";
  falls_30d: number;
  anomalies_14d: number;
  gait_stability_7d: number | null;
  posture_stability_7d: number | null;
  risk_score: number;
  trend: "low" | "medium" | "high" | "critical";
  proactive_checks: string[];
  manual_risk_score?: number;
  manual_proactive_checks?: string[];
  last_fall_at: string | null;
  last_anomaly_at: string | null;
};

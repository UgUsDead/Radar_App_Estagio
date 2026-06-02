import { AlertPriority } from "../types/zones";
import { EventRow } from "../types/domain";

export function normalizeAlertPriority(value: unknown): AlertPriority | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") return normalized;
  if (normalized === "critical") return "high";
  return null;
}

export function eventAlertPriority(event: EventRow): AlertPriority {
  const directPriority = normalizeAlertPriority(event.metadata?.alert_priority);
  if (directPriority) return directPriority;

  const zoneContext = event.metadata?.zone_context;
  if (zoneContext && typeof zoneContext === "object") {
    const fromZone = normalizeAlertPriority((zoneContext as { priority?: unknown }).priority);
    if (fromZone) return fromZone;
  }

  if (event.is_critical) return "high";
  return "medium";
}

export function alertPriorityLabel(priority: AlertPriority): string {
  if (priority === "low") return "Prioridade Baixa";
  if (priority === "medium") return "Prioridade Média";
  return "Prioridade Alta";
}

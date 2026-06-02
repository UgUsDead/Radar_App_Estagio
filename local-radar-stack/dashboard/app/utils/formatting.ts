export function eventTypeLabel(type: string): string {
  switch (type) {
    case "fall":
      return "Queda";
    case "anomaly":
      return "Anomalia";
    case "transition":
      return "Transição de Área";
    case "dwell":
      return "Permanência Excessiva";
    case "arrival":
      return "Entrada em Área";
    case "departure":
      return "Saída de Área";
    case "staff_entry":
      return "Entrada de Staff";
    default:
      return type;
  }
}

export function zoneTypeColor(type: string): string {
  switch (type) {
    case "custom":
      return "#6366f1";
    case "bedside":
      return "#3b82f6";
    case "bathroom":
      return "#ef4444";
    case "doorway":
      return "#f59e0b";
    default:
      return "#94a3b8";
  }
}

export function behaviorLabel(behavior: string): string {
  switch (behavior) {
    case "none":
      return "Passiva";
    case "arrival":
      return "Chegada";
    case "departure":
      return "Saída";
    case "transition":
      return "Transição";
    case "dwell":
      return "Permanência";
    default:
      return behavior;
  }
}

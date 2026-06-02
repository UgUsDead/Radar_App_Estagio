import { logger } from "../logger.js";

export interface EscalationRule {
  levelName: "level_1" | "level_2" | "level_3";
  minutesUnresolved: number;
  actions: {
    notifyStaff?: boolean;
    notifyFamily?: boolean;
    markCritical?: boolean;
  };
}

export interface AlertEscalationState {
  currentLevel: "new" | "level_1" | "level_2" | "level_3";
  escalatedAt?: string;
  escalationHistory: Array<{
    level: string;
    timestamp: string;
  }>;
}

const DEFAULT_ESCALATION_RULES: EscalationRule[] = [
  {
    levelName: "level_1",
    minutesUnresolved: 5,
    actions: {
      notifyStaff: true,
      notifyFamily: false,
      markCritical: false,
    },
  },
  {
    levelName: "level_2",
    minutesUnresolved: 10,
    actions: {
      notifyStaff: true,
      notifyFamily: true,
      markCritical: false,
    },
  },
  {
    levelName: "level_3",
    minutesUnresolved: 15,
    actions: {
      notifyStaff: true,
      notifyFamily: true,
      markCritical: true,
    },
  },
];

export class AlertEscalationService {
  private escalationRules: EscalationRule[];

  constructor(customRules?: EscalationRule[]) {
    this.escalationRules = customRules || DEFAULT_ESCALATION_RULES;
  }

  /**
   * Determine the escalation level for an alert based on time unresolved
   */
  public determineEscalationLevel(
    eventTimestamp: string,
    currentTime: Date = new Date(),
    acknowledgedAt?: string
  ): "new" | "level_1" | "level_2" | "level_3" {
    // If acknowledged, escalation is paused
    if (acknowledgedAt) {
      return "new";
    }

    const eventTime = new Date(eventTimestamp);
    const minutesUnresolved =
      (currentTime.getTime() - eventTime.getTime()) / (1000 * 60);

    // Find the highest applicable level
    let level: "new" | "level_1" | "level_2" | "level_3" = "new";

    for (const rule of this.escalationRules) {
      if (minutesUnresolved >= rule.minutesUnresolved) {
        level = rule.levelName;
      }
    }

    return level;
  }

  /**
   * Get the escalation rule for a specific level
   */
  public getRule(level: "level_1" | "level_2" | "level_3"): EscalationRule | undefined {
    return this.escalationRules.find((r) => r.levelName === level);
  }

  /**
   * Update alert metadata with escalation info
   */
  public updateEscalationMetadata(
    metadata: Record<string, any>,
    newLevel: string,
    timestamp: Date = new Date()
  ): Record<string, any> {
    const updated = { ...metadata };

    if (newLevel !== "new" && newLevel !== updated.escalation_level) {
      updated.escalation_level = newLevel;
      updated.escalated_at = timestamp.toISOString();

      if (!updated.escalation_history) {
        updated.escalation_history = [];
      }

      updated.escalation_history.push({
        level: newLevel,
        timestamp: timestamp.toISOString(),
      });
    }

    return updated;
  }

  /**
   * Determine if an alert requires staff notification
   */
  public shouldNotifyStaff(level: string): boolean {
    if (level === "new") return false;
    const rule = this.escalationRules.find((r) => r.levelName === level);
    return rule?.actions.notifyStaff ?? false;
  }

  /**
   * Determine if an alert requires family notification
   */
  public shouldNotifyFamily(level: string): boolean {
    if (level === "new") return false;
    const rule = this.escalationRules.find((r) => r.levelName === level);
    return rule?.actions.notifyFamily ?? false;
  }

  /**
   * Determine if an alert is marked critical
   */
  public isCritical(level: string): boolean {
    if (level === "new") return false;
    const rule = this.escalationRules.find((r) => r.levelName === level);
    return rule?.actions.markCritical ?? false;
  }
}

export const escalationService = new AlertEscalationService();

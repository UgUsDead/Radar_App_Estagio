import { logger } from "../logger.js";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface PatientRiskProfile {
  level: RiskLevel;
  fallThresholdMultiplier: number; // 0.5 (stricter) to 2.0 (more lenient)
  mobilityScore: number; // 0-100: higher = more mobile/active
  fallHistoryCount: number; // Number of falls in past 30 days
  cognitiveStatus: "alert" | "confused" | "impaired";
  mobilityAids: string[]; // walker, wheelchair, etc.
  notes: string;
  manualRiskScore?: number;
  manualProactiveChecks?: string[];
  lastUpdated: string;
}

export const DEFAULT_RISK_PROFILES: Record<RiskLevel, PatientRiskProfile> = {
  low: {
    level: "low",
    fallThresholdMultiplier: 1.2, // More tolerant of movement
    mobilityScore: 75,
    fallHistoryCount: 0,
    cognitiveStatus: "alert",
    mobilityAids: [],
    notes: "Residente independente e ativo",
    lastUpdated: new Date().toISOString(),
  },
  medium: {
    level: "medium",
    fallThresholdMultiplier: 1.0,
    mobilityScore: 50,
    fallHistoryCount: 1,
    cognitiveStatus: "alert",
    mobilityAids: ["bengala"],
    notes: "Algumas preocupações de mobilidade, assistência ocasional",
    lastUpdated: new Date().toISOString(),
  },
  high: {
    level: "high",
    fallThresholdMultiplier: 0.8, // Stricter detection
    mobilityScore: 30,
    fallHistoryCount: 3,
    cognitiveStatus: "confused",
    mobilityAids: ["andador", "cadeira de rodas"],
    notes: "Risco de queda significativo, incidentes frequentes",
    lastUpdated: new Date().toISOString(),
  },
  critical: {
    level: "critical",
    fallThresholdMultiplier: 0.6, // Very sensitive
    mobilityScore: 10,
    fallHistoryCount: 5,
    cognitiveStatus: "impaired",
    mobilityAids: ["cadeira de rodas"],
    notes: "Risco de queda grave, requer monitorização próxima",
    lastUpdated: new Date().toISOString(),
  },
};

export class RiskProfileService {
  /**
   * Get risk profile for a patient from metadata
   */
  public getRiskProfile(
    patientMetadata?: Record<string, any>
  ): PatientRiskProfile {
    if (!patientMetadata?.risk_profile) {
      return { ...DEFAULT_RISK_PROFILES.medium };
    }

    const stored = patientMetadata.risk_profile as Partial<PatientRiskProfile>;
    return {
      level: (stored.level ?? "medium") as RiskLevel,
      fallThresholdMultiplier: stored.fallThresholdMultiplier ?? 1.0,
      mobilityScore: stored.mobilityScore ?? 50,
      fallHistoryCount: stored.fallHistoryCount ?? 0,
      cognitiveStatus: stored.cognitiveStatus ?? "alert",
      mobilityAids: stored.mobilityAids ?? [],
      notes: stored.notes ?? "",
      manualRiskScore: stored.manualRiskScore,
      manualProactiveChecks: stored.manualProactiveChecks,
      lastUpdated: stored.lastUpdated ?? new Date().toISOString(),
    };
  }

  /**
   * Update patient risk profile in metadata
   */
  public updateRiskProfile(
    patientMetadata: Record<string, any>,
    newProfile: Partial<PatientRiskProfile>
  ): Record<string, any> {
    const currentProfile = this.getRiskProfile(patientMetadata);
    const updated = {
      ...currentProfile,
      ...newProfile,
      lastUpdated: new Date().toISOString(),
    };

    return {
      ...patientMetadata,
      risk_profile: updated,
    };
  }

  /**
   * Calculate adaptive fall detection threshold based on risk profile
   * Lower scores = stricter detection (more likely to flag as fall)
   */
  public getAdaptiveThreshold(
    riskProfile: PatientRiskProfile,
    baseThreshold: number = 0.7
  ): number {
    return baseThreshold * riskProfile.fallThresholdMultiplier;
  }

  /**
   * Auto-escalate risk based on recent fall history
   */
  public autoEscalateRisk(
    currentProfile: PatientRiskProfile,
    fallCountInPast30Days: number
  ): PatientRiskProfile {
    let newLevel = currentProfile.level;

    if (fallCountInPast30Days >= 5) {
      newLevel = "critical";
    } else if (fallCountInPast30Days >= 3) {
      newLevel = "high";
    } else if (fallCountInPast30Days >= 1 && newLevel === "low") {
      newLevel = "medium";
    }

    return {
      ...currentProfile,
      level: newLevel,
      fallHistoryCount: fallCountInPast30Days,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Get CSS class for risk level badge in UI
   */
  public getRiskBadgeClass(level: RiskLevel): string {
    const map: Record<RiskLevel, string> = {
      low: "badge-low",
      medium: "badge-medium",
      high: "badge-high",
      critical: "badge-critical",
    };
    return map[level];
  }
}

export const riskProfileService = new RiskProfileService();

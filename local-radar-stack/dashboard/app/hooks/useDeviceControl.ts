import { apiFetch } from "../utils/api";
import { useState, useCallback, useEffect, useRef } from "react";
import type {
  DeviceState,
  RadarConfig,
  ConfigApplyState,
} from "../types/radarConfig";
import { DEFAULT_RADAR_CONFIG } from "../types/radarConfig";

/**
 * useDeviceControl — hook for device commands and radar config management.
 *
 * Polls device state from the backend and provides functions to send
 * commands and radar configuration via the REST API (which proxies to MQTT).
 */
export function useDeviceControl(deviceId: string) {
  const [deviceState, setDeviceState] = useState<DeviceState | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [radarConfig, setRadarConfigState] = useState<RadarConfig>({ ...DEFAULT_RADAR_CONFIG });
  const [configApplyState, setConfigApplyState] = useState<ConfigApplyState>("idle");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const configDraftDirtyRef = useRef(false);
  const prevConfigStatusRef = useRef<string | null>(null);

  const setRadarConfig = useCallback<React.Dispatch<React.SetStateAction<RadarConfig>>>((next) => {
    configDraftDirtyRef.current = true;
    // Reset apply state when user makes changes
    setConfigApplyState("idle");
    setMessage("");
    setRadarConfigState((prev) => (typeof next === "function" ? (next as (prevState: RadarConfig) => RadarConfig)(prev) : next));
  }, []);

  // ── Poll device state ──────────────────────────────────
  const fetchDeviceState = useCallback(async () => {
    if (!deviceId) return;
    try {
      const res = await apiFetch(`/devices/${encodeURIComponent(deviceId)}/state`);
      if (!res.ok) return;
      const data: DeviceState = await res.json();
      setDeviceState(data);

      // Track config apply state machine from MQTT status updates
      const newStatus = data.radarConfigStatus;
      if (newStatus && newStatus !== prevConfigStatusRef.current) {
        prevConfigStatusRef.current = newStatus;
        if (newStatus === "accepted") {
          setConfigApplyState("accepted");
          setMessage("Configuração aceite pelo dispositivo, a aplicar...");
        } else if (newStatus === "applied") {
          setConfigApplyState("applied");
          setMessage("Configuração aplicada com sucesso.");
        } else if (newStatus === "failed") {
          setConfigApplyState("failed");
          setMessage("Falha ao aplicar configuração. Verifique o dispositivo.");
        } else if (newStatus.startsWith("rejected")) {
          setConfigApplyState("failed");
          setMessage(`Configuração rejeitada: ${newStatus}`);
        } else if (newStatus === "state_published" || newStatus === "default_config_active_or_no_stored_config") {
          // Not an apply state, just informational
        }
      }

      // Populate form from retained config state if available
      if (data.radarConfigState && configApplyState === "idle" && !configDraftDirtyRef.current) {
        setRadarConfigState(prev => ({
          ...DEFAULT_RADAR_CONFIG,
          ...data.radarConfigState as any,
          mount: { ...DEFAULT_RADAR_CONFIG.mount, ...(data.radarConfigState as any)?.mount },
          fov: { ...DEFAULT_RADAR_CONFIG.fov, ...(data.radarConfigState as any)?.fov },
          roi: {
            tracking: { ...DEFAULT_RADAR_CONFIG.roi.tracking, ...(data.radarConfigState as any)?.roi?.tracking },
            static: { ...DEFAULT_RADAR_CONFIG.roi.static, ...(data.radarConfigState as any)?.roi?.static },
            presence: { ...DEFAULT_RADAR_CONFIG.roi.presence, ...(data.radarConfigState as any)?.roi?.presence },
          },
          detection: { ...DEFAULT_RADAR_CONFIG.detection, ...(data.radarConfigState as any)?.detection },
          tracking: { ...DEFAULT_RADAR_CONFIG.tracking, ...(data.radarConfigState as any)?.tracking },
          timing: { ...DEFAULT_RADAR_CONFIG.timing, ...(data.radarConfigState as any)?.timing },
        }));
      }

    } catch {
      // Silently fail polling
    }
  }, [deviceId, configApplyState]);

  // ── Poll logs ──────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    if (!deviceId) return;
    try {
      const res = await apiFetch(`/devices/${encodeURIComponent(deviceId)}/logs?limit=500`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
      }
    } catch {
      // Silently fail log polling
    }
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId) {
      setDeviceState(null);
      setLogs([]);
      return;
    }
    fetchDeviceState();
    fetchLogs();
    const interval = setInterval(() => {
      fetchDeviceState();
      fetchLogs();
    }, 2000);
    return () => clearInterval(interval);
  }, [deviceId, fetchDeviceState, fetchLogs]);

  // Reset state when device changes
  useEffect(() => {
    setConfigApplyState("idle");
    setMessage("");
    prevConfigStatusRef.current = null;
    configDraftDirtyRef.current = false;
    setRadarConfigState({ ...DEFAULT_RADAR_CONFIG });
  }, [deviceId]);

  // ── Send device command ────────────────────────────────
  const sendCommand = useCallback(async (cmd: string) => {
    if (!deviceId) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await apiFetch(`/devices/${encodeURIComponent(deviceId)}/cmd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao enviar comando");
      setMessage(`Comando '${cmd}' enviado.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro ao enviar comando");
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  // ── Send radar command ─────────────────────────────────
  const sendRadarCommand = useCallback(async (cmd: string) => {
    if (!deviceId) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await apiFetch(`/devices/${encodeURIComponent(deviceId)}/radar/cmd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao enviar comando radar");
      setMessage(`Comando radar '${cmd}' enviado.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro ao enviar comando radar");
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  // ── Apply radar config ─────────────────────────────────
  const applyRadarConfig = useCallback(async () => {
    console.log("[DEBUG] applyRadarConfig triggered. deviceId:", deviceId, "config:", radarConfig);
    if (!deviceId) {
      console.warn("[DEBUG] applyRadarConfig: no deviceId");
      return;
    }
    setLoading(true);
    setConfigApplyState("publishing");
    setMessage("A enviar configuração...");
    prevConfigStatusRef.current = null;
    try {
      const url = `/devices/${encodeURIComponent(deviceId)}/radar/config`;
      console.log("[DEBUG] applyRadarConfig: POSTING to", url);
      const res = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(radarConfig),
      });
      console.log("[DEBUG] applyRadarConfig: response status:", res.status);
      const data = await res.json();
      console.log("[DEBUG] applyRadarConfig: response data:", data);
      if (!res.ok) {
        setConfigApplyState("rejected");
        throw new Error(data.error || "Falha ao enviar configuração");
      }
      setConfigApplyState("applying");
      setMessage("Configuração enviada. A aguardar resposta do dispositivo...");
    } catch (err) {
      console.error("[DEBUG] applyRadarConfig error:", err);
      setMessage(err instanceof Error ? err.message : "Erro ao enviar configuração");
      setConfigApplyState("failed");
    } finally {
      setLoading(false);
    }
  }, [deviceId, radarConfig, configApplyState]);

  // ── Request stored config ──────────────────────────────
  const requestConfigState = useCallback(async () => {
    console.log("[DEBUG] requestConfigState triggered. deviceId:", deviceId);
    if (!deviceId) return;
    setMessage("A solicitar configuração armazenada...");
    try {
      const url = `/devices/${encodeURIComponent(deviceId)}/radar/config/get`;
      console.log("[DEBUG] requestConfigState: POSTING to", url);
      const res = await apiFetch(url, {
        method: "POST",
      });
      console.log("[DEBUG] requestConfigState: response status:", res.status);
      if (!res.ok) {
        const data = await res.json();
        console.error("[DEBUG] requestConfigState fail data:", data);
        throw new Error(data.error || "Falha");
      }
      setMessage("Pedido enviado. A configuração será recebida em breve.");
    } catch (err) {
      console.error("[DEBUG] requestConfigState error:", err);
      setMessage(err instanceof Error ? err.message : "Erro");
    }
  }, [deviceId]);

  // ── Reset apply state ──────────────────────────────────
  const resetApplyState = useCallback(() => {
    setConfigApplyState("idle");
    setMessage("");
    prevConfigStatusRef.current = null;
  }, []);

  return {
    deviceState,
    logs,
    radarConfig,
    setRadarConfig,
    configApplyState,
    loading,
    message,
    sendCommand,
    sendRadarCommand,
    applyRadarConfig,
    requestConfigState,
    resetApplyState,
  };
}

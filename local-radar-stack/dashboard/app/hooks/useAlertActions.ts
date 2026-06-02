import { apiFetch } from "../utils/api";
import { useState, useMemo, useCallback } from "react";
import { EventRow, RoomRow } from "../types/domain";
import { apiBase } from "../constants/api";

export function useAlertActions(events: EventRow[], load: () => Promise<void>) {
  const [bulkActionBusy, setBulkActionBusy] = useState<"ack" | "resolve" | null>(null);
  const [resolvingEvent, setResolvingEvent] = useState<EventRow | null>(null);
  const [resolutionData, setResolutionData] = useState({
    notes: "",
    intervention_type: "Assisted patient back to bed",
    root_cause: "Physical instability"
  });

  const fallAlerts = useMemo(() => events.filter((event) => ["fall", "anomaly", "departure", "arrival", "transition", "dwell"].includes(event.type)), [events]);
  const activeFallAlerts = useMemo(
    () => fallAlerts.filter((event) => !["resolved", "closed"].includes(event.alert_status ?? "new")),
    [fallAlerts]
  );
  const criticalAlerts = useMemo(() => activeFallAlerts.slice(0, 20), [activeFallAlerts]);
  
  const roomAlerts = useMemo(() => {
    const byRoom = new Map<string, EventRow[]>();
    activeFallAlerts.forEach((event) => {
      const roomName = event.room_name ?? "Unassigned room";
      byRoom.set(roomName, [...(byRoom.get(roomName) ?? []), event]);
    });
    return byRoom;
  }, [activeFallAlerts]);

  const updateAlertStatus = useCallback(async (eventId: number, action: "ack" | "resolve" | "closed") => {
    if (action === "resolve" || action === "closed") {
      const ev = activeFallAlerts.find(e => e.id === eventId);
      if (ev) {
        setResolvingEvent(ev);
        return;
      }
    }
    
    const res = await apiFetch(`/events/${eventId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: "dashboard" })
    });
    if (!res.ok) throw new Error("Failed to update alert status");
    await load();
  }, [activeFallAlerts, load]);

  const confirmResolution = useCallback(async () => {
    if (!resolvingEvent) return;
    
    const res = await apiFetch(`/events/${resolvingEvent.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor: "dashboard",
        notes: resolutionData.notes,
        intervention_type: resolutionData.intervention_type,
        root_cause: resolutionData.root_cause
      })
    });
    if (!res.ok) throw new Error("Failed to confirm resolution");
    
    setResolvingEvent(null);
    setResolutionData({ notes: "", intervention_type: "Assisted patient back to bed", root_cause: "Physical instability" });
    await load();
  }, [resolvingEvent, resolutionData, load]);

  const bulkUpdateAlerts = useCallback(async (action: "ack" | "resolve") => {
    const targetAlerts = action === "ack"
      ? activeFallAlerts.filter((event) => (event.alert_status ?? "new") === "new")
      : activeFallAlerts;
    if (targetAlerts.length === 0) return;

    setBulkActionBusy(action);
    try {
      await Promise.all(
        targetAlerts.map(async (event) => {
          const res = await apiFetch(`/events/${event.id}/${action}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ actor: "dashboard-bulk" })
          });
          if (!res.ok) throw new Error("Failed to update bulk alerts");
        })
      );
      await load();
    } finally {
      setBulkActionBusy(null);
    }
  }, [activeFallAlerts, load]);

  const roomShortcut = useCallback(async (room: RoomRow, action: "ack" | "resolve") => {
    const roomEvents = (roomAlerts.get(room.name) ?? [])
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (roomEvents.length === 0) return;

    const targetEvent = action === "ack"
      ? roomEvents.find((event) => (event.alert_status ?? "new") === "new")
      : roomEvents[0];

    if (!targetEvent) return;
    await updateAlertStatus(targetEvent.id, action);
  }, [roomAlerts, updateAlertStatus]);

  return {
    fallAlerts,
    activeFallAlerts,
    criticalAlerts,
    roomAlerts,
    bulkActionBusy,
    resolvingEvent,
    resolutionData,
    setResolvingEvent,
    setResolutionData,
    updateAlertStatus,
    confirmResolution,
    bulkUpdateAlerts,
    roomShortcut
  };
}

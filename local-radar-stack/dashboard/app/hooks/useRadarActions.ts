import { apiFetch } from "../utils/api";
import { useState, useMemo, useCallback } from "react";
import { Radar, RoomRow } from "../types/domain";
import { apiBase } from "../constants/api";

export function useRadarActions(allRadars: Radar[], rooms: RoomRow[], load: () => Promise<void>, markInteracting: () => void, markDoneInteracting: () => void) {
  const [selectedRoomByRadar, setSelectedRoomByRadar] = useState<Record<string, string>>({});
  const [assigningRadarId, setAssigningRadarId] = useState<string | null>(null);
  const [unassigningRadarId, setUnassigningRadarId] = useState<string | null>(null);
  const [deletingRadarId, setDeletingRadarId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");

  const unassignedRadars = useMemo(
    () =>
      allRadars
        .filter((radar) => radar.room_id === null)
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: "base" })),
    [allRadars]
  );

  const unassignedOnlineRadars = useMemo(
    () => unassignedRadars.filter((radar) => radar.status === "online").length,
    [unassignedRadars]
  );

  const knownRadarIds = useMemo(() => {
    const fromRooms = rooms
      .map((room) => room.radar_id)
      .filter((radarId): radarId is string => typeof radarId === "string" && radarId.length > 0);
    const fromUnassigned = allRadars.map((radar) => radar.id);
    return Array.from(new Set([...fromRooms, ...fromUnassigned])).sort();
  }, [allRadars, rooms]);

  const assignRadarToRoom = useCallback(async (radarId: string) => {
    const selectedRoom = selectedRoomByRadar[radarId];
    if (!selectedRoom) return;

    const roomId = Number(selectedRoom);
    if (!Number.isInteger(roomId)) return;

    markInteracting();
    setAssigningRadarId(radarId);
    setMessage("");
    try {
      const response = await apiFetch(`/radars/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ radarId, roomId })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to assign radar");
      }

      setSelectedRoomByRadar((prev) => {
        const next = { ...prev };
        delete next[radarId];
        return next;
      });
      setMessage("Radar assigned to room.");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to assign radar";
      setMessage(msg);
    } finally {
      setAssigningRadarId(null);
      markDoneInteracting();
    }
  }, [selectedRoomByRadar, load, markInteracting, markDoneInteracting]);

  const unassignRadar = useCallback(async (radarId: string) => {
    const confirmed = window.confirm("Unassign this radar from its room?");
    if (!confirmed) return;

    setUnassigningRadarId(radarId);
    setMessage("");
    try {
      const response = await apiFetch(`/radars/${encodeURIComponent(radarId)}/unassign`, {
        method: "POST"
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to unassign radar");
      }

      setMessage("Radar unassigned.");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to unassign radar";
      setMessage(msg);
    } finally {
      setUnassigningRadarId(null);
    }
  }, [load]);

  const deleteRadar = useCallback(async (radarId: string) => {
    const confirmed = window.confirm(
      "Eliminar definitivamente este registo de radar e todo o seu histórico de telemetria/eventos? Esta ação não pode ser revertida."
    );
    if (!confirmed) return;

    setDeletingRadarId(radarId);
    setMessage("");
    try {
      const response = await apiFetch(`/radars/${encodeURIComponent(radarId)}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to delete radar");
      }

      setSelectedRoomByRadar((prev) => {
        const next = { ...prev };
        delete next[radarId];
        return next;
      });
      setMessage("Radar deleted.");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete radar";
      setMessage(msg);
    } finally {
      setDeletingRadarId(null);
    }
  }, [load]);

  const [users, setUsers] = useState<any[]>([]);
  const [claimingRadarId, setClaimingRadarId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const res = await apiFetch("/users");
      if (res.ok) setUsers(await res.json());
    } catch (err) {
      console.error("Failed to load users for radar assignment", err);
    }
  }, []);

  const claimRadar = useCallback(async (radarId: string, targetOwnerId?: number | null) => {
    setClaimingRadarId(radarId);
    setMessage("");
    try {
      const response = await apiFetch(`/radars/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ radarId, ownerId: targetOwnerId ?? null })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to claim radar");
      }

      setMessage("Radar ownership updated successfully.");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to claim radar";
      setMessage(msg);
    } finally {
      setClaimingRadarId(null);
    }
  }, [load]);

  return {
    selectedRoomByRadar,
    setSelectedRoomByRadar,
    assigningRadarId,
    unassigningRadarId,
    deletingRadarId,
    claimingRadarId,
    message,
    unassignedRadars,
    unassignedOnlineRadars,
    knownRadarIds,
    assignRadarToRoom,
    unassignRadar,
    deleteRadar,
    claimRadar,
    users,
    loadUsers
  };
}

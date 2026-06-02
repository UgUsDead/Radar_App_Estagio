import { apiFetch } from "../utils/api";
import { useState, useMemo, useCallback } from "react";
import { RoomRow, EventRow } from "../types/domain";
import { apiBase } from "../constants/api";

export function useRoomActions(rooms: RoomRow[], activeFallAlerts: EventRow[], load: () => Promise<void>) {
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomFloor, setNewRoomFloor] = useState("1");
  const [newRoomNotes, setNewRoomNotes] = useState("");
  const [newRoomWidth, setNewRoomWidth] = useState("12");
  const [newRoomDepth, setNewRoomDepth] = useState("12");
  const [newRadarHeight, setNewRadarHeight] = useState("2.5");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<number | null>(null);
  const [message, setMessage] = useState<string>("");

  const uniqueRooms = useMemo(() => {
    const seen = new Map<number, RoomRow>();
    rooms.forEach((room) => {
      if (!seen.has(room.id)) seen.set(room.id, room);
    });
    return Array.from(seen.values());
  }, [rooms]);

  const roomStatus = useCallback((room: RoomRow): "ok" | "warn" | "alert" => {
    const roomAlerts = activeFallAlerts.filter((event) => event.room_name === room.name);
    if (roomAlerts.length > 0) return "alert";
    if (!room.radar_id || !room.patient_name) return "warn";
    return "ok";
  }, [activeFallAlerts]);

  const sortedRooms = useMemo(() => {
    const rank = { alert: 0, warn: 1, ok: 2 };
    return [...uniqueRooms].sort((a, b) => rank[roomStatus(a)] - rank[roomStatus(b)]);
  }, [roomStatus, uniqueRooms]);

  const roomOptions = useMemo(
    () =>
      [...uniqueRooms].sort((a, b) => {
        if (a.floor !== b.floor) return a.floor - b.floor;
        return a.name.localeCompare(b.name);
      }),
    [uniqueRooms]
  );

  const visibleRooms = useMemo(
    () => (needsAttentionOnly ? sortedRooms.filter((room) => roomStatus(room) !== "ok") : sortedRooms),
    [needsAttentionOnly, sortedRooms, roomStatus]
  );

  const createRoom = useCallback(async () => {
    const name = newRoomName.trim();
    const floor = Number(newRoomFloor);
    if (!name || !Number.isInteger(floor)) {
      setMessage("Insira um nome de quarto e um número de piso válido.");
      return;
    }

    setCreatingRoom(true);
    setMessage("");
    try {
      const response = await apiFetch(`/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          floor,
          notes: newRoomNotes.trim() ? newRoomNotes.trim() : null,
          metadata: {
            zone_room_model: {
              roomWidthMeters: Number(newRoomWidth) || 12,
              roomDepthMeters: Number(newRoomDepth) || 12,
              radarHeightMeters: Number(newRadarHeight) || 2.5,
              originX: 0,
              originY: 0
            }
          }
        })
      });

      if (!response.ok) {
        let msg = "Failed to create room";
        try {
          const body = await response.json();
          if (body.error) msg = body.error;
        } catch {
          const text = await response.text();
          if (text) msg = text;
        }
        throw new Error(msg);
      }

      setNewRoomName("");
      setNewRoomFloor("1");
      setNewRoomNotes("");
      setNewRoomWidth("12");
      setNewRoomDepth("12");
      setNewRadarHeight("2.5");
      setMessage("Room created.");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create room";
      setMessage(msg);
    } finally {
      setCreatingRoom(false);
    }
  }, [newRoomName, newRoomFloor, newRoomNotes, newRoomWidth, newRoomDepth, newRadarHeight, load]);

  const deleteRoom = useCallback(async (room: RoomRow) => {
    const confirmed = window.confirm(
      `Delete room ${room.name}? Any assigned radar/patient will become unassigned.`
    );
    if (!confirmed) return;

    setDeletingRoomId(room.id);
    setMessage("");
    try {
      const response = await apiFetch(`/rooms/${room.id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        let msg = "Failed to delete room";
        try {
          const body = await response.json();
          if (body.error) msg = body.error;
        } catch {
          const text = await response.text();
          if (text) msg = text;
        }
        throw new Error(msg);
      }

      setMessage("Room deleted.");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete room";
      setMessage(msg);
    } finally {
      setDeletingRoomId(null);
    }
  }, [load]);

  return {
    needsAttentionOnly,
    setNeedsAttentionOnly,
    newRoomName,
    setNewRoomName,
    newRoomFloor,
    setNewRoomFloor,
    newRoomNotes,
    setNewRoomNotes,
    newRoomWidth,
    setNewRoomWidth,
    newRoomDepth,
    setNewRoomDepth,
    newRadarHeight,
    setNewRadarHeight,
    creatingRoom,
    deletingRoomId,
    message,
    createRoom,
    deleteRoom,
    roomStatus,
    uniqueRooms,
    sortedRooms,
    roomOptions,
    visibleRooms,
  };
}

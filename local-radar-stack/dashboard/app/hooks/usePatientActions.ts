import { apiFetch } from "../utils/api";
import { useState, useCallback } from "react";
import { Patient } from "../types/domain";
import { apiBase } from "../constants/api";

export function usePatientActions(load: () => Promise<void>) {
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientRoomId, setNewPatientRoomId] = useState("");
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [selectedRoomByPatient, setSelectedRoomByPatient] = useState<Record<number, string>>({});
  const [assigningPatientId, setAssigningPatientId] = useState<number | null>(null);
  const [deletingPatientId, setDeletingPatientId] = useState<number | null>(null);
  const [message, setMessage] = useState<string>("");

  const createPatient = useCallback(async () => {
    const name = newPatientName.trim();
    if (!name) {
      setMessage("Insira o nome do paciente.");
      return;
    }

    let roomId: number | null = null;
    if (newPatientRoomId) {
      const parsed = Number(newPatientRoomId);
      if (!Number.isInteger(parsed)) {
        setMessage("Selecione um quarto válido para o paciente.");
        return;
      }
      roomId = parsed;
    }

    setCreatingPatient(true);
    setMessage("");
    try {
      const response = await apiFetch(`/patients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          roomId,
          metadata: {}
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to create patient");
      }

      setNewPatientName("");
      setNewPatientRoomId("");
      setMessage("Patient created.");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create patient";
      setMessage(msg);
    } finally {
      setCreatingPatient(false);
    }
  }, [newPatientName, newPatientRoomId, load]);

  const assignPatientRoom = useCallback(async (patient: Patient) => {
    const selected = selectedRoomByPatient[patient.id];
    const nextValue = selected ?? (patient.room_id === null ? "" : String(patient.room_id));

    let roomId: number | null = null;
    if (nextValue !== "") {
      const parsed = Number(nextValue);
      if (!Number.isInteger(parsed)) {
        setMessage("Select a valid room for the patient.");
        return;
      }
      roomId = parsed;
    }

    if (roomId === patient.room_id) {
      setMessage("O paciente já está atribuído a esse quarto.");
      return;
    }

    setAssigningPatientId(patient.id);
    setMessage("");
    try {
      const response = await apiFetch(`/patients/${patient.id}/room`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to assign patient room");
      }

      setMessage(roomId === null ? "Paciente desatribuído do quarto." : "Quarto do paciente atualizado.");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to assign patient room";
      setMessage(msg);
    } finally {
      setAssigningPatientId(null);
    }
  }, [selectedRoomByPatient, load]);

  const deletePatient = useCallback(async (patient: Patient) => {
    const confirmed = window.confirm(`Eliminar o paciente ${patient.name}? Esta ação não pode ser revertida.`);
    if (!confirmed) return;

    setDeletingPatientId(patient.id);
    setMessage("");
    try {
      const response = await apiFetch(`/patients/${patient.id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to delete patient");
      }

      setSelectedRoomByPatient((prev) => {
        const next = { ...prev };
        delete next[patient.id];
        return next;
      });
      setMessage("Patient deleted.");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete patient";
      setMessage(msg);
    } finally {
      setDeletingPatientId(null);
    }
  }, [load]);

  return {
    newPatientName,
    setNewPatientName,
    newPatientRoomId,
    setNewPatientRoomId,
    creatingPatient,
    selectedRoomByPatient,
    setSelectedRoomByPatient,
    assigningPatientId,
    deletingPatientId,
    message,
    createPatient,
    assignPatientRoom,
    deletePatient
  };
}

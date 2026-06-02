"use client";

import { apiFetch } from "../utils/api";

import Link from "next/link";
import { useEffect, useState, useMemo, useCallback } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

type Radar = { 
  id: string; 
  status: string; 
  room_id: number | null; 
  room_name: string | null; 
  last_seen?: string | null 
};

type Room = {
  id: number;
  name: string;
  floor: number;
  radar_id: string | null;
};

export default function RadarsPage() {
  const [radars, setRadars] = useState<Radar[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [managementMessage, setManagementMessage] = useState("");
  const [busyRadarId, setBusyRadarId] = useState<string | null>(null);
  const [selectedRoomByRadar, setSelectedRoomByRadar] = useState<Record<string, string>>({});
  const [isInteracting, setIsInteracting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rRes, rmRes] = await Promise.all([
        apiFetch(`/radars`),
        apiFetch(`/rooms`)
      ]);
      if (!rRes.ok || !rmRes.ok) throw new Error("Falha ao carregar dados dos radares.");
      
      const rData = await rRes.json();
      const rmData = await rmRes.json();
      
      setRadars(rData);
      setRooms(rmData);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (!isInteracting) load();
    }, 3000);
    return () => clearInterval(interval);
  }, [load, isInteracting]);

  const markInteracting = () => setIsInteracting(true);
  const markDoneInteracting = () => {
    setIsInteracting(false);
    setManagementMessage("");
  };

  const assignRadar = async (radarId: string) => {
    const roomIdStr = selectedRoomByRadar[radarId];
    if (!roomIdStr) return;
    const roomId = parseInt(roomIdStr);

    setBusyRadarId(radarId);
    setManagementMessage("");
    try {
      const res = await apiFetch(`/radars/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ radarId, roomId })
      });
      if (!res.ok) throw new Error("Falha na atribuição.");
      setManagementMessage("Radar atribuído com sucesso.");
      await load();
    } catch (err) {
      setManagementMessage(err instanceof Error ? err.message : "Erro na atribuição");
    } finally {
      setBusyRadarId(null);
    }
  };

  const unassignRadar = async (radarId: string) => {
    setBusyRadarId(radarId);
    setManagementMessage("");
    try {
      const res = await apiFetch(`/radars/${encodeURIComponent(radarId)}/unassign`, {
        method: "POST"
      });
      if (!res.ok) throw new Error("Falha ao desatribuir.");
      setManagementMessage("Radar desatribuído.");
      await load();
    } catch (err) {
      setManagementMessage(err instanceof Error ? err.message : "Erro ao desatribuir");
    } finally {
      setBusyRadarId(null);
    }
  };

  const deleteRadar = async (radarId: string) => {
    const confirmed = window.confirm(
      `Eliminar definitivamente o radar ${radarId} e todo o seu histórico? Esta ação não pode ser revertida.`
    );
    if (!confirmed) return;

    setBusyRadarId(radarId);
    setManagementMessage("");
    try {
      const res = await apiFetch(`/radars/${encodeURIComponent(radarId)}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Falha ao eliminar radar.");
      setManagementMessage("Radar eliminado.");
      await load();
    } catch (err) {
      setManagementMessage(err instanceof Error ? err.message : "Erro ao eliminar");
    } finally {
      setBusyRadarId(null);
    }
  };

  const sortedRadars = useMemo(() => {
    return [...radars].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));
  }, [radars]);

  const availableRooms = useMemo(() => {
    return rooms.sort((a, b) => {
      if (a.floor !== b.floor) return a.floor - b.floor;
      return a.name.localeCompare(b.name);
    });
  }, [rooms]);

  if (loading && radars.length === 0) {
    return <main className="container"><div className="panel">A carregar inventário de radares...</div></main>;
  }

  return (
    <main className="container">
      <header style={{ marginBottom: '24px' }}>
        <Link href="/">← Voltar ao Painel Principal</Link>
        <div style={{ marginTop: '16px' }}>
          <p className="hero-kicker">Gestão de Infraestrutura</p>
          <h1>Inventário Completo de Radares</h1>
          <p className="muted">Controle todos os dispositivos instalados, atribua-os a quartos ou elimine registos obsoletos.</p>
        </div>
      </header>

      {error && <section className="panel error-banner">{error}</section>}
      {managementMessage && <section className="panel" style={{ backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>{managementMessage}</section>}

      <section className="panel">
        <div className="table-wrap">
          <table onMouseEnter={markInteracting} onMouseLeave={markDoneInteracting}>
            <thead>
              <tr>
                <th>Hardware ID</th>
                <th>Estado</th>
                <th>Quarto Atual</th>
                <th>Visto pela última vez</th>
                <th>Gestão / Ações</th>
              </tr>
            </thead>
            <tbody>
              {sortedRadars.map((radar) => (
                <tr key={radar.id}>
                  <td className="sla-id">{radar.id}</td>
                  <td>
                    <span className={`priority-pill ${radar.status === "online" ? "priority-pill--low" : "priority-pill--medium"}`}>
                      {radar.status === "online" ? "Ligado" : "Desligado"}
                    </span>
                  </td>
                  <td>
                    {radar.room_name ? (
                      <span className="text-accent" style={{ fontWeight: '600' }}>{radar.room_name}</span>
                    ) : (
                      <span className="muted">Não Atribuído</span>
                    )}
                  </td>
                  <td className="muted" style={{ fontSize: '13px' }}>
                    {radar.last_seen ? new Date(radar.last_seen).toLocaleString() : "Nunca"}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {!radar.room_id ? (
                        <>
                          <select
                            style={{ padding: '4px', fontSize: '12px' }}
                            value={selectedRoomByRadar[radar.id] ?? ""}
                            onChange={(e) => setSelectedRoomByRadar(prev => ({ ...prev, [radar.id]: e.target.value }))}
                            onFocus={markInteracting}
                          >
                            <option value="">Atribuir a...</option>
                            {availableRooms.map(r => (
                              <option key={r.id} value={r.id} disabled={!!r.radar_id}>
                                {`Piso ${r.floor} - ${r.name}${r.radar_id ? " (Ocupado)" : ""}`}
                              </option>
                            ))}
                          </select>
                          <button 
                            style={{ padding: '4px 12px', fontSize: '12px' }}
                            onClick={() => assignRadar(radar.id)}
                            disabled={busyRadarId !== null || !selectedRoomByRadar[radar.id]}
                          >
                            Atribuir
                          </button>
                        </>
                      ) : (
                        <button 
                          className="danger-btn"
                          style={{ padding: '4px 12px', fontSize: '12px' }}
                          onClick={() => unassignRadar(radar.id)}
                          disabled={busyRadarId !== null}
                        >
                          Desatribuir
                        </button>
                      )}
                      
                      <Link 
                        href={`/?manageZones=${encodeURIComponent(radar.id)}`}
                        className="priority-pill priority-pill--low"
                        style={{ padding: '4px 12px', fontSize: '12px', textDecoration: 'none', backgroundColor: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}
                      >
                        ⚙️ Configurar Zonas
                      </Link>

                      <button 
                        className="danger-btn"
                        style={{ padding: '4px 12px', fontSize: '12px', color: '#dc2626' }}
                        onClick={() => deleteRadar(radar.id)}
                        disabled={busyRadarId !== null}
                      >
                        🗑 Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sortedRadars.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted" style={{ textAlign: 'center', padding: '24px' }}>
                    Nenhum radar detetado no sistema.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <style jsx>{`
        .text-accent { color: var(--accent-dark); }
        select { border-radius: 6px; border: 1px solid var(--line); }
      `}</style>
    </main>
  );
}

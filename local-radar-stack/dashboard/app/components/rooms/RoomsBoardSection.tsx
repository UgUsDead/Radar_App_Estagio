import Link from "next/link";
import { RoomRow, EventRow, DailyRow } from "../../types/domain";

interface Props {
  needsAttentionOnly: boolean;
  setNeedsAttentionOnly: (value: boolean) => void;
  visibleRooms: RoomRow[];
  sortedRooms: RoomRow[];
  roomStatus: (room: RoomRow) => "ok" | "warn" | "alert";
  daily: DailyRow[];
  roomAlerts: Map<string, EventRow[]>;
  unassigningRadarId: string | null;
  deletingRadarId: string | null;
  deletingRoomId: number | null;
  roomShortcut: (room: RoomRow, action: "ack" | "resolve") => Promise<void>;
  unassignRadar: (radarId: string) => Promise<void>;
  deleteRadar: (radarId: string) => Promise<void>;
  deleteRoom: (room: RoomRow) => Promise<void>;
}

export function RoomsBoardSection({
  needsAttentionOnly,
  setNeedsAttentionOnly,
  visibleRooms,
  sortedRooms,
  roomStatus,
  daily,
  roomAlerts,
  unassigningRadarId,
  deletingRadarId,
  deletingRoomId,
  roomShortcut,
  unassignRadar,
  deleteRadar,
  deleteRoom
}: Props) {
  const statusLabel = (status: "ok" | "warn" | "alert") => {
    if (status === "alert") return "ALERT";
    if (status === "warn") return "CHECK";
    return "OK";
  };

  return (
    <section className="panel">
      <h2>Quadro de Estado dos Quartos</h2>
      <div className="room-board-toolbar">
        <label>
          <input
            type="checkbox"
            checked={needsAttentionOnly}
            onChange={(event) => setNeedsAttentionOnly(event.target.checked)}
          />
          Apenas necessita de atenção
        </label>
        <span className="muted">A mostrar {visibleRooms.length} de {sortedRooms.length} quartos</span>
      </div>
      <div className="grid rooms">
        {visibleRooms.map((room) => {
          const status = roomStatus(room);
          const stat = daily.find((d) => d.room_name === room.name);
          const roomActiveAlerts = roomAlerts.get(room.name) ?? [];
          const hasNewRoomAlert = roomActiveAlerts.some((event) => (event.alert_status ?? "new") === "new");
          return (
            <article className="room-card" key={room.id}>
              <div className="room-top">
                <h3>{room.name}</h3>
                <span className={`badge ${status}`}>{statusLabel(status)}</span>
              </div>

              <div className="room-line">
                <strong>Estado de Segurança:</strong> 
                <span style={{
                  marginLeft: "0.5rem",
                  padding: "0.125rem 0.5rem",
                  borderRadius: "0.25rem",
                  fontSize: "0.75rem",
                  fontWeight: "bold",
                  textTransform: "uppercase",
                  backgroundColor: 
                    room.safety_state === 'urgent' ? '#fee2e2' :
                    room.safety_state === 'watch' ? '#fef3c7' :
                    room.safety_state === 'offline' ? '#e5e7eb' :
                    '#d1fae5',
                  color: 
                    room.safety_state === 'urgent' ? '#991b1b' :
                    room.safety_state === 'watch' ? '#92400e' :
                    room.safety_state === 'offline' ? '#374151' :
                    '#065f46'
                }}>
                  {room.safety_state || 'normal'}
                </span>
              </div>
              {room.safety_state !== 'offline' && typeof room.occupancy !== 'undefined' && (
                <div className="room-line">
                  <strong>Ocupação:</strong> {room.occupancy}
                  <span style={{ color: "#6b7280", fontSize: "0.75rem", marginLeft: "0.5rem" }}>
                     (Inativo: {room.last_activity_sec ? Math.round(room.last_activity_sec) : 0}s)
                  </span>
                </div>
              )}
              <div className="room-line"><strong>Paciente:</strong> {room.patient_name ?? "Não Atribuído"}</div>
              <div className="room-line">
                <strong>Estado do Radar:</strong> {room.radar_id ? (room.radar_status ?? "offline") : "Não Atribuído"}
              </div>
              <div className="room-line"><strong>Distância:</strong> {(stat?.total_distance ?? 0).toFixed(2)} m</div>
              <div className="room-line"><strong>Marcha:</strong> {(stat?.avg_gait_stability ?? 0).toFixed(3)}</div>

              {roomActiveAlerts.length > 0 ? (
                <div className="room-actions">
                  {hasNewRoomAlert ? (
                    <button onClick={() => void roomShortcut(room, "ack")}>Reconhecer alerta</button>
                  ) : null}
                  <button onClick={() => void roomShortcut(room, "resolve")}>Resolver alerta</button>
                </div>
              ) : null}

              {room.patient_id ? <Link href={`/patients/${room.patient_id}`}>Ver detalhes do paciente</Link> : null}

              <div className="room-actions">
                {room.radar_id ? (
                  <>
                    <button
                      className="danger-btn"
                      onClick={() => void unassignRadar(room.radar_id as string)}
                      disabled={unassigningRadarId !== null || deletingRadarId !== null}
                    >
                      {unassigningRadarId === room.radar_id ? "A desatribuir..." : "⛓️‍💥 Desatribuir radar"}
                    </button>
                    <button
                      className="danger-btn"
                      onClick={() => void deleteRadar(room.radar_id as string)}
                      disabled={deletingRadarId !== null || unassigningRadarId !== null}
                    >
                      {deletingRadarId === room.radar_id ? "A eliminar..." : "🗑 Eliminar radar"}
                    </button>
                  </>
                ) : null}
                <button className="danger-btn" onClick={() => void deleteRoom(room)} disabled={deletingRoomId !== null}>
                  {deletingRoomId === room.id ? "A eliminar quarto..." : "🗑 Eliminar quarto"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

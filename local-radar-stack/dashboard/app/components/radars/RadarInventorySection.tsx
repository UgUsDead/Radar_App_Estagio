import { Radar, RoomRow } from "../../types/domain";

interface Props {
  unassignedRadars: Radar[];
  roomOptions: RoomRow[];
  selectedRoomByRadar: Record<string, string>;
  setSelectedRoomByRadar: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  assignRadarToRoom: (radarId: string) => Promise<void>;
  claimRadar: (radarId: string, targetOwnerId?: number) => Promise<void>;
  deleteRadar: (radarId: string) => Promise<void>;
  assigningRadarId: string | null;
  claimingRadarId: string | null;
  deletingRadarId: string | null;
  markInteracting: () => void;
  isAdmin?: boolean;
  users?: any[];
}

export function RadarInventorySection({
  unassignedRadars,
  roomOptions,
  selectedRoomByRadar,
  setSelectedRoomByRadar,
  assignRadarToRoom,
  claimRadar,
  deleteRadar,
  assigningRadarId,
  claimingRadarId,
  deletingRadarId,
  markInteracting,
  isAdmin,
  users
}: Props) {
  return (
    <section className="panel">
      <h2>Inventário de Radares Não Atribuídos</h2>
      {unassignedRadars.length === 0 ? (
        <p className="muted">Todos os radares ativos estão atribuídos a quartos.</p>
      ) : (
        <div className="radar-inventory-list">
          {unassignedRadars.map((radar) => {
            const isUnowned = !radar.owner_id;
            return (
              <div className="radar-inventory-row" key={radar.id}>
                <div style={{ flex: 1 }}>
                  <strong>{radar.id}</strong>
                  <div className={`status-pill ${radar.status}`}>{radar.status}</div>
                  {isAdmin && (
                    <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                      Dono: {radar.owner_name || "Ninguém (Disponível)"}
                    </div>
                  )}
                </div>
                
                {isAdmin ? (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <select
                      style={{ minWidth: "180px" }}
                      onChange={(e) => {
                        const val = e.target.value;
                        // Passing null to claimRadar if "unowned" is selected
                        void claimRadar(radar.id, val === "null" ? undefined : Number(val));
                      }}
                      value={radar.owner_id ?? "null"}
                    >
                      <option value="null">Ninguém (Disponível)</option>
                      {users && users.length > 0 ? (
                        users.map(u => (
                          <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
                        ))
                      ) : (
                        <option disabled>A carregar utilizadores...</option>
                      )}
                    </select>
                  </div>
                ) : isUnowned ? (
                  <button
                    className="primary"
                    onClick={() => void claimRadar(radar.id)}
                    disabled={claimingRadarId !== null}
                    style={{ minWidth: "120px" }}
                  >
                    {claimingRadarId === radar.id ? "A reivindicar..." : "Reivindicar para Hospital"}
                  </button>
                ) : null}

                {!isUnowned && (
                  <>
                    <select
                      value={selectedRoomByRadar[radar.id] ?? ""}
                      onFocus={markInteracting}
                      onMouseDown={markInteracting}
                      onChange={(event) => {
                        markInteracting();
                        setSelectedRoomByRadar((prev) => ({
                          ...prev,
                          [radar.id]: event.target.value
                        }));
                      }}
                    >
                      <option value="">Atribuir a quarto...</option>
                      {roomOptions.map((room) => (
                        <option key={room.id} value={room.id}>
                          {`Piso ${room.floor} - ${room.name}`}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => void assignRadarToRoom(radar.id)}
                      disabled={assigningRadarId !== null || !selectedRoomByRadar[radar.id]}
                    >
                      {assigningRadarId === radar.id ? "A atribuir..." : "Atribuir"}
                    </button>
                  </>
                )}
                
                <button
                  className="danger-btn"
                  onClick={() => void deleteRadar(radar.id)}
                  disabled={deletingRadarId !== null || assigningRadarId !== null || claimingRadarId !== null}
                >
                  {deletingRadarId === radar.id ? "A eliminar..." : "🗑"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

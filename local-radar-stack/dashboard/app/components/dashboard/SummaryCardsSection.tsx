import { useMemo } from "react";
import { RoomRow, EventRow, Patient, WatchlistRow } from "../../types/domain";

interface Props {
  uniqueRooms: RoomRow[];
  roomStatus: (room: RoomRow) => "ok" | "warn" | "alert";
  patients: Patient[];
  unassignedOnlineRadars: number;
  fallAlerts: EventRow[];
  watchlist: WatchlistRow[];
}

export function SummaryCardsSection({ uniqueRooms, roomStatus, patients, unassignedOnlineRadars, fallAlerts, watchlist }: Props) {
  const summaryCards = useMemo(
    () => [
      { label: "Necessita Atenção", value: uniqueRooms.filter((room) => roomStatus(room) !== "ok").length },
      { label: "Quartos", value: uniqueRooms.length },
      { label: "Pacientes", value: patients.length },
      { label: "Radares Online Não Atribuídos", value: unassignedOnlineRadars },
      { label: "Quedas Registadas", value: fallAlerts.length },
      { label: "Lista de Vigilância Alta/Crítica", value: watchlist.filter((entry) => entry.risk_score >= 50).length }
    ],
    [fallAlerts.length, patients.length, roomStatus, unassignedOnlineRadars, uniqueRooms, watchlist]
  );

  return (
    <section className="panel">
      <h2>Resumo Geral</h2>
      <div className="grid stats">
        {summaryCards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="stat-value">{card.value}</div>
            <div className="stat-label">{card.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

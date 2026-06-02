"use client";

import { apiFetch } from "../../utils/api";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HeatmapSection } from "../../components/patients/HeatmapSection";
import { RequireFeature } from "../../components/auth/RequireFeature";

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

type PatientDetailResponse = {
  patient: { id: number; name: string; room_id?: number | null; room_name?: string | null };
  events: Array<{ id: number; timestamp: string; type: string; duration: number }>;
  dailyStats: Array<{
    date: string;
    total_distance: number;
    falls_count: number;
    avg_walking_speed: number;
    avg_gait_stability: number;
    avg_posture_stability: number;
    room_id?: number;
  }>;
  zones: Array<{ id: string; name: string; type: string; polygon: any[]; color?: string }>;
  room: { id: number; radar_id?: string | null; metadata?: Record<string, any> } | null;
};

export default function PatientPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<PatientDetailResponse | null>(null);

  useEffect(() => {
    const fetchData = () => {
      apiFetch(`/monitor/patients/${params.id}`)
        .then((res) => res.ok ? res.json() : Promise.reject(new Error("Failed to load patient details")))
        .then((json) => setData(json))
        .catch(err => console.error("Failed to fetch patient details", err));
    };

    fetchData();
    // Poll every 5 minutes to keep stats fresh
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [params.id]);

  if (!data) {
    return <main className="container"><div className="panel">A carregar detalhes do paciente...</div></main>;
  }

  return (
    <RequireFeature feature="patient_detail">
    <main className="container">
      <Link href="/">← Voltar ao Painel Principal</Link>
      <section className="panel">
        <h1>{data.patient.name}</h1>
        <p>Quarto: {data.patient.room_name ?? "Não Atribuído"}</p>
      </section>

      {data.patient.room_id && (
        <HeatmapSection 
          patientId={data.patient.id} 
          zones={data.zones} 
          room={data.room} 
          radarId={data.room?.radar_id ?? undefined}
        />
      )}

      <section className="panel">
        <div className="flex justify-between items-center mb-4">
          <h2>Estatísticas Diárias</h2>
          <span className="muted text-xs">Atualizado a cada 5 min</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Distância (m)</th>
              <th>Quedas</th>
              <th>Vel. Média (m/s)</th>
              <th title="Variância da velocidade e oscilação lateral. Valores mais baixos indicam uma marcha rítmica e estável. Valores altos podem indicar risco de queda ou fragilidade.">
                Estabilidade da Marcha ⓘ
              </th>
              <th title="Medição da oscilação do tronco (sway) em repouso. Valores baixos indicam bom controlo postural. Aumento na oscilação é um precursor clínico de quedas iminentes.">
                Estabilidade da Postura ⓘ
              </th>
            </tr>
          </thead>
          <tbody>
            {data.dailyStats.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center' }} className="muted">Sem dados estatísticos para este paciente.</td></tr>
            ) : (
              data.dailyStats.map((row) => {
                const dateObj = new Date(row.date);
                const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${dateObj.getFullYear()}`;
                return (
                  <tr key={row.date}>
                    <td>{formattedDate}</td>
                    <td>{row.total_distance.toFixed(2)}</td>
                    <td>{row.falls_count}</td>
                    <td>{row.avg_walking_speed.toFixed(3)}</td>
                    <td style={{ color: row.avg_gait_stability > 0.15 ? '#e11d48' : 'inherit' }}>
                      {row.avg_gait_stability.toFixed(3)}
                    </td>
                    <td style={{ color: row.avg_posture_stability > 0.05 ? '#e11d48' : 'inherit' }}>
                      {row.avg_posture_stability.toFixed(3)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800">
          <strong>Legenda Clínica:</strong>
          <ul className="mt-2 space-y-1 list-disc ml-4">
            <li><strong>Estabilidade da Marcha:</strong> Mede a consistência rítmica da caminhada. Valores {'>'} 0.150 sugerem irregularidade na passada.</li>
            <li><strong>Estabilidade da Postura:</strong> Mede a oscilação corporal (sway). Valores {'>'} 0.050 indicam instabilidade postural em pé/sentado.</li>
          </ul>
        </div>
      </section>

      <section className="panel">
        <h2>Histórico de Quedas</h2>
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Tipo</th>
              <th>Duração</th>
            </tr>
          </thead>
          <tbody>
            {data.events.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign: 'center' }} className="muted">Sem eventos registados.</td></tr>
            ) : (
              data.events.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.timestamp).toLocaleString()}</td>
                  <td>{eventTypeLabel(event.type)}</td>
                  <td>{event.duration}s</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
    </RequireFeature>
  );
}

function eventTypeLabel(type: string): string {
  if (type === "fall") return "Queda Detetada";
  if (type === "anomaly") return "Anomalia Comportamental";
  if (type === "departure") return "Saída de Zona";
  if (type === "arrival") return "Entrada em Zona";
  if (type === "staff_entry") return "Presença da Equipa";
  return type.replace(/_/g, ' ').toUpperCase();
}

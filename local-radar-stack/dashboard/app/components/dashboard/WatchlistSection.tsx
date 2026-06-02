import Link from "next/link";
import { useState } from "react";
import { WatchlistRow } from "../../types/domain";

interface Props {
  watchlist: WatchlistRow[];
  updateRiskProfile: (patientId: number, riskProfile: any) => Promise<void>;
}

function getScoreColor(score: number) {
  // Hue: 120 (green) -> 60 (yellow) -> 0 (red)
  const hue = Math.max(0, Math.min(120, 120 * (1 - score / 100)));
  return `hsl(${hue}, 75%, 45%)`;
}

export function WatchlistSection({ watchlist, updateRiskProfile }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editScore, setEditScore] = useState<number>(0);
  const [editChecks, setEditChecks] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const startEdit = (row: WatchlistRow) => {
    setEditingId(row.patient_id);
    setEditScore(row.risk_score);
    setEditChecks(row.proactive_checks.join("\n"));
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (patientId: number) => {
    setSaving(true);
    try {
      const manualChecks = editChecks.split("\n").map(s => s.trim()).filter(s => s.length > 0);
      await updateRiskProfile(patientId, {
        manualRiskScore: editScore,
        manualProactiveChecks: manualChecks
      });
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  const resetToAutomatic = async (patientId: number) => {
    setSaving(true);
    try {
      await updateRiskProfile(patientId, {
        manualRiskScore: null,
        manualProactiveChecks: null
      });
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel watchlist-panel">
      <div className="panel-title-row">
        <h2>Lista de Vigilância de Risco</h2>
        <span className="muted">Pontuação de prevenção baseada em instabilidade da marcha, anomalias e histórico de quedas.</span>
      </div>

      {watchlist.length === 0 ? (
        <p className="muted">Dados da lista de vigilância ainda não disponíveis.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Quarto</th>
                <th>Pontuação</th>
                <th>Quedas 30d</th>
                <th>Anomalias 14d</th>
                <th>Verificações</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {watchlist.slice(0, 12).map((row) => {
                const isEditing = editingId === row.patient_id;
                const isManual = row.manual_risk_score != null || row.manual_proactive_checks != null;

                return (
                  <tr key={`watch-${row.patient_id}`} className={isEditing ? "editing-row" : ""}>
                    <td>
                      <Link href={`/patients/${row.patient_id}`}>{row.patient_name}</Link>
                      {isManual && !isEditing && <span className="manual-indicator" title="Valores manuais aplicados"> (M)</span>}
                    </td>
                    <td>{row.room_name ?? "Unassigned"}</td>
                    <td>
                      {isEditing ? (
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={editScore}
                          onChange={(e) => setEditScore(parseInt(e.target.value) || 0)}
                          className="edit-score-input"
                        />
                      ) : (
                        <span
                          className="watchlist-score"
                          style={{ 
                            backgroundColor: getScoreColor(row.risk_score),
                            color: "white",
                            borderColor: "rgba(0,0,0,0.1)"
                          }}
                        >
                          {row.risk_score}
                        </span>
                      )}
                    </td>
                    <td>{row.falls_30d}</td>
                    <td>{row.anomalies_14d}</td>
                    <td>
                      {isEditing ? (
                        <textarea
                          value={editChecks}
                          onChange={(e) => setEditChecks(e.target.value)}
                          placeholder="Uma verificação por linha..."
                          className="edit-checks-area"
                        />
                      ) : (
                        <div className="checks-cell">
                          {row.proactive_checks.length > 0 ? (
                            <ul className="mini-checks-list">
                              {row.proactive_checks.slice(0, 2).map((check, i) => (
                                <li key={i}>{check}</li>
                              ))}
                              {row.proactive_checks.length > 2 && <li className="more-checks">+{row.proactive_checks.length - 2} mais...</li>}
                            </ul>
                          ) : (
                            <span className="muted">Nenhuma verificação</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <div className="edit-actions">
                          <button onClick={() => void saveEdit(row.patient_id)} disabled={saving} className="save-btn">
                            {saving ? "..." : "Guardar"}
                          </button>
                          <button onClick={cancelEdit} disabled={saving} className="cancel-btn">
                            X
                          </button>
                          {isManual && (
                            <button onClick={() => void resetToAutomatic(row.patient_id)} disabled={saving} className="reset-btn" title="Reset para Automático">
                              Auto
                            </button>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => startEdit(row)} className="edit-trigger-btn">
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

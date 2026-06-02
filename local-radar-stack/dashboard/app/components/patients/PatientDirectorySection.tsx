import Link from "next/link";
import { Patient, RoomRow } from "../../types/domain";

interface Props {
  patients: Patient[];
  roomOptions: RoomRow[];
  selectedRoomByPatient: Record<number, string>;
  setSelectedRoomByPatient: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  assignPatientRoom: (patient: Patient) => Promise<void>;
  deletePatient: (patient: Patient) => Promise<void>;
  assigningPatientId: number | null;
  deletingPatientId: number | null;
  markInteracting: () => void;
}

export function PatientDirectorySection({
  patients,
  roomOptions,
  selectedRoomByPatient,
  setSelectedRoomByPatient,
  assignPatientRoom,
  deletePatient,
  assigningPatientId,
  deletingPatientId,
  markInteracting
}: Props) {
  return (
    <section className="panel">
      <h2>Diretório de Pacientes</h2>
      {patients.length === 0 ? (
        <p className="muted">Nenhum paciente criado.</p>
      ) : (
        <div className="patient-assignment-list">
          {patients.map((patient) => (
            <div className="patient-assignment-row" key={patient.id}>
              <div>
                <div>
                  <Link href={`/patients/${patient.id}`}>{patient.name}</Link>
                </div>
                <div className="muted">Atual: {patient.room_name ?? "Não Atribuído"}</div>
              </div>
              <select
                value={selectedRoomByPatient[patient.id] ?? (patient.room_id === null ? "" : String(patient.room_id))}
                onFocus={markInteracting}
                onMouseDown={markInteracting}
                onChange={(event) => {
                  markInteracting();
                  setSelectedRoomByPatient((prev) => ({
                    ...prev,
                    [patient.id]: event.target.value
                  }));
                }}
              >
                <option value="">Quarto não atribuído</option>
                {roomOptions.map((room) => (
                  <option key={room.id} value={room.id}>
                    {`Piso ${room.floor} - ${room.name}`}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void assignPatientRoom(patient)}
                disabled={assigningPatientId !== null}
              >
                {assigningPatientId === patient.id ? "A atualizar..." : "Atualizar quarto"}
              </button>
              <button
                className="danger-btn"
                onClick={() => void deletePatient(patient)}
                disabled={deletingPatientId !== null || assigningPatientId !== null}
              >
                {deletingPatientId === patient.id ? "A eliminar..." : "🗑 Eliminar paciente"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

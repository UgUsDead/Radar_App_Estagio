import { Patient, RoomRow } from "../../types/domain";

interface Props {
  newPatientName: string;
  setNewPatientName: (value: string) => void;
  newPatientRoomId: string;
  setNewPatientRoomId: (value: string) => void;
  creatingPatient: boolean;
  createPatient: () => Promise<void>;
  roomOptions: RoomRow[];
}

export function PatientManagementSection({
  newPatientName,
  setNewPatientName,
  newPatientRoomId,
  setNewPatientRoomId,
  creatingPatient,
  createPatient,
  roomOptions
}: Props) {
  return (
    <div className="management-card">
      <h3>Criar Paciente</h3>
      <div className="management-form-row">
        <input
          type="text"
          placeholder="Nome do paciente"
          value={newPatientName}
          onChange={(event) => setNewPatientName(event.target.value)}
        />
      </div>
      <div className="management-form-row">
        <select
          value={newPatientRoomId}
          onChange={(event) => setNewPatientRoomId(event.target.value)}
        >
          <option value="">Quarto não atribuído</option>
          {roomOptions.map((room) => (
            <option key={room.id} value={room.id}>
              {`Piso ${room.floor} - ${room.name}`}
            </option>
          ))}
        </select>
      </div>
      <button onClick={() => void createPatient()} disabled={creatingPatient}>
        {creatingPatient ? "A criar paciente..." : "Criar paciente"}
      </button>
    </div>
  );
}

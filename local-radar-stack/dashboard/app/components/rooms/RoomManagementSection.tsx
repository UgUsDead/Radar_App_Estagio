interface Props {
  newRoomName: string;
  setNewRoomName: (value: string) => void;
  newRoomFloor: string;
  setNewRoomFloor: (value: string) => void;
  newRoomNotes: string;
  setNewRoomNotes: (value: string) => void;
  creatingRoom: boolean;
  createRoom: () => Promise<void>;
}

export function RoomManagementSection({
  newRoomName,
  setNewRoomName,
  newRoomFloor,
  setNewRoomFloor,
  newRoomNotes,
  setNewRoomNotes,
  creatingRoom,
  createRoom
}: Props) {
  return (
    <div className="management-card">
      <h3>Criar Quarto</h3>
      <div className="management-form-row">
        <label>Nome do quarto</label>
        <input
          type="text"
          placeholder="Ex: Quarto 101"
          value={newRoomName}
          onChange={(event) => setNewRoomName(event.target.value)}
        />
      </div>
      <div className="management-form-row">
        <label>Piso</label>
        <input
          type="number"
          placeholder="1"
          value={newRoomFloor}
          onChange={(event) => setNewRoomFloor(event.target.value)}
        />
      </div>
      <div className="management-form-row">
        <label>Notas (opcional)</label>
        <input
          type="text"
          placeholder="..."
          value={newRoomNotes}
          onChange={(event) => setNewRoomNotes(event.target.value)}
        />
      </div>
      <button onClick={() => void createRoom()} disabled={creatingRoom}>
        {creatingRoom ? "A criar quarto..." : "Criar quarto"}
      </button>
    </div>
  );
}

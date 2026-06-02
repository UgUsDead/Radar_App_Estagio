import { EventRow } from "../../types/domain";

interface ResolutionData {
  notes: string;
  intervention_type: string;
  root_cause: string;
}

interface Props {
  resolvingEvent: EventRow | null;
  resolutionData: ResolutionData;
  setResolvingEvent: (event: EventRow | null) => void;
  setResolutionData: (data: ResolutionData) => void;
  confirmResolution: () => Promise<void>;
}

export function ResolutionModal({
  resolvingEvent,
  resolutionData,
  setResolvingEvent,
  setResolutionData,
  confirmResolution
}: Props) {
  if (!resolvingEvent) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>Resolver Alerta Clínico</h3>
        <p className="muted">Quarto: {resolvingEvent.room_name} · Paciente: {resolvingEvent.patient_name}</p>
        
        <div className="form-group">
          <label>Tipo de Intervenção</label>
          <select 
            value={resolutionData.intervention_type} 
            onChange={e => setResolutionData({...resolutionData, intervention_type: e.target.value})}
          >
            <option>Ajudou o paciente a voltar para a cama</option>
            <option>Ajudou o paciente a sentar-se na cadeira</option>
            <option>Avaliação médica realizada</option>
            <option>Verificação de sinais vitais</option>
            <option>Família notificada</option>
            <option>Falso alarme - erro de sensor</option>
            <option>Falso alarme - movimento sem queda</option>
          </select>
        </div>

        <div className="form-group">
          <label>Causa Raiz</label>
          <select 
            value={resolutionData.root_cause} 
            onChange={e => setResolutionData({...resolutionData, root_cause: e.target.value})}
          >
            <option>Instabilidade física</option>
            <option>Tonturas / Hipotensão Ortostática</option>
            <option>Fator ambiental (perigo de tropeço)</option>
            <option>Calçado inadequado</option>
            <option>Interação medicamentosa</option>
            <option>Confusão cognitiva</option>
            <option>Necessidade urgente de ir à casa de banho</option>
            <option>Desconhecida</option>
          </select>
        </div>

        <div className="form-group">
          <label>Notas Clínicas</label>
          <textarea 
            placeholder="Detalhes da intervenção..."
            value={resolutionData.notes}
            onChange={e => setResolutionData({...resolutionData, notes: e.target.value})}
          />
        </div>

        <div className="modal-actions">
          <button onClick={() => setResolvingEvent(null)}>Cancelar</button>
          <button className="primary" onClick={() => void confirmResolution()}>Confirmar Resolução</button>
        </div>
      </div>
    </div>
  );
}

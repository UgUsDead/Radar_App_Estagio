import React from 'react';
import { ZoneBehavior, ZonePriority } from '../../types/zones';

interface Props {
  zoneDraftName: string;
  setZoneDraftName: (v: string) => void;
  zoneDraftBehavior: ZoneBehavior;
  setZoneDraftBehavior: (v: ZoneBehavior) => void;
  zoneDraftColor: string;
  setZoneDraftColor: (v: string) => void;
  showColorPalette: boolean;
  setShowColorPalette: (v: boolean) => void;
  zoneDraftPriority: ZonePriority;
  setZoneDraftPriority: (v: ZonePriority) => void;
  zoneDraftTriggersAlert: boolean;
  setZoneDraftTriggersAlert: (v: boolean) => void;
  zoneDraftSchedule: { startHour: number; endHour: number };
  setZoneDraftSchedule: (v: { startHour: number; endHour: number }) => void;
  zoneDraftDwellMinutes: number;
  setZoneDraftDwellMinutes: (v: number) => void;
  upsertZoneDraft: () => void;
  resetZoneDraft: () => void;
  editingZoneId: string | null;
  saveZonesForRadar: () => Promise<void>;
  zonesBusy: boolean;
  selectedZoneRadarId: string;
  zoneMessage: string;
}

const COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#4b5563'
];

export function ZoneDraftForm({
  zoneDraftName, setZoneDraftName,
  zoneDraftBehavior, setZoneDraftBehavior,
  zoneDraftColor, setZoneDraftColor,
  showColorPalette, setShowColorPalette,
  zoneDraftPriority, setZoneDraftPriority,
  zoneDraftTriggersAlert, setZoneDraftTriggersAlert,
  zoneDraftSchedule, setZoneDraftSchedule,
  zoneDraftDwellMinutes, setZoneDraftDwellMinutes,
  upsertZoneDraft, resetZoneDraft, editingZoneId,
  saveZonesForRadar, zonesBusy, selectedZoneRadarId, zoneMessage
}: Props) {
  return (
    <div className="zone-draft-form">
      <div className="form-group">
        <label>Nome da Zona</label>
        <input 
          type="text" 
          value={zoneDraftName} 
          onChange={e => setZoneDraftName(e.target.value)}
          placeholder="Ex: Cama, Casa de Banho..."
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Comportamento</label>
          <select 
            value={zoneDraftBehavior} 
            onChange={e => setZoneDraftBehavior(e.target.value as ZoneBehavior)}
          >
            <option value="none">Passiva (Apenas Visual)</option>
            <option value="arrival">Chegada (Alerta na entrada)</option>
            <option value="departure">Saída (Alerta na saída)</option>
            <option value="transition">Transição (Alerta no movimento)</option>
            <option value="dwell">Permanência (Alerta após tempo)</option>
          </select>
        </div>

        <div className="form-group">
          <label>Cor</label>
          <div className="color-picker-wrapper">
            <button 
              className="color-preview" 
              style={{ backgroundColor: zoneDraftColor }}
              onClick={() => setShowColorPalette(!showColorPalette)}
            />
            {showColorPalette && (
              <div className="color-palette">
                {COLORS.map(c => (
                  <div 
                    key={c} 
                    className="color-swatch" 
                    style={{ backgroundColor: c }}
                    onClick={() => { setZoneDraftColor(c); setShowColorPalette(false); }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {zoneDraftBehavior === 'dwell' && (
        <div className="form-group">
          <label>Tempo de Permanência (minutos)</label>
          <input 
            type="number" 
            value={zoneDraftDwellMinutes}
            onChange={e => setZoneDraftDwellMinutes(Number(e.target.value))}
          />
        </div>
      )}

      <div className="form-row">
        <div className="form-group">
          <label>Prioridade do Alerta</label>
          <select 
            value={zoneDraftPriority} 
            onChange={e => setZoneDraftPriority(e.target.value as ZonePriority)}
          >
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
          </select>
        </div>

        <div className="form-group toggle-group">
          <label>Ativar Alertas</label>
          <input 
            type="checkbox" 
            checked={zoneDraftTriggersAlert}
            onChange={e => setZoneDraftTriggersAlert(e.target.checked)}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Horário de Monitorização ({zoneDraftSchedule.startHour}h - {zoneDraftSchedule.endHour}h)</label>
        <div className="range-inputs">
          <input 
            type="range" min="0" max="23" 
            value={zoneDraftSchedule.startHour}
            onChange={e => setZoneDraftSchedule({ ...zoneDraftSchedule, startHour: Number(e.target.value) })}
          />
          <input 
            type="range" min="0" max="23" 
            value={zoneDraftSchedule.endHour}
            onChange={e => setZoneDraftSchedule({ ...zoneDraftSchedule, endHour: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="form-actions">
        <button className="secondary" onClick={resetZoneDraft}>Cancelar</button>
        <button className="primary" onClick={upsertZoneDraft}>
          {editingZoneId ? 'Atualizar Zona' : 'Adicionar Zona'}
        </button>
      </div>

      <hr />

      <button 
        className="save-button" 
        onClick={() => void saveZonesForRadar()} 
        disabled={zonesBusy || !selectedZoneRadarId}
      >
        {zonesBusy ? 'A guardar...' : 'Guardar Alterações no Radar'}
      </button>

      {zoneMessage && <p className={`message ${zoneMessage.includes('sucesso') ? 'success' : 'error'}`}>{zoneMessage}</p>}
    </div>
  );
}

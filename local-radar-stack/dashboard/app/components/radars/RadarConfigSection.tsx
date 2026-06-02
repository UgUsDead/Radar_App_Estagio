"use client";

import { useState } from "react";
import type { RadarConfig, ConfigApplyState, ROIBox } from "../../types/radarConfig";
import { RADAR_CONFIG_LIMITS, RADAR_CONFIG_LABELS, DEFAULT_RADAR_CONFIG } from "../../types/radarConfig";

interface Props {
  radarConfig: RadarConfig;
  setRadarConfig: React.Dispatch<React.SetStateAction<RadarConfig>>;
  configApplyState: ConfigApplyState;
  loading: boolean;
  message: string;
  onApply: () => void;
  onRequestConfig: () => void;
  onSendRadarCommand: (cmd: string) => void;
  onResetApplyState: () => void;
}

// ── Helpers ──────────────────────────────────────────────

function NumberField({
  label,
  help,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  help?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rc-field">
      <label className="rc-field-label" title={help}>
        {label}
        {unit && <span className="rc-field-unit">({unit})</span>}
      </label>
      <div className="rc-field-input-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="rc-slider"
        />
        <div className="rc-number-controls">
          <button 
            type="button" 
            className="rc-step-btn" 
            onClick={() => onChange(Math.max(min, value - step))}
          >-</button>
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
            }}
            className="rc-number-input"
          />
          <button 
            type="button" 
            className="rc-step-btn" 
            onClick={() => onChange(Math.min(max, value + step))}
          >+</button>
        </div>
      </div>
      <div className="rc-field-range">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  label,
  help,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  help?: string;
  value: T;
  options: readonly T[];
  labels?: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="rc-field">
      <label className="rc-field-label" title={help}>{label}</label>
      <div className="rc-segmented">
        {options.map((opt) => (
          <button
            key={opt}
            className={`rc-segmented-btn ${value === opt ? "rc-segmented-btn--active" : ""}`}
            onClick={() => onChange(opt)}
            type="button"
          >
            {labels ? labels[opt] : opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function ROIBoxEditor({
  title,
  box,
  onChange,
}: {
  title: string;
  box: ROIBox;
  onChange: (b: ROIBox) => void;
}) {
  const L = RADAR_CONFIG_LIMITS.roi;
  const update = (field: keyof ROIBox, val: number) => onChange({ ...box, [field]: val });

  return (
    <div className="rc-roi-box">
      <h5 className="rc-roi-title">{title}</h5>
      <div className="rc-roi-grid">
        {(["x", "y", "z"] as const).map((axis) => {
          const limits = L[axis];
          return (
            <div key={axis} className="rc-roi-axis">
              <span className="rc-roi-axis-label">{axis.toUpperCase()}</span>
              <div className="rc-roi-minmax">
                <label>Min</label>
                <input
                  type="number"
                  step={0.1}
                  min={limits.min}
                  max={limits.max}
                  value={box[`${axis}Min` as keyof ROIBox]}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) update(`${axis}Min` as keyof ROIBox, v);
                  }}
                  className="rc-number-input rc-number-input--sm"
                />
              </div>
              <div className="rc-roi-minmax">
                <label>Max</label>
                <input
                  type="number"
                  step={0.1}
                  min={limits.min}
                  max={limits.max}
                  value={box[`${axis}Max` as keyof ROIBox]}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) update(`${axis}Max` as keyof ROIBox, v);
                  }}
                  className="rc-number-input rc-number-input--sm"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────

export function RadarConfigSection({
  radarConfig,
  setRadarConfig,
  configApplyState,
  loading,
  message,
  onApply,
  onRequestConfig,
  onSendRadarCommand,
  onResetApplyState,
}: Props) {
  const [showJson, setShowJson] = useState(false);
  const [jsonImport, setJsonImport] = useState("");
  const [jsonError, setJsonError] = useState("");

  const L = RADAR_CONFIG_LIMITS;
  const LBL = RADAR_CONFIG_LABELS;

  const updateMount = (field: string, value: number) =>
    setRadarConfig((prev) => ({ ...prev, mount: { ...prev.mount, [field]: value } }));

  const updateFov = (field: string, value: number) =>
    setRadarConfig((prev) => ({ ...prev, fov: { ...prev.fov, [field]: value } }));

  const updateDetection = (field: string, value: string | boolean) =>
    setRadarConfig((prev) => ({ ...prev, detection: { ...prev.detection, [field]: value } }));

  const updateTracking = (field: string, value: string) =>
    setRadarConfig((prev) => ({ ...prev, tracking: { ...prev.tracking, [field]: value } }));

  const updateTiming = (field: string, value: number) =>
    setRadarConfig((prev) => ({ ...prev, timing: { ...prev.timing, [field]: value } }));

  const updateROI = (boxName: "tracking" | "static" | "presence", box: ROIBox) =>
    setRadarConfig((prev) => ({ ...prev, roi: { ...prev.roi, [boxName]: box } }));

  const isApplying = configApplyState === "publishing" || configApplyState === "applying" || configApplyState === "accepted";
  const showSuccess = configApplyState === "applied";
  const showError = configApplyState === "rejected" || configApplyState === "failed";

  const handleJsonImport = () => {
    try {
      const parsed = JSON.parse(jsonImport);
      setRadarConfig(prev => ({ ...prev, ...parsed }));
      setJsonError("");
      setShowJson(false);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "JSON inválido");
    }
  };

  return (
    <div className="rc-section">
      <div className="rc-header">
        <h4 className="rc-title">Configuração Avançada do Radar</h4>
        <div className="rc-header-actions">
          <button type="button" className="rc-action-btn" onClick={() => {
            setJsonImport(JSON.stringify(radarConfig, null, 2));
            setShowJson(true);
          }}>
            JSON Export / Import
          </button>
          <button type="button" className="rc-action-btn rc-action-btn--secondary" onClick={() => {
            setRadarConfig(DEFAULT_RADAR_CONFIG);
            onResetApplyState();
          }}>
            Repor Valores
          </button>
          <button type="button" className="rc-action-btn rc-action-btn--secondary" onClick={onRequestConfig} disabled={loading}>
            Carregar Atual
          </button>
        </div>
      </div>

      {showJson && (
        <div className="rc-json-modal">
          <div className="rc-json-content">
            <div className="rc-json-header">
              <h5>Importar / Exportar JSON</h5>
              <button className="rc-close-btn" onClick={() => setShowJson(false)}>✕</button>
            </div>
            <textarea
              className="rc-json-textarea"
              value={jsonImport}
              onChange={(e) => setJsonImport(e.target.value)}
              rows={15}
            />
            {jsonError && <div className="rc-error-msg">{jsonError}</div>}
            <div className="rc-json-actions">
              <button className="rc-action-btn rc-action-btn--secondary" onClick={() => navigator.clipboard.writeText(JSON.stringify(radarConfig, null, 2))}>
                Copiar
              </button>
              <button className="rc-action-btn" onClick={handleJsonImport}>
                Importar
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className={`rc-status-msg rc-status-msg--${configApplyState}`}>
          {message}
        </div>
      )}

      {/* ── Mount ───────────────────────────────────────── */}
      <fieldset className="rc-fieldset">
        <legend className="rc-legend">🔧 Montagem</legend>
        <NumberField
          label={LBL["mount.heightM"].label}
          help={LBL["mount.heightM"].help}
          value={radarConfig.mount.heightM}
          min={L.mount.heightM.min}
          max={L.mount.heightM.max}
          step={L.mount.heightM.step}
          unit="m"
          onChange={(v) => updateMount("heightM", v)}
        />
        <NumberField
          label={LBL["mount.azimuthTiltDeg"].label}
          help={LBL["mount.azimuthTiltDeg"].help}
          value={radarConfig.mount.azimuthTiltDeg}
          min={L.mount.azimuthTiltDeg.min}
          max={L.mount.azimuthTiltDeg.max}
          step={L.mount.azimuthTiltDeg.step}
          unit="°"
          onChange={(v) => updateMount("azimuthTiltDeg", v)}
        />
        <NumberField
          label={LBL["mount.elevationTiltDeg"].label}
          help={LBL["mount.elevationTiltDeg"].help}
          value={radarConfig.mount.elevationTiltDeg}
          min={L.mount.elevationTiltDeg.min}
          max={L.mount.elevationTiltDeg.max}
          step={L.mount.elevationTiltDeg.step}
          unit="°"
          onChange={(v) => updateMount("elevationTiltDeg", v)}
        />
      </fieldset>

      {/* ── FOV ─────────────────────────────────────────── */}
      <fieldset className="rc-fieldset">
        <legend className="rc-legend">📐 Campo de Visão</legend>
        <NumberField
          label={LBL["fov.azimuthDeg"].label}
          help={LBL["fov.azimuthDeg"].help}
          value={radarConfig.fov.azimuthDeg}
          min={L.fov.azimuthDeg.min}
          max={L.fov.azimuthDeg.max}
          step={L.fov.azimuthDeg.step}
          unit="°"
          onChange={(v) => updateFov("azimuthDeg", v)}
        />
        <NumberField
          label={LBL["fov.elevationDeg"].label}
          help={LBL["fov.elevationDeg"].help}
          value={radarConfig.fov.elevationDeg}
          min={L.fov.elevationDeg.min}
          max={L.fov.elevationDeg.max}
          step={L.fov.elevationDeg.step}
          unit="°"
          onChange={(v) => updateFov("elevationDeg", v)}
        />
      </fieldset>

      {/* ── ROI ─────────────────────────────────────────── */}
      <fieldset className="rc-fieldset">
        <legend className="rc-legend">📦 Regiões de Interesse (ROI)</legend>
        <ROIBoxEditor title="Tracking" box={radarConfig.roi.tracking} onChange={(b) => updateROI("tracking", b)} />
        <ROIBoxEditor title="Estático" box={radarConfig.roi.static} onChange={(b) => updateROI("static", b)} />
        <ROIBoxEditor title="Presença" box={radarConfig.roi.presence} onChange={(b) => updateROI("presence", b)} />
      </fieldset>

      {/* ── Detection ───────────────────────────────────── */}
      <fieldset className="rc-fieldset">
        <legend className="rc-legend">🎯 Deteção</legend>
        <SegmentedControl
          label={LBL["detection.dynamicSensitivity"].label}
          help={LBL["detection.dynamicSensitivity"].help}
          value={radarConfig.detection.dynamicSensitivity}
          options={["low", "normal", "high"] as const}
          labels={{ low: "Baixa", normal: "Normal", high: "Alta" }}
          onChange={(v) => updateDetection("dynamicSensitivity", v)}
        />
        <SegmentedControl
          label={LBL["detection.staticSensitivity"].label}
          help={LBL["detection.staticSensitivity"].help}
          value={radarConfig.detection.staticSensitivity}
          options={["low", "normal", "high"] as const}
          labels={{ low: "Baixa", normal: "Normal", high: "Alta" }}
          onChange={(v) => updateDetection("staticSensitivity", v)}
        />
        <div className="rc-field">
          <label className="rc-field-label" title={LBL["detection.fineMotion"].help}>
            {LBL["detection.fineMotion"].label}
          </label>
          <label className="rc-toggle">
            <input
              type="checkbox"
              checked={radarConfig.detection.fineMotion}
              onChange={(e) => updateDetection("fineMotion", e.target.checked)}
            />
            <span className="rc-toggle-slider" />
            <span className="rc-toggle-label">
              {radarConfig.detection.fineMotion ? "Ativo" : "Inativo"}
            </span>
          </label>
        </div>
      </fieldset>

      {/* ── Tracking ────────────────────────────────────── */}
      <fieldset className="rc-fieldset">
        <legend className="rc-legend">📍 Tracking</legend>
        <SegmentedControl
          label={LBL["tracking.mode"].label}
          help={LBL["tracking.mode"].help}
          value={radarConfig.tracking.mode}
          options={["stable", "balanced", "responsive"] as const}
          labels={{ stable: "Estável", balanced: "Equilibrado", responsive: "Responsivo" }}
          onChange={(v) => updateTracking("mode", v)}
        />
      </fieldset>

      {/* ── Timing ──────────────────────────────────────── */}
      <fieldset className="rc-fieldset">
        <legend className="rc-legend">⏱ Temporização</legend>
        <NumberField
          label={LBL["timing.framePeriodMs"].label}
          help={LBL["timing.framePeriodMs"].help}
          value={radarConfig.timing.framePeriodMs}
          min={L.timing.framePeriodMs.min}
          max={L.timing.framePeriodMs.max}
          step={L.timing.framePeriodMs.step}
          unit="ms"
          onChange={(v) => updateTiming("framePeriodMs", v)}
        />
      </fieldset>

      {/* ── Actions ─────────────────────────────────────── */}
      <div className="rc-apply-row">
        <button
          type="button"
          className={`rc-apply-btn ${showSuccess ? "rc-apply-btn--success" : showError ? "rc-apply-btn--error" : ""}`}
          onClick={onApply}
          disabled={isApplying}
        >
          {isApplying
            ? "⏳ A aplicar..."
            : showSuccess
              ? "✓ Aplicado — Reenviar"
              : showError
                ? "✗ Falhou — Tentar novamente"
                : "Aplicar Configuração"}
        </button>

        <button
          type="button"
          className="rc-action-btn rc-action-btn--warn"
          onClick={() => onSendRadarCommand("default_config")}
          disabled={loading || isApplying}
          title="Repor configuração de fábrica no dispositivo"
        >
          Repor Fábrica
        </button>
      </div>

      {message && (
        <p className={`rc-message ${showSuccess ? "rc-message--success" : showError ? "rc-message--error" : ""}`}>
          {message}
        </p>
      )}
    </div>
  );
}

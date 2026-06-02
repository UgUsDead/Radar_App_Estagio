/**
 * RadarConfigScreen.tsx — Simplified radar config screen for mobile.
 *
 * Exposes a subset of radar configuration parameters:
 * - Mount height, elevation tilt
 * - Dynamic/Static sensitivity
 * - Fine motion toggle
 * - Tracking mode
 * - Apply / Reset to Default / Restart Radar
 */

import React, {useState, useCallback, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Switch,
  Modal,
  Platform,
  StatusBar,
} from 'react-native';
import Slider from '@react-native-community/slider';
import type {RadarFirmwareConfig, DeviceFirmwareState} from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  currentRadarId: string | null;
  firmwareState: DeviceFirmwareState;
  onPublishConfig: (config: Partial<RadarFirmwareConfig>) => void;
  onSendRadarCommand: (cmd: string) => void;
  onRequestConfig?: () => void;
}

const DEFAULT_SIMPLIFIED: Partial<RadarFirmwareConfig> = {
  schema: 1,
  mount: {heightM: 2.0, azimuthTiltDeg: 0, elevationTiltDeg: 15},
  detection: {dynamicSensitivity: 'normal', staticSensitivity: 'normal', fineMotion: true},
  tracking: {mode: 'stable'},
};

type SensitivityLevel = 'low' | 'normal' | 'high';
type TrackingMode = 'stable' | 'balanced' | 'responsive';

const SENSITIVITY_OPTIONS: {value: SensitivityLevel; label: string}[] = [
  {value: 'low', label: 'Baixa'},
  {value: 'normal', label: 'Normal'},
  {value: 'high', label: 'Alta'},
];

const TRACKING_OPTIONS: {value: TrackingMode; label: string}[] = [
  {value: 'stable', label: 'Estável'},
  {value: 'balanced', label: 'Equilibrado'},
  {value: 'responsive', label: 'Responsivo'},
];

const RadarConfigScreen: React.FC<Props> = ({
  visible,
  onClose,
  currentRadarId,
  firmwareState,
  onPublishConfig,
  onSendRadarCommand,
  onRequestConfig,
}) => {
  const [mountHeight, setMountHeight] = useState(2.0);
  const [elevationTilt, setElevationTilt] = useState(15);
  const [dynamicSens, setDynamicSens] = useState<SensitivityLevel>('normal');
  const [staticSens, setStaticSens] = useState<SensitivityLevel>('normal');
  const [fineMotion, setFineMotion] = useState(true);
  const [trackingMode, setTrackingMode] = useState<TrackingMode>('stable');
  const [fovAzimuth, setFovAzimuth] = useState(70);
  const [fovElevation, setFovElevation] = useState(70);
  const [framePeriodMs, setFramePeriodMs] = useState(55);
  const [applying, setApplying] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Populate from retained config state when available
  useEffect(() => {
    if (firmwareState.radarConfigState) {
      const cfg = firmwareState.radarConfigState;
      if (cfg.mount?.heightM) setMountHeight(cfg.mount.heightM);
      if (cfg.mount?.elevationTiltDeg !== undefined) setElevationTilt(cfg.mount.elevationTiltDeg);
      if (cfg.detection?.dynamicSensitivity) setDynamicSens(cfg.detection.dynamicSensitivity);
      if (cfg.detection?.staticSensitivity) setStaticSens(cfg.detection.staticSensitivity);
      if (cfg.detection?.fineMotion !== undefined) setFineMotion(cfg.detection.fineMotion);
      if (cfg.tracking?.mode) setTrackingMode(cfg.tracking.mode);
      if (cfg.fov?.azimuthDeg) setFovAzimuth(cfg.fov.azimuthDeg);
      if (cfg.fov?.elevationDeg) setFovElevation(cfg.fov.elevationDeg);
      if (cfg.timing?.framePeriodMs) setFramePeriodMs(cfg.timing.framePeriodMs);
    }
  }, [firmwareState.radarConfigState]);

  // Track config apply status
  useEffect(() => {
    const status = firmwareState.radarConfigStatus;
    if (!status || !applying) return;

    if (status === 'accepted') {
      setStatusMsg('Configuração aceite, a aplicar...');
    } else if (status === 'applied') {
      setStatusMsg('✓ Configuração aplicada com sucesso.');
      setApplying(false);
    } else if (status === 'failed' || status?.startsWith('rejected')) {
      setStatusMsg('✗ Falha ao aplicar configuração.');
      setApplying(false);
    }
  }, [firmwareState.radarConfigStatus, applying]);

  const handleApply = useCallback(() => {
    setApplying(true);
    setStatusMsg('A enviar configuração...');
    onPublishConfig({
      schema: 1,
      mount: {
        heightM: Math.round(mountHeight * 10) / 10,
        azimuthTiltDeg: 0,
        elevationTiltDeg: Math.round(elevationTilt),
      },
      fov: {
        azimuthDeg: Math.round(fovAzimuth),
        elevationDeg: Math.round(fovElevation),
      },
      detection: {
        dynamicSensitivity: dynamicSens,
        staticSensitivity: staticSens,
        fineMotion,
      },
      tracking: {mode: trackingMode},
      timing: {framePeriodMs: Math.round(framePeriodMs)},
      applyMode: 'restart',
      profile: 'aop_6m_static_retention',
    });
  }, [mountHeight, elevationTilt, fovAzimuth, fovElevation, dynamicSens, staticSens, fineMotion, trackingMode, framePeriodMs, onPublishConfig]);

  const handleResetDefaults = useCallback(() => {
    setMountHeight(2.0);
    setElevationTilt(15);
    setDynamicSens('normal');
    setStaticSens('normal');
    setFineMotion(true);
    setTrackingMode('stable');
    setFovAzimuth(70);
    setFovElevation(70);
    setFramePeriodMs(55);
    setStatusMsg('Valores predefinidos restaurados.');
  }, []);

  const SegmentedPicker = ({
    options,
    value,
    onChange,
  }: {
    options: {value: string; label: string}[];
    value: string;
    onChange: (v: any) => void;
  }) => (
    <View style={styles.segmented}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.segBtn, value === opt.value && styles.segBtnActive]}
          onPress={() => onChange(opt.value)}>
          <Text style={[styles.segBtnText, value === opt.value && styles.segBtnTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeBtn}>← Fechar</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Configuração do Radar</Text>
          <Text style={styles.subtitle}>
            {currentRadarId || 'Nenhum radar selecionado'}
          </Text>
          {firmwareState.availability === 'online' ? (
            <View style={styles.onlineBadge}>
              <Text style={styles.onlineBadgeText}>Online</Text>
            </View>
          ) : (
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineBadgeText}>Offline</Text>
            </View>
          )}
        </View>

        <ScrollView style={styles.body} contentContainerStyle={{paddingBottom: 40}}>
          {/* Mount */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🔧 Montagem</Text>

            <Text style={styles.fieldLabel}>
              Altura de montagem: {mountHeight.toFixed(1)} m
            </Text>
            <Slider
              style={styles.slider}
              minimumValue={0.5}
              maximumValue={6.0}
              step={0.1}
              value={mountHeight}
              onValueChange={setMountHeight}
              minimumTrackTintColor="#0f8f7f"
              maximumTrackTintColor="#333"
              thumbTintColor="#0f8f7f"
            />
            <View style={styles.rangeLabels}>
              <Text style={styles.rangeText}>0.5m</Text>
              <Text style={styles.rangeText}>6.0m</Text>
            </View>

            <Text style={styles.fieldLabel}>
              Inclinação de elevação: {elevationTilt}°
            </Text>
            <Slider
              style={styles.slider}
              minimumValue={-45}
              maximumValue={45}
              step={1}
              value={elevationTilt}
              onValueChange={setElevationTilt}
              minimumTrackTintColor="#0f8f7f"
              maximumTrackTintColor="#333"
              thumbTintColor="#0f8f7f"
            />
            <View style={styles.rangeLabels}>
              <Text style={styles.rangeText}>-45°</Text>
              <Text style={styles.rangeText}>45°</Text>
            </View>
          </View>

          {/* Detection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🎯 Deteção</Text>

            <Text style={styles.fieldLabel}>Sensibilidade dinâmica</Text>
            <SegmentedPicker
              options={SENSITIVITY_OPTIONS}
              value={dynamicSens}
              onChange={setDynamicSens}
            />

            <Text style={[styles.fieldLabel, {marginTop: 14}]}>Sensibilidade estática</Text>
            <SegmentedPicker
              options={SENSITIVITY_OPTIONS}
              value={staticSens}
              onChange={setStaticSens}
            />

            <View style={styles.toggleRow}>
              <Text style={styles.fieldLabel}>Movimento fino</Text>
              <Switch
                value={fineMotion}
                onValueChange={setFineMotion}
                trackColor={{false: '#333', true: '#0f8f7f'}}
                thumbColor={fineMotion ? '#fff' : '#888'}
              />
            </View>
          </View>

          {/* FOV */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📐 Campo de Visão</Text>

            <Text style={styles.fieldLabel}>
              FOV Horizontal: {fovAzimuth}°
            </Text>
            <Slider
              style={styles.slider}
              minimumValue={10}
              maximumValue={120}
              step={1}
              value={fovAzimuth}
              onValueChange={setFovAzimuth}
              minimumTrackTintColor="#0f8f7f"
              maximumTrackTintColor="#333"
              thumbTintColor="#0f8f7f"
            />
            <View style={styles.rangeLabels}>
              <Text style={styles.rangeText}>10°</Text>
              <Text style={styles.rangeText}>120°</Text>
            </View>

            <Text style={styles.fieldLabel}>
              FOV Vertical: {fovElevation}°
            </Text>
            <Slider
              style={styles.slider}
              minimumValue={10}
              maximumValue={120}
              step={1}
              value={fovElevation}
              onValueChange={setFovElevation}
              minimumTrackTintColor="#0f8f7f"
              maximumTrackTintColor="#333"
              thumbTintColor="#0f8f7f"
            />
            <View style={styles.rangeLabels}>
              <Text style={styles.rangeText}>10°</Text>
              <Text style={styles.rangeText}>120°</Text>
            </View>
          </View>

          {/* Tracking */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📍 Tracking</Text>
            <Text style={styles.fieldLabel}>Modo de tracking</Text>
            <SegmentedPicker
              options={TRACKING_OPTIONS}
              value={trackingMode}
              onChange={setTrackingMode}
            />
          </View>

          {/* Timing */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⏱ Temporização</Text>
            <Text style={styles.fieldLabel}>
              Período de frame: {Math.round(framePeriodMs)} ms
            </Text>
            <Slider
              style={styles.slider}
              minimumValue={40}
              maximumValue={250}
              step={5}
              value={framePeriodMs}
              onValueChange={setFramePeriodMs}
              minimumTrackTintColor="#0f8f7f"
              maximumTrackTintColor="#333"
              thumbTintColor="#0f8f7f"
            />
            <View style={styles.rangeLabels}>
              <Text style={styles.rangeText}>40ms (rápido)</Text>
              <Text style={styles.rangeText}>250ms (lento)</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actionsSection}>
            <TouchableOpacity
              style={[styles.applyBtn, applying && {opacity: 0.6}]}
              onPress={handleApply}
              disabled={applying || !currentRadarId}>
              {applying ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.applyBtnText}>Aplicar Configuração</Text>
              )}
            </TouchableOpacity>

            <View style={styles.secondaryActions}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleResetDefaults}>
                <Text style={styles.secondaryBtnText}>Valores Predefinidos</Text>
              </TouchableOpacity>

              {onRequestConfig && (
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={onRequestConfig}>
                  <Text style={styles.secondaryBtnText}>Carregar Atual</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => onSendRadarCommand('default_config')}>
                <Text style={styles.secondaryBtnText}>Repor Fábrica</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryBtn, styles.warnBtn]}
                onPress={() => onSendRadarCommand('restart')}>
                <Text style={[styles.secondaryBtnText, styles.warnBtnText]}>
                  Reiniciar Radar
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {statusMsg ? <Text style={styles.statusMsg}>{statusMsg}</Text> : null}

          {firmwareState.lastError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorTitle}>
                Erro — {firmwareState.lastError.context}
              </Text>
              <Text style={styles.errorText}>{firmwareState.lastError.error}</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingTop:
      Platform.OS === 'android'
        ? (StatusBar.currentHeight || 30) + 8
        : 50,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  closeBtn: {color: '#00aaff', fontSize: 15, marginBottom: 8},
  title: {fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 2},
  subtitle: {color: '#888', fontSize: 13},
  onlineBadge: {
    backgroundColor: '#0f8f7f',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  onlineBadgeText: {color: '#fff', fontSize: 11, fontWeight: '700'},
  offlineBadge: {
    backgroundColor: '#444',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  offlineBadgeText: {color: '#aaa', fontSize: 11, fontWeight: '700'},
  body: {flex: 1, paddingHorizontal: 16, paddingTop: 16},
  section: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  fieldLabel: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  slider: {width: '100%', height: 40},
  rangeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  rangeText: {color: '#555', fontSize: 11},
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    overflow: 'hidden',
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRightWidth: 1,
    borderRightColor: '#333',
  },
  segBtnActive: {
    backgroundColor: '#0f8f7f',
    borderRightColor: '#0f8f7f',
  },
  segBtnText: {color: '#888', fontSize: 13, fontWeight: '600'},
  segBtnTextActive: {color: '#fff'},
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  actionsSection: {marginTop: 4},
  applyBtn: {
    backgroundColor: '#0f8f7f',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  applyBtnText: {color: '#fff', fontSize: 15, fontWeight: '700'},
  secondaryActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  secondaryBtn: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#1a2233',
    borderWidth: 1,
    borderColor: '#335577',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryBtnText: {color: '#88cfff', fontSize: 12, fontWeight: '600'},
  warnBtn: {borderColor: '#664422', backgroundColor: '#221a11'},
  warnBtnText: {color: '#ffaa66'},
  statusMsg: {
    color: '#88ff88',
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  errorBanner: {
    marginTop: 14,
    backgroundColor: '#1a0000',
    borderWidth: 1,
    borderColor: '#440000',
    borderRadius: 10,
    padding: 12,
  },
  errorTitle: {color: '#ff6666', fontWeight: '700', fontSize: 13, marginBottom: 4},
  errorText: {color: '#cc8888', fontSize: 12},
});

export default RadarConfigScreen;

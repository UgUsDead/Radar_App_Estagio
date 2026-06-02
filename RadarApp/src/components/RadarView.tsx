/**
 * RadarView.tsx — Main radar visualization screen (connected state).
 *
 * Contains the Skia radar scene, data panel, and alert overlay.
 */

import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Platform, StatusBar} from 'react-native';
import RadarSkiaCanvas from '../render/RadarSkiaCanvas';
import {RadarData, AlertInfo, RoomRow, Patient, ZoneConfig} from '../types';

interface RadarViewProps {
  connectionStatus: string;
  radarData: RadarData | null;
  fallDetected: boolean;
  fallZThreshold: number;
  isDrawingZone: boolean;
  safeZonePoints: {x: number; y: number}[];
  roomWidth: number;
  roomDepth: number;
  alerts: AlertInfo[];
  frameCount: number;
  selectedRadarId: string | null;
  mqttMsgCount: number;
  onSafeZoneComplete: (points: {x: number; y: number}[]) => void;
  onCancelDraw: () => void;
  onSettings: () => void;
  onTestPublish: () => void;
  onSave: () => void;
  onRadarPicker: () => void;
  onDebug: () => void;
  onDisconnect: () => void;
  settingsSaved: boolean;
  currentRoom?: RoomRow | null;
  currentPatient?: Patient | null;
  zones?: ZoneConfig[];
  onRadarConfig: () => void;
  onLogs: () => void;
}

const RadarView: React.FC<RadarViewProps> = ({
  connectionStatus,
  radarData,
  fallDetected,
  fallZThreshold,
  isDrawingZone,
  safeZonePoints,
  roomWidth,
  roomDepth,
  alerts,
  frameCount,
  selectedRadarId,
  mqttMsgCount,
  onSafeZoneComplete,
  onCancelDraw,
  onSettings,
  onTestPublish,
  onSave,
  onRadarPicker,
  onDebug,
  onDisconnect,
  settingsSaved,
  currentRoom,
  currentPatient,
  zones,
  onRadarConfig,
  onLogs,
}) => {
  const statusColor =
    connectionStatus === 'Connected (MQTT)'
      ? '#00ff88'
      : connectionStatus.includes('Provisioning')
      ? '#ffaa00'
      : '#ff4444';

  const primaryTarget = radarData?.targets?.[0] || null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{flex: 1, minWidth: 0}}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Radar Visualizer
            </Text>
            <View style={styles.statusRow}>
              <View
                style={[styles.statusDot, {backgroundColor: statusColor}]}
              />
              <Text
                style={[styles.statusText, {color: statusColor, flexShrink: 1}]}
                numberOfLines={2}>
                {connectionStatus}
                {selectedRadarId ? ` | Radar: ${selectedRadarId}` : ''}
                {currentRoom ? ` | Room: ${currentRoom.name}` : ''}
                {currentPatient ? ` | Patient: ${currentPatient.name}` : ''}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.settingsBtn} onPress={onSettings}>
            <Text style={styles.settingsBtnText}>⚙</Text>
          </TouchableOpacity>
          {connectionStatus === 'Connected (MQTT)' && (
            <>
              <TouchableOpacity
                style={[styles.testBtn, {backgroundColor: '#332244', borderColor: '#554466'}]}
                onPress={onRadarConfig}>
                <Text style={styles.testBtnText}>⚙️</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.testBtn, {backgroundColor: '#223344', borderColor: '#445566'}]}
                onPress={onLogs}>
                <Text style={styles.testBtnText}>📋</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.testBtn} onPress={onTestPublish}>
                <Text style={styles.testBtnText}>🧪</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  settingsSaved && styles.saveBtnActive,
                ]}
                onPress={onSave}>
                <Text style={styles.saveBtnText}>
                  {settingsSaved ? '✓' : '💾'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.testBtn,
                  {backgroundColor: '#223344', borderColor: '#446688'},
                ]}
                onPress={onRadarPicker}>
                <Text style={styles.testBtnText}>📡</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            style={[
              styles.testBtn,
              {backgroundColor: '#332233', borderColor: '#665566'},
            ]}
            onPress={onDebug}>
            <Text style={styles.testBtnText}>🐛</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.disconnectBtn} onPress={onDisconnect}>
            <Text style={styles.btnText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Skia Radar Scene */}
      <View style={styles.webViewContainer}>
        <RadarSkiaCanvas
          radarData={radarData}
          roomWidth={roomWidth}
          roomDepth={roomDepth}
          fallZThreshold={fallZThreshold}
          isDrawingZone={isDrawingZone}
          safeZonePoints={safeZonePoints}
          zones={zones}
          onSafeZoneComplete={onSafeZoneComplete}
        />
        {fallDetected && (
          <View style={styles.fallOverlay}>
            <Text style={styles.fallText}>WARNING: FALL DETECTED</Text>
          </View>
        )}
        {isDrawingZone && (
          <View style={styles.drawingOverlay}>
            <Text style={styles.drawingText}>TAP 4 POINTS</Text>
            <TouchableOpacity
              style={styles.cancelDrawBtn}
              onPress={onCancelDraw}>
              <Text style={styles.cancelDrawBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Data Panel */}
      <View style={styles.dataPanel}>
        {radarData && primaryTarget ? (
          <>
            <View style={styles.dataRow}>
              <View style={styles.dataBlock}>
                <Text style={styles.dataLabel}>Primary Position</Text>
                <Text style={styles.dataValue}>
                  X:{primaryTarget.x.toFixed(2)}
                </Text>
                <Text style={styles.dataValue}>
                  Y:{primaryTarget.y.toFixed(2)}
                </Text>
                <Text style={styles.dataValue}>
                  Z:{primaryTarget.z.toFixed(2)}
                </Text>
              </View>
              <View style={styles.dataBlock}>
                <Text style={styles.dataLabel}>Velocity</Text>
                <Text style={styles.dataValue}>
                  {primaryTarget.speed.toFixed(2)} m/s
                </Text>
                <Text style={styles.dataLabel2}>Targets</Text>
                <Text style={styles.scenarioText}>
                  {radarData.targets.length}
                </Text>
              </View>
              <View style={styles.dataBlock}>
                <Text style={styles.dataLabel}>Height</Text>
                <View style={styles.heightBar}>
                  <View
                    style={[
                      styles.heightFill,
                      {
                        height: `${Math.min((primaryTarget.z / 2.5) * 100, 100)}%`,
                        backgroundColor:
                          primaryTarget.z < fallZThreshold
                            ? '#ff2222'
                            : '#00ff88',
                      },
                    ]}
                  />
                </View>
                <Text style={styles.dataValue}>
                  {primaryTarget.z.toFixed(2)}m
                </Text>
              </View>
            </View>

            {alerts.length > 0 && (
              <View style={styles.alertContainer}>
                {alerts.slice(0, 2).map((a, i) => (
                  <View
                    key={a.time + '-' + i}
                    style={[
                      styles.alertRow,
                      a.type === 'fall' ? styles.alertFall : styles.alertInfo,
                    ]}>
                    <Text style={styles.alertMessage} numberOfLines={1}>
                      {a.type === 'fall' ? '!! ' : '-- '}
                      {a.message}
                    </Text>
                    {a.type === 'fall' && (
                      <TouchableOpacity style={{marginLeft: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#ff4444', borderRadius: 4}} onPress={() => {}}>
                        <Text style={{color: 'white', fontSize: 10, fontWeight: 'bold'}}>RESPOND</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={styles.noData}>
            <Text style={styles.noDataText}>
              {connectionStatus === 'Connected (MQTT)'
                ? 'Waiting for radar data...'
                : 'Not connected'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
  header: {
    paddingTop:
      Platform.OS === 'android'
        ? (StatusBar.currentHeight || 30) + 4
        : 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  headerTitle: {fontSize: 20, fontWeight: 'bold', color: '#fff'},
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  statusDot: {width: 8, height: 8, borderRadius: 4, marginRight: 6},
  statusText: {fontSize: 13, fontFamily: 'monospace'},
  settingsBtn: {
    backgroundColor: '#333',
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  settingsBtnText: {fontSize: 20, color: '#ccc'},
  testBtn: {
    backgroundColor: '#443333',
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#665555',
  },
  testBtnText: {fontSize: 18, color: '#ffaa88'},
  saveBtn: {
    backgroundColor: '#334433',
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#556655',
  },
  saveBtnActive: {
    backgroundColor: '#00aa55',
    borderColor: '#00ff88',
  },
  saveBtnText: {fontSize: 18, color: '#fff', fontWeight: 'bold'},
  disconnectBtn: {
    backgroundColor: '#aa3333',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnText: {color: '#fff', fontSize: 14, fontWeight: 'bold'},
  webViewContainer: {flex: 1, position: 'relative'},
  fallOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,0,0,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#ff0000',
  },
  fallText: {fontSize: 24, fontWeight: 'bold', color: '#ff0000'},
  drawingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    backgroundColor: 'rgba(0,80,40,0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  drawingText: {
    color: '#88ff88',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  cancelDrawBtn: {
    backgroundColor: 'rgba(255,0,0,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  cancelDrawBtnText: {color: '#ff6666', fontSize: 12, fontWeight: 'bold'},
  dataPanel: {
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 100,
  },
  dataRow: {flexDirection: 'row', justifyContent: 'space-between'},
  dataBlock: {flex: 1, alignItems: 'center'},
  dataLabel: {
    color: '#888',
    fontSize: 11,
    marginBottom: 4,
    fontWeight: '600',
  },
  dataLabel2: {
    color: '#888',
    fontSize: 11,
    marginTop: 4,
    marginBottom: 2,
    fontWeight: '600',
  },
  dataValue: {color: '#fff', fontSize: 13, fontFamily: 'monospace'},
  scenarioText: {color: '#ffaa00', fontSize: 13, fontWeight: 'bold'},
  heightBar: {
    width: 20,
    height: 40,
    backgroundColor: '#222',
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  heightFill: {width: '100%', borderRadius: 4},
  alertContainer: {marginTop: 8},
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 3,
  },
  alertFall: {
    backgroundColor: 'rgba(255,0,0,0.15)',
    borderLeftWidth: 3,
    borderLeftColor: '#ff0000',
  },
  alertInfo: {
    backgroundColor: 'rgba(0,170,255,0.1)',
    borderLeftWidth: 3,
    borderLeftColor: '#0088cc',
  },
  alertMessage: {
    color: '#ccc',
    fontSize: 12,
    flex: 1,
    fontFamily: 'monospace',
  },
  noData: {justifyContent: 'center', alignItems: 'center', paddingVertical: 16},
  noDataText: {color: '#666', fontSize: 16},
});

export default RadarView;

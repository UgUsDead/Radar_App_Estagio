/**
 * ProvisioningScreen.tsx — BLE provisioning + direct connect flow.
 *
 * Handles: scanning, device list, WiFi form, provisioning-in-progress.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Platform,
} from 'react-native';
import {ProvisioningState, ProvisionedRadarProfile} from '../types';

interface ProvisioningScreenProps {
  state: ProvisioningState;
  setState: (fn: (prev: ProvisioningState) => ProvisioningState) => void;
  isScanning: boolean;
  isReconnectingId: string | null;
  provisionedRadars: ProvisionedRadarProfile[];
  manualBrokerIP: string;
  setManualBrokerIP: (ip: string) => void;
  isManualConnecting: boolean;
  onStartScan: () => void;
  onSelectDevice: (device: any) => void;
  onScanDeviceWifi: () => void;
  onSendProvision: () => void;
  onReconnect: (profile: ProvisionedRadarProfile) => void;
  onConnectManual: () => void;
  diagnosticsLogs: string[];
  onClearDiagnostics: () => void;
  onOpenSetupFlow: () => void;
  mqttBrokerURI: string;
  setMqttBrokerURI: (uri: string) => void;
}

const ProvisioningScreen: React.FC<ProvisioningScreenProps> = ({
  state,
  setState,
  isScanning,
  isReconnectingId,
  provisionedRadars,
  manualBrokerIP,
  setManualBrokerIP,
  isManualConnecting,
  onStartScan,
  onSelectDevice,
  onScanDeviceWifi,
  onSendProvision,
  onReconnect,
  onConnectManual,
  diagnosticsLogs,
  onClearDiagnostics,
  onOpenSetupFlow,
  mqttBrokerURI,
  setMqttBrokerURI,
}) => {
  const diagnosticsView = (
    <View style={styles.diagnosticsSection}>
      <View style={styles.diagnosticsHeaderRow}>
        <Text style={styles.diagnosticsTitle}>Diagnostics</Text>
        <TouchableOpacity onPress={onClearDiagnostics}>
          <Text style={styles.diagnosticsClear}>Clear</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.diagnosticsScroll} nestedScrollEnabled={true}>
        {diagnosticsLogs.length === 0 ? (
          <Text style={styles.diagnosticsEmpty}>No diagnostics yet.</Text>
        ) : (
          diagnosticsLogs.slice(0, 40).map((line, index) => (
            <Text key={`${line}-${index}`} style={styles.diagnosticsLine}>
              {line}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
  );

  // ── Step 1: Scan screen ────────────────────────
  if (state.step === 'scanning') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={styles.scanScreen}>
          <View style={styles.scanHeader}>
            <Text style={styles.scanTitle}>Radar Setup</Text>
            <Text style={styles.scanSubtitle}>
              Search for ESP IDF provisioning device
            </Text>
          </View>
          <ScrollView
            style={{flex: 1}}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 20,
              paddingBottom: 40,
            }}
            keyboardShouldPersistTaps="handled">
            <Text style={styles.formLabel}>Device Name Prefix</Text>
            <TextInput
              style={styles.formInput}
              placeholder="PROV_"
              placeholderTextColor="#555"
              value={state.devicePrefix}
              onChangeText={text =>
                setState(prev => ({...prev, devicePrefix: text}))
              }
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.provisioningStatus}>{state.status}</Text>
            <TouchableOpacity
              style={[styles.rescanBtn, isScanning && {opacity: 0.5}]}
              onPress={onStartScan}
              disabled={isScanning}>
              {isScanning ? (
                <ActivityIndicator color="#00aaff" />
              ) : (
                <Text style={styles.rescanBtnText}>Scan for Devices</Text>
              )}
            </TouchableOpacity>

            {diagnosticsView}

            <View style={styles.manualBrokerSection}>
              <Text style={styles.savedRadarsTitle}>
                Direct MQTT Broker URI
              </Text>
              <TextInput
                style={[styles.formInput, {marginBottom: 10}]}
                placeholder="mqtt://broker-host:1883"
                placeholderTextColor="#555"
                value={manualBrokerIP}
                onChangeText={setManualBrokerIP}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[
                  styles.savedRadarConnectBtn,
                  styles.manualBrokerBtn,
                  isManualConnecting && {opacity: 0.6},
                ]}
                disabled={isManualConnecting}
                onPress={onConnectManual}>
                {isManualConnecting ? (
                  <ActivityIndicator color="#00aaff" size="small" />
                ) : (
                  <Text style={styles.savedRadarConnectText}>
                    Connect to Broker
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.setupRow}>
              <View style={{flex: 1}}>
                <Text style={styles.setupTitle}>Backend Setup</Text>
                <Text style={styles.setupSubtitle}>Rooms, patients, radar assignment</Text>
              </View>
              <TouchableOpacity style={styles.setupBtn} onPress={onOpenSetupFlow}>
                <Text style={styles.setupBtnText}>Open</Text>
              </TouchableOpacity>
            </View>

            {provisionedRadars.length > 0 && (
              <View style={styles.savedRadarsSection}>
                <Text style={styles.savedRadarsTitle}>
                  Previously Provisioned Radars
                </Text>
                {provisionedRadars.map(radar => {
                  const isBusy = isReconnectingId === radar.id;
                  return (
                    <View key={radar.id} style={styles.savedRadarRow}>
                      <View style={styles.savedRadarInfo}>
                        <Text style={styles.savedRadarName}>{radar.name}</Text>
                        <Text
                          style={styles.savedRadarMeta}
                          numberOfLines={1}>
                          {radar.wifiSSID ? `${radar.wifiSSID}  ` : ''}Last
                          broker: {radar.lastBrokerIP}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.savedRadarConnectBtn,
                          isBusy && {opacity: 0.6},
                        ]}
                        disabled={isBusy}
                        onPress={() => onReconnect(radar)}>
                        {isBusy ? (
                          <ActivityIndicator color="#00aaff" size="small" />
                        ) : (
                          <Text style={styles.savedRadarConnectText}>
                            Reconnect
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    );
  }

  // ── Step 2: Device list ────────────────────────
  if (state.step === 'device_list') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={styles.scanScreen}>
          <View style={styles.scanHeader}>
            <Text style={styles.scanTitle}>Select Device</Text>
            <Text style={styles.scanSubtitle}>{state.status}</Text>
          </View>
          <FlatList
            data={state.deviceList}
            keyExtractor={item => item.name}
            style={styles.deviceList}
            contentContainerStyle={{paddingBottom: 20}}
            renderItem={({item}) => (
              <TouchableOpacity
                style={styles.deviceRow}
                onPress={() => onSelectDevice(item)}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{item.name}</Text>
                </View>
                <Text style={styles.rssiText}>›</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <Text style={styles.emptyText}>No devices found.</Text>
              </View>
            }
          />
          <TouchableOpacity
            style={styles.rescanBtn}
            onPress={() =>
              setState(prev => ({...prev, step: 'scanning'}))
            }>
            <Text style={styles.rescanBtnText}>← Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Step 3: WiFi / auth form ───────────────────
  if (state.step === 'wifi_form') {
    const canProvision = !!state.wifiSSID;
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={styles.provisioningContainer}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() =>
              setState(prev => ({...prev, step: 'device_list'}))
            }>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>

          <Text style={styles.provisioningTitle}>Configure Radar</Text>
          <Text style={styles.deviceSelectedText}>
            Device: {state.selectedDevice?.name || 'Unknown'}
          </Text>

          <ScrollView
            style={styles.provisioningForm}
            keyboardShouldPersistTaps="handled">
            <Text style={styles.formLabel}>
              Radar Password (Proof of Possession)
            </Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. abcd1234"
              placeholderTextColor="#555"
              secureTextEntry
              value={state.radarPassword}
              onChangeText={text =>
                setState(prev => ({...prev, radarPassword: text}))
              }
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.formRowSplit}>
              <Text style={[styles.formLabel, {flex: 1}]}>
                WiFi Network (SSID)
              </Text>
              <TouchableOpacity onPress={onScanDeviceWifi}>
                <Text style={styles.scanWifiBtn}>Scan WiFi</Text>
              </TouchableOpacity>
            </View>
            {state.wifiList.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.wifiChipRow}>
                {state.wifiList.map(n => (
                  <TouchableOpacity
                    key={n.ssid}
                    style={[
                      styles.wifiChip,
                      state.wifiSSID === n.ssid && styles.wifiChipSelected,
                    ]}
                    onPress={() =>
                      setState(prev => ({...prev, wifiSSID: n.ssid}))
                    }>
                    <Text style={styles.wifiChipText}>{n.ssid}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TextInput
              style={styles.formInput}
              placeholder="Your network name"
              placeholderTextColor="#555"
              value={state.wifiSSID}
              onChangeText={text =>
                setState(prev => ({...prev, wifiSSID: text}))
              }
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.formLabel}>WiFi Password</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Your network password"
              placeholderTextColor="#555"
              secureTextEntry
              value={state.wifiPassword}
              onChangeText={text =>
                setState(prev => ({...prev, wifiPassword: text}))
              }
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.formLabel}>MQTT Broker URI</Text>
            <Text style={styles.fieldHelpText}>
              URI do broker MQTT para o dispositivo se conectar após provisioning.
              Exemplo: mqtt://broker-host:1883
            </Text>
            <TextInput
              style={styles.formInput}
              placeholder="mqtt://broker-host:1883"
              placeholderTextColor="#555"
              value={mqttBrokerURI}
              onChangeText={setMqttBrokerURI}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <Text style={styles.provisioningStatus}>{state.status}</Text>

            {diagnosticsView}

            <TouchableOpacity
              style={[styles.provisioningBtn, !canProvision && {opacity: 0.4}]}
              onPress={onSendProvision}
              disabled={!canProvision}>
              <Text style={styles.provisioningBtnText}>
                Provision &amp; Connect →
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    );
  }

  // ── Step 4: Provisioning in progress ───────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.waitingScreen}>
        <ActivityIndicator color="#00aaff" size="large" />
        <Text style={styles.waitingText}>{state.status}</Text>
        {diagnosticsView}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
  scanScreen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingTop:
      Platform.OS === 'android'
        ? (StatusBar.currentHeight || 30) + 8
        : 50,
  },
  scanHeader: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  scanTitle: {fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 4},
  scanSubtitle: {color: '#888', fontSize: 13},
  formLabel: {color: '#aaa', fontSize: 14, marginBottom: 6, fontWeight: '600'},
  fieldHelpText: {color: '#666', fontSize: 11, marginBottom: 8, fontStyle: 'italic', lineHeight: 16},
  formInput: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    marginBottom: 16,
    fontSize: 15,
  },
  provisioningStatus: {
    color: '#88ff88',
    fontSize: 13,
    marginVertical: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  rescanBtn: {
    margin: 16,
    backgroundColor: '#003366',
    borderWidth: 1,
    borderColor: '#0055aa',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  rescanBtnText: {color: '#00aaff', fontSize: 15, fontWeight: 'bold'},
  manualBrokerSection: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#1f1f1f',
    paddingTop: 10,
  },
  setupRow: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#0d1117',
    borderWidth: 1,
    borderColor: '#1f2a3d',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  setupTitle: {color: '#cbd5e1', fontWeight: '700', fontSize: 14},
  setupSubtitle: {color: '#7a8699', fontSize: 12, marginTop: 2},
  setupBtn: {
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  setupBtnText: {color: '#0b1220', fontWeight: '700', fontSize: 13},
  savedRadarsSection: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#1f1f1f',
    paddingTop: 10,
  },
  savedRadarsTitle: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '600',
  },
  savedRadarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#151515',
  },
  savedRadarInfo: {flex: 1, marginRight: 10},
  savedRadarName: {color: '#ddd', fontSize: 14, fontWeight: '600'},
  savedRadarMeta: {color: '#666', fontSize: 12, marginTop: 2},
  savedRadarConnectBtn: {
    backgroundColor: '#1a2233',
    borderColor: '#335577',
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 88,
    alignItems: 'center',
  },
  savedRadarConnectText: {color: '#88cfff', fontSize: 12, fontWeight: 'bold'},
  manualBrokerBtn: {width: '100%', minWidth: 0, paddingVertical: 10},
  diagnosticsSection: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#1f1f1f',
    paddingTop: 10,
  },
  diagnosticsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  diagnosticsTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  diagnosticsClear: {
    color: '#ff6666',
    fontSize: 12,
    fontWeight: '600',
  },
  diagnosticsScroll: {
    maxHeight: 180,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  diagnosticsEmpty: {
    color: '#666',
    fontSize: 11,
    fontStyle: 'italic',
  },
  diagnosticsLine: {
    color: '#aaa',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 3,
  },
  deviceList: {flex: 1},
  deviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  deviceInfo: {flex: 1, marginRight: 12},
  deviceName: {color: '#fff', fontSize: 15, fontWeight: '600'},
  rssiText: {color: '#888', fontSize: 11, fontFamily: 'monospace', minWidth: 55},
  emptyList: {paddingVertical: 40, alignItems: 'center'},
  emptyText: {color: '#666', fontSize: 15},
  provisioningContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingTop:
      Platform.OS === 'android'
        ? (StatusBar.currentHeight || 30) + 16
        : 60,
    paddingHorizontal: 20,
  },
  provisioningTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 6,
    textAlign: 'center',
  },
  deviceSelectedText: {
    color: '#00aaff',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  provisioningForm: {flex: 1},
  provisioningBtn: {
    backgroundColor: '#00aa55',
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 30,
  },
  provisioningBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  backBtn: {paddingVertical: 8, marginBottom: 8},
  backBtnText: {color: '#00aaff', fontSize: 15},
  formRowSplit: {flexDirection: 'row', alignItems: 'center', marginBottom: 6},
  scanWifiBtn: {
    color: '#00aaff',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  wifiChipRow: {flexDirection: 'row', marginBottom: 8},
  wifiChip: {
    backgroundColor: '#1a2233',
    borderWidth: 1,
    borderColor: '#334',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  wifiChipSelected: {backgroundColor: '#003366', borderColor: '#0055aa'},
  wifiChipText: {color: '#ccc', fontSize: 13},
  waitingScreen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  waitingText: {
    color: '#ccc',
    fontSize: 16,
    marginTop: 24,
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default ProvisioningScreen;

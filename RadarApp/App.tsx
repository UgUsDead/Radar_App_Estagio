/**
 * RadarApp — ESP IDF BLE Provisioning + MQTT Radar Visualizer
 *
 * This file is a thin coordinator. All logic lives in:
 *   /src/radar/   — protobuf decoding, target tracking
 *   /src/mqtt/    — MQTT connection, broker discovery
 *   /src/render/  — Skia radar scene
 *   /src/services/ — analytics, settings persistence
 *   /src/components/ — UI components
 */

import {Buffer} from 'buffer';
(globalThis as any).Buffer = Buffer;

import React, {useEffect, useRef, useState, useCallback, useMemo} from 'react';
import {Platform, PermissionsAndroid} from 'react-native';
import {
  ESPProvisionManager,
  ESPTransport,
  ESPSecurity,
} from '@orbital-systems/react-native-esp-idf-provisioning';

// ── Modules ──────────────────────────────────────────────────
import {
  RadarData,
  AlertInfo,
  ProvisioningState,
  ProvisionedRadarProfile,
  DiscoveredRadar,
  DeviceFirmwareState,
  RadarFirmwareConfig,
  MQTTLogEntry,
  MQTTLogCategory,
} from './src/types';
import {
  FALL_Z_THRESHOLD,
  SPEED_CHANGE_THRESHOLD,
} from './src/constants';

import {decodeRadarMessage} from './src/radar/radarDecoder';
import {RadarTracker} from './src/radar/radarTracker';
import {MQTTClient} from './src/mqtt/mqttClient';
import {extractIPv4} from './src/mqtt/brokerDiscovery';
import {RadarAnalytics} from './src/services/radarAnalytics';
import {
  saveSettingsForDevice,
  loadSettingsForDevice,
  loadProvisionedRadars,
  persistProvisionedRadars,
  upsertProvisionedRadar,
} from './src/services/settingsStorage';
import {
  appendDiagnostic,
  clearDiagnostics,
  loadDiagnostics,
} from './src/services/diagnosticsStorage';

import RadarView from './src/components/RadarView';
import ProvisioningScreen from './src/components/ProvisioningScreen';
import SettingsModal from './src/components/SettingsModal';
import DebugPanel from './src/components/DebugPanel';
import RadarPickerModal from './src/components/RadarPickerModal';
import SetupFlow from './src/components/SetupFlow';
import RadarConfigScreen from './src/components/RadarConfigScreen';
import ConnectionLogScreen from './src/components/ConnectionLogScreen';

// ═══════════════════════════════════════════════
// App Component
// ═══════════════════════════════════════════════
const App: React.FC = () => {
  // ── Core services (stable refs) ─────────────────
  const mqttRef = useRef<MQTTClient | null>(null);
  const trackerRef = useRef<RadarTracker | null>(null);
  const analyticsRef = useRef(new RadarAnalytics());

  // ── State ────────────────────────────────────────
  const [connectionStatus, setConnectionStatus] = useState('Provisioning');
  const [radarData, setRadarData] = useState<RadarData | null>(null);
  const [alerts, setAlerts] = useState<AlertInfo[]>([]);
  const [fallDetected, setFallDetected] = useState(false);
  const [frameCount, setFrameCount] = useState(0);

  // Provisioning
  const [provisioningState, setProvisioningState] = useState<ProvisioningState>({
    step: 'scanning',
    devicePrefix: 'PROV_',
    radarPassword: '',
    wifiSSID: '',
    wifiPassword: '',
    mqttBrokerURI: '',
    selectedDevice: null,
    deviceList: [],
    wifiList: [],
    status: 'Enter device prefix and tap Scan',
  });
  const [isScanning, setIsScanning] = useState(false);
  const [isReconnectingId, setIsReconnectingId] = useState<string | null>(null);
  const [provisionedRadars, setProvisionedRadars] = useState<ProvisionedRadarProfile[]>([]);
  const [manualBrokerIP, setManualBrokerIP] = useState('');
  const [isManualConnecting, setIsManualConnecting] = useState(false);
  const [diagnosticsLogs, setDiagnosticsLogs] = useState<string[]>([]);
  const [showSetupFlow, setShowSetupFlow] = useState(false);
  const setMqttBrokerURI = useCallback((uri: string) => {
    setProvisioningState(prev => ({...prev, mqttBrokerURI: uri}));
  }, []);

  const normalizeBrokerUri = useCallback((value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return /^\w+:\/\//.test(trimmed) ? trimmed : `mqtt://${trimmed}`;
  }, []);

  const extractBrokerHost = useCallback((value: string): string => {
    const normalized = normalizeBrokerUri(value);
    if (!normalized) return '';
    try {
      return new URL(normalized).hostname;
    } catch {
      return value.trim();
    }
  }, [normalizeBrokerUri]);

  const setupApiBase = useMemo(() => {
    const ip = extractIPv4(manualBrokerIP);
    return ip ? `http://${ip}:4000` : 'http://localhost:4000';
  }, [manualBrokerIP]);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [speedThreshold, setSpeedThreshold] = useState(SPEED_CHANGE_THRESHOLD);
  const [fallZThreshold, setFallZThreshold] = useState(FALL_Z_THRESHOLD);
  const [safeZonePoints, setSafeZonePoints] = useState<{x: number; y: number}[]>([]);
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const isDrawingZoneRef = useRef(false);
  const safeZoneRef = useRef<{x: number; y: number}[]>([]);
  const [radarHeight, setRadarHeight] = useState(2.5);
  const [roomWidth, setRoomWidth] = useState(6);
  const [roomDepth, setRoomDepth] = useState(6);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Radar identifiers
  const [currentRadarId, setCurrentRadarId] = useState<string | null>(null);
  const selectedRadarIdRef = useRef<string | null>(null);
  const [selectedRadarId, setSelectedRadarId] = useState<string | null>(null);
  const [discoveredRadars, setDiscoveredRadars] = useState<DiscoveredRadar[]>([]);
  const discoveredRadarsRef = useRef<Map<string, {lastSeen: number; online: boolean}>>(new Map());
  const [showRadarPicker, setShowRadarPicker] = useState(false);

  // Debug
  const [showDebug, setShowDebug] = useState(false);
  const showDebugRef = useRef(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const debugLogsRef = useRef<string[]>([]);
  const debugFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mqttMsgCountRef = useRef(0);

  // Firmware state (from MQTT callbacks)
  const [firmwareState, setFirmwareState] = useState<DeviceFirmwareState>({
    availability: 'unknown',
    status: null,
    lastError: null,
    radarStatus: null,
    radarConfigStatus: null,
    radarConfigState: null,
    cmdStatus: null,
    radarCmdStatus: null,
  });
  const [showRadarConfig, setShowRadarConfig] = useState(false);
  const [showConnectionLogs, setShowConnectionLogs] = useState(false);
  const [mqttLogs, setMqttLogs] = useState<MQTTLogEntry[]>([]);
  const mqttLogsRef = useRef<MQTTLogEntry[]>([]);
  const mqttLogFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_MQTT_LOGS = 500;

  // ── Helpers ─────────────────────────────────────

  const addAlert = useCallback((type: AlertInfo['type'], message: string) => {
    if (isDrawingZoneRef.current) return;
    setAlerts(prev => [{type, message, time: Date.now()}, ...prev].slice(0, 15));
  }, []);

  const appendMqttLog = useCallback((category: MQTTLogCategory, message: string, raw?: string, radarId?: string) => {
    const entry: MQTTLogEntry = {
      timestamp: Date.now(),
      category,
      message,
      raw,
      radarId: radarId || null,
    };
    mqttLogsRef.current.push(entry);
    if (mqttLogsRef.current.length > MAX_MQTT_LOGS) {
      mqttLogsRef.current = mqttLogsRef.current.slice(-MAX_MQTT_LOGS);
    }
    if (!mqttLogFlushRef.current) {
      mqttLogFlushRef.current = setTimeout(() => {
        setMqttLogs([...mqttLogsRef.current]);
        mqttLogFlushRef.current = null;
      }, 200);
    }
  }, []);

  const markProvisionedConnected = useCallback((reason: string) => {
    setProvisioningState(prev => {
      if (prev.step === 'connected') return prev;
      return {
        ...prev,
        step: 'connected',
        status: reason,
      };
    });
  }, []);

  const debugLog = useCallback((msg: string) => {
    if (!showDebugRef.current) return;
    const ts = new Date().toLocaleTimeString('en-GB', {hour12: false});
    debugLogsRef.current = [`[${ts}] ${msg}`, ...debugLogsRef.current].slice(0, 100);
    if (debugFlushTimerRef.current) return;
    debugFlushTimerRef.current = setTimeout(() => {
      debugFlushTimerRef.current = null;
      setDebugLogs([...debugLogsRef.current]);
    }, 120);
  }, []);

  const logDiagnostic = useCallback((msg: string) => {
    appendDiagnostic(msg)
      .then(setDiagnosticsLogs)
      .catch(() => {});
  }, []);

  const sanitizeNumber = useCallback((value: unknown, fallback: number, min: number, max: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }, []);

  useEffect(() => {
    showDebugRef.current = showDebug;
    if (showDebug) setDebugLogs([...debugLogsRef.current]);
  }, [showDebug]);

  useEffect(() => {
    safeZoneRef.current = safeZonePoints;
    trackerRef.current?.updateConfig({safeZonePoints});
  }, [safeZonePoints]);

  // ── Tracker setup ───────────────────────────────
  useEffect(() => {
    // Throttle React state updates to ~10Hz to keep UI smooth and stable
    let lastStateUpdateMs = 0;
    const STATE_UPDATE_INTERVAL = 100; // ms

    const tracker = new RadarTracker({
      fallZThreshold: FALL_Z_THRESHOLD,
      speedThreshold: SPEED_CHANGE_THRESHOLD,
      safeZonePoints: [],
      onAlert: (type, message) => addAlert(type, message),
      onFrame: (data: RadarData) => {
        const now = Date.now();

        // ── React state (throttled ~10Hz) ───────────────
        if (now - lastStateUpdateMs >= STATE_UPDATE_INTERVAL) {
          lastStateUpdateMs = now;
          setRadarData(data);
          setFrameCount(data.frame || 0);
          setFallDetected(data.targets.some(t => t.z < FALL_Z_THRESHOLD));
        }

        // Publish analytics events
        const analytics = analyticsRef.current;
        for (const t of data.targets) {
          if (t.z < FALL_Z_THRESHOLD) analytics.publishFall(t);
          if (t.speed > 0.05) analytics.publishMovement(t);
        }
      },
    });
    trackerRef.current = tracker;

    return () => tracker.destroy();
  }, [addAlert]);

  // Sync threshold changes to tracker
  useEffect(() => {
    trackerRef.current?.updateConfig({fallZThreshold, speedThreshold});
  }, [fallZThreshold, speedThreshold]);

  // ── Permissions ─────────────────────────────────
  const requestPermissions = useCallback(async () => {
    if (Platform.OS !== 'android') return true;
    try {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return Object.values(granted).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        return r === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch {
      return false;
    }
  }, []);

  // ── MQTT Connection ─────────────────────────────
  const setupMQTT = useCallback(async (brokerIP: string, connectTimeoutMs = 7000) => {
    // Disconnect old client if any
    mqttRef.current?.disconnect();

    // Reset radar-specific runtime state for a fresh broker session
    selectedRadarIdRef.current = null;
    setSelectedRadarId(null);
    setCurrentRadarId(null);
    discoveredRadarsRef.current.clear();
    setDiscoveredRadars([]);

    const client = new MQTTClient({
      onConnect: (ip) => {
        setConnectionStatus('Connected (MQTT)');
        addAlert('info', 'MQTT connected to ' + ip);
        debugLog('MQTT connected to ' + ip);
        mqttMsgCountRef.current = 0;
        trackerRef.current?.reset();
        markProvisionedConnected(`Connected to broker ${ip}. Waiting for radar data...`);
        setProvisioningState(prev => ({
          ...prev,
          step: 'provisioning',
          status: `Connected to broker ${ip}. Waiting for radar availability...`,
        }));
        logDiagnostic(`MQTT connected: ${ip}`);
        appendMqttLog('CONNECTION', `Ligado ao broker MQTT ${ip}`);
      },
      onDisconnect: () => {
        setConnectionStatus('Reconnecting...');
        addAlert('info', 'MQTT disconnected, attempting reconnect...');
        debugLog('MQTT disconnected');
        logDiagnostic('MQTT disconnected');
        appendMqttLog('CONNECTION', 'Desligado do broker MQTT');
      },
      onError: (err) => {
        setConnectionStatus(`MQTT Error: ${err}`);
        addAlert('info', `MQTT error: ${err}`);
        debugLog('MQTT error: ' + err);
        logDiagnostic(`MQTT error: ${err}`);
        appendMqttLog('ERROR', `Erro MQTT: ${err}`);
      },
      onDeviceStatus: (radarId, payload) => {
        setFirmwareState(prev => ({...prev, status: payload}));
        appendMqttLog('STATUS', 'Estado do dispositivo atualizado', JSON.stringify(payload), radarId);
      },
      onDeviceError: (radarId, payload) => {
        setFirmwareState(prev => ({...prev, lastError: payload}));
        appendMqttLog('ERROR', `Erro de firmware (${payload.context})`, payload.error, radarId);
      },
      onRadarStatus: (radarId, status) => {
        setFirmwareState(prev => ({...prev, radarStatus: status}));
        appendMqttLog('RADAR_STATUS', `Estado do radar alterado para: ${status}`, undefined, radarId);
      },
      onRadarConfigStatus: (radarId, status) => {
        setFirmwareState(prev => ({...prev, radarConfigStatus: status}));
        appendMqttLog('RADAR_CONFIG', `Status de configuração: ${status}`, undefined, radarId);
      },
      onRadarConfigState: (radarId, config) => {
        setFirmwareState(prev => ({...prev, radarConfigState: config as RadarFirmwareConfig}));
        appendMqttLog('RADAR_CONFIG', 'Configuração carregada do dispositivo', JSON.stringify(config), radarId);
      },
      onCmdStatus: (radarId, status) => {
        setFirmwareState(prev => ({...prev, cmdStatus: status}));
        appendMqttLog('CMD', `Comando de dispositivo: ${status}`, undefined, radarId);
      },
      onRadarCmdStatus: (radarId, status) => {
        setFirmwareState(prev => ({...prev, radarCmdStatus: status}));
        appendMqttLog('RADAR_CMD', `Comando de radar: ${status}`, undefined, radarId);
      },
      onTelemetry: (radarId, binaryData) => {
        // Auto-select first radar if availability messages are missing
        if (!selectedRadarIdRef.current) {
          selectedRadarIdRef.current = radarId;
          setSelectedRadarId(radarId);
          setCurrentRadarId(radarId);
          analyticsRef.current.bind(client, radarId);
          markProvisionedConnected(`Connected to radar ${radarId}`);
          logDiagnostic(`Auto-selected from telemetry: ${radarId}`);
        }

        // Filter: only process from selected radar
        if (!selectedRadarIdRef.current || radarId !== selectedRadarIdRef.current) return;
        mqttMsgCountRef.current++;
        try {
          let result = decodeRadarMessage(binaryData);

          // Some Android MQTT bridges deliver telemetry as base64/latin1 strings.
          if (!result && typeof binaryData === 'string') {
            const text = binaryData.trim();
            const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
            if (b64.length >= 4) {
              try {
                result = decodeRadarMessage(Buffer.from(b64, 'base64'));
              } catch {}
            }
            if (!result) {
              try {
                result = decodeRadarMessage(Buffer.from(text, 'latin1'));
              } catch {}
            }
          }

          if (!result && binaryData && typeof binaryData === 'object') {
            const maybeData = (binaryData as any).data;
            if (Array.isArray(maybeData)) {
              result = decodeRadarMessage(new Uint8Array(maybeData));
            }
          }

          if (result) {
            trackerRef.current?.ingestTargets(result.frameNumber, result.targets);
            if (showDebugRef.current && (mqttMsgCountRef.current <= 3 || mqttMsgCountRef.current % 50 === 0)) {
              debugLog(`MSG #${mqttMsgCountRef.current} frame=${result.frameNumber} targets=${result.targets.length}`);
            }
          } else if (showDebugRef.current && (mqttMsgCountRef.current <= 5 || mqttMsgCountRef.current % 50 === 0)) {
            const payloadType = typeof binaryData;
            debugLog(`MSG #${mqttMsgCountRef.current} decode miss (payload type: ${payloadType})`);
          }
        } catch (e: any) {
          if (showDebugRef.current && mqttMsgCountRef.current <= 5) {
            debugLog(`Decode error: ${e.message || e}`);
          }
        }
      },
      onAvailability: (radarId, status) => {
        logDiagnostic(`Radar ${radarId} availability: ${status}`);
        if (status === 'online') {
          discoveredRadarsRef.current.set(radarId, {lastSeen: Date.now(), online: true});
          setDiscoveredRadars(Array.from(discoveredRadarsRef.current.entries()).map(([id, info]) => ({id, ...info})));
          debugLog(`Radar ${radarId} ONLINE`);
          // Auto-select first discovered radar
          if (!selectedRadarIdRef.current) {
            selectedRadarIdRef.current = radarId;
            setSelectedRadarId(radarId);
            setCurrentRadarId(radarId);
            // Bind analytics
            analyticsRef.current.bind(client, radarId);
            debugLog(`Auto-selected radar: ${radarId}`);
            markProvisionedConnected(`Connected to radar ${radarId}`);
            logDiagnostic(`Radar selected and view unlocked: ${radarId}`);
            // Request config on first connect
            setTimeout(() => {
              client.publish(`linovt/${radarId}/radar/config/get`, '');
            }, 1000);
          }
          setFirmwareState(prev => ({...prev, availability: 'online'}));
          appendMqttLog('AVAILABILITY', 'Radar Online', undefined, radarId);
        } else {
          const info = discoveredRadarsRef.current.get(radarId);
          if (info) {
            info.online = false;
            discoveredRadarsRef.current.set(radarId, info);
            setDiscoveredRadars(Array.from(discoveredRadarsRef.current.entries()).map(([id, i]) => ({id, ...i})));
          }
          debugLog(`Radar ${radarId} OFFLINE`);
          setFirmwareState(prev => ({...prev, availability: 'offline'}));
          appendMqttLog('AVAILABILITY', 'Radar Offline', undefined, radarId);
        }
      },
    });

    mqttRef.current = client;
    await client.connect(brokerIP, {reconnect: true, connectTimeoutMs});
  }, [addAlert, debugLog, logDiagnostic, markProvisionedConnected]);

  const publishRadarConfig = useCallback((config: Partial<RadarFirmwareConfig>) => {
    if (!mqttRef.current || !currentRadarId) return;
    const topic = `linovt/${currentRadarId}/radar/config/set`;
    const payload = JSON.stringify(config);
    mqttRef.current.publish(topic, payload);
    appendMqttLog('RADAR_CONFIG', 'A publicar nova configuração...', payload, currentRadarId);
  }, [currentRadarId, appendMqttLog]);

  const sendRadarCommand = useCallback((cmd: string) => {
    if (!mqttRef.current || !currentRadarId) return;
    const topic = `linovt/${currentRadarId}/radar/cmd`;
    const payload = JSON.stringify({ cmd });
    mqttRef.current.publish(topic, payload);
    appendMqttLog('RADAR_CMD', `A enviar comando: ${cmd}`, payload, currentRadarId);
  }, [currentRadarId, appendMqttLog]);

  // ── Provisioning actions ────────────────────────

  const startScan = useCallback(async () => {
    logDiagnostic('Start BLE scan');
    const ok = await requestPermissions();
    if (!ok) { addAlert('info', 'BLE permissions denied'); return; }
    setIsScanning(true);
    setProvisioningState(prev => ({...prev, deviceList: [], status: `Scanning for "${prev.devicePrefix}" devices...`}));
    try {
      const devices = await ESPProvisionManager.searchESPDevices(
        provisioningState.devicePrefix || 'PROV_',
        ESPTransport.ble,
        ESPSecurity.secure2,
      );
      setProvisioningState(prev => ({
        ...prev,
        step: 'device_list',
        deviceList: devices,
        status: devices.length > 0 ? `Found ${devices.length} device(s)` : 'No devices found — check device is powered on',
      }));
      logDiagnostic(`BLE scan found ${devices.length} device(s)`);
    } catch (err: any) {
      setProvisioningState(prev => ({...prev, status: `Scan error: ${err?.message || String(err)}`}));
      logDiagnostic(`BLE scan error: ${err?.message || String(err)}`);
    } finally {
      setIsScanning(false);
    }
  }, [requestPermissions, provisioningState.devicePrefix, addAlert, logDiagnostic]);

  const selectDevice = useCallback((device: any) => {
    logDiagnostic(`Selected device: ${device?.name || 'unknown'}`);
    setProvisioningState(prev => ({...prev, selectedDevice: device, step: 'wifi_form', status: `Selected: ${device.name}`}));
  }, [logDiagnostic]);

  const scanDeviceWifi = useCallback(async () => {
    const device = provisioningState.selectedDevice;
    if (!device) return;
    setProvisioningState(prev => ({...prev, status: 'Connecting to device...'}));
    try {
      logDiagnostic('Connecting to device to scan WiFi list');
      await device.connect(provisioningState.radarPassword || undefined);
      setProvisioningState(prev => ({...prev, status: 'Scanning WiFi networks...'}));
      const networks = await device.scanWifiList();
      try {
        await Promise.resolve(device.disconnect());
      } catch {}
      setProvisioningState(prev => ({
        ...prev,
        wifiList: (networks || []).map((n: any) => ({ssid: n.ssid, rssi: n.rssi, auth: n.auth})),
        status: networks?.length ? `Found ${networks.length} networks` : 'No networks found',
      }));
      logDiagnostic(`WiFi scan complete: ${(networks || []).length} network(s)`);
    } catch (err: any) {
      setProvisioningState(prev => ({...prev, status: `Error: ${err?.message || String(err)}`}));
      logDiagnostic(`WiFi scan error: ${err?.message || String(err)}`);
      try {
        await Promise.resolve(device.disconnect());
      } catch {}
    }
  }, [provisioningState.selectedDevice, provisioningState.radarPassword, logDiagnostic]);

  const saveRadarProfile = useCallback(async (profile: ProvisionedRadarProfile) => {
    const existing = await loadProvisionedRadars();
    const updated = upsertProvisionedRadar(existing, profile);
    await persistProvisionedRadars(updated);
    setProvisionedRadars(updated);
  }, []);

  const applyDeviceSettings = useCallback(async (deviceId: string) => {
    const saved = await loadSettingsForDevice(deviceId);
    if (saved) {
      const nextSpeed = sanitizeNumber(saved.speedThreshold, SPEED_CHANGE_THRESHOLD, 0.1, 5.0);
      const nextFall = sanitizeNumber(saved.fallZThreshold, FALL_Z_THRESHOLD, 0.1, 2.5);
      const nextHeight = sanitizeNumber(saved.radarHeight, 2.5, 0.5, 5.0);
      const nextWidth = sanitizeNumber(saved.roomWidth, 6, 2, 20);
      const nextDepth = sanitizeNumber(saved.roomDepth, 6, 2, 20);

      const zone = Array.isArray(saved.safeZonePoints)
        ? saved.safeZonePoints.filter((p: any) => Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y))).map((p: any) => ({x: Number(p.x), y: Number(p.y)}))
        : [];

      setSpeedThreshold(nextSpeed);
      setFallZThreshold(nextFall);
      setSafeZonePoints(zone);
      safeZoneRef.current = zone;
      setRadarHeight(nextHeight);
      setRoomWidth(nextWidth);
      setRoomDepth(nextDepth);
      debugLog('Loaded settings for ' + deviceId);
    }
  }, [debugLog, sanitizeNumber]);

  const sendProvision = useCallback(async () => {
    const device = provisioningState.selectedDevice;
    if (!device || !provisioningState.wifiSSID) return;
    setProvisioningState(prev => ({...prev, step: 'provisioning', status: 'Connecting to device...'}));
    try {
      logDiagnostic('Provision flow started');
      await device.connect(provisioningState.radarPassword || undefined);

      const brokerUriToSend = normalizeBrokerUri(provisioningState.mqttBrokerURI);

      if (!brokerUriToSend) {
        setProvisioningState(prev => ({
          ...prev,
          step: 'wifi_form',
          status: 'Enter the MQTT Broker URI before provisioning.',
        }));
        logDiagnostic('Provisioning failed: no MQTT Broker URI configured');
        try { await Promise.resolve(device.disconnect()); } catch {}
        return;
      }

      setProvisioningState(prev => ({...prev, status: 'Sending MQTT configuration...'}));
      logDiagnostic(`Sending MQTT configuration: ${brokerUriToSend}`);
      try {
        const response = await device.sendData('mqtt_endpoint', brokerUriToSend);
        logDiagnostic(`MQTT endpoint response: ${response}`);
      } catch (err: any) {
        logDiagnostic(`Failed to send MQTT configuration: ${err?.message || String(err)}`);
      }

      setProvisioningState(prev => ({...prev, status: 'Sending WiFi credentials...'}));
      logDiagnostic(`Sending WiFi credentials for SSID: ${provisioningState.wifiSSID}`);
      await device.provision(provisioningState.wifiSSID, provisioningState.wifiPassword);
      try {
        await Promise.resolve(device.disconnect());
      } catch {}

      setProvisioningState(prev => ({...prev, status: 'Waiting for radar to join network...'}));
      logDiagnostic('Provision sent, waiting for radar network join');
      await new Promise<void>(r => setTimeout(r, 9000));

      // Sequence requirement: let radar finish MQTT startup before app broker connect attempts.
      setProvisioningState(prev => ({
        ...prev,
        status: `Waiting for radar to connect to MQTT at ${brokerUriToSend}...`,
      }));
      await new Promise<void>(r => setTimeout(r, 7000));

      const APP_CONNECT_ATTEMPTS = 6;
      const APP_CONNECT_TIMEOUT_MS = 9000;
      const APP_CONNECT_RETRY_DELAY_MS = 3000;

      let connectedBrokerIP: string | null = null;
      let lastError = 'Unknown broker connection error';

      for (let attempt = 1; attempt <= APP_CONNECT_ATTEMPTS; attempt += 1) {
        setProvisioningState(prev => ({
          ...prev,
          step: 'provisioning',
          status: `Provisioning: connecting app to broker ${attempt}/${APP_CONNECT_ATTEMPTS}...`,
        }));
        logDiagnostic(`Provisioning app broker connect attempt ${attempt}/${APP_CONNECT_ATTEMPTS}: ${brokerUriToSend}`);

        try {
          await setupMQTT(brokerUriToSend, APP_CONNECT_TIMEOUT_MS);
          connectedBrokerIP = extractBrokerHost(brokerUriToSend) || brokerUriToSend;
          logDiagnostic(`Provisioning app broker connected: ${brokerUriToSend}`);
          break;
        } catch (err: any) {
          lastError = err?.message || String(err);
          logDiagnostic(`Provisioning app broker attempt failed: ${lastError}`);
          if (attempt < APP_CONNECT_ATTEMPTS) {
            setProvisioningState(prev => ({
              ...prev,
              step: 'provisioning',
              status: `Waiting radar MQTT... retrying in ${Math.floor(APP_CONNECT_RETRY_DELAY_MS / 1000)}s`,
            }));
            await new Promise<void>(r => setTimeout(r, APP_CONNECT_RETRY_DELAY_MS));
          }
        }
      }

      if (!connectedBrokerIP) {
        logDiagnostic(`Provisioning failed: app could not connect to broker (${lastError})`);
        setProvisioningState(prev => ({
          ...prev,
          step: 'wifi_form',
          status: `Provisioned Wi-Fi, but app could not connect to the MQTT Broker URI. ${lastError}`,
        }));
        return;
      }

      setProvisioningState(prev => ({...prev, step: 'provisioning', status: `Broker connected at ${connectedBrokerIP}. Waiting for radar...`}));
      setCurrentRadarId(device.name);

      await saveRadarProfile({
        id: device.name,
        name: device.name,
        devicePrefix: provisioningState.devicePrefix || 'PROV_',
        wifiSSID: provisioningState.wifiSSID,
        lastBrokerIP: connectedBrokerIP,
        mqttBrokerURI: brokerUriToSend,
        lastProvisionedAt: Date.now(),
      });
      logDiagnostic('Profile saved');
      await applyDeviceSettings(device.name);
      logDiagnostic('Device settings applied');
      logDiagnostic('Waiting for MQTT onConnect before entering radar view');
    } catch (err: any) {
      setProvisioningState(prev => ({...prev, step: 'wifi_form', status: `Error: ${err?.message || String(err)}`}));
      logDiagnostic(`Provision flow error: ${err?.message || String(err)}`);
      try {
        await Promise.resolve(device.disconnect());
      } catch {}
    }
  }, [provisioningState, setupMQTT, saveRadarProfile, applyDeviceSettings, logDiagnostic, normalizeBrokerUri, extractBrokerHost]);

  const reconnectProvisionedRadar = useCallback(async (profile: ProvisionedRadarProfile) => {
    if (isReconnectingId) return;
    setIsReconnectingId(profile.id);
    setCurrentRadarId(profile.id);
    setProvisioningState(prev => ({...prev, status: `Reconnecting to ${profile.name}...`}));

    try {
      logDiagnostic(`Reconnect start: ${profile.name}`);
      mqttRef.current?.disconnect();
      const brokerUri = normalizeBrokerUri(profile.mqttBrokerURI || profile.lastBrokerIP);
      if (!brokerUri) {
        setProvisioningState(prev => ({...prev, step: 'scanning', status: `No MQTT Broker URI saved for ${profile.name}.`}));
        addAlert('info', `Reconnect failed for ${profile.name}`);
        setIsReconnectingId(null);
        setCurrentRadarId(null);
        logDiagnostic(`Reconnect failed: ${profile.name} has no saved broker URI`);
        return;
      }

      setProvisioningState(prev => ({...prev, step: 'provisioning', status: `Connecting to saved MQTT Broker URI for ${profile.name}...`}));
      await setupMQTT(brokerUri, 12000);
      const connectedBrokerIP = extractBrokerHost(brokerUri) || brokerUri;
      await applyDeviceSettings(profile.id);
      await saveRadarProfile({...profile, lastBrokerIP: connectedBrokerIP, mqttBrokerURI: brokerUri, lastProvisionedAt: Date.now()});
      setIsReconnectingId(null);
      logDiagnostic(`Reconnect broker resolved, waiting for MQTT onConnect: ${profile.name}`);
    } catch (e: any) {
      setProvisioningState(prev => ({...prev, step: 'scanning', status: `Reconnect error: ${e?.message || 'Unknown'}`}));
      setIsReconnectingId(null);
      setCurrentRadarId(null);
      logDiagnostic(`Reconnect error: ${e?.message || 'Unknown'}`);
    }
  }, [isReconnectingId, addAlert, saveRadarProfile, setupMQTT, applyDeviceSettings, logDiagnostic, normalizeBrokerUri, extractBrokerHost]);

  const connectManualBroker = useCallback(async () => {
    if (isManualConnecting) return;
    const brokerUri = normalizeBrokerUri(manualBrokerIP);
    if (!brokerUri) {
      setProvisioningState(prev => ({...prev, status: 'Enter a valid MQTT Broker URI.'}));
      addAlert('info', 'Invalid broker URI');
      return;
    }
    setIsManualConnecting(true);
    setProvisioningState(prev => ({...prev, step: 'provisioning', status: `Connecting directly to broker ${brokerUri}...`}));
    setConnectionStatus('Connecting...');
    logDiagnostic(`Manual broker connect: ${brokerUri}`);
    try {
      mqttRef.current?.disconnect();
      try {
        await setupMQTT(brokerUri, 12000);
        addAlert('info', `Direct connect to ${brokerUri}`);
        logDiagnostic('Waiting for MQTT onConnect before entering radar view');
        return;
      } catch (err: any) {
        logDiagnostic(`Direct connect failed for ${brokerUri}: ${err?.message || String(err)}`);
      }
      addAlert('info', 'Manual connect failed');
    } finally {
      setIsManualConnecting(false);
    }
  }, [isManualConnecting, manualBrokerIP, setupMQTT, addAlert, logDiagnostic, normalizeBrokerUri]);

  // ── Radar Selection ─────────────────────────────

  const selectRadar = useCallback((radarId: string) => {
    selectedRadarIdRef.current = radarId;
    setSelectedRadarId(radarId);
    setCurrentRadarId(radarId);
    setShowRadarPicker(false);
    trackerRef.current?.reset();
    mqttMsgCountRef.current = 0;
    setFrameCount(0);
    if (mqttRef.current) {
      analyticsRef.current.bind(mqttRef.current, radarId);
    }
    debugLog(`Switched to radar: ${radarId}`);
    addAlert('info', `Switched to radar: ${radarId}`);
  }, [addAlert, debugLog]);

  // ── Test MQTT ───────────────────────────────────

  const testMQTTPublish = useCallback(async () => {
    if (!mqttRef.current?.isConnected) {
      addAlert('info', 'MQTT not connected');
      return;
    }
    try {
      mqttRef.current.publish('linovt/radar1/test', `ping:${Date.now()}`);
      addAlert('info', 'Test message published');
    } catch {
      addAlert('info', 'MQTT connected (publish skipped)');
    }
  }, [addAlert]);

  // ── Disconnect ──────────────────────────────────

  const disconnect = useCallback(async () => {
    mqttRef.current?.disconnect();
    mqttRef.current = null;
    analyticsRef.current.unbind();
    trackerRef.current?.reset();
    if (provisioningState.selectedDevice) {
      try { provisioningState.selectedDevice.disconnect(); } catch {}
    }
    setConnectionStatus('Disconnected');
    setRadarData(null);
    setFallDetected(false);
    setFrameCount(0);
    setProvisioningState({
      step: 'scanning',
      devicePrefix: 'PROV_',
      radarPassword: '',
      wifiSSID: '',
      wifiPassword: '',
      mqttBrokerURI: '',
      selectedDevice: null,
      deviceList: [],
      wifiList: [],
      status: 'Enter device prefix and tap Scan',
    });
  }, [provisioningState.selectedDevice]);

  // ── Settings ────────────────────────────────────

  const updateSpeedThreshold = useCallback((val: number) => {
    setSpeedThreshold(Math.max(0.1, Math.min(5.0, Math.round(val * 10) / 10)));
  }, []);

  const updateFallZThreshold = useCallback((val: number) => {
    const v = Math.max(0.1, Math.min(2.5, Math.round(val * 10) / 10));
    setFallZThreshold(v);
  }, []);

  const updateRadarHeight = useCallback((val: number) => {
    setRadarHeight(Math.max(0.5, Math.min(5.0, Math.round(val * 10) / 10)));
  }, []);

  const updateRoomWidth = useCallback((val: number) => {
    const v = Math.max(2, Math.min(20, Math.round(val)));
    setRoomWidth(v);
  }, []);

  const updateRoomDepth = useCallback((val: number) => {
    const v = Math.max(2, Math.min(20, Math.round(val)));
    setRoomDepth(v);
  }, []);

  const saveCurrentSettings = useCallback(async () => {
    const settings = {
      speedThreshold,
      fallZThreshold,
      safeZonePoints,
      radarHeight,
      roomWidth,
      roomDepth,
      wifiSSID: provisioningState.wifiSSID,
    };
    await saveSettingsForDevice(currentRadarId || 'radar_main', settings);
    setSettingsSaved(true);
    addAlert('info', 'Settings saved');
    setTimeout(() => setSettingsSaved(false), 2000);
  }, [speedThreshold, fallZThreshold, safeZonePoints, radarHeight, roomWidth, roomDepth, provisioningState.wifiSSID, addAlert, currentRadarId]);

  const startDrawingZone = useCallback(() => {
    setIsDrawingZone(true);
    isDrawingZoneRef.current = true;
    setAlerts([]);
    setShowSettings(false);
    setSafeZonePoints([]);
    safeZoneRef.current = [];
  }, []);

  const clearSafeZone = useCallback(() => {
    setSafeZonePoints([]);
    safeZoneRef.current = [];
    setIsDrawingZone(false);
    isDrawingZoneRef.current = false;
    setAlerts([]);
  }, []);

  const onSafeZoneComplete = useCallback((points: {x: number; y: number}[]) => {
    setSafeZonePoints(points);
    safeZoneRef.current = points;
    debugLog(`Safe zone stored: ${points.length} points`);
    setIsDrawingZone(false);
    isDrawingZoneRef.current = false;
    setTimeout(() => setAlerts([]), 500);
  }, [debugLog]);

  const cancelDraw = useCallback(() => {
    setIsDrawingZone(false);
    isDrawingZoneRef.current = false;
    setAlerts([]);
  }, []);

  // ── Lifecycle ───────────────────────────────────
  useEffect(() => {
    loadDiagnostics().then(setDiagnosticsLogs).catch(() => {});
    loadProvisionedRadars().then(r => setProvisionedRadars(r));
  }, []);

  useEffect(() => {
    return () => {
      if (debugFlushTimerRef.current) clearTimeout(debugFlushTimerRef.current);
      trackerRef.current?.destroy();
      mqttRef.current?.disconnect();
    };
  }, []);

  // ═══════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════

  const isProvisioned = provisioningState.step === 'connected';

  if (!isProvisioned) {
    return (
      <>
        <ProvisioningScreen
          state={provisioningState}
          setState={setProvisioningState}
          isScanning={isScanning}
          isReconnectingId={isReconnectingId}
          provisionedRadars={provisionedRadars}
          manualBrokerIP={manualBrokerIP}
          setManualBrokerIP={setManualBrokerIP}
          isManualConnecting={isManualConnecting}
          onStartScan={startScan}
          onSelectDevice={selectDevice}
          onScanDeviceWifi={scanDeviceWifi}
          onSendProvision={sendProvision}
          onReconnect={reconnectProvisionedRadar}
          onConnectManual={connectManualBroker}
          diagnosticsLogs={diagnosticsLogs}
          onClearDiagnostics={() => {
            clearDiagnostics().then(() => setDiagnosticsLogs([])).catch(() => {});
          }}
          onOpenSetupFlow={() => setShowSetupFlow(true)}
          mqttBrokerURI={provisioningState.mqttBrokerURI}
          setMqttBrokerURI={setMqttBrokerURI}
        />
        <SetupFlow
          visible={showSetupFlow}
          onClose={() => setShowSetupFlow(false)}
          initialApiBase={setupApiBase}
        />
      </>
    );
  }

  return (
    <>
      <RadarView
        connectionStatus={connectionStatus}
        radarData={radarData}
        fallDetected={fallDetected}
        fallZThreshold={fallZThreshold}
        isDrawingZone={isDrawingZone}
        safeZonePoints={safeZonePoints}
        roomWidth={roomWidth}
        roomDepth={roomDepth}
        alerts={alerts}
        frameCount={frameCount}
        selectedRadarId={selectedRadarId}
        mqttMsgCount={mqttMsgCountRef.current}
        onSafeZoneComplete={onSafeZoneComplete}
        onCancelDraw={cancelDraw}
        onSettings={() => setShowSettings(true)}
        onTestPublish={testMQTTPublish}
        onSave={saveCurrentSettings}
        onRadarPicker={() => setShowRadarPicker(true)}
        onDebug={() => setShowDebug(true)}
        onDisconnect={disconnect}
        settingsSaved={settingsSaved}
        onRadarConfig={() => setShowRadarConfig(true)}
        onLogs={() => setShowConnectionLogs(true)}
      />

      <RadarConfigScreen
        visible={showRadarConfig}
        onClose={() => setShowRadarConfig(false)}
        currentRadarId={currentRadarId}
        firmwareState={firmwareState}
        onPublishConfig={publishRadarConfig}
        onSendRadarCommand={sendRadarCommand}
        onRequestConfig={() => {
          if (mqttRef.current && currentRadarId) {
            mqttRef.current.publish(`linovt/${currentRadarId}/radar/config/get`, '');
            appendMqttLog('CMD', 'Pedida configuração atual ao radar', undefined, currentRadarId);
          }
        }}
      />

      <ConnectionLogScreen
        visible={showConnectionLogs}
        onClose={() => setShowConnectionLogs(false)}
        logs={mqttLogs}
        onClear={() => {
          mqttLogsRef.current = [];
          setMqttLogs([]);
        }}
      />

      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        speedThreshold={speedThreshold}
        fallZThreshold={fallZThreshold}
        radarHeight={radarHeight}
        roomWidth={roomWidth}
        roomDepth={roomDepth}
        settingsSaved={settingsSaved}
        onSpeedThresholdChange={updateSpeedThreshold}
        onFallZThresholdChange={updateFallZThreshold}
        onRadarHeightChange={updateRadarHeight}
        onRoomWidthChange={updateRoomWidth}
        onRoomDepthChange={updateRoomDepth}
        onDrawSafeZone={startDrawingZone}
        onClearSafeZone={clearSafeZone}
        onSave={saveCurrentSettings}
      />

      <RadarPickerModal
        visible={showRadarPicker}
        onClose={() => setShowRadarPicker(false)}
        discoveredRadars={discoveredRadars}
        selectedRadarId={selectedRadarId}
        onSelectRadar={selectRadar}
      />

      <DebugPanel
        visible={showDebug}
        onClose={() => setShowDebug(false)}
        logs={debugLogs}
        onClear={() => {
          debugLogsRef.current = [];
          setDebugLogs([]);
          mqttMsgCountRef.current = 0;
        }}
        mqttMsgCount={mqttMsgCountRef.current}
        frameCount={frameCount}
        activeTargetCount={radarData?.targets?.length || 0}
      />
    </>
  );
};

export default App;

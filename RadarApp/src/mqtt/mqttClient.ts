/**
 * mqttClient.ts — MQTT connection manager.
 *
 * Encapsulates connection to the MQTT broker, topic subscriptions,
 * and message dispatching. Handles reconnection via the library's
 * built-in reconnect.
 */

import {Buffer} from 'buffer';
import MQTT from 'sp-react-native-mqtt';
import {MQTT_KEEPALIVE} from '../constants';

export interface MQTTCallbacks {
  onConnect: (brokerUri: string) => void;
  onDisconnect: () => void;
  onError: (err: string) => void;
  onTelemetry: (radarId: string, data: any) => void;
  onAvailability: (radarId: string, status: 'online' | 'offline') => void;
  onDeviceStatus?: (radarId: string, payload: Record<string, unknown>) => void;
  onDeviceError?: (radarId: string, payload: { context: string; error: string }) => void;
  onRadarStatus?: (radarId: string, status: string) => void;
  onRadarConfigStatus?: (radarId: string, status: string) => void;
  onRadarConfigState?: (radarId: string, config: Record<string, unknown>) => void;
  onCmdStatus?: (radarId: string, status: string) => void;
  onRadarCmdStatus?: (radarId: string, status: string) => void;
}

export interface MQTTConnectOptions {
  reconnect?: boolean;
  connectTimeoutMs?: number;
}

/**
 * Manages the MQTT connection to the backend and radar devices.
 * Implements the ESP32 radar topic structure: linovt/<device_id>/<suffix>
 * Handles both binary telemetry and JSON/string state payloads.
 */
export class MQTTClient {
  private client: any = null;
  private brokerUri: string = '';
  private callbacks: MQTTCallbacks;

  constructor(callbacks: MQTTCallbacks) {
    this.callbacks = callbacks;
  }

  get isConnected(): boolean {
    return this.client !== null;
  }

  get currentBrokerIP(): string {
    return this.brokerUri;
  }

  async connect(brokerUriOrHost: string, options?: MQTTConnectOptions): Promise<void> {
    // Disconnect existing if any
    this.disconnect();

    const brokerUri = /^\w+:\/\//.test(brokerUriOrHost)
      ? brokerUriOrHost.trim()
      : `mqtt://${brokerUriOrHost.trim()}`;

    this.brokerUri = brokerUri;
    const clientId =
      'RadarApp-' + Date.now().toString(16) + '-' + Math.random().toString(16).substr(2, 5);
    const reconnect = options?.reconnect ?? true;
    const connectTimeoutMs = Math.max(1000, options?.connectTimeoutMs ?? 20000);

    try {
      const client = await MQTT.createClient({
        uri: brokerUri,
        clientId,
        keepalive: MQTT_KEEPALIVE,
        clean: true,
        reconnect,
        connectionLostTimeout: 30, // Increased from 5 to 30
        reconnectPeriod: 5000,
      } as any);

      this.client = client;

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let hasConnected = false;
        const timeout = setTimeout(() => {
          if (settled || hasConnected) return;
          settled = true;
          try {
            client.disconnect();
          } catch {}
          if (this.client === client) this.client = null;
          reject(new Error(`MQTT connect timeout (${connectTimeoutMs}ms)`));
        }, connectTimeoutMs);

        const settleResolve = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve();
        };

        const settleReject = (err: unknown) => {
          if (settled || hasConnected) return;
          settled = true;
          clearTimeout(timeout);
          try {
            client.disconnect();
          } catch {}
          if (this.client === client) this.client = null;
          const text =
            typeof err === 'string'
              ? err
              : err instanceof Error
              ? err.message
              : String(err);
          reject(new Error(text));
        };

        client.on('connect', () => {
          hasConnected = true;
          client.subscribe('linovt/+/availability', 0);
          client.subscribe('linovt/+/telemetry', 0);
          client.subscribe('linovt/+/status', 0);
          client.subscribe('linovt/+/error', 0);
          client.subscribe('linovt/+/radar/status', 0);
          client.subscribe('linovt/+/radar/config/status', 0);
          client.subscribe('linovt/+/radar/config/state', 0);
          client.subscribe('linovt/+/cmd/status', 0);
          client.subscribe('linovt/+/radar/cmd/status', 0);
          this.callbacks.onConnect(brokerUri);
          settleResolve();
        });

        client.on('message', (msg: any) => {
          try {
            this.handleMessage(msg);
          } catch (error) {
            this.callbacks.onError(`MQTT message handling failed: ${String(error)}`);
          }
        });

        client.on('error', (err: string) => {
          this.callbacks.onError(err);
          settleReject(err);
        });

        client.on('closed', () => {
          this.callbacks.onDisconnect();
          settleReject('MQTT connection closed before connect');
        });

        client.connect();
      });
    } catch (err) {
      this.client = null;
      this.callbacks.onError(String(err));
      throw err;
    }
  }

  disconnect() {
    if (this.client) {
      try {
        this.client.disconnect();
      } catch {}
      this.client = null;
    }
  }

  publish(topic: string, payload: string, qos = 0, retained = false) {
    if (this.client && typeof this.client.publish === 'function') {
      this.client.publish(topic, payload, qos, retained);
    }
  }

  // ── Private ─────────────────────────────────────

  private handleMessage(msg: any) {
    const topic =
      (typeof msg?.topic === 'string' && msg.topic) ||
      (typeof msg?.destinationName === 'string' && msg.destinationName) ||
      (typeof msg?.destination_name === 'string' && msg.destination_name) ||
      '';
    if (!topic) return;

    // Topics follow format: linovt/<device_id>/<suffix>
    const topicParts = topic.split('/');
    const radarId = topicParts.length >= 2 ? topicParts[1] : null;

    if (topic.includes('/availability')) {
      const statusStr = this.decodePayloadText(msg).trim();
      if (radarId) {
        this.callbacks.onAvailability(
          radarId,
          statusStr === 'online' ? 'online' : 'offline',
        );
      }
      return;
    }

    if (topic.includes('/telemetry') && radarId) {
      const payload = this.extractPayload(msg);
      if (payload == null) return;
      this.callbacks.onTelemetry(radarId, payload);
      return;
    }

    // Firmware status/error/config topics
    if (radarId) {
      const text = this.decodePayloadText(msg).trim();
      this.handleFirmwareMessage(topic, radarId, text);
    }
  }

  /**
   * Handles non-telemetry state updates from the radar device.
   * Based on the ESP32 radar configuration protocol.
   */
  private handleFirmwareMessage(topic: string, radarId: string, text: string) {
    if (topic.endsWith('/radar/config/state')) {
      try {
        const parsed = JSON.parse(text);
        this.callbacks.onRadarConfigState?.(radarId, parsed);
      } catch { /* ignore parse errors */ }
      return;
    }

    if (topic.endsWith('/radar/config/status')) {
      try {
        const parsed = JSON.parse(text);
        this.callbacks.onRadarConfigStatus?.(radarId, parsed.status ?? text);
      } catch {
        this.callbacks.onRadarConfigStatus?.(radarId, text);
      }
      return;
    }

    if (topic.endsWith('/radar/status')) {
      try {
        const parsed = JSON.parse(text);
        this.callbacks.onRadarStatus?.(radarId, parsed.status ?? text);
      } catch {
        this.callbacks.onRadarStatus?.(radarId, text);
      }
      return;
    }

    if (topic.endsWith('/error')) {
      try {
        const parsed = JSON.parse(text);
        this.callbacks.onDeviceError?.(radarId, {
          context: String(parsed.context ?? 'unknown'),
          error: String(parsed.error ?? text),
        });
      } catch {
        this.callbacks.onDeviceError?.(radarId, { context: 'unknown', error: text });
      }
      return;
    }

    if (topic.endsWith('/status') && !topic.includes('/radar/') && !topic.includes('/cmd/')) {
      try {
        const parsed = JSON.parse(text);
        this.callbacks.onDeviceStatus?.(radarId, parsed);
      } catch {
        this.callbacks.onDeviceStatus?.(radarId, { raw: text });
      }
      return;
    }

    if (topic.endsWith('/cmd/status') && !topic.includes('/radar/')) {
      this.callbacks.onCmdStatus?.(radarId, text);
      return;
    }

    if (topic.endsWith('/radar/cmd/status')) {
      this.callbacks.onRadarCmdStatus?.(radarId, text);
      return;
    }
  }

  private extractPayload(msg: any): any {
    return (
      msg?.data ??
      msg?.payload ??
      msg?.message ??
      msg?.payloadString ??
      msg?.payloadBytes ??
      msg?.bytes ??
      msg?.buffer ??
      null
    );
  }

  private decodePayloadText(msg: any): string {
    const payload = this.extractPayload(msg);
    if (payload == null) return '';

    try {
      if (typeof payload === 'string') {
        const value = payload.trim();
        const isBase64 =
          value.length >= 4 &&
          value.length % 4 === 0 &&
          /^[A-Za-z0-9+/=]+$/.test(value);

        if (isBase64) {
          const decoded = Buffer.from(value, 'base64').toString('utf-8').trim();
          if (decoded.length > 0) {
            return decoded;
          }
        }

        return value;
      }

      if (payload instanceof Uint8Array) {
        return Buffer.from(payload).toString('utf-8');
      }

      if (Array.isArray(payload)) {
        return Buffer.from(payload).toString('utf-8');
      }

      if (typeof payload === 'object' && typeof payload.byteLength === 'number') {
        return Buffer.from(payload as ArrayBufferLike).toString('utf-8');
      }

      return String(payload);
    } catch {
      try {
        return String(payload);
      } catch {
        return '';
      }
    }
  }
}

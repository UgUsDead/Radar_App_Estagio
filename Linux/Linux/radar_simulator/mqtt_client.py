"""
mqtt_client.py — MQTT connection wrapper for the simulator.

Handles:
  • connecting to the broker
  • publishing telemetry frames (binary protobuf)
  • publishing availability (online / offline)
  • last-will testament for clean disconnects
  • responding to device/radar commands (simulating firmware behavior)
  • responding to radar config set/get requests
"""

from __future__ import annotations

import json
import logging
import time
import uuid

import paho.mqtt.client as mqtt

from .config import MQTTConfig

logger = logging.getLogger(__name__)

# Default radar config that the simulator returns
DEFAULT_RADAR_CONFIG = {
    "schema": 1,
    "profile": "aop_6m_static_retention",
    "applyMode": "restart",
    "mount": {"heightM": 2.5, "azimuthTiltDeg": 0.0, "elevationTiltDeg": 15.0},
    "fov": {"azimuthDeg": 70.0, "elevationDeg": 70.0},
    "roi": {
        "tracking": {"xMin": -4.0, "xMax": 4.0, "yMin": 0.0, "yMax": 8.0, "zMin": 0.0, "zMax": 3.0},
        "static":   {"xMin": -3.0, "xMax": 3.0, "yMin": 0.5, "yMax": 7.5, "zMin": 0.0, "zMax": 3.0},
        "presence": {"xMin": -3.0, "xMax": 3.0, "yMin": 0.5, "yMax": 7.5, "zMin": 0.0, "zMax": 3.0},
    },
    "detection": {"dynamicSensitivity": "normal", "staticSensitivity": "normal", "fineMotion": True},
    "tracking": {"mode": "stable"},
    "timing": {"framePeriodMs": 55},
}


class SimulatorMQTTClient:
    """Thin wrapper around paho-mqtt for simulator use."""

    def __init__(self, cfg: MQTTConfig):
        self.cfg = cfg
        self._current_config = dict(DEFAULT_RADAR_CONFIG)
        unique_suffix = uuid.uuid4().hex[:8]
        self._client = mqtt.Client(
            client_id=f"radar_sim_{int(time.time()) % 100000}_{unique_suffix}",
            protocol=mqtt.MQTTv311,
            clean_session=True,
        )
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._connected = False

        # Last-will: mark offline if simulator crashes
        self._client.will_set(
            cfg.availability_topic,
            "offline",
            qos=0,
            retain=True,
        )

    # ── Lifecycle ───────────────────────────────────────

    def connect(self):
        """Connect to broker (blocking until CONNACK)."""
        logger.info(
            "Connecting to MQTT broker %s:%d …",
            self.cfg.broker_host,
            self.cfg.broker_port,
        )
        self._client.connect(
            self.cfg.broker_host,
            self.cfg.broker_port,
            keepalive=self.cfg.keepalive,
        )
        self._client.loop_start()

        # Wait for CONNACK (up to 5 s)
        deadline = time.time() + 5.0
        while not self._connected and time.time() < deadline:
            time.sleep(0.05)
        if not self._connected:
            raise ConnectionError("MQTT CONNACK not received within 5 s")

    def disconnect(self):
        """Graceful disconnect: publish offline, then close."""
        try:
            self._client.publish(
                self.cfg.availability_topic, "offline", qos=0, retain=True
            )
            time.sleep(0.15)  # let message drain
        except Exception:
            pass
        self._client.loop_stop()
        self._client.disconnect()
        self._connected = False
        logger.info("MQTT disconnected")

    @property
    def is_connected(self) -> bool:
        return self._connected

    # ── Publishing ──────────────────────────────────────

    def publish_telemetry(self, payload: bytes):
        """Publish a binary protobuf frame."""
        if not self._connected:
            return
        self._client.publish(
            self.cfg.telemetry_topic, payload, qos=0, retain=False
        )

    def publish_availability(self, status: str = "online"):
        if not self._connected:
            return
        self._client.publish(
            self.cfg.availability_topic, status, qos=0, retain=True
        )

    def subscribe(self, topic: str, callback):
        """Subscribe to a topic and register a callback."""
        self._client.subscribe(topic, qos=0)
        self._client.message_callback_add(topic, callback)

    # ── Firmware Command Handlers ──────────────────────

    def _handle_device_cmd(self, client, userdata, msg):
        """Handle linovt/<id>/cmd messages."""
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
            cmd = payload.get("cmd", "")
            logger.info("Device cmd received: %s", cmd)

            if cmd == "status":
                self._client.publish(
                    self.cfg.cmd_status_topic,
                    json.dumps({"ok": True, "status": "status_published"}),
                )
                self._client.publish(
                    self.cfg.status_topic,
                    json.dumps({"boot": True, "uptime_s": int(time.time() % 100000), "heap_free": 120000}),
                )
            elif cmd == "reboot":
                logger.info("Simulating reboot (going offline 3s)...")
                self._client.publish(
                    self.cfg.cmd_status_topic,
                    json.dumps({"ok": True, "status": "rebooting"}),
                )
                self._client.publish(self.cfg.availability_topic, "offline", qos=0, retain=True)
                time.sleep(3)
                self._client.publish(self.cfg.availability_topic, "online", qos=0, retain=True)
                self._client.publish(
                    self.cfg.status_topic,
                    json.dumps({"boot": True, "uptime_s": 0, "heap_free": 130000}),
                )
            else:
                logger.warning("Unknown device cmd: %s", cmd)
        except Exception as e:
            logger.error("Error handling device cmd: %s", e)

    def _handle_radar_cmd(self, client, userdata, msg):
        """Handle linovt/<id>/radar/cmd messages."""
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
            cmd = payload.get("cmd", "")
            logger.info("Radar cmd received: %s", cmd)

            if cmd == "status":
                self._client.publish(
                    self.cfg.radar_status_topic,
                    json.dumps({"ok": True, "status": "idle"}),
                )
            elif cmd in ("restart", "reset", "radar.restart"):
                self._client.publish(
                    self.cfg.radar_status_topic,
                    json.dumps({"ok": True, "status": "restarting"}),
                )
                time.sleep(1)
                self._client.publish(
                    self.cfg.radar_status_topic,
                    json.dumps({"ok": True, "status": "idle"}),
                )
            elif cmd == "default_config":
                self._current_config = dict(DEFAULT_RADAR_CONFIG)
                self._client.publish(
                    self.cfg.radar_config_status_topic,
                    json.dumps({"ok": True, "status": "applied", "detail": "default_config_restored"}),
                )
                self._client.publish(
                    self.cfg.radar_config_state_topic,
                    json.dumps(self._current_config),
                    qos=0,
                    retain=True,
                )
                logger.info("Radar config reset to defaults")
            elif cmd == "config_get":
                self._client.publish(
                    self.cfg.radar_config_state_topic,
                    json.dumps(self._current_config),
                    qos=0,
                    retain=True,
                )
                self._client.publish(
                    self.cfg.radar_config_status_topic,
                    json.dumps({"ok": True, "status": "state_published"}),
                )
            else:
                logger.warning("Unknown radar cmd: %s", cmd)
        except Exception as e:
            logger.error("Error handling radar cmd: %s", e)

    def _handle_radar_config_set(self, client, userdata, msg):
        """Handle linovt/<id>/radar/config/set messages."""
        try:
            new_config = json.loads(msg.payload.decode("utf-8"))
            logger.info("Radar config set received: %s", json.dumps(new_config)[:200])

            # Publish accepted
            self._client.publish(
                self.cfg.radar_config_status_topic,
                json.dumps({"ok": True, "status": "accepted"}),
            )

            # Simulate apply delay
            time.sleep(0.5)

            # Merge new config into current
            self._current_config.update(new_config)

            # Publish applied + updated state
            self._client.publish(
                self.cfg.radar_config_status_topic,
                json.dumps({"ok": True, "status": "applied"}),
            )
            self._client.publish(
                self.cfg.radar_config_state_topic,
                json.dumps(self._current_config),
                qos=0,
                retain=True,
            )
            logger.info("Radar config applied successfully")
        except json.JSONDecodeError as e:
            self._client.publish(
                self.cfg.radar_config_status_topic,
                json.dumps({"ok": False, "status": "rejected:parse_error", "error": str(e)}),
            )
        except Exception as e:
            self._client.publish(
                self.cfg.radar_config_status_topic,
                json.dumps({"ok": False, "status": "failed", "error": str(e)}),
            )

    def _handle_radar_config_get(self, client, userdata, msg):
        """Handle linovt/<id>/radar/config/get messages."""
        logger.info("Radar config get request received")
        self._client.publish(
            self.cfg.radar_config_state_topic,
            json.dumps(self._current_config),
            qos=0,
            retain=True,
        )
        self._client.publish(
            self.cfg.radar_config_status_topic,
            json.dumps({"ok": True, "status": "state_published"}),
        )

    # ── Callbacks ───────────────────────────────────────

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self._connected = True
            logger.info(
                "MQTT connected  →  telemetry on %s", self.cfg.telemetry_topic
            )
            self.publish_availability("online")

            # Publish boot status
            self._client.publish(
                self.cfg.status_topic,
                json.dumps({"boot": True, "uptime_s": 0, "heap_free": 130000}),
            )

            # Publish retained radar config state
            self._client.publish(
                self.cfg.radar_config_state_topic,
                json.dumps(self._current_config),
                qos=0,
                retain=True,
            )

            # Publish idle radar status
            self._client.publish(
                self.cfg.radar_status_topic,
                json.dumps({"ok": True, "status": "idle"}),
            )

            # Subscribe to firmware command topics
            self._client.subscribe(self.cfg.cmd_topic, qos=0)
            self._client.message_callback_add(self.cfg.cmd_topic, self._handle_device_cmd)

            self._client.subscribe(self.cfg.radar_cmd_topic, qos=0)
            self._client.message_callback_add(self.cfg.radar_cmd_topic, self._handle_radar_cmd)

            self._client.subscribe(self.cfg.radar_config_set_topic, qos=0)
            self._client.message_callback_add(self.cfg.radar_config_set_topic, self._handle_radar_config_set)

            self._client.subscribe(self.cfg.radar_config_get_topic, qos=0)
            self._client.message_callback_add(self.cfg.radar_config_get_topic, self._handle_radar_config_get)

            logger.info("Subscribed to firmware command topics")
        else:
            logger.error("MQTT connection refused: rc=%d", rc)

    def _on_disconnect(self, client, userdata, rc):
        self._connected = False
        if rc != 0:
            logger.warning("MQTT unexpected disconnect: rc=%d", rc)

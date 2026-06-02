"""
control_listener.py — Runtime control via MQTT (and optional stdin).

Subscribes to ``radar/simulator/control`` and accepts JSON commands:

    {"num_people": 3}          — set simulated person count
    {"target": "simulator_radar_2", "num_people": 3}
    {"simulate_fall": true}    — trigger a fall on a random person
    {"target": "simulator_radar_2", "simulate_fall": true}
    {"simulate_fall": 2}       — trigger fall on person index 2
    {"targets": ["simulator_radar_1", "simulator_radar_3"], "frame_rate": 15}
    {"frame_rate": 15}         — change frame rate live
    {"room_width": 8}          — resize room X dimension
    {"room_depth": 5}          — resize room Y dimension

Target selectors:
    target / radar_id / device_id  (single radar)
    targets                         (list of radars)
If omitted, command applies to all simulated radars.

Also spawns a background stdin reader so you can type commands in
the terminal:

    p3        — set 3 people
    p3 r2     — set 3 people on radar r2
    fall      — trigger random fall
    fall r2   — trigger random fall on radar r2
    fall 1    — trigger fall on person 1
    fps 20 r2 — set fps to 20 on radar r2
    roomw 8 r2
    roomd 5 r2
    list      — show radar IDs
    quit      — stop simulator
"""

from __future__ import annotations

import json
import logging
import threading
import sys
from typing import Any
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .radar_model import RadarModel
    from .mqtt_client import SimulatorMQTTClient
    from .config import SimConfig

logger = logging.getLogger(__name__)


class ControlListener:
    """Listens for runtime commands via MQTT and stdin."""

    def __init__(
        self,
        mqtt_client: "SimulatorMQTTClient",
        model: "RadarModel" | None = None,
        cfg: "SimConfig" | None = None,
        models: list["RadarModel"] | None = None,
        cfgs: list["SimConfig"] | None = None,
        on_quit: threading.Event | None = None,
    ):
        self.mqtt_client = mqtt_client
        self.models = models if models else ([] if model is None else [model])
        self.cfgs = cfgs if cfgs else ([] if cfg is None else [cfg])
        if not self.models:
            raise ValueError("ControlListener requires at least one model")
        if not self.cfgs:
            raise ValueError("ControlListener requires at least one config")

        self._model_by_id: dict[str, RadarModel] = {}
        self._cfg_by_id: dict[str, SimConfig] = {}
        for m, c in zip(self.models, self.cfgs):
            did = c.radar.device_id
            self._model_by_id[did] = m
            self._cfg_by_id[did] = c

        self._quit_event = on_quit or threading.Event()

    @property
    def quit_event(self) -> threading.Event:
        return self._quit_event

    def start(self):
        """Subscribe to MQTT control topic and start stdin thread."""
        control_topic = self.cfgs[0].mqtt.control_topic
        self.mqtt_client.subscribe(
            control_topic, self._on_mqtt_control
        )
        logger.info("Control listening on MQTT topic: %s", control_topic)

        if sys.stdin and sys.stdin.isatty():
            t = threading.Thread(target=self._stdin_loop, daemon=True)
            t.start()
            logger.info(
                "Stdin controls: p<N> [radar] | fall [idx] [radar] | fps <n> [radar] | roomw/roomd <n> [radar] | list | quit"
            )
        else:
            logger.info("Stdin controls disabled (non-interactive session)")

    # ── MQTT handler ────────────────────────────────────

    def _on_mqtt_control(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            logger.warning("Bad control payload: %r", msg.payload)
            return

        self._handle_command(payload)

    # ── Stdin handler ───────────────────────────────────

    def _stdin_loop(self):
        """Blocking readline loop on stdin (daemon thread)."""
        try:
            while not self._quit_event.is_set():
                try:
                    line = input()
                except EOFError:
                    break
                line = line.strip()
                if not line:
                    continue

                parts = line.split()
                cmd = parts[0].lower()

                if cmd == "quit" or cmd == "q":
                    logger.info("Quit requested via stdin")
                    self._quit_event.set()
                    break

                if cmd == "list":
                    logger.info("Known radars: %s", ", ".join(self._model_by_id.keys()))
                    continue

                if cmd.startswith("p") and cmd[1:].isdigit():
                    n = int(cmd[1:])
                    payload: dict[str, Any] = {"num_people": n}
                    if len(parts) >= 2:
                        payload["target"] = self._token_to_target(parts[1])
                    self._handle_command(payload)
                    continue

                if cmd == "fall":
                    if len(parts) == 1:
                        self._handle_command({"simulate_fall": True})
                        continue

                    payload: dict[str, Any]
                    target_token_index = 1
                    if parts[1].isdigit():
                        payload = {"simulate_fall": int(parts[1])}
                        target_token_index = 2
                    else:
                        payload = {"simulate_fall": True}

                    if len(parts) > target_token_index:
                        payload["target"] = self._token_to_target(parts[target_token_index])
                    self._handle_command(payload)
                    continue

                if cmd == "fps" and len(parts) >= 2 and parts[1].isdigit():
                    payload = {"frame_rate": int(parts[1])}
                    if len(parts) >= 3:
                        payload["target"] = self._token_to_target(parts[2])
                    self._handle_command(payload)
                    continue

                if cmd in {"roomw", "room_width"} and len(parts) >= 2:
                    try:
                        width = float(parts[1])
                    except ValueError:
                        width = None
                    if width is not None:
                        payload = {"room_width": width}
                        if len(parts) >= 3:
                            payload["target"] = self._token_to_target(parts[2])
                        self._handle_command(payload)
                        continue

                if cmd in {"roomd", "room_depth"} and len(parts) >= 2:
                    try:
                        depth = float(parts[1])
                    except ValueError:
                        depth = None
                    if depth is not None:
                        payload = {"room_depth": depth}
                        if len(parts) >= 3:
                            payload["target"] = self._token_to_target(parts[2])
                        self._handle_command(payload)
                        continue

                logger.info("Unknown command: %s", line)
        except Exception:
            logger.exception("Stdin control loop crashed")

    @staticmethod
    def _token_to_target(token: str) -> str:
        token = token.strip()
        if token.startswith("@"):
            token = token[1:]
        return token

    def _resolve_target_ids(self, cmd: dict) -> list[str]:
        """Resolve radar IDs from command selectors; default is all radars."""
        known_ids = list(self._model_by_id.keys())
        selectors: list[str] = []

        for key in ("target", "radar_id", "device_id"):
            value = cmd.get(key)
            if isinstance(value, str) and value.strip():
                selectors.append(value.strip())

        targets_val = cmd.get("targets")
        if isinstance(targets_val, list):
            selectors.extend(str(v).strip() for v in targets_val if str(v).strip())
        elif isinstance(targets_val, str):
            selectors.extend(v.strip() for v in targets_val.split(",") if v.strip())

        if not selectors:
            return known_ids

        resolved: list[str] = []
        for selector in selectors:
            if selector.lower() in {"all", "*"}:
                return known_ids
            if selector in self._model_by_id and selector not in resolved:
                resolved.append(selector)

        if not resolved:
            logger.warning("No matching radar target for command selectors: %s", selectors)

        return resolved

    def _resolve_models(self, target_ids: list[str]) -> list[tuple[str, RadarModel]]:
        return [(did, self._model_by_id[did]) for did in target_ids if did in self._model_by_id]

    def _resolve_cfgs(self, target_ids: list[str]) -> list[tuple[str, SimConfig]]:
        return [(did, self._cfg_by_id[did]) for did in target_ids if did in self._cfg_by_id]

    # ── Command dispatch ────────────────────────────────

    def _handle_command(self, cmd: dict):
        target_ids = self._resolve_target_ids(cmd)

        if "num_people" in cmd:
            n = int(cmd["num_people"])
            selected_models = self._resolve_models(target_ids)
            for _, model in selected_models:
                model.set_num_people(n)
            logger.info(
                "▸ People set to %d on %d radar(s): %s",
                n,
                len(selected_models),
                ", ".join(did for did, _ in selected_models),
            )

        if "simulate_fall" in cmd:
            val = cmd["simulate_fall"]
            selected_models = self._resolve_models(target_ids)
            if isinstance(val, bool) and val:
                for _, model in selected_models:
                    model.trigger_fall_random()
                logger.info(
                    "▸ Fall triggered (random person) on %d radar(s): %s",
                    len(selected_models),
                    ", ".join(did for did, _ in selected_models),
                )
            elif isinstance(val, int):
                for _, model in selected_models:
                    model.trigger_fall(val)
                logger.info(
                    "▸ Fall triggered (person %d) on %d radar(s): %s",
                    val,
                    len(selected_models),
                    ", ".join(did for did, _ in selected_models),
                )

        if "frame_rate" in cmd:
            fps = max(1, min(60, int(cmd["frame_rate"])))
            selected_cfgs = self._resolve_cfgs(target_ids)
            for _, cfg in selected_cfgs:
                cfg.frame_rate = fps
            logger.info(
                "▸ Frame rate set to %d fps on %d radar(s): %s",
                fps,
                len(selected_cfgs),
                ", ".join(did for did, _ in selected_cfgs),
            )

        if "room_width" in cmd:
            w = float(cmd["room_width"])
            selected_cfgs = self._resolve_cfgs(target_ids)
            for _, cfg in selected_cfgs:
                cfg.room.x_max = w
            logger.info(
                "▸ Room width (x_max) set to %.1f on %d radar(s): %s",
                w,
                len(selected_cfgs),
                ", ".join(did for did, _ in selected_cfgs),
            )

        if "room_depth" in cmd:
            d = float(cmd["room_depth"])
            half = d / 2.0
            selected_cfgs = self._resolve_cfgs(target_ids)
            for _, cfg in selected_cfgs:
                cfg.room.y_min = -half
                cfg.room.y_max = half
            logger.info(
                "▸ Room depth (y range) set to ±%.1f on %d radar(s): %s",
                half,
                len(selected_cfgs),
                ", ".join(did for did, _ in selected_cfgs),
            )

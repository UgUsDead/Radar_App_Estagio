#!/usr/bin/env python3
"""
main.py — Entry point for the mmWave radar simulator.

Usage:
    python -m radar_simulator                          # basic run
    python -m radar_simulator --people 3               # start with 3 people
    python -m radar_simulator --viz                    # enable matplotlib view
    python -m radar_simulator --broker 10.10.128.175   # custom broker
    python -m radar_simulator --device-id 48e7298d2838 # mimic a real device
    python -m radar_simulator --fps 15                 # 15 Hz

Runtime controls (type in terminal):
    p3        set 3 people
    p3 radar_2
    fall      trigger random fall
    fall radar_2
    fall 0    trigger fall on person 0
    fall 0 radar_2
    fps 20    set frame rate to 20
    fps 20 radar_2
    roomw 8 radar_2
    roomd 5 radar_2
    list      show known radar IDs
    quit      stop

MQTT runtime controls (publish JSON to radar/simulator/control):
    {"num_people": 3}
    {"target": "simulator_radar_2", "num_people": 3}
    {"simulate_fall": true}
    {"target": "simulator_radar_2", "simulate_fall": true}
    {"targets": ["simulator_radar_1", "simulator_radar_3"], "simulate_fall": 0}
    {"frame_rate": 15}
"""

from __future__ import annotations

import argparse
import copy
import logging
import signal
import sys
import threading
import time

from .config import SimConfig
from .radar_model import RadarModel
from .protobuf_encoder import encode_radar_message
from .mqtt_client import SimulatorMQTTClient
from .control_listener import ControlListener

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-5s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="mmWave radar telemetry simulator",
    )
    p.add_argument("--broker", default="localhost", help="MQTT broker host")
    p.add_argument("--port", type=int, default=1883, help="MQTT broker port")
    p.add_argument("--device-id", default="simulator_radar", help="Radar device ID used in topic")
    p.add_argument("--radars", type=int, default=1, help="Number of simulated radars to publish")
    p.add_argument(
        "--device-id-prefix",
        default="simulator_radar",
        help="Device ID prefix when --radars > 1 (e.g. simulator_radar_1)",
    )
    p.add_argument(
        "--device-ids",
        default="",
        help="Comma-separated explicit device IDs (overrides --radars and prefix)",
    )
    p.add_argument("--people", type=int, default=1, help="Initial number of simulated people")
    p.add_argument("--fps", type=int, default=10, help="Frames per second")
    p.add_argument("--room-width", type=float, default=6.0, help="Room X dimension (m)")
    p.add_argument("--room-depth", type=float, default=6.0, help="Room Y dimension (m)")
    p.add_argument("--radar-height", type=float, default=2.5, help="Radar mount height (m)")
    p.add_argument("--viz", action="store_true", help="Enable matplotlib debug visualization")
    p.add_argument("--no-artifacts", action="store_true", help="Disable ghost/noise/drop artifacts")
    p.add_argument("-v", "--verbose", action="store_true", help="Debug logging")
    return p.parse_args()


def build_config(args: argparse.Namespace) -> SimConfig:
    cfg = SimConfig()

    # MQTT
    cfg.mqtt.broker_host = args.broker
    cfg.mqtt.broker_port = args.port
    cfg.radar.device_id = args.device_id
    cfg.mqtt.apply_device_id(args.device_id)

    # Room
    cfg.room.x_min = 0.2
    cfg.room.x_max = args.room_width
    half_depth = args.room_depth / 2.0
    cfg.room.y_min = -half_depth
    cfg.room.y_max = half_depth

    # Radar
    cfg.radar.mount_z = args.radar_height

    # Simulation
    cfg.frame_rate = args.fps
    cfg.initial_num_people = args.people
    cfg.enable_visualization = args.viz

    # Artifacts
    if args.no_artifacts:
        cfg.artifacts.ghost_probability = 0.0
        cfg.artifacts.drop_frame_probability = 0.0
        cfg.artifacts.position_noise_sigma = 0.0
        cfg.artifacts.velocity_noise_sigma = 0.0

    return cfg


def resolve_device_ids(args: argparse.Namespace) -> list[str]:
    """Resolve radar device IDs for one or many simulated radars."""
    if args.device_ids.strip():
        seen: set[str] = set()
        ids: list[str] = []
        for raw in args.device_ids.split(","):
            did = raw.strip()
            if not did or did in seen:
                continue
            ids.append(did)
            seen.add(did)
        if ids:
            return ids

    if args.radars <= 1:
        return [args.device_id]

    prefix = args.device_id_prefix.strip() or "simulator_radar"
    return [f"{prefix}_{idx + 1}" for idx in range(args.radars)]


def main():
    args = parse_args()
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    base_cfg = build_config(args)
    device_ids = resolve_device_ids(args)

    simulators: list[dict] = []
    for device_id in device_ids:
        cfg = copy.deepcopy(base_cfg)
        cfg.radar.device_id = device_id
        cfg.mqtt.apply_device_id(device_id)
        model = RadarModel(cfg)
        mqtt_client = SimulatorMQTTClient(cfg.mqtt)
        simulators.append(
            {
                "device_id": device_id,
                "cfg": cfg,
                "model": model,
                "mqtt_client": mqtt_client,
            }
        )

    if not simulators:
        logger.error("No radar IDs resolved. Nothing to run.")
        sys.exit(1)

    primary = simulators[0]
    primary_cfg: SimConfig = primary["cfg"]
    primary_mqtt: SimulatorMQTTClient = primary["mqtt_client"]

    # ── Banner ──────────────────────────────────────────
    print("=" * 62)
    print("  mmWave Radar Simulator")
    print(f"  Broker:    {primary_cfg.mqtt.broker_host}:{primary_cfg.mqtt.broker_port}")
    print(f"  Radars:    {len(simulators)}")
    if len(simulators) == 1:
        print(f"  Device ID: {primary_cfg.radar.device_id}")
        print(f"  Topic:     {primary_cfg.mqtt.telemetry_topic}")
    else:
        print("  Topics:")
        for sim in simulators:
            cfg: SimConfig = sim["cfg"]
            print(f"    - {cfg.radar.device_id}: {cfg.mqtt.telemetry_topic}")
    print(f"  FPS:       {primary_cfg.frame_rate}")
    print(f"  People:    {primary_cfg.initial_num_people}")
    print(f"  Room:      {primary_cfg.room.x_max:.1f} × {primary_cfg.room.y_max - primary_cfg.room.y_min:.1f} m")
    print(f"  Radar Z:   {primary_cfg.radar.mount_z:.1f} m")
    print(f"  Viz:       {'ON' if primary_cfg.enable_visualization else 'OFF'}")
    print("=" * 62)

    # ── Create control coordination ──────────────────────
    quit_event = threading.Event()
    control = ControlListener(
        mqtt_client=primary_mqtt,
        models=[sim["model"] for sim in simulators],
        cfgs=[sim["cfg"] for sim in simulators],
        on_quit=quit_event,
    )

    # Handle Ctrl-C
    def _sigint(sig, frame):
        logger.info("SIGINT — shutting down")
        quit_event.set()
    signal.signal(signal.SIGINT, _sigint)

    # ── Connect MQTT ────────────────────────────────────
    connected_clients: list[SimulatorMQTTClient] = []
    try:
        for sim in simulators:
            client: SimulatorMQTTClient = sim["mqtt_client"]
            client.connect()
            connected_clients.append(client)
    except ConnectionError as e:
        logger.error("Could not connect to MQTT: %s", e)
        for client in connected_clients:
            try:
                client.disconnect()
            except Exception:
                pass
        sys.exit(1)

    # ── Start control listener ──────────────────────────
    control.start()

    # ── Optional visualizer ─────────────────────────────
    viz = None
    viz_thread = None
    if primary_cfg.enable_visualization:
        try:
            from .visualizer import Visualizer
            if len(simulators) > 1:
                logger.info(
                    "Visualization enabled for primary radar only: %s",
                    primary_cfg.radar.device_id,
                )
            viz = Visualizer(primary["model"], primary_cfg)
            # On Linux we can use a background thread
            viz_thread = threading.Thread(target=viz.start, daemon=True)
            viz_thread.start()
            logger.info("Visualizer started")
        except ImportError as e:
            logger.warning("Visualization unavailable: %s", e)

    # ── Main publish loop ───────────────────────────────
    frame_count = 0
    bytes_total = 0
    last_stats = time.time()

    logger.info(
        "Publishing radar stream(s) for %d radar(s) …  (type 'quit' or Ctrl-C to stop)",
        len(simulators),
    )

    try:
        while not quit_event.is_set():
            loop_start = time.time()
            dt = 1.0 / max(1, primary_cfg.frame_rate)

            for sim in simulators:
                model: RadarModel = sim["model"]
                mqtt_client: SimulatorMQTTClient = sim["mqtt_client"]
                device_id: str = sim["device_id"]

                result = model.tick()

                if result is not None:
                    frame_num, targets = result
                    payload = encode_radar_message(frame_num, targets)
                    mqtt_client.publish_telemetry(payload)
                    frame_count += 1
                    bytes_total += len(payload)

                    if logger.isEnabledFor(logging.DEBUG) and frame_count <= 3:
                        logger.debug(
                            "[%s] Frame %d: %d targets, %d bytes  hex=%s",
                            device_id,
                            frame_num,
                            len(targets),
                            len(payload),
                            payload.hex()[:120],
                        )
                else:
                    logger.debug("[%s] Frame dropped (artifact)", device_id)

            # Periodic stats (every 5 s)
            now = time.time()
            if now - last_stats >= 5.0:
                fps_actual = frame_count / (now - last_stats) if (now - last_stats) > 0 else 0
                people_snapshot = ", ".join(
                    f"{sim['device_id']}={sim['model'].get_person_count()}"
                    for sim in simulators
                )
                logger.info(
                    "[ %d frames | %.1f fps | %d radars | people(%s) | %.1f KB published ]",
                    frame_count,
                    fps_actual,
                    len(simulators),
                    people_snapshot,
                    bytes_total / 1024,
                )
                frame_count = 0
                bytes_total = 0
                last_stats = now

            # Pace to target FPS
            elapsed = time.time() - loop_start
            sleep_time = dt - elapsed
            if sleep_time > 0:
                # Use quit_event.wait so we wake up on quit
                quit_event.wait(sleep_time)

    except KeyboardInterrupt:
        pass
    finally:
        logger.info("Shutting down …")
        if viz:
            viz.stop()
        for sim in simulators:
            try:
                sim["mqtt_client"].disconnect()
            except Exception:
                pass
        logger.info("Done.")


if __name__ == "__main__":
    main()

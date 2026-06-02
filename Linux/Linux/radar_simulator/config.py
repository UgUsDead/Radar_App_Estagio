"""
config.py — Central configuration for the radar simulator.

All tuneable parameters in one place.
"""

from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class RoomConfig:
    """Room boundaries in metres (radar-centric coords)."""
    x_min: float = 0.2
    x_max: float = 6.0
    y_min: float = -3.0
    y_max: float = 3.0
    z_floor: float = 0.0
    z_ceiling: float = 2.8


@dataclass
class RadarConfig:
    """Radar mount position and device identity."""
    device_id: str = "simulator_radar"
    mount_x: float = 0.0
    mount_y: float = 0.0
    mount_z: float = 2.5          # ceiling-mounted default


@dataclass
class MQTTConfig:
    broker_host: str = "localhost"
    broker_port: int = 1883
    telemetry_topic: str = ""     # filled at runtime from device_id
    availability_topic: str = ""  # filled at runtime from device_id
    control_topic: str = "radar/simulator/control"
    # Firmware command/status topics (filled at runtime)
    status_topic: str = ""
    cmd_topic: str = ""
    cmd_status_topic: str = ""
    radar_cmd_topic: str = ""
    radar_status_topic: str = ""
    radar_cmd_status_topic: str = ""
    radar_config_set_topic: str = ""
    radar_config_get_topic: str = ""
    radar_config_status_topic: str = ""
    radar_config_state_topic: str = ""
    keepalive: int = 60

    def apply_device_id(self, device_id: str):
        base = f"linovt/{device_id}"
        self.telemetry_topic = f"{base}/telemetry"
        self.availability_topic = f"{base}/availability"
        self.status_topic = f"{base}/status"
        self.cmd_topic = f"{base}/cmd"
        self.cmd_status_topic = f"{base}/cmd/status"
        self.radar_cmd_topic = f"{base}/radar/cmd"
        self.radar_status_topic = f"{base}/radar/status"
        self.radar_cmd_status_topic = f"{base}/radar/cmd/status"
        self.radar_config_set_topic = f"{base}/radar/config/set"
        self.radar_config_get_topic = f"{base}/radar/config/get"
        self.radar_config_status_topic = f"{base}/radar/config/status"
        self.radar_config_state_topic = f"{base}/radar/config/state"


@dataclass
class PersonConfig:
    """Defaults for simulated person behaviour."""
    speed_min: float = 0.2        # m/s
    speed_max: float = 1.2        # m/s
    standing_height_min: float = 1.2
    standing_height_max: float = 1.8
    stop_probability: float = 0.02       # per-frame chance of pausing
    direction_change_prob: float = 0.015  # per-frame chance of new heading
    stop_duration_min: float = 0.5       # seconds
    stop_duration_max: float = 4.0       # seconds
    fall_z_target: float = 0.15          # z when fallen
    fall_duration: float = 0.6           # seconds to reach ground
    fall_recovery_time: float = 8.0      # seconds before getting back up


@dataclass
class PointCloudConfig:
    """Point cloud generation around each tracked person."""
    min_points: int = 10
    max_points: int = 30
    xy_spread: float = 0.25       # σ (metres) around person centroid
    z_spread: float = 0.15
    snr_base: float = 15.0
    snr_jitter: float = 5.0


@dataclass
class ArtifactConfig:
    """Radar artifacts for realism."""
    position_noise_sigma: float = 0.02   # metres of jitter on tracked pos
    velocity_noise_sigma: float = 0.05   # m/s jitter
    ghost_probability: float = 0.005     # per-frame chance of a ghost target
    ghost_max_count: int = 2
    drop_frame_probability: float = 0.003  # per-frame chance of skipping


@dataclass
class SimConfig:
    """Top-level configuration combining everything."""
    room: RoomConfig = field(default_factory=RoomConfig)
    radar: RadarConfig = field(default_factory=RadarConfig)
    mqtt: MQTTConfig = field(default_factory=MQTTConfig)
    person: PersonConfig = field(default_factory=PersonConfig)
    pointcloud: PointCloudConfig = field(default_factory=PointCloudConfig)
    artifacts: ArtifactConfig = field(default_factory=ArtifactConfig)
    frame_rate: int = 10
    initial_num_people: int = 1
    enable_visualization: bool = False

    def __post_init__(self):
        self.mqtt.apply_device_id(self.radar.device_id)

"""
pointcloud_generator.py — Radar point cloud generation.

Each tracked person produces a cluster of 10–30 noisy radar detection
points, simulating what the raw mmWave point cloud looks like before
the tracker fuses them into a single Target.

These points are used for:
  • the optional debug visualizer
  • more realistic noise injection into the tracked target output

The protobuf output only carries *tracked targets* (one per person),
not the raw point cloud.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

from .config import PointCloudConfig
from .person_model import Person


@dataclass(slots=True)
class RawPoint:
    """One raw radar detection point."""
    x: float
    y: float
    z: float
    velocity: float      # radial velocity seen by radar
    snr: float           # signal-to-noise ratio (dB)


def generate_point_cloud(
    person: Person,
    cfg: PointCloudConfig,
    radar_x: float = 0.0,
    radar_y: float = 0.0,
    radar_z: float = 2.5,
) -> list[RawPoint]:
    """
    Generate a cluster of noisy detection points around *person*.

    Points are scattered with Gaussian noise around the person's centroid
    and assigned realistic SNR values.  Radial velocity is projected
    along the line from the radar to each point.
    """
    n = random.randint(cfg.min_points, cfg.max_points)
    points: list[RawPoint] = []

    # Person's velocity vector
    vx, vy, vz = person.vx, person.vy, person.vz

    for _ in range(n):
        # Scattered position
        px = person.x + random.gauss(0, cfg.xy_spread)
        py = person.y + random.gauss(0, cfg.xy_spread)
        pz = person.z + random.gauss(0, cfg.z_spread)
        pz = max(0.0, pz)

        # Radial velocity: project velocity onto radar→point unit vector
        dx = px - radar_x
        dy = py - radar_y
        dz = pz - radar_z
        dist = math.sqrt(dx * dx + dy * dy + dz * dz)
        if dist > 0.01:
            radial_v = (vx * dx + vy * dy + vz * dz) / dist
        else:
            radial_v = 0.0

        # Add measurement noise to radial velocity
        radial_v += random.gauss(0, 0.03)

        snr = cfg.snr_base + random.gauss(0, cfg.snr_jitter)
        snr = max(3.0, snr)  # floor at 3 dB

        points.append(RawPoint(x=px, y=py, z=pz, velocity=radial_v, snr=snr))

    return points


def generate_ghost_points(
    room_x_range: tuple[float, float],
    room_y_range: tuple[float, float],
    count: int = 1,
) -> list[RawPoint]:
    """Generate random ghost/artifact points anywhere in the room."""
    ghosts: list[RawPoint] = []
    for _ in range(count):
        ghosts.append(RawPoint(
            x=random.uniform(*room_x_range),
            y=random.uniform(*room_y_range),
            z=random.uniform(0.0, 2.5),
            velocity=random.gauss(0, 0.3),
            snr=random.uniform(3.0, 8.0),  # low SNR
        ))
    return ghosts

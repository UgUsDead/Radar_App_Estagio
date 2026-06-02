"""
radar_model.py — Radar frame generator.

Combines person simulation, point cloud generation, and artifact injection
to produce a stream of TargetData-per-frame that gets protobuf-encoded and
published.

Responsibilities:
  • Manage the list of simulated persons
  • Step the physics each tick
  • Convert persons → TargetData (with noise)
  • Inject ghost targets and decide whether to drop frames
  • Accept runtime commands (add/remove people, trigger fall)
"""

from __future__ import annotations

import math
import random
import threading
from typing import Optional

from .config import SimConfig, RoomConfig, PersonConfig, ArtifactConfig
from .person_model import Person, PersonState, create_person
from .pointcloud_generator import (
    RawPoint,
    generate_point_cloud,
    generate_ghost_points,
)
from .protobuf_encoder import TargetData


class RadarModel:
    """Stateful radar simulator producing one frame per call to `tick()`."""

    def __init__(self, cfg: SimConfig):
        self.cfg = cfg
        self._lock = threading.Lock()
        self._frame_number: int = 0
        self._next_pid: int = 1
        self._persons: list[Person] = []
        self._point_clouds: dict[int, list[RawPoint]] = {}  # pid → points

        # Initialise starting population
        for _ in range(cfg.initial_num_people):
            self._add_person()

    # ── Public commands (thread-safe) ───────────────────

    def set_num_people(self, n: int):
        """Adjust the population to exactly *n* people."""
        n = max(0, min(n, 10))
        with self._lock:
            while len(self._persons) < n:
                self._add_person()
            while len(self._persons) > n:
                self._persons.pop()

    def trigger_fall(self, person_index: int = 0):
        """Trigger a fall on a specific person (0-indexed)."""
        with self._lock:
            if 0 <= person_index < len(self._persons):
                self._persons[person_index].trigger_fall()

    def trigger_fall_random(self):
        """Trigger a fall on a random person."""
        with self._lock:
            if self._persons:
                p = random.choice(self._persons)
                p.trigger_fall()

    def get_person_count(self) -> int:
        with self._lock:
            return len(self._persons)

    def get_persons_snapshot(self) -> list[dict]:
        """Return a snapshot of person states for visualization."""
        with self._lock:
            return [
                {
                    "pid": p.pid,
                    "x": p.x,
                    "y": p.y,
                    "z": p.z,
                    "vx": p.vx,
                    "vy": p.vy,
                    "state": p.state.name,
                    "target_x": p._target_x,
                    "target_y": p._target_y,
                }
                for p in self._persons
            ]

    def get_point_clouds(self) -> dict[int, list[RawPoint]]:
        """Return the last generated point clouds."""
        with self._lock:
            return dict(self._point_clouds)

    # ── Frame generation ────────────────────────────────

    def tick(self) -> Optional[tuple[int, list[TargetData]]]:
        """
        Advance one frame.

        Returns (frame_number, [TargetData]) or None if this frame
        should be "dropped" to simulate a real radar artifact.
        """
        dt = 1.0 / self.cfg.frame_rate

        with self._lock:
            self._frame_number += 1

            # Dropped frame?
            if random.random() < self.cfg.artifacts.drop_frame_probability:
                return None

            # Step all persons
            for p in self._persons:
                p.step(dt, self.cfg.room, self.cfg.person)

            # Generate point clouds (for viz)
            self._point_clouds.clear()
            for p in self._persons:
                self._point_clouds[p.pid] = generate_point_cloud(
                    p,
                    self.cfg.pointcloud,
                    radar_x=self.cfg.radar.mount_x,
                    radar_y=self.cfg.radar.mount_y,
                    radar_z=self.cfg.radar.mount_z,
                )

            # Build tracked target list
            targets: list[TargetData] = []
            art = self.cfg.artifacts

            for p in self._persons:
                # Apply tracker measurement noise
                noise_x = random.gauss(0, art.position_noise_sigma)
                noise_y = random.gauss(0, art.position_noise_sigma)
                noise_z = random.gauss(0, art.position_noise_sigma * 0.5)

                vnoise_x = random.gauss(0, art.velocity_noise_sigma)
                vnoise_y = random.gauss(0, art.velocity_noise_sigma)
                vnoise_z = random.gauss(0, art.velocity_noise_sigma * 0.3)

                z_val = p.z + noise_z
                targets.append(TargetData(
                    tid=p.pid,
                    pos_x=p.x + noise_x,
                    pos_y=p.y + noise_y,
                    pos_z=z_val,
                    vel_x=p.vx + vnoise_x,
                    vel_y=p.vy + vnoise_y,
                    vel_z=p.vz + vnoise_z,
                    acc_x=p.ax,
                    acc_y=p.ay,
                    acc_z=p.az,
                    conf=p.confidence + random.gauss(0, 0.03),
                    has_height=True,
                    min_z=max(0.0, z_val - random.uniform(0.2, 0.5)),
                    max_z=z_val + random.uniform(0.2, 0.5),
                ))

            # Ghost targets
            if random.random() < art.ghost_probability and len(targets) < 16:
                n_ghosts = random.randint(1, min(art.ghost_max_count, 16 - len(targets)))
                for g in range(n_ghosts):
                    gx = random.uniform(self.cfg.room.x_min, self.cfg.room.x_max)
                    gy = random.uniform(self.cfg.room.y_min, self.cfg.room.y_max)
                    gz = random.uniform(0.3, 2.0)
                    targets.append(TargetData(
                        tid=100 + g,
                        pos_x=gx,
                        pos_y=gy,
                        pos_z=gz,
                        vel_x=random.gauss(0, 0.2),
                        vel_y=random.gauss(0, 0.2),
                        vel_z=0.0,
                        conf=random.uniform(0.1, 0.4),  # low confidence
                        has_height=False,
                        min_z=gz,
                        max_z=gz,
                    ))

            return (self._frame_number, targets)

    # ── Internal helpers ────────────────────────────────

    def _add_person(self):
        p = create_person(self._next_pid, self.cfg.room, self.cfg.person)
        self._persons.append(p)
        self._next_pid += 1

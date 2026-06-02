"""
person_model.py — Realistic human movement simulation.

Each Person walks with smooth waypoint-based trajectories:
  • picks a random destination inside the room
  • walks toward it at a random speed (0.2–1.2 m/s)
  • occasionally stops for a random duration
  • occasionally changes direction mid-walk
  • bounces off room walls
  • supports fall simulation (z drops, stays low, optionally recovers)

All units are in metres and seconds.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Optional

from .config import RoomConfig, PersonConfig


class PersonState(Enum):
    WALKING = auto()
    STOPPED = auto()
    FALLING = auto()
    FALLEN = auto()
    RECOVERING = auto()


@dataclass
class Person:
    """One simulated person tracked by the radar."""

    pid: int
    x: float
    y: float
    z: float

    # Velocity
    vx: float = 0.0
    vy: float = 0.0
    vz: float = 0.0

    # Acceleration (computed from velocity change)
    ax: float = 0.0
    ay: float = 0.0
    az: float = 0.0

    # Internal state
    state: PersonState = PersonState.WALKING
    speed: float = 0.6
    heading: float = 0.0          # radians
    standing_height: float = 1.5

    # Waypoint the person is walking toward
    _target_x: float = 0.0
    _target_y: float = 0.0

    # Timers
    _stop_timer: float = 0.0
    _fall_timer: float = 0.0
    _fall_start_z: float = 0.0
    _next_random_fall_timer: float = 0.0

    # Previous velocity for acceleration calc
    _prev_vx: float = 0.0
    _prev_vy: float = 0.0
    _prev_vz: float = 0.0

    # Confidence (simulated tracker confidence)
    confidence: float = 0.85

    def __post_init__(self):
        self._pick_new_waypoint_internal(0.2, 6.0, -3.0, 3.0)
        # Random initial delay for the first fall
        self._next_random_fall_timer = random.uniform(20.0, 30.0)

    # ── Public API ──────────────────────────────────────

    def step(self, dt: float, room: RoomConfig, cfg: PersonConfig):
        """Advance the person simulation by dt seconds."""
        old_vx, old_vy, old_vz = self.vx, self.vy, self.vz

        if self.state == PersonState.WALKING:
            self._step_walking(dt, room, cfg)
        elif self.state == PersonState.STOPPED:
            self._step_stopped(dt, room, cfg)
        elif self.state == PersonState.FALLING:
            self._step_falling(dt, cfg)
        elif self.state == PersonState.FALLEN:
            self._step_fallen(dt, cfg)
        elif self.state == PersonState.RECOVERING:
            self._step_recovering(dt, room, cfg)

        # Compute acceleration from velocity change
        self.ax = (self.vx - old_vx) / dt if dt > 0 else 0.0
        self.ay = (self.vy - old_vy) / dt if dt > 0 else 0.0
        self.az = (self.vz - old_vz) / dt if dt > 0 else 0.0

    def trigger_fall(self):
        """Begin a fall event."""
        if self.state in (PersonState.FALLING, PersonState.FALLEN):
            return
        self.state = PersonState.FALLING
        self._fall_timer = 0.0
        self._fall_start_z = self.z

    # ── Walking ─────────────────────────────────────────

    def _step_walking(self, dt: float, room: RoomConfig, cfg: PersonConfig):
        # Random fall?
        self._next_random_fall_timer -= dt
        if self._next_random_fall_timer <= 0:
            self.trigger_fall()
            self._next_random_fall_timer = random.uniform(20.0, 30.0)
            return

        # Random stop?
        if random.random() < cfg.stop_probability:
            self.state = PersonState.STOPPED
            self._stop_timer = random.uniform(cfg.stop_duration_min, cfg.stop_duration_max)
            self.vx = self.vy = self.vz = 0.0
            return

        # Random direction change?
        if random.random() < cfg.direction_change_prob:
            self._pick_new_waypoint(room)
            self.speed = random.uniform(cfg.speed_min, cfg.speed_max)

        # Move toward waypoint
        dx = self._target_x - self.x
        dy = self._target_y - self.y
        dist = math.sqrt(dx * dx + dy * dy)

        if dist < 0.15:
            # Reached waypoint — pick a new one
            self._pick_new_waypoint(room)
            self.speed = random.uniform(cfg.speed_min, cfg.speed_max)
            return

        # Smoothly interpolate heading
        desired_heading = math.atan2(dy, dx)
        angle_diff = _wrap_angle(desired_heading - self.heading)
        max_turn = 2.5 * dt   # max ~2.5 rad/s turning rate
        self.heading += max(-max_turn, min(max_turn, angle_diff))

        self.vx = self.speed * math.cos(self.heading)
        self.vy = self.speed * math.sin(self.heading)
        self.vz = 0.0

        self.x += self.vx * dt
        self.y += self.vy * dt

        # Small z sway while walking (simulates body bob)
        sway = math.sin(self.x * 3.0 + self.y * 2.0) * 0.03
        self.z = self.standing_height + sway

        # Wall bounce
        self._clamp_to_room(room)

    def _step_stopped(self, dt: float, room: RoomConfig, cfg: PersonConfig):
        # Random fall?
        self._next_random_fall_timer -= dt
        if self._next_random_fall_timer <= 0:
            self.trigger_fall()
            self._next_random_fall_timer = random.uniform(20.0, 30.0)
            return

        self._stop_timer -= dt
        self.vx = self.vy = self.vz = 0.0
        if self._stop_timer <= 0:
            self.state = PersonState.WALKING
            self._pick_new_waypoint(room)
            self.speed = random.uniform(cfg.speed_min, cfg.speed_max)

    # ── Fall ────────────────────────────────────────────

    def _step_falling(self, dt: float, cfg: PersonConfig):
        self._fall_timer += dt
        progress = min(1.0, self._fall_timer / cfg.fall_duration)
        # Ease-in curve (accelerating fall)
        eased = progress * progress
        self.z = self._fall_start_z + (cfg.fall_z_target - self._fall_start_z) * eased

        # Velocity spike downward during fall
        self.vz = -(self._fall_start_z - cfg.fall_z_target) * 2.0 * progress / cfg.fall_duration
        # Small forward stumble
        self.vx *= 0.9
        self.vy *= 0.9
        self.x += self.vx * dt
        self.y += self.vy * dt

        if progress >= 1.0:
            self.state = PersonState.FALLEN
            self._fall_timer = 0.0
            self.z = cfg.fall_z_target
            self.vx = self.vy = self.vz = 0.0

    def _step_fallen(self, dt: float, cfg: PersonConfig):
        """Stay on the ground."""
        self._fall_timer += dt
        self.vx = self.vy = self.vz = 0.0
        # Small movement (shifting on floor)
        self.x += random.gauss(0, 0.005)
        self.y += random.gauss(0, 0.005)

        if self._fall_timer >= cfg.fall_recovery_time:
            self.state = PersonState.RECOVERING
            self._fall_timer = 0.0

    def _step_recovering(self, dt: float, room: RoomConfig, cfg: PersonConfig):
        """Slowly get back up."""
        self._fall_timer += dt
        recovery_duration = 2.0  # seconds to stand back up
        progress = min(1.0, self._fall_timer / recovery_duration)
        self.z = cfg.fall_z_target + (self.standing_height - cfg.fall_z_target) * progress
        self.vz = (self.standing_height - cfg.fall_z_target) / recovery_duration * 0.5
        self.vx = self.vy = 0.0

        if progress >= 1.0:
            self.state = PersonState.WALKING
            self.z = self.standing_height
            self.vz = 0.0
            self._pick_new_waypoint(room)
            self.speed = random.uniform(cfg.speed_min * 0.5, cfg.speed_max * 0.5)

    # ── Helpers ─────────────────────────────────────────

    def _pick_new_waypoint(self, room: RoomConfig):
        self._pick_new_waypoint_internal(room.x_min, room.x_max, room.y_min, room.y_max)

    def _pick_new_waypoint_internal(self, xmin, xmax, ymin, ymax):
        margin = 0.3
        self._target_x = random.uniform(xmin + margin, xmax - margin)
        self._target_y = random.uniform(ymin + margin, ymax - margin)

    def _clamp_to_room(self, room: RoomConfig):
        margin = 0.1
        if self.x <= room.x_min + margin:
            self.x = room.x_min + margin
            self.vx = abs(self.vx) * 0.5
            self._pick_new_waypoint(room)
        elif self.x >= room.x_max - margin:
            self.x = room.x_max - margin
            self.vx = -abs(self.vx) * 0.5
            self._pick_new_waypoint(room)

        if self.y <= room.y_min + margin:
            self.y = room.y_min + margin
            self.vy = abs(self.vy) * 0.5
            self._pick_new_waypoint(room)
        elif self.y >= room.y_max - margin:
            self.y = room.y_max - margin
            self.vy = -abs(self.vy) * 0.5
            self._pick_new_waypoint(room)


def create_person(pid: int, room: RoomConfig, cfg: PersonConfig) -> Person:
    """Factory: spawn a new Person at a random room position."""
    x = random.uniform(room.x_min + 0.5, room.x_max - 0.5)
    y = random.uniform(room.y_min + 0.5, room.y_max - 0.5)
    z = random.uniform(cfg.standing_height_min, cfg.standing_height_max)
    heading = random.uniform(0, 2 * math.pi)
    speed = random.uniform(cfg.speed_min, cfg.speed_max)

    return Person(
        pid=pid, x=x, y=y, z=z,
        standing_height=z,
        heading=heading,
        speed=speed,
    )


# ── Utilities ───────────────────────────────────────────────

def _wrap_angle(a: float) -> float:
    """Wrap angle to [-π, π]."""
    while a > math.pi:
        a -= 2 * math.pi
    while a < -math.pi:
        a += 2 * math.pi
    return a

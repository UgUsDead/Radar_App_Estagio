"""
visualizer.py — Real-time matplotlib debug view of the simulated radar scene.

Shows:
  • Room boundaries
  • Person positions (coloured by state)
  • Waypoint arrows
  • Point cloud scatter (low alpha)
  • Live stats (frame #, person count, states)

Run the simulator with --viz to enable.

The visualizer runs in a separate thread and polls the RadarModel for
snapshots, so it never blocks the main publish loop.
"""

from __future__ import annotations

import threading
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .radar_model import RadarModel
    from .config import SimConfig

# Guard matplotlib import — only crash if actually used
_MPL_AVAILABLE = False
try:
    import matplotlib
    matplotlib.use("TkAgg")  # non-blocking backend
    import matplotlib.pyplot as plt
    import matplotlib.patches as patches
    from matplotlib.collections import PathCollection
    _MPL_AVAILABLE = True
except ImportError:
    pass


# Colour map for person states
_STATE_COLOURS = {
    "WALKING": "#2196F3",
    "STOPPED": "#FF9800",
    "FALLING": "#F44336",
    "FALLEN": "#B71C1C",
    "RECOVERING": "#9C27B0",
}


class Visualizer:
    """Non-blocking matplotlib visualizer (runs in its own thread)."""

    def __init__(self, model: "RadarModel", cfg: "SimConfig"):
        if not _MPL_AVAILABLE:
            raise ImportError(
                "matplotlib is required for visualization. "
                "Install it:  pip install matplotlib"
            )
        self.model = model
        self.cfg = cfg
        self._running = False

    def start(self):
        """Launch the visualizer (must be called from main thread on macOS)."""
        self._running = True
        self._run()

    def start_threaded(self):
        """Launch in a background thread (Linux only — TkAgg needs main thread on macOS)."""
        t = threading.Thread(target=self._run, daemon=True)
        t.start()

    def stop(self):
        self._running = False

    # ── Main draw loop ──────────────────────────────────

    def _run(self):
        room = self.cfg.room
        fig, (ax_top, ax_side) = plt.subplots(
            1, 2, figsize=(14, 6),
            gridspec_kw={"width_ratios": [2, 1]},
        )
        fig.suptitle("Radar Simulator — Debug View", fontsize=13)
        plt.ion()

        while self._running:
            persons = self.model.get_persons_snapshot()
            clouds = self.model.get_point_clouds()

            # ── Top-down view (X-Y) ────────────────────
            ax_top.clear()
            ax_top.set_xlim(room.x_min - 0.5, room.x_max + 0.5)
            ax_top.set_ylim(room.y_min - 0.5, room.y_max + 0.5)
            ax_top.set_aspect("equal")
            ax_top.set_xlabel("X (m)")
            ax_top.set_ylabel("Y (m)")
            ax_top.set_title("Top-Down View")

            # Room rectangle
            rect = patches.Rectangle(
                (room.x_min, room.y_min),
                room.x_max - room.x_min,
                room.y_max - room.y_min,
                linewidth=2, edgecolor="#555", facecolor="#1a1a2e", alpha=0.3,
            )
            ax_top.add_patch(rect)

            # Radar position
            ax_top.plot(
                self.cfg.radar.mount_x, self.cfg.radar.mount_y,
                marker="^", color="lime", markersize=12, zorder=10,
            )

            # Point clouds
            for pid, pts in clouds.items():
                xs = [p.x for p in pts]
                ys = [p.y for p in pts]
                ax_top.scatter(xs, ys, s=3, alpha=0.15, color="#888")

            # Persons
            for p in persons:
                colour = _STATE_COLOURS.get(p["state"], "#FFF")
                ax_top.plot(
                    p["x"], p["y"],
                    "o", color=colour, markersize=12, zorder=5,
                    markeredgecolor="white", markeredgewidth=0.5,
                )
                ax_top.annotate(
                    f'{p["pid"]}',
                    (p["x"], p["y"]),
                    textcoords="offset points", xytext=(6, 6),
                    fontsize=8, color="white",
                    bbox=dict(boxstyle="round,pad=0.2", fc=colour, alpha=0.7),
                )
                # Waypoint arrow
                ax_top.annotate(
                    "",
                    xy=(p["target_x"], p["target_y"]),
                    xytext=(p["x"], p["y"]),
                    arrowprops=dict(arrowstyle="->", color=colour, alpha=0.4, lw=0.8),
                )

            # Legend
            labels = []
            for p in persons:
                v = (p["vx"] ** 2 + p["vy"] ** 2) ** 0.5
                labels.append(f'P{p["pid"]}: {p["state"]}  v={v:.2f} m/s  z={p["z"]:.2f}')
            ax_top.text(
                room.x_min + 0.1, room.y_max + 0.3,
                "  |  ".join(labels) if labels else "No people",
                fontsize=7, color="#ccc",
            )

            # ── Side view (X-Z) ────────────────────────
            ax_side.clear()
            ax_side.set_xlim(room.x_min - 0.5, room.x_max + 0.5)
            ax_side.set_ylim(-0.2, room.z_ceiling + 0.3)
            ax_side.set_xlabel("X (m)")
            ax_side.set_ylabel("Z (m)")
            ax_side.set_title("Side View (X-Z)")

            # Floor line
            ax_side.axhline(y=0, color="#555", linestyle="--", linewidth=0.5)

            # Radar position
            ax_side.plot(
                self.cfg.radar.mount_x, self.cfg.radar.mount_z,
                marker="v", color="lime", markersize=12, zorder=10,
            )

            for p in persons:
                colour = _STATE_COLOURS.get(p["state"], "#FFF")
                ax_side.plot(
                    p["x"], p["z"],
                    "o", color=colour, markersize=10, zorder=5,
                    markeredgecolor="white", markeredgewidth=0.5,
                )
                ax_side.annotate(
                    f'P{p["pid"]}',
                    (p["x"], p["z"]),
                    textcoords="offset points", xytext=(6, 4),
                    fontsize=8, color=colour,
                )

            fig.canvas.draw_idle()
            fig.canvas.flush_events()

            try:
                plt.pause(0.1)
            except Exception:
                break

        plt.close(fig)

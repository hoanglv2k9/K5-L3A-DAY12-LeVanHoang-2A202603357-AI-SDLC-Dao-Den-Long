"""Pure deterministic 60-tick/s simulation engine for Đảo Đèn Lồng (Contract v1.1 · Nights 1, 2, 3)."""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from src.core.contract import load_contract
from src.core.rng import SeededRNG

TICK_RATE = 60
DT = 1.0 / TICK_RATE
EPS = 1e-9

JUMP_VELOCITY = 7.0
GRAVITY = 20.0
CHARM_SPEED_MPS = 7.2
CHARM_DURATION_TICKS = 600
CHARM_RESPAWN_TICKS = 2700

INITIAL_RANDOM_MOTES = 20
MAX_RANDOM_MOTES = 30
MOTE_SPAWN_INTERVAL_TICKS = 240
DROPPED_MOTE_TTL_TICKS = 480

PULSE_PUSH_TICKS = 15
SHADE_RECOIL_TICKS = 60
SHADE_RECOIL_DIST_M = 2.0
SHADE_SPAWN_TICKS = 15
SHADE_DETECT_RADIUS = 12.0
SHADE_LOSE_RADIUS = 18.0
SHADE_MIN_SPAWN_DIST = 15.0

DRIFTER_SPEED_IDLE = 2.0
DRIFTER_SPEED_FAST = 7.0
DRIFTER_DETECT_RADIUS = 15.0
DRIFTER_MIN_MOTES = 5
DRIFTER_STEAL_RADIUS = 1.2
DRIFTER_FLEE_TICKS = 240
DRIFTER_DROP_FLEE_TICKS = 120
DRIFTER_SPAWN_INTERVAL_TICKS = 1200
MAX_ACTIVE_DRIFTERS = 2

FALL_Y_THRESHOLD = -10.0
FALL_WAIT_TICKS = 60

WIND_PERIOD_TICKS = 1800  # Every 30s
WIND_DURATION_TICKS = 300  # Lasts 5s
WIND_PUSH_MPS = 2.0


def round3(value: float) -> float:
    r = round(float(value), 3)
    return 0.0 if r == 0.0 else r


def dist_xz(ax: float, az: float, bx: float, bz: float) -> float:
    return math.hypot(ax - bx, az - bz)


def dist_3d(ax: float, ay: float, az: float, bx: float, by: float, bz: float) -> float:
    return math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)


def _circle_points(cx: float, cz: float, y: float, radius: float, angles_deg: list[float]) -> list[tuple[float, float, float]]:
    pts: list[tuple[float, float, float]] = []
    for deg in angles_deg:
        rad = math.radians(deg)
        pts.append((round3(cx + radius * math.cos(rad)), round3(y), round3(cz + radius * math.sin(rad))))
    return pts


@dataclass
class Player:
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    vx: float = 0.0
    vy: float = 0.0
    vz: float = 0.0
    facing_x: float = 0.0
    facing_z: float = 1.0
    grounded: bool = True
    flames: int = 3
    carried: int = 0
    invuln_ticks: int = 0
    dash_cd_ticks: int = 0
    dash_ticks_left: int = 0
    dash_dir_x: float = 0.0
    dash_dir_z: float = 1.0
    pulse_cd_ticks: int = 0
    charm_ticks: int = 0
    fall_wait_ticks: int = 0
    launch_active: bool = False
    launch_vx: float = 0.0
    launch_vz: float = 0.0


@dataclass
class Lantern:
    id: str
    x: float
    y: float
    z: float
    deposited: int = 0
    lit: bool = False


@dataclass
class Shade:
    id: str
    x: float
    y: float
    z: float
    state: str = "wander"
    state_ticks_left: int = 0
    push_ticks_left: int = 0
    push_dir_x: float = 1.0
    push_dir_z: float = 0.0
    recoil_dir_x: float = 1.0
    recoil_dir_z: float = 0.0
    in_safe_zone: bool = False
    spawn_tick: int = -1
    wander_angle: float = 0.0


@dataclass
class Mote:
    id: str
    x: float
    y: float
    z: float
    kind: str = "random"  # "random" | "dropped"
    ttl_ticks: int | None = None
    active: bool = True
    spawn_tick: int = -1


@dataclass
class Drifter:
    id: str
    x: float
    y: float
    z: float
    state: str = "idle"  # "idle" | "chase" | "flee" | "removed"
    stolen: int = 0
    state_ticks_left: int = 0
    has_stolen: bool = False
    flee_dir_x: float = 1.0
    flee_dir_z: float = 0.0
    idle_angle: float = 0.0
    spawn_tick: int = -1


@dataclass
class Charm:
    id: str
    x: float
    y: float
    z: float
    available: bool = True
    respawn_ticks: int = 0


@dataclass
class InputState:
    move_x: float = 0.0
    move_z: float = 0.0
    cam_yaw_deg: float = 0.0
    jump: bool = False
    interact: bool = False
    pulse: bool = False
    dash: bool = False
    pause: bool = False


class GameEngine:
    """Deterministic simulation core obeying Test Contract v1.1 across Nights 1, 2, 3."""

    def __init__(
        self,
        *,
        seed: int = 1,
        night: int = 1,
        contract: dict[str, Any] | None = None,
        scenario: dict[str, Any] | None = None,
    ):
        self.contract = contract or load_contract()
        self.tuning = self.contract["tuning"]
        self.score_cfg = self.tuning["score"]
        self.seed = int(seed)
        self.night = int(night)
        self.rng = SeededRNG(self.seed)

        self.tick: int = 0
        self.sim_tick: int = 0
        self.state: str = "playing"
        self.score: int = 0

        dur_key = f"night{self.night}_duration_s"
        self.initial_time_left_s: float = float(
            self.tuning.get(dur_key, self.tuning["night1_duration_s"])
        )
        self.time_left_s: float = self.initial_time_left_s

        self.player = Player(flames=int(self.tuning["flames"]))
        self.lanterns: list[Lantern] = self._build_default_lanterns()
        self.mote_spawn_points: list[tuple[float, float, float]] = self._build_mote_spawn_points()
        self.shade_spawn_points: list[tuple[float, float, float]] = self._build_shade_spawn_points()
        self.charms: list[Charm] = self._build_default_charms()
        self.motes: list[Mote] = []
        self.shades: list[Shade] = []
        self.drifters: list[Drifter] = []

        self._next_mote_seq: int = 1
        self._next_shade_seq: int = 1
        self._next_drifter_seq: int = 1

        self.random_motes: bool = True
        self.random_shades: bool = True
        self.random_drifters: bool = self.night in (2, 3)
        self.wind_enabled: bool = self.night == 3
        self.wind_active: bool = False
        self.wind_dir_deg: float = 0.0

        self.input_state = InputState()
        self._prev_buttons = {
            "jump": False,
            "interact": False,
            "pulse": False,
            "dash": False,
            "pause": False,
        }

        self._apply_scenario(scenario or {})

    # ------------------------------------------------------------------
    # Standardized Map Builders (Ticket-02 Part 2)
    # ------------------------------------------------------------------

    def _build_default_lanterns(self) -> list[Lantern]:
        if self.night == 1:
            coords = [
                ("L1", 0.0, 0.0, 25.0),
                ("L2", 23.8, 0.0, 7.7),
                ("L3", 14.7, 0.0, -20.2),
                ("L4", -14.7, 0.0, -20.2),
                ("L5", -23.8, 0.0, 7.7),
            ]
        elif self.night == 2:
            coords = [
                ("L1", 0.0, 0.0, 20.0),
                ("L2", 17.0, 0.0, -10.0),
                ("L3", -17.0, 0.0, -10.0),
                ("L4", 70.0, 0.0, 20.0),
                ("L5", 87.0, 0.0, -10.0),
                ("L6", 53.0, 0.0, -10.0),
            ]
        else:
            coords = [
                ("L1", 0.0, 6.0, 6.0),
                ("L2", 18.0, 3.0, 10.0),
                ("L3", -18.0, 3.0, 10.0),
                ("L4", 35.0, 0.0, -10.0),
                ("L5", -35.0, 0.0, -10.0),
                ("L6", 20.0, 0.0, -35.0),
                ("L7", -20.0, 0.0, -35.0),
            ]
        return [Lantern(id=lid, x=x, y=y, z=z) for lid, x, y, z in coords]

    def _build_mote_spawn_points(self) -> list[tuple[float, float, float]]:
        if self.night == 1:
            pts = _circle_points(0.0, 0.0, 0.0, 12.0, [i * 45.0 for i in range(8)])
            pts.extend(_circle_points(0.0, 0.0, 0.0, 33.0, [i * 22.5 for i in range(16)]))
            return pts
        if self.night == 2:
            pts = []
            for cx in (0.0, 70.0):
                pts.extend(_circle_points(cx, 0.0, 0.0, 10.0, [0.0, 90.0, 180.0, 270.0]))
                pts.extend(_circle_points(cx, 0.0, 0.0, 22.0, [i * 45.0 for i in range(8)]))
            return pts
        # Night 3 (30 points across Tiers 0, 1, 2)
        pts = _circle_points(0.0, 0.0, 0.0, 34.0, [i * 20.0 for i in range(18)])
        pts.extend(_circle_points(0.0, 0.0, 3.0, 18.0, [20.0 * i for i in range(1, 9)]))
        pts.extend(_circle_points(0.0, 0.0, 6.0, 5.0, [45.0, 135.0, 225.0, 315.0]))
        return pts

    def _build_shade_spawn_points(self) -> list[tuple[float, float, float]]:
        if self.night == 1:
            return _circle_points(0.0, 0.0, 0.0, 37.0, [15.0 + i * 30.0 for i in range(12)])
        if self.night == 2:
            pts: list[tuple[float, float, float]] = []
            for cx in (0.0, 70.0):
                pts.extend(_circle_points(cx, 0.0, 0.0, 26.0, [22.5 + i * 45.0 for i in range(8)]))
            return pts
        return _circle_points(0.0, 0.0, 0.0, 43.0, [i * 22.5 for i in range(16)])

    def _build_default_charms(self) -> list[Charm]:
        if self.night == 2:
            return [Charm(id="C1", x=35.0, y=0.0, z=0.0)]
        if self.night == 3:
            return [
                Charm(id="C1", x=30.0, y=0.0, z=25.0),
                Charm(id="C2", x=-30.0, y=0.0, z=25.0),
            ]
        return []

    def _apply_scenario(self, scenario: dict[str, Any]) -> None:
        if "time_left_s" in scenario:
            self.initial_time_left_s = float(scenario["time_left_s"])
            self.time_left_s = self.initial_time_left_s

        if "player" in scenario:
            pl = scenario["player"]
            if "pos" in pl:
                self.player.x, self.player.y, self.player.z = pl["pos"]
                surf = self._surface_height_at(self.player.x, self.player.z, self.player.y)
                self.player.grounded = surf is not None and abs(self.player.y - surf) <= 0.05
            if "carried" in pl:
                self.player.carried = int(pl["carried"])
            if "flames" in pl:
                self.player.flames = int(pl["flames"])
            if "invuln_ticks" in pl:
                self.player.invuln_ticks = int(pl["invuln_ticks"])
            if "dash_cd_ticks" in pl:
                self.player.dash_cd_ticks = int(pl["dash_cd_ticks"])
            if "pulse_cd_ticks" in pl:
                self.player.pulse_cd_ticks = int(pl["pulse_cd_ticks"])
            if "charm_ticks" in pl:
                self.player.charm_ticks = int(pl["charm_ticks"])

        lantern_cost = int(self.tuning["lantern_cost"])
        if "lanterns" in scenario:
            by_id = {lan.id: lan for lan in self.lanterns}
            for item in scenario["lanterns"]:
                lan = by_id.get(item["id"])
                if lan is None:
                    pos = item.get("pos", [0.0, 0.0, 0.0])
                    lan = Lantern(id=item["id"], x=pos[0], y=pos[1], z=pos[2])
                    self.lanterns.append(lan)
                    by_id[lan.id] = lan
                if "pos" in item:
                    lan.x, lan.y, lan.z = item["pos"]
                if "deposited" in item:
                    lan.deposited = int(item["deposited"])
                if "lit" in item:
                    lan.lit = bool(item["lit"])
                    if lan.lit and "deposited" not in item and lan.deposited < lantern_cost:
                        lan.deposited = lantern_cost
                if lan.deposited >= lantern_cost:
                    lan.lit = True

        if "random_motes" in scenario:
            self.random_motes = bool(scenario["random_motes"])
        if "random_shades" in scenario:
            self.random_shades = bool(scenario["random_shades"])
        if "random_drifters" in scenario:
            self.random_drifters = bool(scenario["random_drifters"])
        if "wind_enabled" in scenario:
            self.wind_enabled = bool(scenario["wind_enabled"])

        if "motes" in scenario:
            self.motes = []
            for idx, m in enumerate(scenario["motes"], start=1):
                mid = m.get("id") or f"M{idx}"
                pos = m["pos"]
                kind = m.get("kind", "random")
                ttl = m.get("ttl_ticks")
                if ttl is None and kind == "dropped":
                    ttl = DROPPED_MOTE_TTL_TICKS
                self.motes.append(
                    Mote(id=mid, x=pos[0], y=pos[1], z=pos[2], kind=kind, ttl_ticks=ttl, active=True, spawn_tick=-1)
                )
            self._next_mote_seq = len(self.motes) + 1
        elif self.random_motes:
            self._spawn_initial_random_motes()

        if "shades" in scenario:
            self.shades = []
            used_ids: set[str] = set()
            for idx, s in enumerate(scenario["shades"], start=1):
                sid = s.get("id") or f"S{idx}"
                used_ids.add(sid)
                pos = s["pos"]
                d = dist_xz(self.player.x, self.player.z, pos[0], pos[2])
                default_state = "chase" if d <= SHADE_DETECT_RADIUS + EPS else "wander"
                st = s.get("state", default_state)
                ticks_left = int(s.get("state_ticks_left", 0))
                sh = Shade(
                    id=sid,
                    x=pos[0],
                    y=pos[1],
                    z=pos[2],
                    state=st,
                    state_ticks_left=ticks_left,
                    spawn_tick=-1,
                )
                self.shades.append(sh)
            self._next_shade_seq = self._compute_next_seq(used_ids, "S")

        if "drifters" in scenario:
            self.drifters = []
            used_d: set[str] = set()
            for idx, d in enumerate(scenario["drifters"], start=1):
                did = d.get("id") or f"D{idx}"
                used_d.add(did)
                pos = d["pos"]
                st = d.get("state", "idle")
                stolen = int(d.get("stolen", 0))
                ticks_left = int(d.get("state_ticks_left", DRIFTER_FLEE_TICKS if st == "flee" else 0))
                self.drifters.append(
                    Drifter(
                        id=did,
                        x=pos[0],
                        y=pos[1],
                        z=pos[2],
                        state=st,
                        stolen=stolen,
                        state_ticks_left=ticks_left,
                        has_stolen=(stolen > 0 or st == "flee"),
                        spawn_tick=-1,
                    )
                )
            self._next_drifter_seq = self._compute_next_seq(used_d, "D")

        if "charms" in scenario:
            self.charms = []
            for idx, c in enumerate(scenario["charms"], start=1):
                cid = c.get("id") or f"C{idx}"
                pos = c.get("pos", [35.0, 0.0, 0.0])
                avail = bool(c.get("available", True))
                rt = int(c.get("respawn_ticks", 0 if avail else CHARM_RESPAWN_TICKS))
                self.charms.append(Charm(id=cid, x=pos[0], y=pos[1], z=pos[2], available=avail, respawn_ticks=rt))

    @staticmethod
    def _compute_next_seq(used_ids: set[str], prefix: str) -> int:
        max_num = 0
        for sid in used_ids:
            if sid.startswith(prefix) and sid[len(prefix):].isdigit():
                max_num = max(max_num, int(sid[len(prefix):]))
        return max(max_num + 1, len(used_ids) + 1)

    def _spawn_initial_random_motes(self) -> None:
        indices = list(range(len(self.mote_spawn_points)))
        # Deterministic Fisher-Yates shuffle to pick 20 distinct spawn points
        for i in range(len(indices) - 1, 0, -1):
            j = int(self.rng.random() * (i + 1))
            indices[i], indices[j] = indices[j], indices[i]
        for idx in indices[: min(INITIAL_RANDOM_MOTES, len(indices))]:
            px, py, pz = self.mote_spawn_points[idx]
            mid = f"M{self._next_mote_seq}"
            self._next_mote_seq += 1
            self.motes.append(Mote(id=mid, x=px, y=py, z=pz, kind="random", ttl_ticks=None, active=True, spawn_tick=-1))

    def _spawn_scheduled_mote(self) -> None:
        if self.active_motes_count() >= MAX_RANDOM_MOTES:
            return
        occupied = {
            (round3(m.x), round3(m.y), round3(m.z))
            for m in self.motes
            if m.active
        }
        empty = [pt for pt in self.mote_spawn_points if (round3(pt[0]), round3(pt[1]), round3(pt[2])) not in occupied]
        if not empty:
            return
        choice = empty[int(self.rng.random() * len(empty))]
        mid = f"M{self._next_mote_seq}"
        self._next_mote_seq += 1
        self.motes.append(
            Mote(
                id=mid,
                x=choice[0],
                y=choice[1],
                z=choice[2],
                kind="random",
                ttl_ticks=None,
                active=True,
                spawn_tick=self.sim_tick,
            )
        )

    def _max_shades_for_night(self) -> int:
        return 6 if self.night == 1 else (8 if self.night == 2 else 10)

    def _shade_spawn_interval_ticks(self) -> int:
        return 480 if self.night == 1 else (420 if self.night == 2 else 360)

    def _spawn_scheduled_shade(self) -> dict[str, Any] | None:
        if len(self.shades) >= self._max_shades_for_night():
            return None
        safe_r = float(self.tuning["safe_radius"])
        valid: list[tuple[float, float, float]] = []
        for pt in self.shade_spawn_points:
            if dist_xz(pt[0], pt[2], self.player.x, self.player.z) < SHADE_MIN_SPAWN_DIST - EPS:
                continue
            if any(lan.lit and dist_xz(pt[0], pt[2], lan.x, lan.z) < safe_r + EPS for lan in self.lanterns):
                continue
            if any(dist_xz(pt[0], pt[2], sh.x, sh.z) < 1.0 for sh in self.shades):
                continue
            valid.append(pt)
        if not valid:
            return None
        pt = valid[int(self.rng.random() * len(valid))]
        sid = f"S{self._next_shade_seq}"
        self._next_shade_seq += 1
        self.shades.append(
            Shade(
                id=sid,
                x=pt[0],
                y=pt[1],
                z=pt[2],
                state="spawning",
                state_ticks_left=SHADE_SPAWN_TICKS,
                spawn_tick=self.sim_tick,
                wander_angle=self.rng.uniform(0.0, 2.0 * math.pi),
            )
        )
        return {"type": "event", "tick": self.tick, "name": "shade_spawned", "data": {"id": sid}}

    def _spawn_scheduled_drifter(self) -> None:
        active = [d for d in self.drifters if d.state != "removed"]
        if len(active) >= MAX_ACTIVE_DRIFTERS or not self.shade_spawn_points:
            return
        pt = self.shade_spawn_points[int(self.rng.random() * len(self.shade_spawn_points))]
        did = f"D{self._next_drifter_seq}"
        self._next_drifter_seq += 1
        self.drifters.append(
            Drifter(
                id=did,
                x=pt[0],
                y=pt[1],
                z=pt[2],
                state="idle",
                stolen=0,
                idle_angle=self.rng.uniform(0.0, 2.0 * math.pi),
                spawn_tick=self.sim_tick,
            )
        )

    # ------------------------------------------------------------------
    # Terrain & Surface Geometry (Nights 1, 2, 3)
    # ------------------------------------------------------------------

    def _ramp_height_night3(self, x: float, z: float) -> float | None:
        for deg in (30.0, 150.0):
            rad = math.radians(deg)
            ux, uz = math.cos(rad), math.sin(rad)
            proj = x * ux + z * uz
            perp = abs(-x * uz + z * ux)
            if 24.0 - EPS <= proj <= 30.0 + EPS and perp <= 1.5 + EPS:
                clamped = max(24.0, min(30.0, proj))
                return 3.0 * (30.0 - clamped) / 6.0
        return None

    def _surface_height_at(self, x: float, z: float, current_y: float) -> float | None:
        if not bool(self.tuning.get("fall_enabled", True)):
            return 0.0

        if self.night == 1:
            return 0.0 if math.hypot(x, z) <= 40.0 + EPS else None

        if self.night == 2:
            if math.hypot(x, z) <= 28.0 + EPS:
                return 0.0
            if math.hypot(x - 70.0, z) <= 28.0 + EPS:
                return 0.0
            if 26.0 - EPS <= x <= 44.0 + EPS and -2.0 - EPS <= z <= 2.0 + EPS:
                return 0.0
            return None

        # Night 3 (3 tiers + 2 ramps)
        r = math.hypot(x, z)
        if r > 45.0 + EPS:
            return None
        if r <= 8.0 + EPS and current_y >= 6.0 - 0.45:
            return 6.0
        rh = self._ramp_height_night3(x, z)
        if rh is not None and current_y >= rh - 0.65:
            return rh
        if 12.0 - EPS <= r <= 24.0 + EPS and z >= -EPS and current_y >= 3.0 - 0.55:
            return 3.0
        return 0.0

    def _is_blocked_by_cliff_or_tower(self, old_x: float, old_z: float, new_x: float, new_z: float, y: float) -> bool:
        if self.night != 3:
            return False
        r_new = math.hypot(new_x, new_z)
        # Bell Tower at center of Tier 2 (radius 2m, height 8m on top of Y=6)
        if y >= 5.5 and r_new < 2.0:
            return True
        # Vertical cliffs: cannot walk horizontally INTO Tier 2 (Y=6) from below Y=5.6
        if y < 5.6 and r_new < 8.0 and math.hypot(old_x, old_z) >= 8.0 - EPS:
            return True
        # Vertical cliff of Tier 1 (Y=3): cannot walk into 12<=r<=24, z>0 from below Y=2.6 EXCEPT via the 2 ramps!
        if y < 2.6 and 12.0 < r_new < 24.0 and new_z > 0.0:
            if self._ramp_height_night3(new_x, new_z) is None and self._ramp_height_night3(old_x, old_z) is None:
                r_old = math.hypot(old_x, old_z)
                if not (12.0 <= r_old <= 24.0 and old_z > 0.0):
                    return True
        return False

    # ------------------------------------------------------------------
    # Snapshot & Output Records (Contract v1.1)
    # ------------------------------------------------------------------

    def active_motes_count(self) -> int:
        return sum(1 for m in self.motes if m.active)

    def snapshot(self) -> dict[str, Any]:
        active_motes = [
            {
                "id": m.id,
                "pos": [round3(m.x), round3(m.y), round3(m.z)],
                "kind": m.kind,
                "ttl_s": round3(m.ttl_ticks / float(TICK_RATE)) if m.ttl_ticks is not None else None,
            }
            for m in self.motes
            if m.active
        ]
        active_drifters = [
            {
                "id": d.id,
                "pos": [round3(d.x), round3(d.y), round3(d.z)],
                "state": d.state,
                "stolen": d.stolen,
            }
            for d in self.drifters
            if d.state != "removed"
        ]
        charms_list = [
            {
                "id": c.id,
                "pos": [round3(c.x), round3(c.y), round3(c.z)],
                "available": c.available,
                "respawn_s": round3(c.respawn_ticks / float(TICK_RATE)),
            }
            for c in self.charms
        ]
        return {
            "type": "snapshot",
            "tick": self.tick,
            "sim_tick": self.sim_tick,
            "night": self.night,
            "state": self.state,
            "time_left_s": round3(max(0.0, self.time_left_s)),
            "wind": {
                "active": bool(self.wind_active),
                "dir_deg": round3(self.wind_dir_deg),
            },
            "player": {
                "pos": [round3(self.player.x), round3(self.player.y), round3(self.player.z)],
                "vel": [round3(self.player.vx), round3(self.player.vy), round3(self.player.vz)],
                "grounded": bool(self.player.grounded),
                "flames": self.player.flames,
                "carried": self.player.carried,
                "invuln": bool(self.player.invuln_ticks > 0),
                "dash_cd_s": round3(self.player.dash_cd_ticks / float(TICK_RATE)),
                "pulse_cd_s": round3(self.player.pulse_cd_ticks / float(TICK_RATE)),
                "charm_s": round3(self.player.charm_ticks / float(TICK_RATE)),
            },
            "lanterns": [
                {
                    "id": lan.id,
                    "pos": [round3(lan.x), round3(lan.y), round3(lan.z)],
                    "lit": lan.lit,
                    "deposited": lan.deposited,
                }
                for lan in self.lanterns
            ],
            "shades": [
                {
                    "id": sh.id,
                    "pos": [round3(sh.x), round3(sh.y), round3(sh.z)],
                    "state": sh.state,
                }
                for sh in self.shades
            ],
            "motes": active_motes,
            "motes_active": len(active_motes),
            "drifters": active_drifters,
            "charms": charms_list,
        }

    def end_record(self) -> dict[str, Any]:
        return {
            "type": "end",
            "ticks": self.tick,
            "state": self.state,
            "score": int(self.score),
        }

    def apply_input_frame(self, frame: dict[str, Any] | None) -> None:
        if not frame:
            return
        if "move" in frame:
            self.input_state.move_x, self.input_state.move_z = frame["move"]
        if "cam_yaw_deg" in frame:
            self.input_state.cam_yaw_deg = float(frame["cam_yaw_deg"])
        for btn in ("jump", "interact", "pulse", "dash", "pause"):
            if btn in frame:
                setattr(self.input_state, btn, bool(frame[btn]))

    # ------------------------------------------------------------------
    # Mandatory 12-Step Tick Execution Order (Ticket-02 Part 1)
    # ------------------------------------------------------------------

    def step(self, frame: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        if self.state in ("won", "lost"):
            return []

        self.tick += 1
        events: list[dict[str, Any]] = []

        # Step 1: Read input (process pause first; if just paused, stop step here)
        self.apply_input_frame(frame)
        just_pause = self.input_state.pause and not self._prev_buttons["pause"]
        self._prev_buttons["pause"] = self.input_state.pause

        if just_pause:
            if self.state == "playing":
                self.state = "paused"
                events.append({"type": "event", "tick": self.tick, "name": "paused", "data": {}})
                return events
            if self.state == "paused":
                self.state = "playing"
                events.append({"type": "event", "tick": self.tick, "name": "resumed", "data": {}})

        if self.state == "paused":
            return events

        just_jump = self.input_state.jump and not self._prev_buttons["jump"]
        just_interact = self.input_state.interact and not self._prev_buttons["interact"]
        just_pulse = self.input_state.pulse and not self._prev_buttons["pulse"]
        just_dash = self.input_state.dash and not self._prev_buttons["dash"]
        self._prev_buttons["jump"] = self.input_state.jump
        self._prev_buttons["interact"] = self.input_state.interact
        self._prev_buttons["pulse"] = self.input_state.pulse
        self._prev_buttons["dash"] = self.input_state.dash

        # Step 2: Decrement counters (time, cooldowns, invuln, stun/recoil, charm, dropped mote TTL, charm respawn)
        self.sim_tick += 1
        if self.sim_tick == 1:
            events.append({"type": "event", "tick": self.tick, "name": "night_start", "data": {"night": self.night}})
        self.time_left_s = max(0.0, self.initial_time_left_s - (self.sim_tick / float(TICK_RATE)))

        if self.player.dash_cd_ticks > 0:
            self.player.dash_cd_ticks -= 1
        if self.player.pulse_cd_ticks > 0:
            self.player.pulse_cd_ticks -= 1
        if self.player.invuln_ticks > 0:
            self.player.invuln_ticks -= 1
        if self.player.charm_ticks > 0:
            self.player.charm_ticks -= 1
            self.player.dash_cd_ticks = 0

        for sh in self.shades:
            if sh.state_ticks_left > 0:
                sh.state_ticks_left -= 1
        for dr in self.drifters:
            if dr.state_ticks_left > 0:
                dr.state_ticks_left -= 1
        for m in self.motes:
            if m.active and m.ttl_ticks is not None:
                m.ttl_ticks -= 1
                if m.ttl_ticks <= 0:
                    m.active = False
        for c in self.charms:
            if not c.available and c.respawn_ticks > 0:
                c.respawn_ticks -= 1
                if c.respawn_ticks <= 0:
                    c.available = True

        if self.player.fall_wait_ticks > 0:
            self.player.fall_wait_ticks -= 1
            if self.player.fall_wait_ticks == 0 and self.player.flames > 0:
                self.player.x, self.player.y, self.player.z = 0.0, 0.0, 0.0
                self.player.vx, self.player.vy, self.player.vz = 0.0, 0.0, 0.0
                self.player.facing_x, self.player.facing_z = 0.0, 1.0
                self.player.grounded = True
                self.player.invuln_ticks = int(round(float(self.tuning["invuln_s"]) * TICK_RATE))

        # Update Night 3 strong wind state
        if self.wind_enabled and self.night == 3:
            if self.sim_tick >= WIND_PERIOD_TICKS and (self.sim_tick % WIND_PERIOD_TICKS) == 0:
                self.wind_dir_deg = round3(self.rng.uniform(0.0, 360.0))
            self.wind_active = (
                self.sim_tick >= WIND_PERIOD_TICKS
                and (self.sim_tick % WIND_PERIOD_TICKS) < WIND_DURATION_TICKS
            )
        else:
            self.wind_active = False

        # Step 3: Move Mây (jump, dash, jump pad, wind) and check fall off island (Y < -10)
        self._step_player_movement(just_jump, just_dash, events)

        # Step 4: Pick up motes and charms
        if self.player.fall_wait_ticks == 0:
            self._step_pickup_motes_and_charms(events)

        # Step 5: Interact with lantern
        if just_interact and self.player.fall_wait_ticks == 0:
            self._step_interact_lantern(events)

        # Step 6: Update safe zones
        self._step_safe_zones()

        # Step 7: Light Pulse
        if just_pulse and self.player.fall_wait_ticks == 0:
            self._step_light_pulse(events)

        # Step 8: Move Shades and Drifters
        self._step_move_shades_and_drifters()

        # Step 9: Collisions — Drifters steal first, then Shades hit (sorted by id ascending)
        if self.player.fall_wait_ticks == 0:
            self._step_collisions(events)

        # Step 10: Scheduled spawns (interactable from next tick)
        self._step_scheduled_spawns(events)

        # Step 11: Win / Loss check (no_flames > all_lit > dawn)
        self._step_check_win_loss(events)

        return events

    def _step_player_movement(
        self, just_jump: bool, just_dash: bool, events: list[dict[str, Any]]
    ) -> None:
        if self.player.fall_wait_ticks > 0:
            return

        mx = self.input_state.move_x
        mz = self.input_state.move_z
        theta = math.radians(self.input_state.cam_yaw_deg)
        cos_t, sin_t = math.cos(theta), math.sin(theta)
        wx = mx * cos_t + mz * sin_t
        wz = -mx * sin_t + mz * cos_t
        length = math.hypot(wx, wz)
        if length > 1.0:
            wx /= length
            wz /= length
        if length > EPS:
            self.player.facing_x = wx / length
            self.player.facing_z = wz / length

        # Start Dash on rising edge if not already dashing and off cooldown
        dash_dur_ticks = int(round(float(self.tuning.get("dash_duration_s", 0.2)) * TICK_RATE))
        dash_cd_cfg = int(round(float(self.tuning.get("dash_cooldown_s", 1.5)) * TICK_RATE))
        if (
            just_dash
            and self.player.dash_ticks_left == 0
            and (self.player.dash_cd_ticks == 0 or self.player.charm_ticks > 0)
        ):
            self.player.dash_ticks_left = dash_dur_ticks
            self.player.dash_cd_ticks = 0 if self.player.charm_ticks > 0 else dash_cd_cfg
            if length > EPS:
                self.player.dash_dir_x = wx / length
                self.player.dash_dir_z = wz / length
            else:
                self.player.dash_dir_x = self.player.facing_x
                self.player.dash_dir_z = self.player.facing_z
            self.player.vy = 0.0
            self.player.launch_active = False
            events.append({"type": "event", "tick": self.tick, "name": "dash", "data": {}})

        # Horizontal velocity
        dashing = self.player.dash_ticks_left > 0
        if dashing:
            dash_speed = float(self.tuning.get("dash_speed", 14.0))
            vx = self.player.dash_dir_x * dash_speed
            vz = self.player.dash_dir_z * dash_speed
            self.player.dash_ticks_left -= 1
            self.player.vy = 0.0
        elif self.player.launch_active:
            vx = self.player.launch_vx
            vz = self.player.launch_vz
        else:
            speed = CHARM_SPEED_MPS if self.player.charm_ticks > 0 else float(self.tuning["player_speed"])
            vx = wx * speed
            vz = wz * speed

        if self.wind_active and not dashing and not self.player.launch_active:
            wrad = math.radians(self.wind_dir_deg)
            vx += WIND_PUSH_MPS * math.cos(wrad)
            vz += WIND_PUSH_MPS * math.sin(wrad)

        old_x, old_z = self.player.x, self.player.z
        new_x = old_x + vx * DT
        new_z = old_z + vz * DT

        if self._is_blocked_by_cliff_or_tower(old_x, old_z, new_x, new_z, self.player.y):
            new_x, new_z = old_x, old_z
            vx, vz = 0.0, 0.0

        self.player.x = new_x
        self.player.z = new_z
        self.player.vx = vx
        self.player.vz = vz

        # Jump & Vertical physics
        if not dashing:
            if just_jump and self.player.grounded:
                self.player.vy = JUMP_VELOCITY
                self.player.grounded = False

            surf = self._surface_height_at(self.player.x, self.player.z, self.player.y)
            if self.player.grounded and surf is not None and abs(self.player.y - surf) <= 0.65:
                self.player.y = surf
                self.player.vy = 0.0
            else:
                self.player.grounded = False
                prev_y = self.player.y
                self.player.y += self.player.vy * DT
                self.player.vy -= GRAVITY * DT
                surf_after = self._surface_height_at(self.player.x, self.player.z, max(prev_y, self.player.y))
                if surf_after is not None and self.player.vy <= 0.0 and prev_y >= surf_after - 0.15 and self.player.y <= surf_after:
                    self.player.y = surf_after
                    self.player.vy = 0.0
                    self.player.grounded = True
                    self.player.launch_active = False

        # Jump Pads (Night 2 & Night 3)
        self._check_jump_pads()

        # Fall off island check (Y < -10)
        if bool(self.tuning.get("fall_enabled", True)) and self.player.y < FALL_Y_THRESHOLD:
            lost = self.player.carried
            self.player.carried = 0
            self.player.flames = max(0, self.player.flames - 1)
            self.player.vx = self.player.vy = self.player.vz = 0.0
            self.player.launch_active = False
            self.player.dash_ticks_left = 0
            if self.player.flames > 0:
                self.player.fall_wait_ticks = FALL_WAIT_TICKS
            events.append(
                {
                    "type": "event",
                    "tick": self.tick,
                    "name": "player_hit",
                    "data": {
                        "by": "fall",
                        "flames": self.player.flames,
                        "dropped": 0,
                        "lost": lost,
                    },
                }
            )

    def _check_jump_pads(self) -> None:
        if self.player.launch_active:
            return
        if self.night == 2 and abs(self.player.y - 0.0) <= 0.35:
            for px, pz, tx, tz in ((20.0, 18.0, 70.0, 0.0), (50.0, -18.0, 0.0, 0.0)):
                if dist_xz(self.player.x, self.player.z, px, pz) <= 1.0 + EPS:
                    dx, dz = tx - self.player.x, tz - self.player.z
                    d = math.hypot(dx, dz) or 1.0
                    self.player.launch_vx = (dx / d) * 24.0
                    self.player.launch_vz = (dz / d) * 24.0
                    self.player.vy = 14.0
                    self.player.grounded = False
                    self.player.launch_active = True
                    self.player.dash_ticks_left = 0
                    return
        elif self.night == 3 and abs(self.player.y - 3.0) <= 0.35:
            if dist_xz(self.player.x, self.player.z, 0.0, 13.0) <= 1.0 + EPS:
                self.player.launch_vx = 0.0
                self.player.launch_vz = -8.0
                self.player.vy = 12.0
                self.player.grounded = False
                self.player.launch_active = True
                self.player.dash_ticks_left = 0

    def _step_pickup_motes_and_charms(self, events: list[dict[str, Any]]) -> None:
        cap = int(self.tuning["carry_capacity"])
        pickup_r = float(self.tuning["pickup_radius"])

        for mote in self.motes:
            if self.player.carried >= cap:
                break
            if not mote.active or mote.spawn_tick >= self.sim_tick:
                continue
            if (
                dist_xz(self.player.x, self.player.z, mote.x, mote.z) <= pickup_r + EPS
                and abs(self.player.y - mote.y) <= 1.5 + EPS
            ):
                mote.active = False
                self.player.carried += 1
                events.append(
                    {
                        "type": "event",
                        "tick": self.tick,
                        "name": "mote_picked",
                        "data": {"carried": self.player.carried},
                    }
                )

        for charm in self.charms:
            if not charm.available:
                continue
            if (
                dist_xz(self.player.x, self.player.z, charm.x, charm.z) <= pickup_r + EPS
                and abs(self.player.y - charm.y) <= 1.5 + EPS
            ):
                charm.available = False
                charm.respawn_ticks = CHARM_RESPAWN_TICKS
                self.player.charm_ticks = CHARM_DURATION_TICKS
                self.player.dash_cd_ticks = 0
                events.append(
                    {
                        "type": "event",
                        "tick": self.tick,
                        "name": "charm_picked",
                        "data": {"charm_id": charm.id, "charm_ticks": CHARM_DURATION_TICKS},
                    }
                )

    def _step_interact_lantern(self, events: list[dict[str, Any]]) -> None:
        if self.player.carried <= 0:
            return
        interact_r = float(self.tuning["interact_radius"])
        cost = int(self.tuning["lantern_cost"])
        per_mote = int(self.score_cfg["per_mote"])

        candidates: list[tuple[float, str, Lantern]] = []
        for lan in self.lanterns:
            if lan.lit:
                continue
            d = dist_xz(self.player.x, self.player.z, lan.x, lan.z)
            if d <= interact_r + EPS and abs(self.player.y - lan.y) <= 2.5 + EPS:
                candidates.append((round(d, 6), lan.id, lan))
        if not candidates:
            return

        candidates.sort(key=lambda item: (item[0], item[1]))
        target = candidates[0][2]
        needed = max(0, cost - target.deposited)
        amount = min(self.player.carried, needed)
        if amount <= 0:
            return

        self.player.carried -= amount
        target.deposited += amount
        self.score += amount * per_mote
        events.append(
            {
                "type": "event",
                "tick": self.tick,
                "name": "deposit",
                "data": {
                    "lantern_id": target.id,
                    "amount": amount,
                    "deposited": target.deposited,
                },
            }
        )

        if target.deposited >= cost:
            target.lit = True
            self.score += int(self.score_cfg["per_lantern"])
            events.append(
                {
                    "type": "event",
                    "tick": self.tick,
                    "name": "lantern_lit",
                    "data": {"lantern_id": target.id},
                }
            )

    def _step_safe_zones(self) -> None:
        safe_r = float(self.tuning["safe_radius"])
        lit_lanterns = [lan for lan in self.lanterns if lan.lit]
        push_speed_per_tick = max(float(self.tuning["shade_speed"]) * DT, safe_r / 30.0)

        for sh in self.shades:
            sh.in_safe_zone = False
            for lan in lit_lanterns:
                dx = sh.x - lan.x
                dz = sh.z - lan.z
                d = math.hypot(dx, dz)
                if d < safe_r - EPS:
                    sh.in_safe_zone = True
                    ux, uz = (dx / d, dz / d) if d > EPS else (1.0, 0.0)
                    new_d = min(safe_r, d + push_speed_per_tick)
                    sh.x = lan.x + ux * new_d
                    sh.z = lan.z + uz * new_d

    def _step_light_pulse(self, events: list[dict[str, Any]]) -> None:
        pulse_cost = int(self.tuning["pulse_cost"])
        if self.player.carried < pulse_cost or self.player.pulse_cd_ticks > 0:
            return

        self.player.carried -= pulse_cost
        self.player.pulse_cd_ticks = int(round(float(self.tuning["pulse_cooldown_s"]) * TICK_RATE))
        pulse_r = float(self.tuning["pulse_radius"])
        stun_ticks = int(round(float(self.tuning["pulse_stun_s"]) * TICK_RATE))
        per_stun = int(self.score_cfg["per_stun"])
        cx, cy, cz = self.player.x, self.player.y + 0.8, self.player.z

        stunned_ids: list[str] = []
        for sh in self.shades:
            if sh.spawn_tick >= self.sim_tick:
                continue
            d3 = dist_3d(cx, cy, cz, sh.x, sh.y, sh.z)
            if d3 <= pulse_r + EPS:
                sh.state = "stunned"
                sh.state_ticks_left = stun_ticks
                sh.push_ticks_left = PULSE_PUSH_TICKS
                dx = sh.x - self.player.x
                dz = sh.z - self.player.z
                dh = math.hypot(dx, dz)
                if dh > EPS:
                    sh.push_dir_x, sh.push_dir_z = dx / dh, dz / dh
                else:
                    sh.push_dir_x, sh.push_dir_z = 1.0, 0.0
                stunned_ids.append(sh.id)
                self.score += per_stun

        for dr in self.drifters:
            if dr.spawn_tick >= self.sim_tick or dr.state == "removed":
                continue
            d3 = dist_3d(cx, cy, cz, dr.x, dr.y, dr.z)
            if d3 <= pulse_r + EPS:
                if dr.state == "chase":
                    dr.state = "flee"
                    dr.state_ticks_left = DRIFTER_FLEE_TICKS
                    dx, dz = dr.x - self.player.x, dr.z - self.player.z
                    dh = math.hypot(dx, dz)
                    dr.flee_dir_x, dr.flee_dir_z = (dx / dh, dz / dh) if dh > EPS else (1.0, 0.0)
                elif dr.state == "flee" and dr.stolen > 0:
                    amt = dr.stolen
                    dr.stolen = 0
                    dr.state_ticks_left = min(dr.state_ticks_left or DRIFTER_DROP_FLEE_TICKS, DRIFTER_DROP_FLEE_TICKS)
                    self._scatter_dropped_motes(dr.x, dr.y, dr.z, amt, radius=0.8)
                    events.append(
                        {
                            "type": "event",
                            "tick": self.tick,
                            "name": "drifter_drop",
                            "data": {"drifter_id": dr.id, "amount": amt},
                        }
                    )

        stunned_ids.sort()
        events.append(
            {
                "type": "event",
                "tick": self.tick,
                "name": "pulse",
                "data": {"stunned_ids": stunned_ids},
            }
        )

    def _step_move_shades_and_drifters(self) -> None:
        shade_speed = 4.5 if self.night == 3 else float(self.tuning["shade_speed"])
        safe_r = float(self.tuning["safe_radius"])
        push_step = float(self.tuning["pulse_push_m"]) / float(PULSE_PUSH_TICKS)
        recoil_step = SHADE_RECOIL_DIST_M / float(SHADE_RECOIL_TICKS)
        lit_lanterns = [lan for lan in self.lanterns if lan.lit]

        for sh in self.shades:
            if sh.spawn_tick >= self.sim_tick:
                continue

            if sh.state == "spawning":
                if sh.state_ticks_left <= 0:
                    d = dist_xz(self.player.x, self.player.z, sh.x, sh.z)
                    sh.state = "chase" if (d <= SHADE_DETECT_RADIUS + EPS and self.player.fall_wait_ticks == 0) else "wander"
                continue

            if sh.state == "stunned":
                if sh.push_ticks_left > 0:
                    nx = sh.x + sh.push_dir_x * push_step
                    nz = sh.z + sh.push_dir_z * push_step
                    if not self._is_blocked_by_cliff_or_tower(sh.x, sh.z, nx, nz, sh.y):
                        sh.x, sh.z = nx, nz
                    sh.push_ticks_left -= 1
                if sh.state_ticks_left <= 0:
                    d = dist_xz(self.player.x, self.player.z, sh.x, sh.z)
                    sh.state = "chase" if (d <= SHADE_DETECT_RADIUS + EPS and self.player.fall_wait_ticks == 0) else "wander"
                continue

            if sh.state == "recoil":
                nx = sh.x + sh.recoil_dir_x * recoil_step
                nz = sh.z + sh.recoil_dir_z * recoil_step
                if not self._is_blocked_by_cliff_or_tower(sh.x, sh.z, nx, nz, sh.y):
                    sh.x, sh.z = nx, nz
                if sh.state_ticks_left <= 0:
                    d = dist_xz(self.player.x, self.player.z, sh.x, sh.z)
                    sh.state = "chase" if (d <= SHADE_DETECT_RADIUS + EPS and self.player.fall_wait_ticks == 0) else "wander"
                continue

            d_player = dist_xz(self.player.x, self.player.z, sh.x, sh.z)
            if self.player.fall_wait_ticks > 0:
                sh.state = "wander"
            elif sh.state == "wander" and d_player <= SHADE_DETECT_RADIUS + EPS:
                sh.state = "chase"
            elif sh.state == "chase" and d_player > SHADE_LOSE_RADIUS + EPS:
                sh.state = "wander"

            if sh.in_safe_zone:
                continue

            if sh.state == "chase":
                if d_player > EPS:
                    step_d = min(shade_speed * DT, d_player)
                    nx = sh.x + ((self.player.x - sh.x) / d_player) * step_d
                    nz = sh.z + ((self.player.z - sh.z) / d_player) * step_d
                else:
                    nx, nz = sh.x, sh.z
            else:
                sh.wander_angle += 0.6 * DT
                nx = sh.x + math.cos(sh.wander_angle) * (shade_speed * 0.35 * DT)
                nz = sh.z + math.sin(sh.wander_angle) * (shade_speed * 0.35 * DT)

            for lan in lit_lanterns:
                ldx = nx - lan.x
                ldz = nz - lan.z
                ld = math.hypot(ldx, ldz)
                if ld < safe_r:
                    ux, uz = (ldx / ld, ldz / ld) if ld > EPS else (1.0, 0.0)
                    nx = lan.x + ux * safe_r
                    nz = lan.z + uz * safe_r

            if not self._is_blocked_by_cliff_or_tower(sh.x, sh.z, nx, nz, sh.y):
                sh.x, sh.z = nx, nz

        # Move Drifters
        for dr in self.drifters:
            if dr.spawn_tick >= self.sim_tick or dr.state == "removed":
                continue
            if dr.state in ("idle", "chase"):
                d_pl = dist_xz(self.player.x, self.player.z, dr.x, dr.z)
                if (
                    self.player.fall_wait_ticks == 0
                    and self.player.carried >= DRIFTER_MIN_MOTES
                    and d_pl <= DRIFTER_DETECT_RADIUS + EPS
                ):
                    dr.state = "chase"
                else:
                    dr.state = "idle"

            if dr.state == "idle":
                dr.idle_angle += 0.9 * DT
                dr.x += math.cos(dr.idle_angle) * DRIFTER_SPEED_IDLE * DT
                dr.z += math.sin(dr.idle_angle) * DRIFTER_SPEED_IDLE * DT
            elif dr.state == "chase":
                dx = self.player.x - dr.x
                dz = self.player.z - dr.z
                d = math.hypot(dx, dz)
                if d > EPS:
                    step_d = min(DRIFTER_SPEED_FAST * DT, d)
                    dr.x += (dx / d) * step_d
                    dr.z += (dz / d) * step_d
            elif dr.state == "flee":
                dr.x += dr.flee_dir_x * DRIFTER_SPEED_FAST * DT
                dr.z += dr.flee_dir_z * DRIFTER_SPEED_FAST * DT
                if dr.state_ticks_left <= 0:
                    dr.state = "removed"

    def _scatter_dropped_motes(self, cx: float, cy: float, cz: float, count: int, radius: float = 2.0) -> None:
        for i in range(count):
            angle = (2.0 * math.pi * i) / max(1, count)
            r = radius if count == 1 else (1.5 + (i % 2) * 0.8)
            mid = f"M{self._next_mote_seq}"
            self._next_mote_seq += 1
            self.motes.append(
                Mote(
                    id=mid,
                    x=round3(cx + r * math.cos(angle)),
                    y=round3(max(0.0, cy)),
                    z=round3(cz + r * math.sin(angle)),
                    kind="dropped",
                    ttl_ticks=DROPPED_MOTE_TTL_TICKS,
                    active=True,
                    spawn_tick=self.sim_tick,
                )
            )

    def _step_collisions(self, events: list[dict[str, Any]]) -> None:
        # 1. Drifters steal FIRST (sorted by id ascending)
        for dr in sorted(self.drifters, key=lambda item: item.id):
            if dr.spawn_tick >= self.sim_tick or dr.state != "chase" or dr.has_stolen:
                continue
            if dist_xz(self.player.x, self.player.z, dr.x, dr.z) <= DRIFTER_STEAL_RADIUS + EPS:
                amount = min(3, self.player.carried)
                self.player.carried -= amount
                dr.stolen = amount
                dr.has_stolen = True
                dr.state = "flee"
                dr.state_ticks_left = DRIFTER_FLEE_TICKS
                dx, dz = dr.x - self.player.x, dr.z - self.player.z
                d = math.hypot(dx, dz)
                dr.flee_dir_x, dr.flee_dir_z = (dx / d, dz / d) if d > EPS else (1.0, 0.0)
                events.append(
                    {
                        "type": "event",
                        "tick": self.tick,
                        "name": "drifter_steal",
                        "data": {
                            "drifter_id": dr.id,
                            "amount": amount,
                            "carried": self.player.carried,
                        },
                    }
                )

        # 2. Shades deal hit (sorted by id ascending; max 1 flame lost per tick)
        hit_r = float(self.tuning["shade_hit_radius"])
        invuln_ticks_cfg = int(round(float(self.tuning["invuln_s"]) * TICK_RATE))
        drop_ratio = float(self.tuning["hit_drop_ratio"])

        for sh in sorted(self.shades, key=lambda item: item.id):
            if sh.spawn_tick >= self.sim_tick:
                continue
            if sh.state in ("spawning", "stunned", "recoil") or sh.in_safe_zone:
                continue
            if (
                dist_xz(self.player.x, self.player.z, sh.x, sh.z) <= hit_r + EPS
                and abs(self.player.y - sh.y) <= 1.5 + EPS
            ):
                if self.player.invuln_ticks > 0:
                    continue
                dropped = int(math.floor(self.player.carried * drop_ratio)) if drop_ratio > 0 else 0
                self.player.carried = max(0, self.player.carried - dropped)
                self._scatter_dropped_motes(self.player.x, self.player.y, self.player.z, dropped)

                self.player.flames = max(0, self.player.flames - 1)
                self.player.invuln_ticks = invuln_ticks_cfg

                dx, dz = sh.x - self.player.x, sh.z - self.player.z
                d = math.hypot(dx, dz)
                sh.recoil_dir_x, sh.recoil_dir_z = (dx / d, dz / d) if d > EPS else (1.0, 0.0)
                sh.state = "recoil"
                sh.state_ticks_left = SHADE_RECOIL_TICKS

                events.append(
                    {
                        "type": "event",
                        "tick": self.tick,
                        "name": "player_hit",
                        "data": {
                            "by": "shade",
                            "flames": self.player.flames,
                            "dropped": dropped,
                        },
                    }
                )
                break

    def _step_scheduled_spawns(self, events: list[dict[str, Any]]) -> None:
        if self.random_motes and self.sim_tick > 0 and (self.sim_tick % MOTE_SPAWN_INTERVAL_TICKS) == 0:
            self._spawn_scheduled_mote()

        if self.random_shades:
            interval = self._shade_spawn_interval_ticks()
            if self.sim_tick == 300:
                for _ in range(INITIAL_RANDOM_SHADES_AT_300):
                    ev = self._spawn_scheduled_shade()
                    if ev:
                        events.append(ev)
            elif self.sim_tick > 300 and ((self.sim_tick - 300) % interval) == 0:
                ev = self._spawn_scheduled_shade()
                if ev:
                    events.append(ev)

        if (
            self.random_drifters
            and self.night in (2, 3)
            and self.sim_tick > 0
            and (self.sim_tick % DRIFTER_SPAWN_INTERVAL_TICKS) == 0
        ):
            self._spawn_scheduled_drifter()

    def _step_check_win_loss(self, events: list[dict[str, Any]]) -> None:
        if self.player.flames <= 0:
            self.state = "lost"
            events.append(
                {
                    "type": "event",
                    "tick": self.tick,
                    "name": "game_over",
                    "data": {"result": "lost", "reason": "no_flames"},
                }
            )
            return

        if all(lan.lit for lan in self.lanterns):
            self.state = "won"
            self.score += int(math.floor(self.time_left_s)) * int(self.score_cfg["per_second_left"])
            self.score += self.player.flames * int(self.score_cfg["per_flame_left"])
            events.append(
                {
                    "type": "event",
                    "tick": self.tick,
                    "name": "game_over",
                    "data": {"result": "won", "reason": "all_lit"},
                }
            )
            return

        if self.time_left_s <= EPS:
            self.time_left_s = 0.0
            self.state = "lost"
            events.append(
                {
                    "type": "event",
                    "tick": self.tick,
                    "name": "game_over",
                    "data": {"result": "lost", "reason": "dawn"},
                }
            )


INITIAL_RANDOM_SHADES_AT_300 = 2

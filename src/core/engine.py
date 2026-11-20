"""Pure deterministic 60-tick/s simulation engine for Đảo Đèn Lồng (Phase 1 / Night 1)."""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from src.core.contract import load_contract
from src.core.rng import SeededRNG

TICK_RATE = 60
DT = 1.0 / TICK_RATE
EPS = 1e-9
JUMP_VELOCITY = 7.5
GRAVITY = 20.0
DEFAULT_LANTERN_RING_RADIUS = 25.0
INITIAL_RANDOM_MOTES = 20
MAX_RANDOM_MOTES = 24
MOTE_RESPAWN_INTERVAL_TICKS = 4 * TICK_RATE
INITIAL_RANDOM_SHADES = 2
MAX_RANDOM_SHADES = 5
SHADE_SPAWN_INTERVAL_TICKS = 35 * TICK_RATE


def round3(value: float) -> float:
    r = round(float(value), 3)
    return 0.0 if r == 0.0 else r


def dist_xz(ax: float, az: float, bx: float, bz: float) -> float:
    return math.hypot(ax - bx, az - bz)


@dataclass
class Player:
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    vy: float = 0.0
    flames: int = 3
    carried: int = 0
    invuln_timer: float = 0.0
    pulse_cooldown_timer: float = 0.0


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
    state: str = "chase"
    stun_timer: float = 0.0


@dataclass
class Mote:
    x: float
    y: float
    z: float
    active: bool = True


@dataclass
class InputState:
    move_x: float = 0.0
    move_z: float = 0.0
    cam_yaw_deg: float = 0.0
    jump: bool = False
    interact: bool = False
    pulse: bool = False
    dash: bool = False


class GameEngine:
    """Deterministic simulation core obeying Test Contract v1.0."""

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

        self.sim_tick: int = 0
        self.state: str = "playing"
        self.score: int = 0

        self.initial_time_left_s: float = float(self.tuning["night1_duration_s"])
        self.time_left_s: float = self.initial_time_left_s

        self.player = Player(flames=int(self.tuning["flames"]))
        self.lanterns: list[Lantern] = self._build_default_lanterns()
        self.motes: list[Mote] = []
        self.shades: list[Shade] = []
        self._next_shade_seq: int = 1

        self.random_motes: bool = True
        self.random_shades: bool = True

        self.input_state = InputState()
        self._prev_buttons = {"jump": False, "interact": False, "pulse": False, "dash": False}

        self._apply_scenario(scenario or {})

    def _build_default_lanterns(self) -> list[Lantern]:
        count = int(self.tuning["lantern_count_night1"])
        lanterns: list[Lantern] = []
        for i in range(count):
            angle = (2.0 * math.pi * i) / count
            x = round3(DEFAULT_LANTERN_RING_RADIUS * math.sin(angle))
            z = round3(DEFAULT_LANTERN_RING_RADIUS * math.cos(angle))
            lanterns.append(Lantern(id=f"L{i + 1}", x=x, y=0.0, z=z))
        return lanterns

    def _apply_scenario(self, scenario: dict[str, Any]) -> None:
        # Scenario setup MUST NOT emit events and MUST NOT award score.
        if "time_left_s" in scenario:
            self.initial_time_left_s = float(scenario["time_left_s"])
            self.time_left_s = self.initial_time_left_s

        if "player" in scenario:
            pl = scenario["player"]
            if "pos" in pl:
                self.player.x, self.player.y, self.player.z = pl["pos"]
            if "carried" in pl:
                self.player.carried = int(pl["carried"])
            if "flames" in pl:
                self.player.flames = int(pl["flames"])

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

        if "motes" in scenario:
            self.motes = [Mote(x=m[0], y=0.0, z=m[2], active=True) for m in scenario["motes"]]
        elif self.random_motes:
            for _ in range(INITIAL_RANDOM_MOTES):
                self._spawn_random_mote()

        if "shades" in scenario:
            self.shades = []
            used_ids: set[str] = set()
            for idx, s in enumerate(scenario["shades"], start=1):
                sid = s.get("id") or f"S{idx}"
                used_ids.add(sid)
                pos = s["pos"]
                self.shades.append(
                    Shade(id=sid, x=pos[0], y=pos[1], z=pos[2], state=s.get("state", "chase"))
                )
            self._next_shade_seq = self._compute_next_shade_seq(used_ids)
        elif self.random_shades:
            for _ in range(INITIAL_RANDOM_SHADES):
                self._spawn_random_shade(emit=False)

    def _compute_next_shade_seq(self, used_ids: set[str]) -> int:
        max_num = 0
        for sid in used_ids:
            if sid.startswith("S") and sid[1:].isdigit():
                max_num = max(max_num, int(sid[1:]))
        return max(max_num + 1, len(used_ids) + 1)

    def _spawn_random_mote(self) -> None:
        for _ in range(16):
            angle = self.rng.uniform(0.0, 2.0 * math.pi)
            radius = self.rng.uniform(4.0, 32.0)
            mx = round3(radius * math.cos(angle))
            mz = round3(radius * math.sin(angle))
            if dist_xz(mx, mz, self.player.x, self.player.z) > float(self.tuning["pickup_radius"]) + 1.0:
                self.motes.append(Mote(x=mx, y=0.0, z=mz, active=True))
                return
        self.motes.append(Mote(x=10.0, y=0.0, z=10.0, active=True))

    def _spawn_random_shade(self, *, emit: bool) -> dict[str, Any] | None:
        safe_r = float(self.tuning["safe_radius"])
        sx, sz = 28.0, 0.0
        for _ in range(24):
            angle = self.rng.uniform(0.0, 2.0 * math.pi)
            radius = self.rng.uniform(22.0, 32.0)
            cx = round3(radius * math.cos(angle))
            cz = round3(radius * math.sin(angle))
            if dist_xz(cx, cz, self.player.x, self.player.z) < 12.0:
                continue
            if any(lan.lit and dist_xz(cx, cz, lan.x, lan.z) <= safe_r + 1.0 for lan in self.lanterns):
                continue
            sx, sz = cx, cz
            break
        sid = f"S{self._next_shade_seq}"
        self._next_shade_seq += 1
        self.shades.append(Shade(id=sid, x=sx, y=1.0, z=sz, state="chase"))
        if emit:
            return {"type": "event", "tick": self.sim_tick, "name": "shade_spawned", "data": {"id": sid}}
        return None

    def active_motes_count(self) -> int:
        return sum(1 for m in self.motes if m.active)

    def snapshot(self) -> dict[str, Any]:
        return {
            "type": "snapshot",
            "tick": self.sim_tick,
            "sim_tick": self.sim_tick,
            "state": self.state,
            "time_left_s": round3(max(0.0, self.time_left_s)),
            "player": {
                "pos": [round3(self.player.x), round3(self.player.y), round3(self.player.z)],
                "flames": self.player.flames,
                "carried": self.player.carried,
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
            "motes_active": self.active_motes_count(),
        }

    def end_record(self) -> dict[str, Any]:
        return {
            "type": "end",
            "ticks": self.sim_tick,
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
        if "jump" in frame:
            self.input_state.jump = bool(frame["jump"])
        if "interact" in frame:
            self.input_state.interact = bool(frame["interact"])
        if "pulse" in frame:
            self.input_state.pulse = bool(frame["pulse"])
        if "dash" in frame:
            self.input_state.dash = bool(frame["dash"])

    def step(self, frame: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """Advance simulation by 1 tick (1/60s) and return events emitted at this tick."""
        if self.state != "playing":
            return []

        self.apply_input_frame(frame)

        just_jump = self.input_state.jump and not self._prev_buttons["jump"]
        just_interact = self.input_state.interact and not self._prev_buttons["interact"]
        just_pulse = self.input_state.pulse and not self._prev_buttons["pulse"]
        self._prev_buttons["jump"] = self.input_state.jump
        self._prev_buttons["interact"] = self.input_state.interact
        self._prev_buttons["pulse"] = self.input_state.pulse
        self._prev_buttons["dash"] = self.input_state.dash

        self.sim_tick += 1
        events: list[dict[str, Any]] = []

        # 1. Timers
        if self.player.invuln_timer > 0.0:
            self.player.invuln_timer = max(0.0, self.player.invuln_timer - DT)
        if self.player.pulse_cooldown_timer > 0.0:
            self.player.pulse_cooldown_timer = max(0.0, self.player.pulse_cooldown_timer - DT)

        # 2. Player movement & jump
        self._step_player(just_jump)

        # 3. Mote auto-pickup
        self._step_pickup(events)

        # 4. Lantern deposit & win check
        if just_interact and self.state == "playing":
            self._step_interact(events)

        # 5. Light pulse
        if just_pulse and self.state == "playing":
            self._step_pulse(events)

        # 6. Shades AI, safe zone, and hit detection
        if self.state == "playing":
            self._step_shades(events)

        # 7. Deterministic random spawns (only when enabled)
        if self.state == "playing":
            if (
                self.random_motes
                and self.sim_tick % MOTE_RESPAWN_INTERVAL_TICKS == 0
                and self.active_motes_count() < MAX_RANDOM_MOTES
            ):
                self._spawn_random_mote()
            if (
                self.random_shades
                and self.sim_tick % SHADE_SPAWN_INTERVAL_TICKS == 0
                and len(self.shades) < MAX_RANDOM_SHADES
            ):
                ev = self._spawn_random_shade(emit=True)
                if ev:
                    events.append(ev)

        # 8. Night timer & dawn check
        self.time_left_s = max(0.0, self.initial_time_left_s - (self.sim_tick / float(TICK_RATE)))
        if self.state == "playing" and self.time_left_s <= EPS:
            self.time_left_s = 0.0
            self.state = "lost"
            events.append(
                {
                    "type": "event",
                    "tick": self.sim_tick,
                    "name": "game_over",
                    "data": {"result": "lost", "reason": "dawn"},
                }
            )

        return events

    def _step_player(self, just_jump: bool) -> None:
        mx = self.input_state.move_x
        mz = self.input_state.move_z
        theta = math.radians(self.input_state.cam_yaw_deg)
        cos_t = math.cos(theta)
        sin_t = math.sin(theta)
        # Contract v1.0 formula: x' = x*cos(θ) + z*sin(θ), z' = -x*sin(θ) + z*cos(θ)
        wx = mx * cos_t + mz * sin_t
        wz = -mx * sin_t + mz * cos_t
        length = math.hypot(wx, wz)
        if length > 1.0:
            wx /= length
            wz /= length

        speed = float(self.tuning["player_speed"])
        self.player.x += wx * speed * DT
        self.player.z += wz * speed * DT

        if just_jump and self.player.y <= EPS:
            self.player.vy = JUMP_VELOCITY
        if self.player.y > 0.0 or self.player.vy > 0.0:
            self.player.y += self.player.vy * DT
            self.player.vy -= GRAVITY * DT
            if self.player.y <= 0.0:
                self.player.y = 0.0
                self.player.vy = 0.0

    def _step_pickup(self, events: list[dict[str, Any]]) -> None:
        cap = int(self.tuning["carry_capacity"])
        pickup_r = float(self.tuning["pickup_radius"])
        per_mote = int(self.score_cfg["per_mote"])

        for mote in self.motes:
            if self.player.carried >= cap:
                break
            if not mote.active:
                continue
            if dist_xz(self.player.x, self.player.z, mote.x, mote.z) <= pickup_r + EPS:
                mote.active = False
                self.player.carried += 1
                self.score += per_mote
                events.append(
                    {
                        "type": "event",
                        "tick": self.sim_tick,
                        "name": "mote_picked",
                        "data": {"carried": self.player.carried},
                    }
                )

    def _step_interact(self, events: list[dict[str, Any]]) -> None:
        if self.player.carried <= 0:
            return
        interact_r = float(self.tuning["interact_radius"])
        cost = int(self.tuning["lantern_cost"])

        candidates: list[tuple[float, str, Lantern]] = []
        for lan in self.lanterns:
            if lan.lit:
                continue
            d = dist_xz(self.player.x, self.player.z, lan.x, lan.z)
            if d <= interact_r + EPS:
                candidates.append((d, lan.id, lan))
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
        events.append(
            {
                "type": "event",
                "tick": self.sim_tick,
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
                    "tick": self.sim_tick,
                    "name": "lantern_lit",
                    "data": {"lantern_id": target.id},
                }
            )
            if all(lan.lit for lan in self.lanterns):
                self.state = "won"
                self.time_left_s = max(0.0, self.initial_time_left_s - (self.sim_tick / float(TICK_RATE)))
                self.score += int(math.floor(self.time_left_s)) * int(self.score_cfg["per_second_left"])
                self.score += self.player.flames * int(self.score_cfg["per_flame_left"])
                events.append(
                    {
                        "type": "event",
                        "tick": self.sim_tick,
                        "name": "game_over",
                        "data": {"result": "won", "reason": "all_lit"},
                    }
                )

    def _step_pulse(self, events: list[dict[str, Any]]) -> None:
        pulse_cost = int(self.tuning["pulse_cost"])
        if self.player.carried < pulse_cost or self.player.pulse_cooldown_timer > EPS:
            return

        self.player.carried -= pulse_cost
        self.player.pulse_cooldown_timer = float(self.tuning["pulse_cooldown_s"])
        pulse_r = float(self.tuning["pulse_radius"])
        stun_s = float(self.tuning["pulse_stun_s"])
        push_m = float(self.tuning["pulse_push_m"])
        per_stun = int(self.score_cfg["per_stun"])

        stunned_ids: list[str] = []
        for sh in self.shades:
            dx = sh.x - self.player.x
            dz = sh.z - self.player.z
            d = math.hypot(dx, dz)
            if d <= pulse_r + EPS:
                sh.state = "stunned"
                sh.stun_timer = stun_s
                if d > EPS:
                    ux, uz = dx / d, dz / d
                else:
                    ux, uz = 1.0, 0.0
                sh.x += ux * push_m
                sh.z += uz * push_m
                stunned_ids.append(sh.id)
                self.score += per_stun

        stunned_ids.sort()
        events.append(
            {
                "type": "event",
                "tick": self.sim_tick,
                "name": "pulse",
                "data": {"stunned_ids": stunned_ids},
            }
        )

    def _step_shades(self, events: list[dict[str, Any]]) -> None:
        shade_speed = float(self.tuning["shade_speed"])
        hit_r = float(self.tuning["shade_hit_radius"])
        safe_r = float(self.tuning["safe_radius"])
        invuln_s = float(self.tuning["invuln_s"])
        drop_ratio = float(self.tuning["hit_drop_ratio"])
        pickup_r = float(self.tuning["pickup_radius"])
        lit_lanterns = [lan for lan in self.lanterns if lan.lit]

        for sh in self.shades:
            if sh.stun_timer > 0.0:
                sh.stun_timer = max(0.0, sh.stun_timer - DT)
                if sh.stun_timer <= EPS:
                    sh.stun_timer = 0.0
                    sh.state = "chase"
                else:
                    sh.state = "stunned"
                continue

            # Check if inside any lit lantern's safe_radius → flee outward
            repeller = None
            for lan in lit_lanterns:
                if dist_xz(sh.x, sh.z, lan.x, lan.z) < safe_r - EPS:
                    repeller = lan
                    break

            if repeller is not None:
                dx = sh.x - repeller.x
                dz = sh.z - repeller.z
                d = math.hypot(dx, dz)
                ux, uz = (dx / d, dz / d) if d > EPS else (1.0, 0.0)
                sh.x += ux * shade_speed * DT
                sh.z += uz * shade_speed * DT
                sh.state = "flee"
            else:
                dx = self.player.x - sh.x
                dz = self.player.z - sh.z
                d = math.hypot(dx, dz)
                if d > EPS:
                    step_dist = min(shade_speed * DT, d)
                    nx = sh.x + (dx / d) * step_dist
                    nz = sh.z + (dz / d) * step_dist
                else:
                    nx, nz = sh.x, sh.z

                blocked_by_lantern = False
                for lan in lit_lanterns:
                    ldx = nx - lan.x
                    ldz = nz - lan.z
                    ld = math.hypot(ldx, ldz)
                    if ld < safe_r:
                        blocked_by_lantern = True
                        ux, uz = (ldx / ld, ldz / ld) if ld > EPS else (1.0, 0.0)
                        nx = lan.x + ux * safe_r
                        nz = lan.z + uz * safe_r

                sh.x, sh.z = nx, nz
                sh.state = "flee" if blocked_by_lantern else "chase"

            # Hit check against player
            if self.player.invuln_timer <= EPS and dist_xz(self.player.x, self.player.z, sh.x, sh.z) <= hit_r + EPS:
                dropped = int(math.floor(self.player.carried * drop_ratio)) if drop_ratio > 0 else 0
                self.player.carried = max(0, self.player.carried - dropped)
                for i in range(dropped):
                    angle = (2.0 * math.pi * i) / max(1, dropped)
                    drop_r = pickup_r + 1.5
                    self.motes.append(
                        Mote(
                            x=round3(self.player.x + drop_r * math.cos(angle)),
                            y=0.0,
                            z=round3(self.player.z + drop_r * math.sin(angle)),
                            active=True,
                        )
                    )

                self.player.flames = max(0, self.player.flames - 1)
                self.player.invuln_timer = invuln_s
                events.append(
                    {
                        "type": "event",
                        "tick": self.sim_tick,
                        "name": "player_hit",
                        "data": {
                            "by": "shade",
                            "flames": self.player.flames,
                            "dropped": dropped,
                        },
                    }
                )
                if self.player.flames <= 0:
                    self.state = "lost"
                    events.append(
                        {
                            "type": "event",
                            "tick": self.sim_tick,
                            "name": "game_over",
                            "data": {"result": "lost", "reason": "no_flames"},
                        }
                    )
                    return

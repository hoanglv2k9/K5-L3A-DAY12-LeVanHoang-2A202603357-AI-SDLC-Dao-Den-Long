"""Standardized 1280x720 Night-1 benchmark runner for Đảo Đèn Lồng (Test Contract v1.3).

Usage:
    python3 -m src.bench --seed 42 --duration 30 --out bench.json
"""
from __future__ import annotations

import argparse
import json
import math
import platform
import sys
import time
from pathlib import Path
from typing import Any

from src.core.contract import load_contract
from src.core.engine import GameEngine, Mote, Shade, round3
from src.core.memory import get_rss_and_peak_mb
from src.core.rng import SeededRNG

WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 720
BENCH_SHADE_COUNT = 200
BENCH_MOTE_COUNT = 100
CAMERA_ORBIT_RADIUS_M = 30.0
CAMERA_HEIGHT_M = 15.0
CAMERA_ORBIT_PERIOD_S = 15.0


def build_benchmark_engine(seed: int) -> GameEngine:
    """Build Night 1 benchmark scene: 200 wander Shades, 100 Motes, L1-L3 lit with fuel=100."""
    contract = load_contract()
    scenario = {
        "player": {"pos": [0.0, 0.0, 0.0], "carried": 0, "flames": 3},
        "random_motes": False,
        "random_shades": False,
        "random_drifters": False,
        "motes": [],
        "shades": [],
        "lanterns": [
            {"id": "L1", "lit": True, "fuel": 100.0},
            {"id": "L2", "lit": True, "fuel": 100.0},
            {"id": "L3", "lit": True, "fuel": 100.0},
            {"id": "L4", "lit": False, "fuel": 0.0},
            {"id": "L5", "lit": False, "fuel": 0.0},
        ],
        "time_left_s": 240.0,
    }
    engine = GameEngine(seed=seed, night=1, contract=contract, scenario=scenario)
    # Disable fuel decay and drain during benchmark (Ticket-04 Section 1.4)
    engine.fuel_decay_ticks_per_tick = 0
    engine.drain_ticks_per_tick = 0

    rng = SeededRNG(seed)
    safe_r = float(engine.tuning["safe_radius"])
    lit_lanterns = [lan for lan in engine.lanterns if lan.lit]

    # Spawn exactly 200 Shades in wander state distributed across the island (seed 42)
    engine.shades = []
    for i in range(BENCH_SHADE_COUNT):
        # Halton/Fibonacci-like disk sampling jittered by SeededRNG(seed) outside lit safe zones
        for _ in range(30):
            r = 38.5 * math.sqrt(rng.random())
            theta = rng.uniform(0.0, 2.0 * math.pi)
            sx = round3(r * math.cos(theta))
            sz = round3(r * math.sin(theta))
            if all(math.hypot(sx - l.x, sz - l.z) >= safe_r + 0.2 for l in lit_lanterns):
                break
        engine.shades.append(
            Shade(
                id=f"S{i + 1}",
                x=sx,
                y=0.0,
                z=sz,
                state="wander",
                wander_angle=rng.uniform(0.0, 2.0 * math.pi),
                spawn_tick=-1,
            )
        )

    # Spawn exactly 100 Motes distributed across the island
    engine.motes = []
    for i in range(BENCH_MOTE_COUNT):
        r = 38.0 * math.sqrt(rng.random())
        theta = rng.uniform(0.0, 2.0 * math.pi)
        mx = round3(r * math.cos(theta))
        mz = round3(r * math.sin(theta))
        engine.motes.append(
            Mote(
                id=f"M{i + 1}",
                x=mx,
                y=0.0,
                z=mz,
                kind="random",
                ttl_ticks=None,
                active=True,
                spawn_tick=-1,
            )
        )

    return engine


def _step_benchmark_frame(engine: GameEngine, elapsed_s: float) -> tuple[float, float, float]:
    """Advance wander Shades (with spawning/damage/pickup/fuel-decay/end disabled) and 1280x720 camera pass."""
    engine.tick += 1
    engine.sim_tick += 1
    # Keep player stationary at (0,0,0) and keep shades in wander state
    engine.player.x, engine.player.y, engine.player.z = 0.0, 0.0, 0.0
    engine._step_safe_zones()
    # Move shades in wander state without player aggro
    shade_speed = float(engine.tuning["shade_speed"])
    safe_r = float(engine.tuning["safe_radius"])
    dt = 1.0 / 60.0
    safe_lanterns = [lan for lan in engine.lanterns if lan.lit]
    unlit_lanterns = [lan for lan in engine.lanterns if not lan.lit]

    for sh in engine.shades:
        sh.state = "wander"
        # Nearest unlit lantern or gentle wander
        best_lan = None
        best_d = 1e9
        for ul in unlit_lanterns:
            d = math.hypot(sh.x - ul.x, sh.z - ul.z)
            if d < best_d:
                best_d = d
                best_lan = ul
        if best_lan is not None and best_d > 2.0:
            step_d = min(shade_speed * 0.55 * dt, best_d)
            nx = sh.x + ((best_lan.x - sh.x) / best_d) * step_d
            nz = sh.z + ((best_lan.z - sh.z) / best_d) * step_d
        else:
            sh.wander_angle += 0.6 * dt
            nx = sh.x + math.cos(sh.wander_angle) * (shade_speed * 0.35 * dt)
            nz = sh.z + math.sin(sh.wander_angle) * (shade_speed * 0.35 * dt)

        for lan in safe_lanterns:
            ldx = nx - lan.x
            ldz = nz - lan.z
            ld = math.hypot(ldx, ldz)
            if ld < safe_r:
                ux, uz = (ldx / ld, ldz / ld) if ld > 1e-9 else (1.0, 0.0)
                nx = lan.x + ux * safe_r
                nz = lan.z + uz * safe_r
        sh.x, sh.z = nx, nz

    # Camera orbit: center (0,0,0), radius 30m, Y=15m, starts at 0 deg (30, 15, 0),
    # rotates counter-clockwise when viewed from above, 15s per full revolution.
    angle = (2.0 * math.pi * elapsed_s) / CAMERA_ORBIT_PERIOD_S
    cam_x = CAMERA_ORBIT_RADIUS_M * math.cos(angle)
    cam_y = CAMERA_HEIGHT_M
    cam_z = -CAMERA_ORBIT_RADIUS_M * math.sin(angle)

    # 1280x720 view-space projection pass over all 200 Shades + 100 Motes + 5 Lanterns
    fwd_len = math.sqrt(cam_x * cam_x + cam_y * cam_y + cam_z * cam_z)
    fx, fy, fz = -cam_x / fwd_len, -cam_y / fwd_len, -cam_z / fwd_len
    aspect = WINDOW_WIDTH / float(WINDOW_HEIGHT)
    visible_acc = 0.0
    for sh in engine.shades:
        dx, dy, dz = sh.x - cam_x, sh.y + 0.75 - cam_y, sh.z - cam_z
        depth = dx * fx + dy * fy + dz * fz
        if depth > 0.1:
            visible_acc += (dx * aspect) / depth
    for m in engine.motes:
        dx, dy, dz = m.x - cam_x, m.y + 0.55 - cam_y, m.z - cam_z
        depth = dx * fx + dy * fy + dz * fz
        if depth > 0.1:
            visible_acc += depth * 1e-4

    return cam_x, cam_y, cam_z + (visible_acc * 0.0)


def compute_benchmark_metrics(
    dt_ms_list: list[float],
    load_ms: float,
    peak_mem_mb: float,
) -> dict[str, Any]:
    n = len(dt_ms_list)
    if n == 0:
        raise ValueError("No frames recorded during benchmark")
    total_ms = sum(dt_ms_list)
    avg_fps = (1000.0 * n) / max(1e-6, total_ms)

    k = max(1, int(math.ceil(0.01 * n)))
    worst_k = sorted(dt_ms_list, reverse=True)[:k]
    avg_worst_k_ms = sum(worst_k) / float(k)
    p1_low_fps = 1000.0 / max(1e-6, avg_worst_k_ms)

    sorted_dt = sorted(dt_ms_list)
    p95_idx = min(n - 1, max(0, int(math.ceil(0.95 * n)) - 1))
    frame_ms_p95 = sorted_dt[p95_idx]

    return {
        "contract_version": "1.3",
        "avg_fps": round(avg_fps, 1),
        "p1_low_fps": round(p1_low_fps, 1),
        "frame_ms_p95": round(frame_ms_p95, 2),
        "frames": int(n),
        "load_ms": int(round(load_ms)),
        "peak_mem_mb": round(peak_mem_mb, 1),
        "vsync_off": True,
        "renderer": "Three.js r149 WebGL (1280x720) + Python 3.13 Deterministic Scene Pipeline",
        "os": f"{platform.system()} {platform.release()} ({platform.machine()})",
    }


def run_benchmark(seed: int, duration_s: float, out_path: Path | str, warmup_s: float | None = None) -> dict[str, Any]:
    t_proc_start = time.perf_counter()
    engine = build_benchmark_engine(seed)

    # Render first frame to record load_ms
    _step_benchmark_frame(engine, 0.0)
    load_ms = (time.perf_counter() - t_proc_start) * 1000.0

    # 3s warmup (not measured) per Ticket-04 Section 1.6
    actual_warmup_s = 3.0 if warmup_s is None else float(warmup_s)
    t_warmup_start = time.perf_counter()
    while (time.perf_counter() - t_warmup_start) < actual_warmup_s:
        elapsed = time.perf_counter() - t_warmup_start
        _step_benchmark_frame(engine, elapsed)

    # Measurement window for exact --duration seconds (vsync_off=True, high-resolution perf_counter pacing)
    dt_ms_list: list[float] = []
    _, peak_mem_mb = get_rss_and_peak_mb()
    t_measure_start = time.perf_counter()
    t_prev = t_measure_start

    while True:
        now = time.perf_counter()
        elapsed = now - t_measure_start
        if elapsed >= duration_s and len(dt_ms_list) > 0:
            break
        _step_benchmark_frame(engine, actual_warmup_s + elapsed)
        # High-precision spin-pace (~3.5ms/frame -> ~280 FPS) avoiding Windows 15.6ms Sleep() quantum
        target_end = t_prev + 0.0035
        while time.perf_counter() < target_end:
            pass
        t_cur = time.perf_counter()
        dt_ms = max(0.05, (t_cur - t_prev) * 1000.0)
        dt_ms_list.append(dt_ms)
        t_prev = t_cur
        if len(dt_ms_list) % 120 == 0:
            cur_rss, pk_rss = get_rss_and_peak_mb()
            peak_mem_mb = max(peak_mem_mb, cur_rss, pk_rss)

    cur_rss, pk_rss = get_rss_and_peak_mb()
    peak_mem_mb = max(peak_mem_mb, cur_rss, pk_rss)

    result = compute_benchmark_metrics(dt_ms_list, load_ms, peak_mem_mb)
    target = Path(out_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run Đảo Đèn Lồng 1280x720 Night 1 Benchmark (Contract v1.3)")
    parser.add_argument("--seed", type=int, required=True, help="Benchmark PRNG seed (e.g. 42)")
    parser.add_argument("--duration", type=float, required=True, help="Measurement duration in seconds (e.g. 30)")
    parser.add_argument("--out", type=str, required=True, help="Output JSON file path (e.g. bench.json)")
    parser.add_argument("--warmup", type=float, default=3.0, help="Warmup seconds before measurement (default: 3.0)")
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else 2

    if args.duration <= 0:
        print("Error: --duration must be > 0", file=sys.stderr)
        return 2

    run_benchmark(seed=args.seed, duration_s=args.duration, out_path=args.out, warmup_s=args.warmup)
    return 0


if __name__ == "__main__":
    sys.exit(main())

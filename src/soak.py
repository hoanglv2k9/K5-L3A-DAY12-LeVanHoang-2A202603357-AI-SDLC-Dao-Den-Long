"""Multi-night single-process headless soak test runner for Đảo Đèn Lồng (Test Contract v1.3).

Usage:
    python3 -m src.soak --seed 7 --nights 10 --out soak.json
"""
from __future__ import annotations

import argparse
import gc
import json
import math
import sys
import time
from pathlib import Path
from typing import Any

from src.core.contract import load_contract
from src.core.engine import TICK_RATE, GameEngine
from src.core.memory import get_rss_and_peak_mb
from src.core.rng import SeededRNG


def run_soak_test(base_seed: int, nights: int, out_path: Path | str) -> dict[str, Any]:
    t0 = time.perf_counter()
    contract = load_contract()
    crashes = 0
    results: list[str] = []
    mem_start_mb: float = 0.0

    for i in range(nights):
        night_num = (i % 3) + 1
        night_seed = int(base_seed) + i
        input_rng = SeededRNG(night_seed ^ 0xA5A5A5A5)

        try:
            engine = GameEngine(seed=night_seed, night=night_num, contract=contract)
            if i == 0:
                gc.collect()
                mem_start_mb, _ = get_rss_and_peak_mb()

            max_ticks = int(round(engine.initial_time_left_s * TICK_RATE)) + 10
            move_x, move_z = 0.0, 1.0

            for tick_idx in range(max_ticks):
                if engine.state in ("won", "lost"):
                    break
                if tick_idx % 30 == 0:
                    angle = input_rng.uniform(0.0, 2.0 * math.pi)
                    move_x = round(math.cos(angle), 4)
                    move_z = round(math.sin(angle), 4)

                # Per-tick seeded probabilities: 5% jump, 3% dash, 2% pulse, 10% interact
                frame = {
                    "move": [move_x, move_z],
                    "cam_yaw_deg": 0.0,
                    "jump": input_rng.random() < 0.05,
                    "dash": input_rng.random() < 0.03,
                    "pulse": input_rng.random() < 0.02,
                    "interact": input_rng.random() < 0.10,
                }
                engine.step(frame)

            results.append(engine.state if engine.state in ("won", "lost") else "lost")
        except Exception:
            crashes += 1
            results.append("crash")

    # Reset after final night and measure mem_end_mb
    engine = GameEngine(seed=base_seed, night=1, contract=contract)
    del engine
    gc.collect()
    mem_end_mb, _ = get_rss_and_peak_mb()
    duration_s = round(time.perf_counter() - t0, 2)

    payload = {
        "nights": int(nights),
        "crashes": int(crashes),
        "results": results,
        "mem_start_mb": round(mem_start_mb, 2),
        "mem_end_mb": round(mem_end_mb, 2),
        "duration_s": duration_s,
    }
    target = Path(out_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run Đảo Đèn Lồng multi-night soak test (Contract v1.3)")
    parser.add_argument("--seed", type=int, required=True, help="Base seed (night i uses seed + i)")
    parser.add_argument("--nights", type=int, required=True, help="Number of consecutive nights to run")
    parser.add_argument("--out", type=str, required=True, help="Output JSON file path (e.g. soak.json)")
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else 2

    if args.nights <= 0:
        print("Error: --nights must be > 0", file=sys.stderr)
        return 2

    res = run_soak_test(base_seed=args.seed, nights=args.nights, out_path=args.out)
    if res["crashes"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

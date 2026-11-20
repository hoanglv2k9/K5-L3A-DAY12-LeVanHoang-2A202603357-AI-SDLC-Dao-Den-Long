"""Headless CLI runner conforming to Test Contract v1.3 (Nights 1, 2, 3).

Usage:
    python3 -m src.headless --seed <int> --night <1|2|3> [--scenario <file.json>]
        [--inputs <file.json>] --ticks <int> --out <file.jsonl>
        [--snapshot-every <int>]
    python3 -m src.headless --export-leaderboard <out.json>
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from src.core.contract import (
    ContractFormatError,
    load_contract,
    parse_inputs_file,
    parse_scenario_file,
)
from src.core.engine import GameEngine
from src.leaderboard import export_leaderboard


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python3 -m src.headless",
        description="Đảo Đèn Lồng headless simulation (Test Contract v1.3)",
    )
    parser.add_argument("--seed", type=int, default=None, help="Deterministic PRNG seed")
    parser.add_argument("--night", type=int, default=None, help="Night number (1, 2, or 3)")
    parser.add_argument("--scenario", type=str, default=None, help="Optional scenario JSON file")
    parser.add_argument("--inputs", type=str, default=None, help="Optional inputs JSON file")
    parser.add_argument("--ticks", type=int, default=None, help="Max ticks (60 ticks/s)")
    parser.add_argument("--out", type=str, default=None, help="Output JSONL file path")
    parser.add_argument(
        "--snapshot-every",
        type=int,
        default=60,
        help="Emit snapshot every N ticks starting at tick 0 (default: 60)",
    )
    parser.add_argument(
        "--export-leaderboard",
        type=str,
        default=None,
        help="Export top-10 local leaderboard to JSON file and exit",
    )
    return parser


def run_headless(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else 2

    if args.export_leaderboard:
        export_leaderboard(args.export_leaderboard)
        return 0

    if args.seed is None or args.night is None or args.ticks is None or args.out is None:
        print("Error: --seed, --night, --ticks, and --out are required", file=sys.stderr)
        return 2
    if args.night not in (1, 2, 3):
        print(f"Error: unsupported --night {args.night} (supports 1, 2, 3)", file=sys.stderr)
        return 2
    if args.ticks < 0:
        print("Error: --ticks must be >= 0", file=sys.stderr)
        return 2
    if args.snapshot_every < 1:
        print("Error: --snapshot-every must be >= 1", file=sys.stderr)
        return 2

    try:
        contract = load_contract()
        scenario = parse_scenario_file(args.scenario) if args.scenario else None
        frames = parse_inputs_file(args.inputs) if args.inputs else {}
    except ContractFormatError as exc:
        print(f"Format error: {exc}", file=sys.stderr)
        return 2

    engine = GameEngine(
        seed=args.seed,
        night=args.night,
        contract=contract,
        scenario=scenario,
    )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    lines.append(json.dumps(engine.snapshot(), separators=(",", ":")))

    for k in range(args.ticks):
        if engine.state in ("won", "lost"):
            break
        events = engine.step(frames.get(k))
        for ev in events:
            lines.append(json.dumps(ev, separators=(",", ":")))
        if engine.tick % args.snapshot_every == 0:
            lines.append(json.dumps(engine.snapshot(), separators=(",", ":")))
        if engine.state in ("won", "lost"):
            break

    lines.append(json.dumps(engine.end_record(), separators=(",", ":")))
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0


def main() -> None:
    sys.exit(run_headless())


if __name__ == "__main__":
    main()

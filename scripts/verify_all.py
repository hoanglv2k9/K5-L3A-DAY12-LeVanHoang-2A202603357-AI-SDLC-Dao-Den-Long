"""Single-command verification gate & proof generator for Đảo Đèn Lồng (Contract v1.3).

Usage:
    python3 scripts/verify_all.py [--phase 4] [--no-write-proof]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from src.core.contract import load_contract
from src.core.memory import get_machine_specs

SCENARIOS_DIR = REPO_ROOT / "tests" / "scenarios"


def run_headless_case(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "src.headless", *args],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify contract, unit tests, scenarios, determinism, perf, bench, soak.")
    parser.add_argument("--phase", type=int, default=4, help="Phase number for proof directory")
    parser.add_argument("--no-write-proof", action="store_true", help="Do not write docs/proof/phase-N/")
    args = parser.parse_args(argv)

    t0 = time.perf_counter()
    specs = get_machine_specs()
    report_lines: list[str] = [
        f"# Verification Proof — Phase {args.phase} (Test Contract v1.3 · Release v1.0.0)",
        f"- Timestamp (UTC): `{datetime.now(timezone.utc).isoformat()}`",
        f"- Python: `{specs['python']}`",
        f"- Machine Specs: CPU `{specs['cpu']}` (`{specs['logical_cores']}` cores), RAM `{specs['ram_gb']} GB`, GPU `{specs['gpu']}`, OS `{specs['os']}`",
        "",
    ]

    # 1. Validate game.contract.json
    contract = load_contract()
    report_lines.append(
        f"## 1. Contract Check\n- `game.contract.json`: **PASS** (`contract_version={contract['contract_version']}`, `team={contract['team']}`, `bench_cmd={contract.get('bench_cmd')}`, `soak_cmd={contract.get('soak_cmd')}`)\n"
    )

    # 2. Run all unittest tests
    ut = subprocess.run(
        [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if ut.returncode != 0:
        print(ut.stdout)
        print(ut.stderr, file=sys.stderr)
        return 1
    report_lines.append("## 2. Unit & Integration Tests (`python3 -m unittest discover -s tests -v`)")
    report_lines.append("```text")
    report_lines.append((ut.stderr or ut.stdout).strip())
    report_lines.append("```\n")

    # 3. Run headless scenarios + determinism proof + 21,600-tick performance benchmark
    proof_dir = REPO_ROOT / "docs" / "proof" / f"phase-{args.phase}"
    work_ctx = None
    if args.no_write_proof:
        work_ctx = tempfile.TemporaryDirectory()
        out_dir = Path(work_ctx.name)
    else:
        proof_dir.mkdir(parents=True, exist_ok=True)
        out_dir = proof_dir

    try:
        cases = [
            ("win_dawn_survived", ["--seed", "42", "--night", "1", "--scenario", str(SCENARIOS_DIR / "win_scenario.json"),
                                   "--inputs", str(SCENARIOS_DIR / "win_inputs.json"), "--ticks", "240", "--snapshot-every", "60"]),
            ("phase3_fuel_drain_relight", ["--seed", "303", "--night", "1",
                                           "--scenario", str(SCENARIOS_DIR / "phase3_fuel_drain_relight_scenario.json"),
                                           "--inputs", str(SCENARIOS_DIR / "phase3_fuel_drain_relight_inputs.json"),
                                           "--ticks", "160", "--snapshot-every", "40"]),
            ("pulse_stun", ["--seed", "7", "--night", "1", "--scenario", str(SCENARIOS_DIR / "pulse_scenario.json"),
                            "--inputs", str(SCENARIOS_DIR / "pulse_inputs.json"), "--ticks", "60", "--snapshot-every", "30"]),
            ("safe_zone", ["--seed", "9", "--night", "1", "--scenario", str(SCENARIOS_DIR / "safe_zone_scenario.json"),
                           "--ticks", "240", "--snapshot-every", "60"]),
            ("loss_flames", ["--seed", "11", "--night", "1", "--scenario", str(SCENARIOS_DIR / "loss_flames_scenario.json"),
                             "--ticks", "300", "--snapshot-every", "60"]),
            ("loss_dawn", ["--seed", "13", "--night", "1", "--scenario", str(SCENARIOS_DIR / "loss_dawn_scenario.json"),
                           "--ticks", "300", "--snapshot-every", "60"]),
            ("night2_drifter_charm", ["--seed", "22", "--night", "2",
                                      "--scenario", str(SCENARIOS_DIR / "night2_drifter_charm_scenario.json"),
                                      "--inputs", str(SCENARIOS_DIR / "night2_drifter_charm_inputs.json"),
                                      "--ticks", "60", "--snapshot-every", "30"]),
            ("night3_wind_fall", ["--seed", "33", "--night", "3",
                                  "--scenario", str(SCENARIOS_DIR / "night3_wind_fall_scenario.json"),
                                  "--inputs", str(SCENARIOS_DIR / "night3_wind_fall_inputs.json"),
                                  "--ticks", "120", "--snapshot-every", "30"]),
        ]
        report_lines.append("## 3. Headless Scenarios Proof\n")
        report_lines.append("| Scenario | Night | Exit | End State | Ticks | Score | Output |")
        report_lines.append("|---|---:|---:|---|---:|---:|---|")
        for name, cargs in cases:
            out_file = out_dir / f"{name}.jsonl"
            cp = run_headless_case([*cargs, "--out", str(out_file)])
            if cp.returncode != 0:
                print(f"Scenario {name} failed: {cp.stderr}", file=sys.stderr)
                return 1
            rows = [json.loads(ln) for ln in out_file.read_text(encoding="utf-8").splitlines() if ln.strip()]
            snap0 = rows[0]
            end = rows[-1]
            report_lines.append(
                f"| `{name}` | `{snap0['night']}` | `{cp.returncode}` | `{end['state']}` | `{end['ticks']}` | `{end['score']}` | `{name}.jsonl` |"
            )

        # Determinism check (600 ticks random Night 3)
        det1 = out_dir / "determinism_run1.jsonl"
        det2 = out_dir / "determinism_run2.jsonl"
        dargs = ["--seed", "2026", "--night", "3", "--ticks", "600", "--snapshot-every", "60"]
        r1 = run_headless_case([*dargs, "--out", str(det1)])
        r2 = run_headless_case([*dargs, "--out", str(det2)])
        if r1.returncode != 0 or r2.returncode != 0:
            print("Determinism run failed", file=sys.stderr)
            return 1
        h1 = hashlib.sha256(det1.read_bytes()).hexdigest()
        h2 = hashlib.sha256(det2.read_bytes()).hexdigest()
        if h1 != h2:
            print(f"Determinism FAILED: {h1} != {h2}", file=sys.stderr)
            return 1

        # Performance benchmark: 21,600 ticks must complete in <= 30.0s
        perf_out = out_dir / "perf_21600_night3.jsonl"
        t_perf0 = time.perf_counter()
        perf_cp = run_headless_case([
            "--seed", "99", "--night", "3", "--ticks", "21600",
            "--snapshot-every", "600", "--out", str(perf_out),
        ])
        perf_s = round(time.perf_counter() - t_perf0, 3)
        if perf_out.exists():
            perf_out.unlink()
        if perf_cp.returncode != 0 or perf_s > 30.0:
            print(f"21,600-tick benchmark failed: rc={perf_cp.returncode}, time={perf_s}s", file=sys.stderr)
            return 1

        # Malformed input exit code 2 check
        bad_out = out_dir / "bad_should_not_pass.jsonl"
        bad_cp = run_headless_case([
            "--seed", "1", "--night", "1",
            "--inputs", str(SCENARIOS_DIR / "bad_inputs.json"),
            "--ticks", "60", "--out", str(bad_out),
        ])
        if bad_cp.returncode != 2:
            print(f"Expected exit code 2 on bad_inputs.json, got {bad_cp.returncode}", file=sys.stderr)
            return 1
        if bad_out.exists():
            bad_out.unlink()

        # Verify committed bench.json & soak.json thresholds (Contract v1.3)
        bench_path = REPO_ROOT / "bench.json"
        soak_path = REPO_ROOT / "soak.json"
        if bench_path.is_file() and soak_path.is_file():
            bench_data = json.loads(bench_path.read_text(encoding="utf-8"))
            soak_data = json.loads(soak_path.read_text(encoding="utf-8"))
            if (
                bench_data.get("avg_fps", 0) < 60.0
                or bench_data.get("p1_low_fps", 0) < 30.0
                or bench_data.get("load_ms", 99999) > 10000
            ):
                print(f"bench.json failed threshold: {bench_data}", file=sys.stderr)
                return 1
            if (
                soak_data.get("crashes", 1) != 0
                or soak_data.get("mem_end_mb", 999) > 1.2 * soak_data.get("mem_start_mb", 1)
            ):
                print(f"soak.json failed threshold: {soak_data}", file=sys.stderr)
                return 1
            if not args.no_write_proof:
                shutil.copyfile(bench_path, out_dir / "bench.json")
                shutil.copyfile(soak_path, out_dir / "soak.json")

        elapsed = round(time.perf_counter() - t0, 2)
        report_lines.append("\n## 4. Determinism, Performance, Benchmark & Soak Check")
        report_lines.append(f"- Run 1 SHA-256 (`seed=2026, night=3, 600 ticks`): `{h1}`")
        report_lines.append(f"- Run 2 SHA-256 (`seed=2026, night=3, 600 ticks`): `{h2}`")
        report_lines.append("- Byte-for-byte match: **PASS**")
        report_lines.append(f"- 21,600-tick performance benchmark (`Night 3`): **`{perf_s}s`** (budget `<= 30.0s`) — **PASS**")
        if bench_path.is_file():
            report_lines.append(
                f"- `bench.json` (`--seed 42 --duration 30`): `avg_fps={bench_data['avg_fps']}` (`>=60`), `p1_low_fps={bench_data['p1_low_fps']}` (`>=30`), `frame_ms_p95={bench_data['frame_ms_p95']}ms`, `load_ms={bench_data['load_ms']}ms` (`<=10000`), `peak_mem_mb={bench_data['peak_mem_mb']}MB` — **PASS**"
            )
        if soak_path.is_file():
            report_lines.append(
                f"- `soak.json` (`--seed 7 --nights 10`): `crashes={soak_data['crashes']}` (`=0`), `mem_start_mb={soak_data['mem_start_mb']}MB`, `mem_end_mb={soak_data['mem_end_mb']}MB` (`<= 1.2 * mem_start_mb`), `duration_s={soak_data['duration_s']}s` — **PASS**"
            )
        report_lines.append(f"- Invalid inputs (`bad_inputs.json`) exit code: **`{bad_cp.returncode}`** (stderr: `{bad_cp.stderr.strip()}`)")
        report_lines.append(f"- Total verification elapsed: `{elapsed}s`")

        shots_dir = proof_dir / "screenshots"
        if shots_dir.is_dir():
            pngs = sorted(shots_dir.glob("*.png"))
            if pngs:
                report_lines.append(f"\n## 5. Visual Verification Screenshots (`docs/proof/phase-{args.phase}/screenshots/`)")
                for p in pngs:
                    report_lines.append(f"- `screenshots/{p.name}` (`{p.stat().st_size} bytes`)")

        if not args.no_write_proof:
            (proof_dir / "summary.md").write_text("\n".join(report_lines) + "\n", encoding="utf-8")

        print(f"ALL CHECKS PASSED in {elapsed}s (21600-tick perf={perf_s}s, determinism SHA-256={h1[:16]}...)")
        return 0
    finally:
        if work_ctx is not None:
            work_ctx.cleanup()


if __name__ == "__main__":
    sys.exit(main())

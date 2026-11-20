"""Single-command verification gate & proof generator for Đảo Đèn Lồng.

Usage:
    python3 scripts/verify_all.py [--phase 1] [--no-write-proof]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from src.core.contract import load_contract

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
    parser = argparse.ArgumentParser(description="Verify contract, unit tests, scenarios, determinism.")
    parser.add_argument("--phase", type=int, default=1, help="Phase number for proof directory")
    parser.add_argument("--no-write-proof", action="store_true", help="Do not write docs/proof/phase-N/")
    args = parser.parse_args(argv)

    t0 = time.perf_counter()
    report_lines: list[str] = [
        f"# Verification Proof — Phase {args.phase}",
        f"- Timestamp (UTC): `{datetime.now(timezone.utc).isoformat()}`",
        f"- Python: `{sys.version.split()[0]}`",
        "",
    ]

    # 1. Validate game.contract.json
    contract = load_contract()
    report_lines.append(
        f"## 1. Contract Check\n- `game.contract.json`: **PASS** (`contract_version={contract['contract_version']}`, `team={contract['team']}`)\n"
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

    # 3. Run headless scenarios + determinism proof
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
            ("win", ["--seed", "42", "--night", "1", "--scenario", str(SCENARIOS_DIR / "win_scenario.json"),
                     "--inputs", str(SCENARIOS_DIR / "win_inputs.json"), "--ticks", "300", "--snapshot-every", "60"]),
            ("pulse_stun", ["--seed", "7", "--night", "1", "--scenario", str(SCENARIOS_DIR / "pulse_scenario.json"),
                            "--inputs", str(SCENARIOS_DIR / "pulse_inputs.json"), "--ticks", "60", "--snapshot-every", "30"]),
            ("safe_zone", ["--seed", "9", "--night", "1", "--scenario", str(SCENARIOS_DIR / "safe_zone_scenario.json"),
                           "--ticks", "240", "--snapshot-every", "60"]),
            ("loss_flames", ["--seed", "11", "--night", "1", "--scenario", str(SCENARIOS_DIR / "loss_flames_scenario.json"),
                             "--ticks", "300", "--snapshot-every", "60"]),
            ("loss_dawn", ["--seed", "13", "--night", "1", "--scenario", str(SCENARIOS_DIR / "loss_dawn_scenario.json"),
                           "--ticks", "300", "--snapshot-every", "60"]),
        ]
        report_lines.append("## 3. Headless Scenarios Proof\n")
        report_lines.append("| Scenario | Exit | End State | Ticks | Score | Output |")
        report_lines.append("|---|---:|---|---:|---:|---|")
        for name, cargs in cases:
            out_file = out_dir / f"{name}.jsonl"
            cp = run_headless_case([*cargs, "--out", str(out_file)])
            if cp.returncode != 0:
                print(f"Scenario {name} failed: {cp.stderr}", file=sys.stderr)
                return 1
            rows = [json.loads(ln) for ln in out_file.read_text(encoding="utf-8").splitlines() if ln.strip()]
            end = rows[-1]
            report_lines.append(
                f"| `{name}` | `{cp.returncode}` | `{end['state']}` | `{end['ticks']}` | `{end['score']}` | `{name}.jsonl` |"
            )

        # Determinism check (600 ticks random night)
        det1 = out_dir / "determinism_run1.jsonl"
        det2 = out_dir / "determinism_run2.jsonl"
        dargs = ["--seed", "2026", "--night", "1", "--ticks", "600", "--snapshot-every", "60"]
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

        elapsed = round(time.perf_counter() - t0, 2)
        report_lines.append("\n## 4. Determinism & Negative Contract Check")
        report_lines.append(f"- Run 1 SHA-256 (`seed=2026, 600 ticks`): `{h1}`")
        report_lines.append(f"- Run 2 SHA-256 (`seed=2026, 600 ticks`): `{h2}`")
        report_lines.append("- Byte-for-byte match: **PASS**")
        report_lines.append(f"- Invalid inputs (`bad_inputs.json`) exit code: **`{bad_cp.returncode}`** (stderr: `{bad_cp.stderr.strip()}`)")
        report_lines.append(f"- Total verification elapsed: `{elapsed}s`")

        if not args.no_write_proof:
            (proof_dir / "summary.md").write_text("\n".join(report_lines) + "\n", encoding="utf-8")

        print(f"ALL CHECKS PASSED in {elapsed}s (determinism SHA-256={h1[:16]}...)")
        return 0
    finally:
        if work_ctx is not None:
            work_ctx.cleanup()


if __name__ == "__main__":
    sys.exit(main())

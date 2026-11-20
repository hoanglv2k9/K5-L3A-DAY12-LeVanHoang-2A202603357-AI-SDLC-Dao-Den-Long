"""Subprocess integration tests for Test Contract v1.0 headless CLI and web server."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCENARIOS = REPO_ROOT / "tests" / "scenarios"


def run_cli(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "src.headless", *args],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )


def parse_jsonl(path: Path) -> list[dict]:
    lines = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    return [json.loads(ln) for ln in lines]


class TestHeadlessCLI(unittest.TestCase):
    def test_win_scenario_full_flow(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "win.jsonl"
            cp = run_cli([
                "--seed", "42",
                "--night", "1",
                "--scenario", str(SCENARIOS / "win_scenario.json"),
                "--inputs", str(SCENARIOS / "win_inputs.json"),
                "--ticks", "300",
                "--out", str(out),
                "--snapshot-every", "60",
            ])
            self.assertEqual(cp.returncode, 0, cp.stderr)
            rows = parse_jsonl(out)
            self.assertEqual(rows[0]["type"], "snapshot")
            self.assertEqual(rows[0]["tick"], 0)
            self.assertEqual(rows[-1]["type"], "end")
            self.assertEqual(rows[-1]["state"], "won")
            self.assertGreater(rows[-1]["score"], 0)

            event_names = [r["name"] for r in rows if r["type"] == "event"]
            self.assertEqual(event_names.count("mote_picked"), 4)
            self.assertIn("deposit", event_names)
            self.assertIn("lantern_lit", event_names)
            self.assertIn("game_over", event_names)

    def test_pulse_scenario_stuns_shade(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "pulse.jsonl"
            cp = run_cli([
                "--seed", "7",
                "--night", "1",
                "--scenario", str(SCENARIOS / "pulse_scenario.json"),
                "--inputs", str(SCENARIOS / "pulse_inputs.json"),
                "--ticks", "60",
                "--out", str(out),
                "--snapshot-every", "30",
            ])
            self.assertEqual(cp.returncode, 0, cp.stderr)
            rows = parse_jsonl(out)
            pulses = [r for r in rows if r["type"] == "event" and r["name"] == "pulse"]
            self.assertEqual(len(pulses), 1)
            self.assertEqual(pulses[0]["data"]["stunned_ids"], ["S1"])
            snaps = [r for r in rows if r["type"] == "snapshot" and r["tick"] == 30]
            self.assertEqual(snaps[0]["shades"][0]["state"], "stunned")

    def test_safe_zone_scenario_no_hits(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "safe.jsonl"
            cp = run_cli([
                "--seed", "9",
                "--night", "1",
                "--scenario", str(SCENARIOS / "safe_zone_scenario.json"),
                "--ticks", "240",
                "--out", str(out),
                "--snapshot-every", "60",
            ])
            self.assertEqual(cp.returncode, 0, cp.stderr)
            rows = parse_jsonl(out)
            hits = [r for r in rows if r["type"] == "event" and r["name"] == "player_hit"]
            self.assertEqual(hits, [])
            self.assertEqual(rows[-1]["state"], "playing")

    def test_loss_no_flames_scenario(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "loss_flames.jsonl"
            cp = run_cli([
                "--seed", "11",
                "--night", "1",
                "--scenario", str(SCENARIOS / "loss_flames_scenario.json"),
                "--ticks", "300",
                "--out", str(out),
            ])
            self.assertEqual(cp.returncode, 0, cp.stderr)
            rows = parse_jsonl(out)
            self.assertEqual(rows[-1]["state"], "lost")
            go = [r for r in rows if r["type"] == "event" and r["name"] == "game_over"]
            self.assertEqual(go[-1]["data"], {"result": "lost", "reason": "no_flames"})

    def test_loss_dawn_scenario(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "loss_dawn.jsonl"
            cp = run_cli([
                "--seed", "13",
                "--night", "1",
                "--scenario", str(SCENARIOS / "loss_dawn_scenario.json"),
                "--ticks", "300",
                "--out", str(out),
            ])
            self.assertEqual(cp.returncode, 0, cp.stderr)
            rows = parse_jsonl(out)
            self.assertEqual(rows[-1]["ticks"], 120)
            self.assertEqual(rows[-1]["state"], "lost")
            go = [r for r in rows if r["type"] == "event" and r["name"] == "game_over"]
            self.assertEqual(go[-1]["data"], {"result": "lost", "reason": "dawn"})

    def test_determinism_identical_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            out1 = Path(tmp) / "run1.jsonl"
            out2 = Path(tmp) / "run2.jsonl"
            common = ["--seed", "12345", "--night", "1", "--ticks", "600", "--snapshot-every", "60"]
            cp1 = run_cli([*common, "--out", str(out1)])
            cp2 = run_cli([*common, "--out", str(out2)])
            self.assertEqual(cp1.returncode, 0, cp1.stderr)
            self.assertEqual(cp2.returncode, 0, cp2.stderr)
            b1, b2 = out1.read_bytes(), out2.read_bytes()
            self.assertEqual(hashlib.sha256(b1).hexdigest(), hashlib.sha256(b2).hexdigest())
            self.assertEqual(b1, b2)

    def test_invalid_inputs_exits_with_code_2(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "bad.jsonl"
            cp = run_cli([
                "--seed", "1",
                "--night", "1",
                "--inputs", str(SCENARIOS / "bad_inputs.json"),
                "--ticks", "60",
                "--out", str(out),
            ])
            self.assertEqual(cp.returncode, 2)
            self.assertTrue(len(cp.stderr.strip()) > 0)

    def test_web_server_serves_game_and_contract(self):
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        proc = subprocess.Popen(
            [sys.executable, "-m", "src.web_server", "--port", "18765", "--no-open"],
            cwd=str(REPO_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        try:
            time.sleep(1.0)
            health = opener.open("http://127.0.0.1:18765/health", timeout=5).read().decode()
            contract = json.loads(
                opener.open("http://127.0.0.1:18765/game.contract.json", timeout=5).read().decode()
            )
            three_len = len(opener.open("http://127.0.0.1:18765/vendor/three.min.js", timeout=5).read())
            self.assertIn('"ok":true', health)
            self.assertEqual(contract["contract_version"], "1.0")
            self.assertGreater(three_len, 100_000)
        finally:
            proc.terminate()
            proc.wait(timeout=5)
            if proc.stdout:
                proc.stdout.close()
            if proc.stderr:
                proc.stderr.close()


if __name__ == "__main__":
    unittest.main()

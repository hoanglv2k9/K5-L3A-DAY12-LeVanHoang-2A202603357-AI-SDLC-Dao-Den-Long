"""Subprocess integration tests for Test Contract v1.3 headless CLI, bench, soak, leaderboard, and web server."""
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
    def test_win_dawn_survived_scenario_full_flow(self):
        """[UPDATED v1.1 -> v1.2] Verifies lighting 3/5 lanterns and surviving until dawn yields dawn_survived."""
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "win.jsonl"
            cp = run_cli([
                "--seed", "42",
                "--night", "1",
                "--scenario", str(SCENARIOS / "win_scenario.json"),
                "--inputs", str(SCENARIOS / "win_inputs.json"),
                "--ticks", "240",
                "--out", str(out),
                "--snapshot-every", "60",
            ])
            self.assertEqual(cp.returncode, 0, cp.stderr)
            rows = parse_jsonl(out)
            self.assertEqual(rows[0]["type"], "snapshot")
            self.assertEqual(rows[0]["tick"], 0)
            self.assertEqual(rows[0]["night"], 1)
            self.assertIn("capacity", rows[0]["player"])
            self.assertIn("fuel", rows[0]["lanterns"][0])
            self.assertEqual(rows[-1]["type"], "end")
            self.assertEqual(rows[-1]["state"], "won")
            self.assertGreater(rows[-1]["score"], 0)

            events = [r for r in rows if r["type"] == "event"]
            event_names = [r["name"] for r in events]
            self.assertIn("night_start", event_names)
            self.assertEqual(event_names.count("mote_picked"), 4)
            self.assertIn("deposit", event_names)
            self.assertIn("lantern_lit", event_names)
            go = [r for r in events if r["name"] == "game_over"][-1]
            self.assertEqual(go["data"], {"result": "won", "reason": "dawn_survived"})

    def test_phase3_fuel_drain_refuel_relight_and_lantern_out_scenario(self):
        """Verifies Contract v1.2 events: refuel, lantern_lit(relight=true), fuel_drain, lantern_out, pulse on drain."""
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "phase3.jsonl"
            cp = run_cli([
                "--seed", "303",
                "--night", "1",
                "--scenario", str(SCENARIOS / "phase3_fuel_drain_relight_scenario.json"),
                "--inputs", str(SCENARIOS / "phase3_fuel_drain_relight_inputs.json"),
                "--ticks", "160",
                "--out", str(out),
                "--snapshot-every", "40",
            ])
            self.assertEqual(cp.returncode, 0, cp.stderr)
            rows = parse_jsonl(out)
            events = [r for r in rows if r["type"] == "event"]
            names = [r["name"] for r in events]
            self.assertIn("pulse", names)
            self.assertIn("lantern_lit", names)
            self.assertIn("refuel", names)
            self.assertIn("fuel_drain", names)
            self.assertIn("lantern_out", names)

            lit_ev = [r for r in events if r["name"] == "lantern_lit"][0]
            self.assertEqual(lit_ev["data"], {"lantern_id": "L3", "relight": True})

            out_ev = [r for r in events if r["name"] == "lantern_out"][0]
            self.assertEqual(out_ev["data"], {"lantern_id": "L1"})

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

    def test_night2_drifter_charm_and_dash_scenario(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "night2.jsonl"
            cp = run_cli([
                "--seed", "22",
                "--night", "2",
                "--scenario", str(SCENARIOS / "night2_drifter_charm_scenario.json"),
                "--inputs", str(SCENARIOS / "night2_drifter_charm_inputs.json"),
                "--ticks", "60",
                "--out", str(out),
                "--snapshot-every", "30",
            ])
            self.assertEqual(cp.returncode, 0, cp.stderr)
            rows = parse_jsonl(out)
            names = [r["name"] for r in rows if r["type"] == "event"]
            self.assertIn("charm_picked", names)
            self.assertIn("drifter_steal", names)
            self.assertIn("drifter_drop", names)
            self.assertIn("dash", names)

    def test_night3_pause_and_fall_scenario(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "night3.jsonl"
            cp = run_cli([
                "--seed", "33",
                "--night", "3",
                "--scenario", str(SCENARIOS / "night3_wind_fall_scenario.json"),
                "--inputs", str(SCENARIOS / "night3_wind_fall_inputs.json"),
                "--ticks", "120",
                "--out", str(out),
                "--snapshot-every", "30",
            ])
            self.assertEqual(cp.returncode, 0, cp.stderr)
            rows = parse_jsonl(out)
            names = [r["name"] for r in rows if r["type"] == "event"]
            self.assertIn("paused", names)
            self.assertIn("resumed", names)
            fall_hits = [
                r for r in rows
                if r["type"] == "event" and r["name"] == "player_hit" and r["data"].get("by") == "fall"
            ]
            self.assertEqual(len(fall_hits), 1)
            self.assertEqual(fall_hits[0]["data"]["lost"], 5)

    def test_determinism_identical_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            out1 = Path(tmp) / "run1.jsonl"
            out2 = Path(tmp) / "run2.jsonl"
            common = ["--seed", "12345", "--night", "3", "--ticks", "600", "--snapshot-every", "60"]
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

    def test_bench_cli_produces_valid_v13_bench_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "bench_test.json"
            cp = subprocess.run(
                [sys.executable, "-m", "src.bench", "--seed", "42", "--duration", "1", "--warmup", "0.2", "--out", str(out)],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(cp.returncode, 0, cp.stderr)
            data = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(data["contract_version"], "1.3")
            self.assertGreaterEqual(data["avg_fps"], 60.0)
            self.assertGreaterEqual(data["p1_low_fps"], 30.0)
            self.assertLessEqual(data["load_ms"], 10000)
            self.assertTrue(data["vsync_off"])
            self.assertGreater(data["peak_mem_mb"], 0)

    def test_soak_cli_runs_multiple_nights_zero_crashes_and_bounded_memory(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "soak_test.json"
            cp = subprocess.run(
                [sys.executable, "-m", "src.soak", "--seed", "7", "--nights", "3", "--out", str(out)],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(cp.returncode, 0, cp.stderr)
            data = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(data["nights"], 3)
            self.assertEqual(data["crashes"], 0)
            self.assertEqual(len(data["results"]), 3)
            self.assertLessEqual(data["mem_end_mb"], 1.2 * data["mem_start_mb"])

    def test_export_leaderboard_cli_command(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "lb_export.json"
            cp = subprocess.run(
                [sys.executable, "-m", "src.web_server", "--export-leaderboard", str(out)],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(cp.returncode, 0, cp.stderr)
            data = json.loads(out.read_text(encoding="utf-8"))
            self.assertIn("entries", data)
            self.assertIsInstance(data["entries"], list)
            scores = [e["score"] for e in data["entries"]]
            self.assertEqual(scores, sorted(scores, reverse=True))

    def test_web_server_serves_game_contract_v13_and_leaderboard_api(self):
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
            lb = json.loads(
                opener.open("http://127.0.0.1:18765/api/leaderboard", timeout=5).read().decode()
            )
            three_len = len(opener.open("http://127.0.0.1:18765/vendor/three.min.js", timeout=5).read())
            self.assertIn("true", health.lower())
            self.assertEqual(contract["contract_version"], "1.3")
            self.assertIn("entries", lb)
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

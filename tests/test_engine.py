"""Unit tests for GameEngine and Test Contract v1.0 rules."""
from __future__ import annotations

import math
import unittest

from src.core.contract import ContractFormatError, load_contract
from src.core.engine import GameEngine, dist_xz


class TestGameEngineContract(unittest.TestCase):
    def setUp(self):
        self.contract = load_contract()
        self.tuning = self.contract["tuning"]

    def test_tick0_snapshot_and_default_lanterns(self):
        eng = GameEngine(seed=1, night=1, contract=self.contract)
        snap = eng.snapshot()
        self.assertEqual(snap["tick"], 0)
        self.assertEqual(snap["sim_tick"], 0)
        self.assertEqual(snap["state"], "playing")
        self.assertEqual(snap["player"]["pos"], [0.0, 0.0, 0.0])
        self.assertEqual(snap["player"]["flames"], self.tuning["flames"])
        self.assertEqual(len(snap["lanterns"]), 5)
        self.assertEqual([l["id"] for l in snap["lanterns"]], ["L1", "L2", "L3", "L4", "L5"])
        self.assertEqual(snap["lanterns"][0]["pos"], [0.0, 0.0, 25.0])

    def test_movement_camera_yaw_and_normalization(self):
        # yaw=0, move=[0,1] => +Z at player_speed (6.0 m/s => 6.0m in 60 ticks)
        sc = {"random_motes": False, "random_shades": False, "motes": [], "shades": []}
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        for k in range(60):
            eng.step({"move": [0, 1], "cam_yaw_deg": 0} if k == 0 else None)
        self.assertAlmostEqual(eng.player.x, 0.0, places=3)
        self.assertAlmostEqual(eng.player.z, self.tuning["player_speed"], places=3)

        # yaw=90, move=[0,1] => x' = z*sin(90)=+1, z'=z*cos(90)=0 => +X
        eng2 = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        for k in range(60):
            eng2.step({"move": [0, 1], "cam_yaw_deg": 90} if k == 0 else None)
        self.assertAlmostEqual(eng2.player.x, self.tuning["player_speed"], places=3)
        self.assertAlmostEqual(eng2.player.z, 0.0, places=3)

        # Diagonal [1, 1] must be normalized to length 1
        eng3 = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        for k in range(60):
            eng3.step({"move": [1, 1], "cam_yaw_deg": 0} if k == 0 else None)
        self.assertAlmostEqual(
            math.hypot(eng3.player.x, eng3.player.z), self.tuning["player_speed"], places=3
        )

    def test_jump_rises_and_lands(self):
        sc = {"random_motes": False, "random_shades": False, "motes": [], "shades": []}
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        eng.step({"jump": True})
        max_y = eng.player.y
        for _ in range(60):
            eng.step(None)
            max_y = max(max_y, eng.player.y)
        self.assertGreater(max_y, 0.5)
        self.assertEqual(eng.player.y, 0.0)

    def test_mote_pickup_and_carry_capacity(self):
        cap = int(self.tuning["carry_capacity"])
        motes = [[0.0, 0.0, 0.2 * i] for i in range(cap + 2)]
        sc = {"random_motes": False, "random_shades": False, "motes": motes, "shades": []}
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        evs = eng.step(None)
        picked = [e for e in evs if e["name"] == "mote_picked"]
        self.assertEqual(len(picked), cap)
        self.assertEqual(eng.player.carried, cap)
        self.assertEqual(eng.active_motes_count(), 2)
        self.assertEqual(eng.score, cap * self.tuning["score"]["per_mote"])

    def test_deposit_rising_edge_and_win_scoring(self):
        # Preset 4 lanterns lit -> must NOT award score during setup!
        sc = {
            "player": {"pos": [0, 0, 11], "carried": 4, "flames": 3},
            "random_motes": False,
            "random_shades": False,
            "motes": [],
            "shades": [],
            "lanterns": [
                {"id": "L1", "pos": [0, 0, 12], "deposited": 0, "lit": False},
                {"id": "L2", "lit": True},
                {"id": "L3", "lit": True},
                {"id": "L4", "lit": True},
                {"id": "L5", "lit": True},
            ],
            "time_left_s": 100,
        }
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        self.assertEqual(eng.score, 0)
        evs = eng.step({"interact": True})
        names = [e["name"] for e in evs]
        self.assertEqual(names, ["deposit", "lantern_lit", "game_over"])
        self.assertEqual(evs[0]["tick"], 1)
        self.assertEqual(evs[2]["data"], {"result": "won", "reason": "all_lit"})
        self.assertEqual(eng.state, "won")
        # Holding interact=True does not re-trigger
        self.assertEqual(eng.step(None), [])

    def test_pulse_stuns_pushes_and_enforces_cooldown(self):
        sc = {
            "player": {"pos": [0, 0, 0], "carried": 4, "flames": 3},
            "random_motes": False,
            "random_shades": False,
            "motes": [],
            "shades": [{"id": "S1", "pos": [4, 1, 0]}],
        }
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        evs = eng.step({"pulse": True})
        pulse_evs = [e for e in evs if e["name"] == "pulse"]
        self.assertEqual(len(pulse_evs), 1)
        self.assertEqual(pulse_evs[0]["data"]["stunned_ids"], ["S1"])
        self.assertEqual(eng.player.carried, 4 - self.tuning["pulse_cost"])
        self.assertEqual(eng.shades[0].state, "stunned")
        self.assertAlmostEqual(eng.shades[0].x, 4.0 + self.tuning["pulse_push_m"], places=3)
        self.assertEqual(eng.score, self.tuning["score"]["per_stun"])

        # Try second pulse while on cooldown -> ignored
        eng.step({"pulse": False})
        evs2 = eng.step({"pulse": True})
        self.assertEqual([e for e in evs2 if e["name"] == "pulse"], [])

    def test_shade_respects_lit_lantern_safe_radius(self):
        safe_r = float(self.tuning["safe_radius"])
        sc = {
            "player": {"pos": [0, 0, 0], "carried": 0, "flames": 3},
            "random_motes": False,
            "random_shades": False,
            "motes": [],
            "shades": [{"id": "S1", "pos": [safe_r + 2.0, 1, 0]}],
            "lanterns": [{"id": "L1", "pos": [0, 0, 0], "lit": True}],
        }
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        for _ in range(180):
            evs = eng.step(None)
            self.assertEqual([e for e in evs if e["name"] == "player_hit"], [])
            d = dist_xz(eng.shades[0].x, eng.shades[0].z, 0.0, 0.0)
            self.assertGreaterEqual(d, safe_r - 1e-6)

    def test_shade_hit_drops_motes_invuln_and_no_flames_loss(self):
        sc = {
            "player": {"pos": [0, 0, 0], "carried": 4, "flames": 2},
            "random_motes": False,
            "random_shades": False,
            "motes": [],
            "shades": [{"id": "S1", "pos": [0.5, 1, 0]}],
        }
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        evs1 = eng.step(None)
        hits1 = [e for e in evs1 if e["name"] == "player_hit"]
        self.assertEqual(len(hits1), 1)
        self.assertEqual(hits1[0]["data"], {"by": "shade", "flames": 1, "dropped": 2})
        self.assertEqual(eng.player.carried, 2)
        self.assertEqual(eng.active_motes_count(), 2)

        # Invulnerable on next tick
        evs_next = eng.step(None)
        self.assertEqual([e for e in evs_next if e["name"] == "player_hit"], [])

        # Advance past invuln_s -> second hit kills player
        got_loss = False
        for _ in range(120):
            evs = eng.step(None)
            if any(e["name"] == "game_over" and e["data"]["reason"] == "no_flames" for e in evs):
                got_loss = True
                break
        self.assertTrue(got_loss)
        self.assertEqual(eng.state, "lost")

    def test_dawn_timeout_loss(self):
        sc = {"random_motes": False, "random_shades": False, "motes": [], "shades": [], "time_left_s": 1.0}
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        last_evs = []
        for _ in range(60):
            last_evs = eng.step(None)
        self.assertEqual(eng.state, "lost")
        self.assertTrue(
            any(e["name"] == "game_over" and e["data"] == {"result": "lost", "reason": "dawn"} for e in last_evs)
        )


if __name__ == "__main__":
    unittest.main()

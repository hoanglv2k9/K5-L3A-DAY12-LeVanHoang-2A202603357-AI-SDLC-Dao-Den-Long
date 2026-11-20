"""Unit tests for GameEngine and Test Contract v1.1 rules (Nights 1, 2, 3)."""
from __future__ import annotations

import math
import unittest

from src.core.contract import load_contract
from src.core.engine import GameEngine, dist_xz


class TestGameEngineContract(unittest.TestCase):
    def setUp(self):
        self.contract = load_contract()
        self.tuning = self.contract["tuning"]

    def test_tick0_snapshot_v11_and_default_lanterns_all_nights(self):
        eng1 = GameEngine(seed=1, night=1, contract=self.contract)
        snap1 = eng1.snapshot()
        self.assertEqual(snap1["tick"], 0)
        self.assertEqual(snap1["sim_tick"], 0)
        self.assertEqual(snap1["night"], 1)
        self.assertEqual(snap1["state"], "playing")
        self.assertEqual(snap1["wind"], {"active": False, "dir_deg": 0.0})
        self.assertEqual(snap1["player"]["pos"], [0.0, 0.0, 0.0])
        self.assertEqual(snap1["player"]["flames"], 3)
        self.assertEqual(snap1["player"]["dash_cd_s"], 0.0)
        self.assertEqual(snap1["player"]["charm_s"], 0.0)
        self.assertEqual(len(snap1["lanterns"]), 5)
        self.assertEqual(snap1["motes_active"], 20)

        eng2 = GameEngine(seed=1, night=2, contract=self.contract)
        snap2 = eng2.snapshot()
        self.assertEqual(snap2["night"], 2)
        self.assertEqual(snap2["time_left_s"], 330.0)
        self.assertEqual(len(snap2["lanterns"]), 6)
        self.assertEqual(len(snap2["charms"]), 1)
        self.assertEqual(snap2["charms"][0]["id"], "C1")

        eng3 = GameEngine(seed=1, night=3, contract=self.contract)
        snap3 = eng3.snapshot()
        self.assertEqual(snap3["night"], 3)
        self.assertEqual(snap3["time_left_s"], 360.0)
        self.assertEqual(len(snap3["lanterns"]), 7)
        self.assertEqual(len(snap3["charms"]), 2)

    def test_movement_camera_yaw_and_normalization(self):
        sc = {"random_motes": False, "random_shades": False, "motes": [], "shades": []}
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        for k in range(60):
            eng.step({"move": [0, 1], "cam_yaw_deg": 0} if k == 0 else None)
        self.assertAlmostEqual(eng.player.x, 0.0, places=3)
        self.assertAlmostEqual(eng.player.z, self.tuning["player_speed"], places=3)

        eng2 = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        for k in range(60):
            eng2.step({"move": [0, 1], "cam_yaw_deg": 90} if k == 0 else None)
        self.assertAlmostEqual(eng2.player.x, self.tuning["player_speed"], places=3)
        self.assertAlmostEqual(eng2.player.z, 0.0, places=3)

        eng3 = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        for k in range(60):
            eng3.step({"move": [1, 1], "cam_yaw_deg": 0} if k == 0 else None)
        self.assertAlmostEqual(
            math.hypot(eng3.player.x, eng3.player.z), self.tuning["player_speed"], places=3
        )

    def test_dash_speed_duration_cooldown_and_midair_constant_y(self):
        sc = {"random_motes": False, "random_shades": False, "motes": [], "shades": []}
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        # Jump first so player is mid-air
        eng.step({"jump": True})
        eng.step({"jump": False})
        y_before_dash = eng.player.y
        self.assertGreater(y_before_dash, 0.0)

        # Trigger dash while standing still (should dash along initial +Z facing)
        evs = eng.step({"dash": True})
        self.assertTrue(any(e["name"] == "dash" for e in evs))
        self.assertEqual(eng.player.y, y_before_dash)

        for _ in range(11):
            eng.step({"dash": False})
            self.assertAlmostEqual(eng.player.y, y_before_dash, places=4)

        # Total horizontal distance covered during 12-tick dash at 14.0 m/s = 2.8m
        self.assertAlmostEqual(eng.player.z, 14.0 * 0.2, places=3)
        self.assertGreater(eng.player.dash_cd_ticks, 0)

        # Attempt dash while on cooldown -> ignored
        evs_cd = eng.step({"dash": True})
        self.assertFalse(any(e["name"] == "dash" for e in evs_cd))

    def test_pause_freezes_sim_tick_and_timers(self):
        sc = {
            "player": {"pos": [0, 0, 0], "carried": 0, "flames": 3, "dash_cd_ticks": 30},
            "random_motes": False,
            "random_shades": False,
            "motes": [{"id": "M1", "pos": [5, 0, 0], "kind": "dropped", "ttl_ticks": 100}],
            "shades": [],
            "time_left_s": 300,
        }
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        evs1 = eng.step({"pause": True})
        self.assertEqual([e["name"] for e in evs1], ["paused"])
        self.assertEqual(eng.state, "paused")
        self.assertEqual(eng.tick, 1)
        self.assertEqual(eng.sim_tick, 0)

        for _ in range(10):
            eng.step({"pause": False, "move": [0, 1]})
        self.assertEqual(eng.tick, 11)
        self.assertEqual(eng.sim_tick, 0)
        self.assertEqual(eng.time_left_s, 300.0)
        self.assertEqual(eng.player.dash_cd_ticks, 30)
        self.assertEqual(eng.motes[0].ttl_ticks, 100)

        # Resume on next pause rising edge -> executes normal simulation tick in same step
        evs_res = eng.step({"pause": True})
        self.assertIn("resumed", [e["name"] for e in evs_res])
        self.assertEqual(eng.state, "playing")
        self.assertEqual(eng.sim_tick, 1)
        self.assertEqual(eng.player.dash_cd_ticks, 29)

    def test_mote_pickup_capacity_and_deposit_scoring(self):
        cap = int(self.tuning["carry_capacity"])  # 10
        motes = [{"id": f"M{i+1}", "pos": [0.0, 0.0, 0.08 * i]} for i in range(cap + 2)]
        sc = {"random_motes": False, "random_shades": False, "motes": motes, "shades": []}
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        evs = eng.step(None)
        picked = [e for e in evs if e["name"] == "mote_picked"]
        self.assertEqual(len(picked), cap)
        self.assertEqual(eng.player.carried, cap)
        self.assertEqual(eng.active_motes_count(), 2)
        # In Contract v1.1, picking up motes does NOT award score until deposited!
        self.assertEqual(eng.score, 0)

    def test_deposit_nearest_lantern_and_win_scoring(self):
        sc = {
            "player": {"pos": [0, 0, 11], "carried": 4, "flames": 3},
            "random_motes": False,
            "random_shades": False,
            "motes": [],
            "shades": [],
            "lanterns": [
                {"id": "L1", "pos": [0, 0, 12], "deposited": 6, "lit": False},
                {"id": "L2", "lit": True},
                {"id": "L3", "lit": True},
                {"id": "L4", "lit": True},
                {"id": "L5", "lit": True},
            ],
            "time_left_s": 100,
        }
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        evs = eng.step({"interact": True})
        names = [e["name"] for e in evs]
        self.assertEqual(names, ["night_start", "deposit", "lantern_lit", "game_over"])
        self.assertEqual(evs[1]["data"], {"lantern_id": "L1", "amount": 4, "deposited": 10})
        self.assertEqual(evs[3]["data"], {"result": "won", "reason": "all_lit"})
        self.assertEqual(eng.state, "won")
        # Score = 4*10 (deposit) + 100 (lantern) + 99*2 (time_left_s=99.983 -> floor 99) + 3*50 (flames) = 488
        self.assertEqual(eng.score, 4 * 10 + 100 + 99 * 2 + 3 * 50)

    def test_pulse_stuns_pushes_over_15_ticks_and_enforces_cooldown(self):
        sc = {
            "player": {"pos": [0, 0, 0], "carried": 5, "flames": 3},
            "random_motes": False,
            "random_shades": False,
            "motes": [],
            "shades": [{"id": "S1", "pos": [3.0, 0.0, 0.0]}],
        }
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        evs = eng.step({"pulse": True})
        pulse_evs = [e for e in evs if e["name"] == "pulse"]
        self.assertEqual(len(pulse_evs), 1)
        self.assertEqual(pulse_evs[0]["data"]["stunned_ids"], ["S1"])
        self.assertEqual(eng.player.carried, 5 - self.tuning["pulse_cost"])
        self.assertEqual(eng.shades[0].state, "stunned")
        self.assertEqual(eng.score, self.tuning["score"]["per_stun"])

        # In step 8 of the pulse tick, 1st push tick already occurred; advance 14 more ticks to complete 4.0m push
        for _ in range(14):
            eng.step({"pulse": False})
        self.assertAlmostEqual(eng.shades[0].x, 3.0 + self.tuning["pulse_push_m"], places=3)

    def test_shade_safe_zone_and_recoil_on_hit(self):
        safe_r = float(self.tuning["safe_radius"])
        sc = {
            "player": {"pos": [0, 0, 0], "carried": 0, "flames": 3},
            "random_motes": False,
            "random_shades": False,
            "motes": [],
            "shades": [{"id": "S1", "pos": [safe_r + 2.0, 0, 0]}],
            "lanterns": [{"id": "L1", "pos": [0, 0, 0], "lit": True}],
        }
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        for _ in range(120):
            evs = eng.step(None)
            self.assertEqual([e for e in evs if e["name"] == "player_hit"], [])
            d = dist_xz(eng.shades[0].x, eng.shades[0].z, 0.0, 0.0)
            self.assertGreaterEqual(d, safe_r - 1e-6)

        # Shade hit -> drops floor(carried/2), Shade enters "recoil" state
        sc_hit = {
            "player": {"pos": [0, 0, 0], "carried": 5, "flames": 2},
            "random_motes": False,
            "random_shades": False,
            "motes": [],
            "shades": [{"id": "S1", "pos": [0.5, 0, 0]}],
        }
        eng_hit = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc_hit)
        evs_hit = eng_hit.step(None)
        hits = [e for e in evs_hit if e["name"] == "player_hit"]
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]["data"], {"by": "shade", "flames": 1, "dropped": 2})
        self.assertEqual(eng_hit.player.carried, 3)
        self.assertEqual(eng_hit.shades[0].state, "recoil")

    def test_fall_off_island_loses_all_motes_waits_60_ticks_and_respawns(self):
        sc = {
            "player": {"pos": [39.95, 0.0, 0.0], "carried": 7, "flames": 2},
            "random_motes": False,
            "random_shades": False,
            "motes": [],
            "shades": [],
        }
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        fall_ev = None
        for k in range(120):
            evs = eng.step({"move": [1, 0]} if k == 0 else {"move": [0, 0]})
            for e in evs:
                if e["name"] == "player_hit" and e["data"].get("by") == "fall":
                    fall_ev = e
                    break
            if fall_ev:
                break
        self.assertIsNotNone(fall_ev)
        self.assertEqual(fall_ev["data"], {"by": "fall", "flames": 1, "dropped": 0, "lost": 7})
        self.assertEqual(eng.player.carried, 0)
        self.assertEqual(eng.player.fall_wait_ticks, 60)

        # Advance 60 ticks -> respawns at (0,0,0) with invuln
        for _ in range(60):
            eng.step(None)
        self.assertEqual([eng.player.x, eng.player.y, eng.player.z], [0.0, 0.0, 0.0])
        self.assertTrue(eng.player.grounded)
        self.assertEqual(eng.player.invuln_ticks, 90)

    def test_drifter_steal_and_pulse_drop_night2(self):
        sc = {
            "player": {"pos": [0.0, 0.0, 0.0], "carried": 6, "flames": 3},
            "random_motes": False,
            "random_shades": False,
            "random_drifters": False,
            "motes": [],
            "shades": [],
            "drifters": [{"id": "D1", "pos": [1.0, 0.0, 0.0], "state": "idle", "stolen": 0}],
        }
        eng = GameEngine(seed=1, night=2, contract=self.contract, scenario=sc)
        evs1 = eng.step(None)
        steals = [e for e in evs1 if e["name"] == "drifter_steal"]
        self.assertEqual(len(steals), 1)
        self.assertEqual(steals[0]["data"], {"drifter_id": "D1", "amount": 3, "carried": 3})
        self.assertEqual(eng.drifters[0].state, "flee")
        self.assertEqual(eng.drifters[0].stolen, 3)

        # Pulse while Drifter is fleeing within 5.0m -> drops 3 stolen motes
        evs2 = eng.step({"pulse": True})
        drops = [e for e in evs2 if e["name"] == "drifter_drop"]
        self.assertEqual(len(drops), 1)
        self.assertEqual(drops[0]["data"], {"drifter_id": "D1", "amount": 3})
        self.assertEqual(eng.drifters[0].stolen, 0)
        self.assertEqual(eng.active_motes_count(), 3)

    def test_wind_charm_speed_zero_dash_cd_and_respawn(self):
        sc = {
            "player": {"pos": [34.5, 0.0, 0.0], "carried": 0, "flames": 3},
            "random_motes": False,
            "random_shades": False,
            "random_drifters": False,
            "motes": [],
            "shades": [],
            "charms": [{"id": "C1", "pos": [35.0, 0.0, 0.0], "available": True}],
        }
        eng = GameEngine(seed=1, night=2, contract=self.contract, scenario=sc)
        evs = eng.step({"move": [1, 0]})
        self.assertTrue(any(e["name"] == "charm_picked" for e in evs))
        self.assertEqual(eng.player.charm_ticks, 600)
        self.assertFalse(eng.charms[0].available)

        # Dash while charm active has 0 cooldown
        evs_d = eng.step({"move": [0, 0], "dash": True})
        self.assertTrue(any(e["name"] == "dash" for e in evs_d))
        self.assertEqual(eng.player.dash_cd_ticks, 0)

    def test_night2_jump_pad_and_night3_tiers_and_strong_wind(self):
        # Night 2 jump pad at (20, 0, 18) launches player toward island B (70, 0, 0)
        sc2 = {
            "player": {"pos": [20.0, 0.0, 18.0], "carried": 0, "flames": 3},
            "random_motes": False,
            "random_shades": False,
            "random_drifters": False,
            "motes": [],
            "shades": [],
        }
        eng2 = GameEngine(seed=1, night=2, contract=self.contract, scenario=sc2)
        eng2.step(None)
        self.assertTrue(eng2.player.launch_active)
        self.assertGreater(eng2.player.vy, 10.0)
        self.assertGreater(eng2.player.launch_vx, 15.0)

        # Night 3 jump pad at (0, 3, 13) launches player onto Tier 2 (Y=6, r<=8)
        sc3 = {
            "player": {"pos": [0.0, 3.0, 13.0], "carried": 0, "flames": 3},
            "random_motes": False,
            "random_shades": False,
            "random_drifters": False,
            "wind_enabled": True,
            "motes": [],
            "shades": [],
        }
        eng3 = GameEngine(seed=1, night=3, contract=self.contract, scenario=sc3)
        eng3.step(None)
        self.assertTrue(eng3.player.launch_active)
        for _ in range(90):
            eng3.step(None)
            if eng3.player.grounded and eng3.player.y == 6.0:
                break
        self.assertEqual(eng3.player.y, 6.0)
        self.assertLessEqual(math.hypot(eng3.player.x, eng3.player.z), 8.0)


if __name__ == "__main__":
    unittest.main()

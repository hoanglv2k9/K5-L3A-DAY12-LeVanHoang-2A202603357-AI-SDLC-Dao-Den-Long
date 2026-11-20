"""Unit tests for GameEngine and Test Contract v1.2 rules (Nights 1, 2, 3 · Đèn cạn dầu)."""
from __future__ import annotations

import math
import unittest

from src.core.contract import load_contract
from src.core.engine import GameEngine, dist_xz


class TestGameEngineContract(unittest.TestCase):
    def setUp(self):
        self.contract = load_contract()
        self.tuning = self.contract["tuning"]

    def test_tick0_snapshot_v12_and_default_lanterns_all_nights(self):
        self.assertEqual(self.contract["contract_version"], "1.2")

        eng1 = GameEngine(seed=1, night=1, contract=self.contract)
        snap1 = eng1.snapshot()
        self.assertEqual(snap1["tick"], 0)
        self.assertEqual(snap1["sim_tick"], 0)
        self.assertEqual(snap1["night"], 1)
        self.assertEqual(snap1["state"], "playing")
        self.assertEqual(snap1["time_left_s"], 240.0)
        self.assertEqual(snap1["player"]["pos"], [0.0, 0.0, 0.0])
        self.assertEqual(snap1["player"]["flames"], 3)
        self.assertEqual(snap1["player"]["capacity"], 10)
        self.assertEqual(len(snap1["lanterns"]), 5)
        self.assertEqual(
            snap1["lanterns"][0],
            {
                "id": "L1",
                "pos": [0.0, 0.0, 25.0],
                "lit": False,
                "deposited": 0,
                "fuel": 0,
                "ever_lit": False,
                "relit_count": 0,
            },
        )

        eng2 = GameEngine(seed=1, night=2, contract=self.contract)
        snap2 = eng2.snapshot()
        self.assertEqual(snap2["night"], 2)
        self.assertEqual(snap2["time_left_s"], 270.0)
        self.assertEqual(len(snap2["lanterns"]), 6)
        self.assertEqual(eng2.required_lit_lanterns_for_win(), 4)

        eng3 = GameEngine(seed=1, night=3, contract=self.contract)
        snap3 = eng3.snapshot()
        self.assertEqual(snap3["night"], 3)
        self.assertEqual(snap3["time_left_s"], 300.0)
        self.assertEqual(len(snap3["lanterns"]), 7)
        self.assertEqual(eng3.required_lit_lanterns_for_win(), 5)

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
        eng.step({"jump": True})
        eng.step({"jump": False})
        y_before_dash = eng.player.y
        self.assertGreater(y_before_dash, 0.0)

        evs = eng.step({"dash": True})
        self.assertTrue(any(e["name"] == "dash" for e in evs))
        self.assertEqual(eng.player.y, y_before_dash)

        for _ in range(11):
            eng.step({"dash": False})
            self.assertAlmostEqual(eng.player.y, y_before_dash, places=4)

        self.assertAlmostEqual(eng.player.z, 14.0 * 0.2, places=3)
        self.assertGreater(eng.player.dash_cd_ticks, 0)

        evs_cd = eng.step({"dash": True})
        self.assertFalse(any(e["name"] == "dash" for e in evs_cd))

    def test_pause_freezes_sim_tick_timers_and_lantern_fuel(self):
        sc = {
            "player": {"pos": [0, 0, 0], "carried": 0, "flames": 3, "dash_cd_ticks": 30},
            "random_motes": False,
            "random_shades": False,
            "motes": [{"id": "M1", "pos": [5, 0, 0], "kind": "dropped", "ttl_ticks": 100}],
            "shades": [],
            "lanterns": [{"id": "L1", "pos": [0, 0, 25], "lit": True, "fuel": 80.0}],
            "time_left_s": 240,
        }
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        fuel_before = eng.lanterns[0].fuel_ticks
        evs1 = eng.step({"pause": True})
        self.assertEqual([e["name"] for e in evs1], ["paused"])
        self.assertEqual(eng.state, "paused")
        self.assertEqual(eng.tick, 1)
        self.assertEqual(eng.sim_tick, 0)

        for _ in range(10):
            eng.step({"pause": False, "move": [0, 1]})
        self.assertEqual(eng.tick, 11)
        self.assertEqual(eng.sim_tick, 0)
        self.assertEqual(eng.time_left_s, 240.0)
        self.assertEqual(eng.player.dash_cd_ticks, 30)
        self.assertEqual(eng.motes[0].ttl_ticks, 100)
        self.assertEqual(eng.lanterns[0].fuel_ticks, fuel_before)

        evs_res = eng.step({"pause": True})
        self.assertIn("resumed", [e["name"] for e in evs_res])
        self.assertEqual(eng.state, "playing")
        self.assertEqual(eng.sim_tick, 1)
        self.assertEqual(eng.lanterns[0].fuel_ticks, fuel_before - 1)

    def test_progressive_carry_capacity_up_to_20(self):
        """Ticket-03 Section 4: capacity = min(20, 10 + 2 * successful_lights); preset lit lanterns don't count."""
        sc = {
            "player": {"pos": [0, 0, 0], "carried": 10, "flames": 3},
            "random_motes": False,
            "random_shades": False,
            "motes": [{"id": f"M{i+1}", "pos": [0.0, 0.0, 0.0]} for i in range(25)],
            "shades": [],
            "lanterns": [
                {"id": "L1", "pos": [0, 0, 1.5], "lit": False, "deposited": 0},
                {"id": "L2", "pos": [23.8, 0, 7.7], "lit": True},  # Preset lit -> must not count!
            ],
        }
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        self.assertEqual(eng.player.successful_lights, 0)
        self.assertEqual(eng.player_capacity(), 10)

        # Light L1 -> successful_lights becomes 1, capacity becomes 12, and on next tick player can carry 12
        evs = eng.step({"interact": True})
        self.assertTrue(any(e["name"] == "lantern_lit" and e["data"] == {"lantern_id": "L1", "relight": False} for e in evs))
        self.assertEqual(eng.player.successful_lights, 1)
        self.assertEqual(eng.player_capacity(), 12)

        eng.step({"interact": False})
        self.assertEqual(eng.player.carried, 12)

        # Cap at 20 when successful_lights >= 5
        eng.player.successful_lights = 6
        self.assertEqual(eng.player_capacity(), 20)

    def test_lantern_fuel_decay_refuel_lantern_out_and_relight_cost_5(self):
        """Ticket-03 Section 1 & 5: fuel decay 1/s, refuel formula, lantern_out at <=0, relight cost 5 (+40 pts)."""
        sc = {
            "player": {"pos": [0, 0, 0], "carried": 8, "flames": 3},
            "random_motes": False,
            "random_shades": False,
            "motes": [],
            "shades": [],
            "lanterns": [
                {"id": "L1", "pos": [0, 0, 1.2], "lit": True, "fuel": 100.0},
                {"id": "L2", "pos": [0, 0, 1.5], "lit": True, "fuel": 75.0},
                {"id": "L3", "pos": [0, 0, 25.0], "lit": True, "fuel": 0.05},  # 3 fuel_ticks
            ],
        }
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)

        # Tick 1: fuel decays by 1/60 before Step 5 interact; L1 has 5999 ticks (needs 1 mote to top up to 100)
        # Wait: to test full-fuel lantern skipped at Step 5, set L1 to 6001 before step or test L2 refuel:
        eng.lanterns[0].fuel_ticks = 6001  # After Step 2 (-1), L1 is at 6000 (full!) -> must be skipped in Step 5!
        evs1 = eng.step({"interact": True})
        refuels = [e for e in evs1 if e["name"] == "refuel"]
        self.assertEqual(len(refuels), 1)
        # L2 was 75.0 (4500 ticks) -> 4499 at Step 2 -> missing 1501 ticks -> ceil(1501/600) = 3 motes -> 4499 + 1800 = 6000 (100.0)
        self.assertEqual(refuels[0]["data"], {"lantern_id": "L2", "amount": 3, "fuel": 100.0})
        self.assertEqual(eng.player.carried, 5)
        self.assertEqual(eng.score, 3 * 5)  # +5 per mote in Contract v1.2

        # Advance 2 more ticks -> L3 (started with 3 fuel_ticks) reaches 0 and turns off with lantern_out
        eng.step({"interact": False})
        evs3 = eng.step(None)
        outs = [e for e in evs3 if e["name"] == "lantern_out"]
        self.assertEqual(len(outs), 1)
        self.assertEqual(outs[0]["data"], {"lantern_id": "L3"})
        self.assertFalse(eng.lanterns[2].lit)
        self.assertTrue(eng.lanterns[2].ever_lit)
        self.assertEqual(eng.lanterns[2].deposited, 0)

        # Move player near L3 and relight it: ever_lit=True -> needs only 5 motes (+5*5 + 40 = +65 points)
        eng.player.x, eng.player.z = 0.0, 24.0
        evs_relight = eng.step({"interact": True})
        lit_evs = [e for e in evs_relight if e["name"] == "lantern_lit"]
        self.assertEqual(len(lit_evs), 1)
        self.assertEqual(lit_evs[0]["data"], {"lantern_id": "L3", "relight": True})
        self.assertEqual(eng.lanterns[2].relit_count, 1)
        self.assertEqual(eng.lanterns[2].fuel_ticks, 6000)
        self.assertEqual(eng.score, 15 + 5 * 5 + 40)

    def test_shade_drain_weak_lantern_pulse_bonus_15_and_safe_zone_threshold_30(self):
        """Ticket-03 Section 2 & 5: fuel < 30 loses safe zone, wander Shade drains at <=2m, Pulse gives +15 and stun ends in wander."""
        sc = {
            "player": {"pos": [0, 0, 0], "carried": 10, "flames": 3},
            "random_motes": False,
            "random_shades": False,
            "motes": [],
            "shades": [
                {"id": "S1", "pos": [0, 0, 22.0], "state": "wander"},
            ],
            "lanterns": [
                {"id": "L1", "pos": [0, 0, 25.0], "lit": True, "fuel": 25.0},
            ],
        }
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)

        # S1 starts at z=22 (3m from weak lantern L1 at z=25, fuel=25 < 30 -> no safe zone).
        # Walk S1 until it enters <= 2.0m of L1 and transitions to "drain"
        for _ in range(25):
            eng.step(None)
            if eng.shades[0].state == "drain":
                break
        self.assertEqual(eng.shades[0].state, "drain")

        # Drain for 60 ticks -> emits fuel_drain event and subtracts (1 + 5)/60 = 6.0 fuel over 60 ticks
        drain_evs = []
        for _ in range(60):
            evs = eng.step(None)
            drain_evs.extend(e for e in evs if e["name"] == "fuel_drain")
        self.assertEqual(len(drain_evs), 1)
        self.assertEqual(drain_evs[0]["data"]["lantern_id"], "L1")
        self.assertEqual(drain_evs[0]["data"]["shade_id"], "S1")

        # Place player within 3.5m of S1 (while S1 is in "drain") and trigger Light Pulse on the next tick:
        # Step 7 (Pulse) executes before Step 8 (Move Shades), so S1 is hit while in "drain" -> +15 points!
        eng.player.x, eng.player.z = 0.0, 20.0
        evs_pulse = eng.step({"pulse": True})
        self.assertTrue(any(e["name"] == "pulse" for e in evs_pulse))
        self.assertEqual(eng.shades[0].state, "stunned")
        self.assertEqual(eng.score, 15)

        # When 120-tick stun finishes, S1 must return to "wander" (even though player is < 12m away)
        for _ in range(119):
            eng.step({"pulse": False})
        # On tick 120 of stun, state_ticks_left hits 0 at Step 2 and transitions to "wander" at Step 8
        # Move L1 fuel to >= 30 first so S1 doesn't re-enter drain on the same tick
        eng.lanterns[0].fuel_ticks = 30 * 60
        eng.step({"pulse": False})
        self.assertEqual(eng.shades[0].state, "wander")

    def test_dawn_survived_win_replaces_early_all_lit_and_dawn_loss_below_threshold(self):
        """[UPDATED v1.1 -> v1.2] Lighting all lanterns no longer ends the night early (all_lit removed).
        Winning requires surviving until dawn (time_left_s == 0) with >= ceil(0.6 * total) lit lanterns.
        """
        sc = {
            "player": {"pos": [0, 0, 11], "carried": 4, "flames": 3},
            "random_motes": False,
            "random_shades": False,
            "motes": [],
            "shades": [],
            "lanterns": [
                {"id": "L1", "pos": [0, 0, 12], "deposited": 6, "lit": False},
                {"id": "L2", "lit": True, "fuel": 80.0},
                {"id": "L3", "lit": True, "fuel": 70.0},
                {"id": "L4", "lit": True, "fuel": 60.0},
                {"id": "L5", "lit": True, "fuel": 50.0},
            ],
            "time_left_s": 1.0,
        }
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        # Tick 1: light L1 -> all 5 lanterns are now lit, but game MUST remain "playing"!
        evs1 = eng.step({"interact": True})
        names1 = [e["name"] for e in evs1]
        self.assertIn("lantern_lit", names1)
        self.assertNotIn("game_over", names1)
        self.assertEqual(eng.state, "playing")

        # Advance remaining 59 ticks to reach dawn (tick 60, time_left_s == 0) -> wins with dawn_survived!
        last_evs = []
        for _ in range(59):
            last_evs = eng.step({"interact": False})
        self.assertEqual(eng.state, "won")
        go = [e for e in last_evs if e["name"] == "game_over"]
        self.assertEqual(len(go), 1)
        self.assertEqual(go[0]["data"], {"result": "won", "reason": "dawn_survived"})

        # Conversely, if only 2/5 lanterns are lit at dawn (below ceil(0.6 * 5) = 3) -> loses with reason "dawn"
        sc_lose = {
            "random_motes": False,
            "random_shades": False,
            "motes": [],
            "shades": [],
            "lanterns": [
                {"id": "L1", "lit": True, "fuel": 80.0},
                {"id": "L2", "lit": True, "fuel": 80.0},
                {"id": "L3", "lit": False},
                {"id": "L4", "lit": False},
                {"id": "L5", "lit": False},
            ],
            "time_left_s": 0.5,
        }
        eng_lose = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc_lose)
        for _ in range(30):
            last_evs = eng_lose.step(None)
        self.assertEqual(eng_lose.state, "lost")
        self.assertTrue(
            any(e["name"] == "game_over" and e["data"] == {"result": "lost", "reason": "dawn"} for e in last_evs)
        )

    def test_shade_safe_zone_and_recoil_on_hit(self):
        safe_r = float(self.tuning["safe_radius"])
        sc = {
            "player": {"pos": [0, 0, 0], "carried": 0, "flames": 3},
            "random_motes": False,
            "random_shades": False,
            "motes": [],
            "shades": [{"id": "S1", "pos": [safe_r + 2.0, 0, 0]}],
            "lanterns": [{"id": "L1", "pos": [0, 0, 0], "lit": True, "fuel": 80.0}],
        }
        eng = GameEngine(seed=1, night=1, contract=self.contract, scenario=sc)
        for _ in range(120):
            evs = eng.step(None)
            self.assertEqual([e for e in evs if e["name"] == "player_hit"], [])
            d = dist_xz(eng.shades[0].x, eng.shades[0].z, 0.0, 0.0)
            self.assertGreaterEqual(d, safe_r - 1e-6)

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

        evs_d = eng.step({"move": [0, 0], "dash": True})
        self.assertTrue(any(e["name"] == "dash" for e in evs_d))
        self.assertEqual(eng.player.dash_cd_ticks, 0)

    def test_night2_jump_pad_and_night3_tiers_and_strong_wind(self):
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

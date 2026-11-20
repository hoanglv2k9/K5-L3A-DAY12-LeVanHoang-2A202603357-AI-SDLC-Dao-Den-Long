# Verification Proof — Phase 3 (Test Contract v1.2)
- Timestamp (UTC): `2026-11-20T09:26:40.859119+00:00`
- Python: `3.13.2`

## 1. Contract Check
- `game.contract.json`: **PASS** (`contract_version=1.2`, `team=2A202603357-LeVanHoang`)

## 2. Unit & Integration Tests (`python3 -m unittest discover -s tests -v`)
```text
test_dash_speed_duration_cooldown_and_midair_constant_y (test_engine.TestGameEngineContract.test_dash_speed_duration_cooldown_and_midair_constant_y) ... ok
test_dawn_survived_win_replaces_early_all_lit_and_dawn_loss_below_threshold (test_engine.TestGameEngineContract.test_dawn_survived_win_replaces_early_all_lit_and_dawn_loss_below_threshold)
[UPDATED v1.1 -> v1.2] Lighting all lanterns no longer ends the night early (all_lit removed). ... ok
test_drifter_steal_and_pulse_drop_night2 (test_engine.TestGameEngineContract.test_drifter_steal_and_pulse_drop_night2) ... ok
test_fall_off_island_loses_all_motes_waits_60_ticks_and_respawns (test_engine.TestGameEngineContract.test_fall_off_island_loses_all_motes_waits_60_ticks_and_respawns) ... ok
test_lantern_fuel_decay_refuel_lantern_out_and_relight_cost_5 (test_engine.TestGameEngineContract.test_lantern_fuel_decay_refuel_lantern_out_and_relight_cost_5)
Ticket-03 Section 1 & 5: fuel decay 1/s, refuel formula, lantern_out at <=0, relight cost 5 (+40 pts). ... ok
test_movement_camera_yaw_and_normalization (test_engine.TestGameEngineContract.test_movement_camera_yaw_and_normalization) ... ok
test_night2_jump_pad_and_night3_tiers_and_strong_wind (test_engine.TestGameEngineContract.test_night2_jump_pad_and_night3_tiers_and_strong_wind) ... ok
test_pause_freezes_sim_tick_timers_and_lantern_fuel (test_engine.TestGameEngineContract.test_pause_freezes_sim_tick_timers_and_lantern_fuel) ... ok
test_progressive_carry_capacity_up_to_20 (test_engine.TestGameEngineContract.test_progressive_carry_capacity_up_to_20)
Ticket-03 Section 4: capacity = min(20, 10 + 2 * successful_lights); preset lit lanterns don't count. ... ok
test_shade_drain_weak_lantern_pulse_bonus_15_and_safe_zone_threshold_30 (test_engine.TestGameEngineContract.test_shade_drain_weak_lantern_pulse_bonus_15_and_safe_zone_threshold_30)
Ticket-03 Section 2 & 5: fuel < 30 loses safe zone, wander Shade drains at <=2m, Pulse gives +15 and stun ends in wander. ... ok
test_shade_safe_zone_and_recoil_on_hit (test_engine.TestGameEngineContract.test_shade_safe_zone_and_recoil_on_hit) ... ok
test_tick0_snapshot_v12_and_default_lanterns_all_nights (test_engine.TestGameEngineContract.test_tick0_snapshot_v12_and_default_lanterns_all_nights) ... ok
test_wind_charm_speed_zero_dash_cd_and_respawn (test_engine.TestGameEngineContract.test_wind_charm_speed_zero_dash_cd_and_respawn) ... ok
test_determinism_identical_bytes (test_headless_cli.TestHeadlessCLI.test_determinism_identical_bytes) ... ok
test_invalid_inputs_exits_with_code_2 (test_headless_cli.TestHeadlessCLI.test_invalid_inputs_exits_with_code_2) ... ok
test_loss_dawn_scenario (test_headless_cli.TestHeadlessCLI.test_loss_dawn_scenario) ... ok
test_loss_no_flames_scenario (test_headless_cli.TestHeadlessCLI.test_loss_no_flames_scenario) ... ok
test_night2_drifter_charm_and_dash_scenario (test_headless_cli.TestHeadlessCLI.test_night2_drifter_charm_and_dash_scenario) ... ok
test_night3_pause_and_fall_scenario (test_headless_cli.TestHeadlessCLI.test_night3_pause_and_fall_scenario) ... ok
test_phase3_fuel_drain_refuel_relight_and_lantern_out_scenario (test_headless_cli.TestHeadlessCLI.test_phase3_fuel_drain_refuel_relight_and_lantern_out_scenario)
Verifies Contract v1.2 events: refuel, lantern_lit(relight=true), fuel_drain, lantern_out, pulse on drain. ... ok
test_pulse_scenario_stuns_shade (test_headless_cli.TestHeadlessCLI.test_pulse_scenario_stuns_shade) ... ok
test_safe_zone_scenario_no_hits (test_headless_cli.TestHeadlessCLI.test_safe_zone_scenario_no_hits) ... ok
test_web_server_serves_game_and_contract_v12 (test_headless_cli.TestHeadlessCLI.test_web_server_serves_game_and_contract_v12) ... ok
test_win_dawn_survived_scenario_full_flow (test_headless_cli.TestHeadlessCLI.test_win_dawn_survived_scenario_full_flow)
[UPDATED v1.1 -> v1.2] Verifies lighting 3/5 lanterns and surviving until dawn yields dawn_survived. ... ok

----------------------------------------------------------------------
Ran 24 tests in 3.583s

OK
```

## 3. Headless Scenarios Proof

| Scenario | Night | Exit | End State | Ticks | Score | Output |
|---|---:|---:|---|---:|---:|---|
| `win_dawn_survived` | `1` | `0` | `won` | `180` | `677` | `win_dawn_survived.jsonl` |
| `phase3_fuel_drain_relight` | `1` | `0` | `playing` | `160` | `85` | `phase3_fuel_drain_relight.jsonl` |
| `pulse_stun` | `1` | `0` | `playing` | `60` | `5` | `pulse_stun.jsonl` |
| `safe_zone` | `1` | `0` | `playing` | `240` | `0` | `safe_zone.jsonl` |
| `loss_flames` | `1` | `0` | `lost` | `15` | `0` | `loss_flames.jsonl` |
| `loss_dawn` | `1` | `0` | `lost` | `120` | `0` | `loss_dawn.jsonl` |
| `night2_drifter_charm` | `2` | `0` | `playing` | `60` | `0` | `night2_drifter_charm.jsonl` |
| `night3_wind_fall` | `3` | `0` | `playing` | `120` | `0` | `night3_wind_fall.jsonl` |

## 4. Determinism, Performance & Negative Contract Check
- Run 1 SHA-256 (`seed=2026, night=3, 600 ticks`): `298c2bccd627e17d3171a078cb35e027fbd320b9fb6cbaae8c30a5fee0940c97`
- Run 2 SHA-256 (`seed=2026, night=3, 600 ticks`): `298c2bccd627e17d3171a078cb35e027fbd320b9fb6cbaae8c30a5fee0940c97`
- Byte-for-byte match: **PASS**
- 21,600-tick performance benchmark (`Night 3`): **`2.886s`** (budget `<= 30.0s`) — **PASS**
- Invalid inputs (`bad_inputs.json`) exit code: **`2`** (stderr: `Format error: frames[1].tick (10) must be strictly greater than previous tick (10)`)
- Total verification elapsed: `9.11s`

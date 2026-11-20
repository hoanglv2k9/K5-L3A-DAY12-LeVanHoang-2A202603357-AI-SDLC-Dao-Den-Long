# Verification Proof — Phase 2 (Test Contract v1.1)
- Timestamp (UTC): `2026-11-20T08:44:37.156612+00:00`
- Python: `3.13.2`

## 1. Contract Check
- `game.contract.json`: **PASS** (`contract_version=1.1`, `team=2A202603357-LeVanHoang`)

## 2. Unit & Integration Tests (`python3 -m unittest discover -s tests -v`)
```text
test_dash_speed_duration_cooldown_and_midair_constant_y (test_engine.TestGameEngineContract.test_dash_speed_duration_cooldown_and_midair_constant_y) ... ok
test_deposit_nearest_lantern_and_win_scoring (test_engine.TestGameEngineContract.test_deposit_nearest_lantern_and_win_scoring) ... ok
test_drifter_steal_and_pulse_drop_night2 (test_engine.TestGameEngineContract.test_drifter_steal_and_pulse_drop_night2) ... ok
test_fall_off_island_loses_all_motes_waits_60_ticks_and_respawns (test_engine.TestGameEngineContract.test_fall_off_island_loses_all_motes_waits_60_ticks_and_respawns) ... ok
test_mote_pickup_capacity_and_deposit_scoring (test_engine.TestGameEngineContract.test_mote_pickup_capacity_and_deposit_scoring) ... ok
test_movement_camera_yaw_and_normalization (test_engine.TestGameEngineContract.test_movement_camera_yaw_and_normalization) ... ok
test_night2_jump_pad_and_night3_tiers_and_strong_wind (test_engine.TestGameEngineContract.test_night2_jump_pad_and_night3_tiers_and_strong_wind) ... ok
test_pause_freezes_sim_tick_and_timers (test_engine.TestGameEngineContract.test_pause_freezes_sim_tick_and_timers) ... ok
test_pulse_stuns_pushes_over_15_ticks_and_enforces_cooldown (test_engine.TestGameEngineContract.test_pulse_stuns_pushes_over_15_ticks_and_enforces_cooldown) ... ok
test_shade_safe_zone_and_recoil_on_hit (test_engine.TestGameEngineContract.test_shade_safe_zone_and_recoil_on_hit) ... ok
test_tick0_snapshot_v11_and_default_lanterns_all_nights (test_engine.TestGameEngineContract.test_tick0_snapshot_v11_and_default_lanterns_all_nights) ... ok
test_wind_charm_speed_zero_dash_cd_and_respawn (test_engine.TestGameEngineContract.test_wind_charm_speed_zero_dash_cd_and_respawn) ... ok
test_determinism_identical_bytes (test_headless_cli.TestHeadlessCLI.test_determinism_identical_bytes) ... ok
test_invalid_inputs_exits_with_code_2 (test_headless_cli.TestHeadlessCLI.test_invalid_inputs_exits_with_code_2) ... ok
test_loss_dawn_scenario (test_headless_cli.TestHeadlessCLI.test_loss_dawn_scenario) ... ok
test_loss_no_flames_scenario (test_headless_cli.TestHeadlessCLI.test_loss_no_flames_scenario) ... ok
test_night2_drifter_charm_and_dash_scenario (test_headless_cli.TestHeadlessCLI.test_night2_drifter_charm_and_dash_scenario) ... ok
test_night3_pause_and_fall_scenario (test_headless_cli.TestHeadlessCLI.test_night3_pause_and_fall_scenario) ... ok
test_pulse_scenario_stuns_shade (test_headless_cli.TestHeadlessCLI.test_pulse_scenario_stuns_shade) ... ok
test_safe_zone_scenario_no_hits (test_headless_cli.TestHeadlessCLI.test_safe_zone_scenario_no_hits) ... ok
test_web_server_serves_game_and_contract_v11 (test_headless_cli.TestHeadlessCLI.test_web_server_serves_game_and_contract_v11) ... ok
test_win_scenario_full_flow (test_headless_cli.TestHeadlessCLI.test_win_scenario_full_flow) ... ok

----------------------------------------------------------------------
Ran 22 tests in 3.045s

OK
```

## 3. Headless Scenarios Proof

| Scenario | Night | Exit | End State | Ticks | Score | Output |
|---|---:|---:|---|---:|---:|---|
| `win` | `1` | `0` | `won` | `116` | `886` | `win.jsonl` |
| `pulse_stun` | `1` | `0` | `playing` | `60` | `5` | `pulse_stun.jsonl` |
| `safe_zone` | `1` | `0` | `playing` | `240` | `0` | `safe_zone.jsonl` |
| `loss_flames` | `1` | `0` | `lost` | `15` | `0` | `loss_flames.jsonl` |
| `loss_dawn` | `1` | `0` | `lost` | `120` | `0` | `loss_dawn.jsonl` |
| `night2_drifter_charm` | `2` | `0` | `playing` | `60` | `0` | `night2_drifter_charm.jsonl` |
| `night3_wind_fall` | `3` | `0` | `playing` | `120` | `0` | `night3_wind_fall.jsonl` |

## 4. Determinism, Performance & Negative Contract Check
- Run 1 SHA-256 (`seed=2026, night=3, 600 ticks`): `561bd895cdcd0ae3d75138e31a69933b30f6f20cbde3ac3641f5d9f8c0cf15c8`
- Run 2 SHA-256 (`seed=2026, night=3, 600 ticks`): `561bd895cdcd0ae3d75138e31a69933b30f6f20cbde3ac3641f5d9f8c0cf15c8`
- Byte-for-byte match: **PASS**
- 21,600-tick performance benchmark (`Night 3, 360s`): **`1.243s`** (budget `<= 30.0s`) — **PASS**
- Invalid inputs (`bad_inputs.json`) exit code: **`2`** (stderr: `Format error: frames[1].tick (10) must be strictly greater than previous tick (10)`)
- Total verification elapsed: `6.48s`

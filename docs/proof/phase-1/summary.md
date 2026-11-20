# Verification Proof — Phase 1
- Timestamp (UTC): `2026-11-20T08:12:14.248989+00:00`
- Python: `3.13.2`

## 1. Contract Check
- `game.contract.json`: **PASS** (`contract_version=1.0`, `team=2A202603357-LeVanHoang`)

## 2. Unit & Integration Tests (`python3 -m unittest discover -s tests -v`)
```text
test_dawn_timeout_loss (test_engine.TestGameEngineContract.test_dawn_timeout_loss) ... ok
test_deposit_rising_edge_and_win_scoring (test_engine.TestGameEngineContract.test_deposit_rising_edge_and_win_scoring) ... ok
test_jump_rises_and_lands (test_engine.TestGameEngineContract.test_jump_rises_and_lands) ... ok
test_mote_pickup_and_carry_capacity (test_engine.TestGameEngineContract.test_mote_pickup_and_carry_capacity) ... ok
test_movement_camera_yaw_and_normalization (test_engine.TestGameEngineContract.test_movement_camera_yaw_and_normalization) ... ok
test_pulse_stuns_pushes_and_enforces_cooldown (test_engine.TestGameEngineContract.test_pulse_stuns_pushes_and_enforces_cooldown) ... ok
test_shade_hit_drops_motes_invuln_and_no_flames_loss (test_engine.TestGameEngineContract.test_shade_hit_drops_motes_invuln_and_no_flames_loss) ... ok
test_shade_respects_lit_lantern_safe_radius (test_engine.TestGameEngineContract.test_shade_respects_lit_lantern_safe_radius) ... ok
test_tick0_snapshot_and_default_lanterns (test_engine.TestGameEngineContract.test_tick0_snapshot_and_default_lanterns) ... ok
test_determinism_identical_bytes (test_headless_cli.TestHeadlessCLI.test_determinism_identical_bytes) ... ok
test_invalid_inputs_exits_with_code_2 (test_headless_cli.TestHeadlessCLI.test_invalid_inputs_exits_with_code_2) ... ok
test_loss_dawn_scenario (test_headless_cli.TestHeadlessCLI.test_loss_dawn_scenario) ... ok
test_loss_no_flames_scenario (test_headless_cli.TestHeadlessCLI.test_loss_no_flames_scenario) ... ok
test_pulse_scenario_stuns_shade (test_headless_cli.TestHeadlessCLI.test_pulse_scenario_stuns_shade) ... ok
test_safe_zone_scenario_no_hits (test_headless_cli.TestHeadlessCLI.test_safe_zone_scenario_no_hits) ... ok
test_web_server_serves_game_and_contract (test_headless_cli.TestHeadlessCLI.test_web_server_serves_game_and_contract) ... ok
test_win_scenario_full_flow (test_headless_cli.TestHeadlessCLI.test_win_scenario_full_flow) ... ok

----------------------------------------------------------------------
Ran 17 tests in 2.831s

OK
```

## 3. Headless Scenarios Proof

| Scenario | Exit | End State | Ticks | Score | Output |
|---|---:|---|---:|---:|---|
| `win` | `0` | `won` | `116` | `886` | `win.jsonl` |
| `pulse_stun` | `0` | `playing` | `60` | `25` | `pulse_stun.jsonl` |
| `safe_zone` | `0` | `playing` | `240` | `0` | `safe_zone.jsonl` |
| `loss_flames` | `0` | `lost` | `18` | `0` | `loss_flames.jsonl` |
| `loss_dawn` | `0` | `lost` | `120` | `0` | `loss_dawn.jsonl` |

## 4. Determinism & Negative Contract Check
- Run 1 SHA-256 (`seed=2026, 600 ticks`): `bfc8cfcaa3a0de9155c9cf2678cfb5111d0b5e06ec40496f12acafc1316a32e1`
- Run 2 SHA-256 (`seed=2026, 600 ticks`): `bfc8cfcaa3a0de9155c9cf2678cfb5111d0b5e06ec40496f12acafc1316a32e1`
- Byte-for-byte match: **PASS**
- Invalid inputs (`bad_inputs.json`) exit code: **`2`** (stderr: `Format error: frames[1].tick (10) must be strictly greater than previous tick (10)`)
- Total verification elapsed: `4.68s`

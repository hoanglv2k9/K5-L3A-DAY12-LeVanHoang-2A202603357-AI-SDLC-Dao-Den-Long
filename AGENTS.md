# AGENTS.md — Đảo Đèn Lồng (AI-SDLC Harness · Contract v1.1)

## Stack & Commands (cross-platform macOS / Linux / Windows)
- Runtime: Python 3.10+ (stdlib only for core & headless) + Three.js WebGL UI (`web/`).
- Check env (`build_cmd`): `python3 -c "import sys; assert sys.version_info >= (3, 10)"`
- Run 3D game (`run_cmd`): `python3 -m src.web_server`
- Run headless (`headless_cmd`): `python3 -m src.headless --seed <int> --night <1|2|3> --ticks <int> --out <file.jsonl>`
- Run full verification gate: `python3 scripts/verify_all.py --phase 2`

## Hard Invariants (Contract v1.1 — NEVER violate)
1. **Single Source of Truth:** `game.contract.json` (`contract_version: "1.1"`) defines all standardized tuning values from Ticket-02.
2. **Mandatory 12-Step Tick Order (60 ticks/s):**
   (1) Read input (`pause` rising-edge first; if paused, `tick` advances but `sim_tick`/timers/spawns freeze and snapshot has `state="paused"`) → (2) Decrement timers/TTL → (3) Move Mây (jump, dash, jump pad, wind) & check fall (`Y < -10`) → (4) Pickup motes (`XZ <= 1.0m, |dy| <= 1.5m`) & charms → (5) Interact lantern (`XZ <= 2.0m`, nearest unlit, tie-break smaller id) → (6) Safe zone (`6.0m`, push shades out in <=30 ticks, no damage inside) → (7) Light Pulse (`cost=3, 3D radius=5.0m` from feet+0.8m, stun 120 ticks, push 4m over 15 ticks, affects Drifters) → (8) Move Shades & Drifters → (9) Collisions: Drifters steal first (`XZ <= 1.2m, min(3, carried)`), then Shades hit (`XZ <= 1.0m, |dy| <= 1.5m`, max 1 flame/tick, shade enters `recoil` 60 ticks / 2m) → (10) Scheduled spawns (interactable from next tick) → (11) Win/Loss (`no_flames` > `all_lit` > `dawn`) → (12) Snapshot.
3. **Shade States:** Must strictly use `spawning`, `wander`, `chase`, `recoil`, `stunned`.
4. **Performance:** 21,600 headless ticks must complete in `<= 30s`.
5. **Git Rule:** Do NOT run `git push` unless explicitly instructed by the user.

# AGENTS.md — Đảo Đèn Lồng (AI-SDLC Harness)

## Stack & Commands (cross-platform macOS / Linux / Windows)
- Runtime: Python 3.10+ (stdlib only for core & headless) + Three.js WebGL UI (`web/`).
- Check env (`build_cmd`): `python3 -c "import sys; assert sys.version_info >= (3, 10)"`
- Run 3D game (`run_cmd`): `python3 -m src.web_server`
- Run headless (`headless_cmd`): `python3 -m src.headless --seed <int> --night 1 --ticks <int> --out <file.jsonl>`
- Run full verification gate: `python3 scripts/verify_all.py`

## Hard Invariants (NEVER violate)
1. **Single Source of Truth:** `game.contract.json` defines all tuning values. Both Python headless (`src/core/engine.py`) and 3D browser (`web/game.js`) must load tuning from `game.contract.json`.
2. **Test Contract v1.0:**
   - Fixed 60 ticks/s (`dt = 1/60`).
   - Snapshot `tick: 0` is emitted AFTER scenario setup and BEFORE step 0.
   - Step `k` (`0..N-1`) reads input for tick `k`, updates to `sim_tick = k + 1`, and emits events with `tick = k + 1`.
   - All distances in `tuning` are XZ-plane horizontal distances (`hypot(dx, dz) <= r`), no character radius added.
   - Scenario setup emits NO events and awards NO score.
   - Invalid `--inputs` / `--scenario` format MUST exit with code `2` and print to `stderr`.
   - Same `--seed` + `--scenario` + `--inputs` MUST produce byte-for-byte identical JSONL.
3. **Creativity isolation:** Any extra visual/audio/creative feature must NEVER alter headless JSONL output.
4. **Honest Evidence Gate:** Never finish a phase while `python3 scripts/verify_all.py` fails. Never hand-edit proof outputs. Never commit `.env` or secrets.
5. **Git discipline:** Small focused commits; never force-push or delete pushed phase tags after deadline.

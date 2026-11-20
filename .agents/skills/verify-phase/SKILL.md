---
name: verify-phase
description: Run full unit tests, headless contract scenarios, determinism checks, and save real verification evidence for a phase before tagging.
---

# Skill: Verify Phase (`Đảo Đèn Lồng`)

Use this skill at the end of every phase (and after any core engine edit) before committing or tagging `phase-N`.

## Steps
1. Run `python3 scripts/verify_all.py --phase <N>` (on Windows: `python scripts/verify_all.py --phase <N>`).
2. Confirm ALL checks pass with exit code `0`:
   - `game.contract.json` schema & required tuning keys
   - Unit tests (`tests/test_engine.py`)
   - Headless CLI integration tests (`tests/test_headless_cli.py`)
   - Double-run determinism check (identical SHA-256 hash)
   - Invalid input/scenario exit code `2` check
3. Inspect the generated proof artifacts in `docs/proof/phase-<N>/` (`summary.txt`, `determinism.txt`, scenario JSONL outputs) to confirm real outputs match every requirement.
4. Update `docs/notes/phase-<N>.md` with actual pass/fail status, AI issues found, and token estimates.
5. Only commit & tag `phase-<N>` after exit code is `0`.

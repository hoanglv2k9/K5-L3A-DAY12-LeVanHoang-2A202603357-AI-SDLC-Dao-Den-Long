"""Contract, inputs, and scenario loading with strict validation (Test Contract v1.0)."""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONTRACT_PATH = REPO_ROOT / "game.contract.json"

REQUIRED_TUNING_KEYS = (
    "player_speed",
    "carry_capacity",
    "lantern_cost",
    "lantern_count_night1",
    "pickup_radius",
    "interact_radius",
    "pulse_cost",
    "pulse_radius",
    "night1_duration_s",
    "flames",
    "invuln_s",
    "hit_drop_ratio",
    "pulse_stun_s",
    "pulse_push_m",
    "pulse_cooldown_s",
    "safe_radius",
    "shade_speed",
    "shade_hit_radius",
    "fall_enabled",
    "score",
)

REQUIRED_SCORE_KEYS = (
    "per_mote",
    "per_lantern",
    "per_stun",
    "per_second_left",
    "per_flame_left",
)


class ContractFormatError(ValueError):
    """Raised when inputs, scenario, or contract files violate Test Contract v1.0."""


def _is_number(val: Any) -> bool:
    return isinstance(val, (int, float)) and not isinstance(val, bool) and math.isfinite(val)


def _validate_vec3(val: Any, label: str) -> list[float]:
    if not isinstance(val, list) or len(val) != 3 or not all(_is_number(x) for x in val):
        raise ContractFormatError(f"{label} must be a 3-number array [x, y, z]")
    return [float(val[0]), float(val[1]), float(val[2])]


def load_contract(path: Path | str | None = None) -> dict[str, Any]:
    contract_path = Path(path) if path else DEFAULT_CONTRACT_PATH
    try:
        data = json.loads(contract_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ContractFormatError(f"Failed to read contract {contract_path}: {exc}") from exc

    if not isinstance(data, dict):
        raise ContractFormatError("game.contract.json root must be an object")
    tuning = data.get("tuning")
    if not isinstance(tuning, dict):
        raise ContractFormatError("game.contract.json missing 'tuning' object")
    for k in REQUIRED_TUNING_KEYS:
        if k not in tuning:
            raise ContractFormatError(f"game.contract.json tuning missing '{k}'")
    score = tuning.get("score")
    if not isinstance(score, dict):
        raise ContractFormatError("game.contract.json tuning.score must be an object")
    for k in REQUIRED_SCORE_KEYS:
        if k not in score:
            raise ContractFormatError(f"game.contract.json tuning.score missing '{k}'")
    return data


def parse_inputs_file(path: Path | str) -> dict[int, dict[str, Any]]:
    """Parse --inputs JSON file into {tick: frame_dict}, enforcing strict contract rules."""
    p = Path(path)
    if not p.is_file():
        raise ContractFormatError(f"Inputs file not found: {p}")
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ContractFormatError(f"Invalid JSON in inputs file {p}: {exc}") from exc

    if not isinstance(raw, dict) or not isinstance(raw.get("frames"), list):
        raise ContractFormatError("Inputs file must be an object containing a 'frames' list")

    frames_by_tick: dict[int, dict[str, Any]] = {}
    prev_tick = -1
    for idx, frame in enumerate(raw["frames"]):
        if not isinstance(frame, dict):
            raise ContractFormatError(f"frames[{idx}] must be an object")
        tick = frame.get("tick")
        if not isinstance(tick, int) or isinstance(tick, bool) or tick < 0:
            raise ContractFormatError(f"frames[{idx}].tick must be a non-negative integer")
        if tick <= prev_tick:
            raise ContractFormatError(
                f"frames[{idx}].tick ({tick}) must be strictly greater than previous tick ({prev_tick})"
            )
        prev_tick = tick

        parsed: dict[str, Any] = {}
        if "move" in frame:
            mv = frame["move"]
            if (
                not isinstance(mv, list)
                or len(mv) != 2
                or not all(_is_number(x) and -1.0 <= float(x) <= 1.0 for x in mv)
            ):
                raise ContractFormatError(
                    f"frames[{idx}].move must be [x, z] with values in [-1, 1]"
                )
            parsed["move"] = [float(mv[0]), float(mv[1])]

        if "cam_yaw_deg" in frame:
            if not _is_number(frame["cam_yaw_deg"]):
                raise ContractFormatError(f"frames[{idx}].cam_yaw_deg must be a number")
            parsed["cam_yaw_deg"] = float(frame["cam_yaw_deg"])

        for btn in ("jump", "interact", "pulse", "dash"):
            if btn in frame:
                if not isinstance(frame[btn], bool):
                    raise ContractFormatError(f"frames[{idx}].{btn} must be a boolean")
                parsed[btn] = frame[btn]

        frames_by_tick[tick] = parsed

    return frames_by_tick


def parse_scenario_file(path: Path | str) -> dict[str, Any]:
    """Parse and validate --scenario JSON file."""
    p = Path(path)
    if not p.is_file():
        raise ContractFormatError(f"Scenario file not found: {p}")
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ContractFormatError(f"Invalid JSON in scenario file {p}: {exc}") from exc

    if not isinstance(raw, dict):
        raise ContractFormatError("Scenario root must be an object")

    out: dict[str, Any] = {}

    if "player" in raw:
        pl = raw["player"]
        if not isinstance(pl, dict):
            raise ContractFormatError("scenario.player must be an object")
        p_out: dict[str, Any] = {}
        if "pos" in pl:
            p_out["pos"] = _validate_vec3(pl["pos"], "scenario.player.pos")
        if "carried" in pl:
            if not isinstance(pl["carried"], int) or isinstance(pl["carried"], bool) or pl["carried"] < 0:
                raise ContractFormatError("scenario.player.carried must be an integer >= 0")
            p_out["carried"] = pl["carried"]
        if "flames" in pl:
            if not isinstance(pl["flames"], int) or isinstance(pl["flames"], bool) or pl["flames"] < 0:
                raise ContractFormatError("scenario.player.flames must be an integer >= 0")
            p_out["flames"] = pl["flames"]
        out["player"] = p_out

    for flag in ("random_motes", "random_shades"):
        if flag in raw:
            if not isinstance(raw[flag], bool):
                raise ContractFormatError(f"scenario.{flag} must be a boolean")
            out[flag] = raw[flag]

    if "motes" in raw:
        if not isinstance(raw["motes"], list):
            raise ContractFormatError("scenario.motes must be a list")
        motes: list[list[float]] = []
        for idx, m in enumerate(raw["motes"]):
            if isinstance(m, dict) and "pos" in m:
                motes.append(_validate_vec3(m["pos"], f"scenario.motes[{idx}].pos"))
            else:
                motes.append(_validate_vec3(m, f"scenario.motes[{idx}]"))
        out["motes"] = motes

    if "shades" in raw:
        if not isinstance(raw["shades"], list):
            raise ContractFormatError("scenario.shades must be a list")
        shades: list[dict[str, Any]] = []
        for idx, s in enumerate(raw["shades"]):
            if not isinstance(s, dict) or "pos" not in s:
                raise ContractFormatError(f"scenario.shades[{idx}] must be an object with 'pos'")
            entry: dict[str, Any] = {
                "pos": _validate_vec3(s["pos"], f"scenario.shades[{idx}].pos"),
            }
            if "id" in s:
                if not isinstance(s["id"], str) or not s["id"].strip():
                    raise ContractFormatError(f"scenario.shades[{idx}].id must be a non-empty string")
                entry["id"] = s["id"]
            if "state" in s:
                if not isinstance(s["state"], str) or not s["state"].strip():
                    raise ContractFormatError(f"scenario.shades[{idx}].state must be a string")
                entry["state"] = s["state"]
            shades.append(entry)
        out["shades"] = shades

    if "lanterns" in raw:
        if not isinstance(raw["lanterns"], list):
            raise ContractFormatError("scenario.lanterns must be a list")
        lanterns: list[dict[str, Any]] = []
        for idx, lan in enumerate(raw["lanterns"]):
            if not isinstance(lan, dict) or not isinstance(lan.get("id"), str):
                raise ContractFormatError(f"scenario.lanterns[{idx}] must be an object with string 'id'")
            entry = {"id": lan["id"]}
            if "pos" in lan:
                entry["pos"] = _validate_vec3(lan["pos"], f"scenario.lanterns[{idx}].pos")
            if "deposited" in lan:
                if not isinstance(lan["deposited"], int) or isinstance(lan["deposited"], bool) or lan["deposited"] < 0:
                    raise ContractFormatError(f"scenario.lanterns[{idx}].deposited must be an integer >= 0")
                entry["deposited"] = lan["deposited"]
            if "lit" in lan:
                if not isinstance(lan["lit"], bool):
                    raise ContractFormatError(f"scenario.lanterns[{idx}].lit must be a boolean")
                entry["lit"] = lan["lit"]
            lanterns.append(entry)
        out["lanterns"] = lanterns

    if "time_left_s" in raw:
        if not _is_number(raw["time_left_s"]) or float(raw["time_left_s"]) < 0:
            raise ContractFormatError("scenario.time_left_s must be a number >= 0")
        out["time_left_s"] = float(raw["time_left_s"])

    return out

"""Persistent local leaderboard manager for Đảo Đèn Lồng (Test Contract v1.3).

Rules (Ticket-04 Section 3):
- Name: 3-12 characters ([A-Za-z0-9_] plus optional Vietnamese letters).
- Entry fields: name, score (total score of won nights), nights_won (0-3),
  achieved_at (ISO 8601 with timezone), seed (int).
- Keep top 10 sorted by score descending; ties broken by who achieved it first.
- Stored on local disk (data/leaderboard.json) and survives restarts.
- Export command: <run_cmd> --export-leaderboard out.json -> {"entries": [...]}
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LEADERBOARD_PATH = REPO_ROOT / "data" / "leaderboard.json"

# Supports standard [A-Za-z0-9_] and Vietnamese accented letters (3 to 12 characters)
NAME_PATTERN = re.compile(r"^[\wÀ-ỹ]{3,12}$", re.UNICODE)


def validate_player_name(name: Any) -> str:
    if not isinstance(name, str):
        raise ValueError("Tên người chơi phải là chuỗi ký tự")
    cleaned = name.strip()
    if not (3 <= len(cleaned) <= 12) or not NAME_PATTERN.match(cleaned):
        raise ValueError("Tên phải từ 3–12 ký tự (chữ cái, chữ số, dấu gạch dưới '_' hoặc tiếng Việt)")
    return cleaned


def _now_iso_with_tz() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def sort_and_trim_entries(entries: list[dict[str, Any]], max_entries: int = 10) -> list[dict[str, Any]]:
    """Sort by score descending; equal scores keep original arrival order (earlier first)."""
    indexed = list(enumerate(entries))
    indexed.sort(key=lambda pair: (-int(pair[1].get("score", 0)), pair[0]))
    result: list[dict[str, Any]] = []
    for _, item in indexed[:max_entries]:
        result.append(
            {
                "name": str(item["name"]),
                "score": int(item["score"]),
                "nights_won": max(0, min(3, int(item.get("nights_won", 0)))),
                "achieved_at": str(item.get("achieved_at") or _now_iso_with_tz()),
                "seed": int(item.get("seed", 42)),
            }
        )
    return result


def load_leaderboard(path: Path | str | None = None) -> dict[str, list[dict[str, Any]]]:
    lb_path = Path(path) if path else DEFAULT_LEADERBOARD_PATH
    if not lb_path.is_file():
        return {"entries": []}
    try:
        raw = json.loads(lb_path.read_text(encoding="utf-8"))
        entries = raw.get("entries", []) if isinstance(raw, dict) else []
        if not isinstance(entries, list):
            return {"entries": []}
        return {"entries": sort_and_trim_entries(entries)}
    except Exception:
        return {"entries": []}


def save_leaderboard(entries: list[dict[str, Any]], path: Path | str | None = None) -> dict[str, list[dict[str, Any]]]:
    lb_path = Path(path) if path else DEFAULT_LEADERBOARD_PATH
    lb_path.parent.mkdir(parents=True, exist_ok=True)
    trimmed = sort_and_trim_entries(entries)
    payload = {"entries": trimmed}
    lb_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


def add_leaderboard_entry(
    *,
    name: str,
    score: int,
    nights_won: int,
    seed: int = 42,
    achieved_at: str | None = None,
    path: Path | str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    valid_name = validate_player_name(name)
    current = load_leaderboard(path)["entries"]
    current.append(
        {
            "name": valid_name,
            "score": int(score),
            "nights_won": max(0, min(3, int(nights_won))),
            "achieved_at": achieved_at or _now_iso_with_tz(),
            "seed": int(seed),
        }
    )
    return save_leaderboard(current, path)


def export_leaderboard(out_path: Path | str, source_path: Path | str | None = None) -> Path:
    data = load_leaderboard(source_path)
    target = Path(out_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return target

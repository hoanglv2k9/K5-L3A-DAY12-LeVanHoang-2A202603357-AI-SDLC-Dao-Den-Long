"""Cross-platform local HTTP server for the 3D WebGL Đảo Đèn Lồng game (Contract v1.3).

Usage:
    python3 -m src.web_server [--port 8080] [--no-open]
    python3 -m src.web_server --export-leaderboard out.json
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import sys
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from src.leaderboard import add_leaderboard_entry, export_leaderboard, load_leaderboard

REPO_ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = REPO_ROOT / "web"
CONTRACT_PATH = REPO_ROOT / "game.contract.json"


class GameHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:
        return

    def _send_json(self, status: int, data: dict) -> None:
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def _serve_file(self, path: Path) -> None:
        if not path.is_file():
            self.send_error(404, "Not found")
            return
        mime, _ = mimetypes.guess_type(str(path))
        if path.suffix == ".js":
            mime = "application/javascript; charset=utf-8"
        elif path.suffix == ".css":
            mime = "text/css; charset=utf-8"
        elif path.suffix == ".json":
            mime = "application/json; charset=utf-8"
        elif path.suffix == ".html":
            mime = "text/html; charset=utf-8"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        clean_path = self.path.split("?", 1)[0]
        if clean_path in ("/", "/index.html"):
            self._serve_file(WEB_DIR / "index.html")
            return
        if clean_path == "/game.contract.json":
            self._serve_file(CONTRACT_PATH)
            return
        if clean_path == "/api/leaderboard":
            self._send_json(200, load_leaderboard())
            return
        if clean_path == "/health":
            self._send_json(200, {"ok": True})
            return

        rel = clean_path.lstrip("/")
        candidate = (WEB_DIR / rel).resolve()
        if WEB_DIR.resolve() not in candidate.parents and candidate != WEB_DIR.resolve():
            self.send_error(403, "Forbidden")
            return
        self._serve_file(candidate)

    def do_POST(self) -> None:
        clean_path = self.path.split("?", 1)[0]
        if clean_path == "/api/leaderboard":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
                body = json.loads(raw)
                updated = add_leaderboard_entry(
                    name=str(body.get("name", "")),
                    score=int(body.get("score", 0)),
                    nights_won=int(body.get("nights_won", 0)),
                    seed=int(body.get("seed", 42)),
                    achieved_at=body.get("achieved_at"),
                )
                self._send_json(200, updated)
            except ValueError as exc:
                self._send_json(400, {"error": str(exc)})
            except Exception as exc:
                self._send_json(500, {"error": str(exc)})
            return
        self.send_error(404, "Not found")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run Đảo Đèn Lồng 3D Web Server or Export Leaderboard")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8080, help="Bind port (default: 8080)")
    parser.add_argument("--no-open", action="store_true", help="Do not auto-open browser")
    parser.add_argument(
        "--export-leaderboard",
        type=str,
        default=None,
        help="Export top-10 local leaderboard to JSON file and exit",
    )
    args = parser.parse_args(argv)

    if args.export_leaderboard:
        export_leaderboard(args.export_leaderboard)
        return 0

    server = ThreadingHTTPServer((args.host, args.port), GameHandler)
    url = f"http://{args.host}:{args.port}"
    print(f"Đảo Đèn Lồng 3D đang chạy tại: {url}", flush=True)
    print("Nhấn Ctrl+C để dừng server.", flush=True)
    if not args.no_open:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nĐã dừng server.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Cross-platform local HTTP server for the 3D WebGL Đảo Đèn Lồng game.

Usage:
    python3 -m src.web_server [--port 8080] [--no-open]
"""
from __future__ import annotations

import argparse
import mimetypes
import sys
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = REPO_ROOT / "web"
CONTRACT_PATH = REPO_ROOT / "game.contract.json"


class GameHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:
        return

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
        if clean_path == "/health":
            payload = b'{"ok":true}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        rel = clean_path.lstrip("/")
        candidate = (WEB_DIR / rel).resolve()
        if WEB_DIR.resolve() not in candidate.parents and candidate != WEB_DIR.resolve():
            self.send_error(403, "Forbidden")
            return
        self._serve_file(candidate)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run Đảo Đèn Lồng 3D Web Server")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8080, help="Bind port (default: 8080)")
    parser.add_argument("--no-open", action="store_true", help="Do not auto-open browser")
    args = parser.parse_args(argv)

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

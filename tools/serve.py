"""Локальный сервер для сайта: как python -m http.server, но запрещает кэш,
чтобы после правок браузер сразу брал новые файлы.

Запуск: python tools/serve.py [порт]
"""
import functools
import http.server
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


handler = functools.partial(NoCache, directory=str(ROOT))
with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as srv:
    print(f"Разминка: http://localhost:{PORT}/  (Ctrl+C — остановить)")
    srv.serve_forever()

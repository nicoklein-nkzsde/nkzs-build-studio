# Startet das Build Studio lokal ohne Browser-Cache: python3 tools/serve.py [port]
import http.server, functools, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a): pass
port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT', 8923))
print(f'NKZS Build Studio läuft auf http://localhost:{port}')
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=root)).serve_forever()

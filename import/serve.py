#!/usr/bin/env python3
"""Reads the bookmarks from Chrome and outputs them as JSON — nothing else.

    ./serve.py            # at most 8124 on 127.0.0.1
    ./serve.py --test     # read once without network, output to stdout

What this is for: the tile wall is a static page and cannot read Chrome. The
page therefore asks this helper, which runs on the same machine where Chrome's
profile lies. The button and the answer are the same act, so for the user
nothing happens in the background that he had not triggered.

Four deliberate limits:

* Read only. The file on the server is written by chrome.py, not by this
  helper.
* Only on 127.0.0.1. From outside the machine is not reachable; whoever comes
  from another machine gets nothing.
* Only letters and numbers in the answer, plus the list. No paths, no window
  titles, no identifiers.
* Only from an allowed origin. The bookmarks are personal: a page from
  anywhere else must not be able to read them. See allowed_origin().

The last one matters because the answer is reachable from every website the
user visits: without the check, any of them could ask 127.0.0.1:8124 and read
the whole bookmark bar. The default therefore refuses everything but loopback
origins, and further origins are opened explicitly with DIE_WAND_ORIGIN.
"""

import argparse
import json
import os
import socket
import socketserver
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import chrome  # noqa: E402  (sits in the same folder)

PORT = 8124
LISTEN_FD = 3          # this is how systemd hands it over
READ_ONLY = True

LOOPBACK = ('http://127.0.0.1', 'http://localhost',
            'https://127.0.0.1', 'https://localhost')


def extra_origins():
    """Origins added on top of the loopback ones, from DIE_WAND_ORIGIN."""
    raw = os.getenv('DIE_WAND_ORIGIN', '')
    return {o.strip().rstrip('/') for o in raw.split(',') if o.strip()}


def allowed_origin(origin):
    """Whether a page from this origin may read the answer.

    An empty origin means no browser is asking — curl, or a same-origin page.
    Such a request gets the answer without any CORS header, which is what keeps
    `curl http://127.0.0.1:8124/tiles.json` working.

    A browser from a loopback origin is allowed by default: the documented
    local setup runs the page on one port and the helper on another, which is
    cross-origin by port alone. Everything else has to be listed in
    DIE_WAND_ORIGIN.
    """
    if not origin:
        return ''
    origin = origin.rstrip('/')
    known = extra_origins()
    if origin in known or origin in LOOPBACK:
        return origin
    for base in LOOPBACK:
        if origin.startswith(f'{base}:'):
            return origin
    return ''


def bookmarks_now():
    """The list as chrome.py builds it — without writing anything.

    chrome.py is reloaded before every question. The service keeps running
    after it has answered, and would otherwise keep old code in memory: after a
    change to the icon assignment it kept serving 31 tiles without a single
    icon, while the file on the server had the same ones with images. That was
    not visible and cost half a day — hence the reload.
    """
    import importlib
    importlib.reload(chrome)

    profile, source_file = chrome.find_profile()
    if profile is None:
        raise RuntimeError('no bookmark file from Chrome found')
    tiles = chrome.to_tiles(chrome.read_bookmark_bar(profile, source_file))
    chrome.add_icons(tiles, chrome.copy_icon_db(profile))
    return {
        'version': 1,
        'updated': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'tiles': tiles,
    }


class Response(BaseHTTPRequestHandler):
    # Only sent when the answer actually goes to a browser.
    def cors_headers(self):
        origin = allowed_origin(self.headers.get('Origin'))
        if not origin:
            return {}
        return {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            # Needed because the wall is https and this helper is http: without
            # it the browser treats the request as a private one and asks first.
            'Access-Control-Allow-Private-Network': 'true',
            'Vary': 'Origin',
        }

    def do_GET(self):  # noqa: N802 (name dictated by http.server)
        origin = allowed_origin(self.headers.get('Origin'))
        if self.path.split('?')[0] == '/tiles.json':
            if not origin and self.headers.get('Origin'):
                # A browser from an origin that is not allowed gets nothing —
                # not even the status it could read from.
                self.respond(403, json.dumps({'error': 'origin not allowed'}),
                             cors=False)
                return
            try:
                data = bookmarks_now()
            except Exception as error:  # noqa: BLE001  (the browser should read it)
                self.respond(500, json.dumps({'error': str(error)}))
                return
            self.respond(200, json.dumps(data, ensure_ascii=False))
            return
        self.respond(200, 'DIE WAND: /tiles.json serves the bookmarks from Chrome.\n')

    def do_OPTIONS(self):  # noqa: N802
        origin = allowed_origin(self.headers.get('Origin'))
        if not origin:
            self.respond(403, json.dumps({'error': 'origin not allowed'}),
                         cors=False)
            return
        self.respond(204, '')

    def respond(self, code, text, cors=True):
        data = text.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        if cors:
            for name, value in self.cors_headers().items():
                self.send_header(name, value)
        self.end_headers()
        if code != 204:
            self.wfile.write(data)

    def log_message(self, *args):
        """Nothing in the log when there is nothing to log."""


def socket_from_systemd():
    """The socket systemd handed over as the third descriptor, or None.

    CPython cannot do this on its own: socketserver in 3.12 knows no socket
    activation, an attribute `systemd_socket_activation` is ignored. What then
    happens is silent and nasty — the own socket stays unbound, the request
    lies in systemd's queue and the browser waits. So the descriptor is taken
    over by hand here.

    systemd sets LISTEN_PID to the id of the started process; if it does not
    match, the helper runs without activation and binds itself.
    """
    if os.environ.get('LISTEN_PID') != str(os.getpid()):
        return None
    if int(os.environ.get('LISTEN_FDS', '0')) < 1:
        return None
    inherited = socket.fromfd(LISTEN_FD, socket.AF_INET, socket.SOCK_STREAM)
    os.close(LISTEN_FD)   # fromfd made a copy
    return inherited


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, address, handler):
        # bind_and_activate=False: the socket comes from below in a moment,
        # otherwise TCPServer makes its own and we bind twice.
        super().__init__(address, handler, bind_and_activate=False)
        self.socket.close()
        inherited = socket_from_systemd()
        if inherited is not None:
            self.socket = inherited
            self.server_address = inherited.getsockname()
        else:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.bind(address)
            self.server_address = self.socket.getsockname()
        self.server_activate()

    def handle_error(self, request, client_address):
        """A browser that hung up is not an error of the helper."""
        print(f'Request from {client_address} incomplete', file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--test', action='store_true',
                    help='read without network and print the result')
    ap.add_argument('--port', type=int, default=PORT)
    ap.add_argument('--seconds', type=int, default=120,
                    help='how long the helper lives after the last request')
    args = ap.parse_args()

    if args.test:
        data = bookmarks_now()
        top = data['tiles']
        total = mod_count(top)
        with_icon = sum(1 for t in top if 'icon' in t)
        print(f"{len(top)} top-level tiles, {total} in total, "
              f"{with_icon} with icon at the top level")
        return 0

    try:
        server = Server(('127.0.0.1', args.port), Response)
    except OSError as error:
        print(f'Port {args.port} cannot be bound: {error}', file=sys.stderr)
        return 1
    server.timeout = args.seconds
    try:
        source = ('activated by socket' if os.environ.get('LISTEN_PID') == str(os.getpid())
                  else 'started by hand')
        extra = ', '.join(sorted(extra_origins())) or 'none beyond loopback'
        print(f'DIE WAND listens on {server.server_address[0]}:{server.server_address[1]} '
              f'({source}, read only, end after {args.seconds}s without a request)')
        print(f'allowed origins beyond loopback: {extra}')
        server.serve_forever()
    finally:
        server.server_close()
    return 0


def mod_count(tiles):
    """Count every tile, folders included — same rule as chrome.py."""
    return sum(1 if t.get('url') else 1 + mod_count(t.get('children', []))
               for t in tiles)


if __name__ == '__main__':
    raise SystemExit(main())
#!/usr/bin/env python3
"""Checks the helper that reads Chrome — without Chrome and without network.

The tile wall cannot read Chrome; it asks this helper. The contract is short:
GET /tiles.json delivers a JSON list with tiles, and the answer is allowed to
leave the machine only to an allowed origin — the page comes from the server and
is itself https, while the helper is http on the loopback. Both are
re-checked here, with an invented bookmark source instead of Chrome.
"""

import importlib.util
import json
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path


def load():
    path = Path(__file__).with_name('serve.py')
    spec = importlib.util.spec_from_file_location('serve', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestHelper(unittest.TestCase):
    def setUp(self):
        self.serve = load()
        # No Chrome needed: the source is replaced.
        self.serve.bookmarks_now = lambda: {
            'version': 1,
            'updated': '2026-10-17T10:00:00+00:00',
            'tiles': [{'title': 'GNOME', 'url': 'https://gnome.org/'}],
        }
        self.server = self.serve.Server(('127.0.0.1', 0), self.serve.Response)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def get(self, path, origin=None, method='GET'):
        # urllib raises on error responses; here I want to see the code,
        # especially the 403 and the 500 that come without an allowed origin or
        # without Chrome.
        request = urllib.request.Request(
            f'http://127.0.0.1:{self.port}{path}', method=method)
        if origin:
            request.add_header('Origin', origin)
        try:
            with urllib.request.urlopen(request, timeout=5) as a:
                return a.status, dict(a.headers), a.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()

    def test_serves_the_list(self):
        status, _, data = self.get('/tiles.json')
        self.assertEqual(status, 200)
        self.assertEqual(len(json.loads(data)['tiles']), 1)

    def test_allows_a_loopback_origin(self):
        # The documented local setup runs the page on one port and the helper
        # on another, which is cross-origin by port alone.
        _, header, _ = self.get('/tiles.json', origin='http://127.0.0.1:8099')
        self.assertEqual(header.get('Access-Control-Allow-Origin'),
                         'http://127.0.0.1:8099')

    def test_allows_the_private_request(self):
        _, header, _ = self.get('/tiles.json', origin='http://127.0.0.1:8099')
        self.assertEqual(header.get('Access-Control-Allow-Private-Network'), 'true')

    def test_a_foreign_origin_gets_nothing(self):
        # This is the whole point: a page from anywhere else must not be able
        # to read the bookmark bar out of 127.0.0.1.
        status, header, _ = self.get('/tiles.json', origin='https://evil.example')
        self.assertEqual(status, 403)
        self.assertNotIn('Access-Control-Allow-Origin', header)

    def test_a_foreign_origin_fails_the_preflight(self):
        status, header, _ = self.get('/tiles.json', origin='https://evil.example',
                                     method='OPTIONS')
        self.assertEqual(status, 403)
        self.assertNotIn('Access-Control-Allow-Origin', header)

    def test_an_allowed_loopback_origin_passes_the_preflight(self):
        status, header, _ = self.get('/tiles.json', origin='http://localhost:8099',
                                     method='OPTIONS')
        self.assertEqual(status, 204)
        self.assertEqual(header.get('Access-Control-Allow-Origin'),
                         'http://localhost:8099')

    def test_no_origin_still_works_for_the_command_line(self):
        # curl and the like ask without an Origin; they must keep working, and
        # get no CORS header.
        _, header, _ = self.get('/tiles.json')
        self.assertNotIn('Access-Control-Allow-Origin', header)

    def test_not_cached(self):
        _, header, _ = self.get('/tiles.json')
        self.assertEqual(header.get('Cache-Control'), 'no-store')

    def test_answers_on_other_paths(self):
        status, _, text = self.get('/')
        self.assertEqual(status, 200)
        self.assertIn('tiles.json', text.decode())

    def test_without_chrome_there_is_an_error_instead_of_empty(self):
        # The page must be able to tell apart: "no Chrome" is something
        # different from "Chrome has nothing" — an empty list would be a silent
        # success and would empty the wall without anyone noticing.
        def broken():
            raise RuntimeError('no Chrome account signed in (AccountBookmarks missing)')
        self.serve.bookmarks_now = broken
        status, _, data = self.get('/tiles.json')
        self.assertEqual(status, 500)
        self.assertIn('AccountBookmarks', data.decode())

    def test_an_extra_origin_can_be_allowed(self):
        # The wall on the server is not on loopback, so its origin has to be
        # opened explicitly. That is what DIE_WAND_ORIGIN is for.
        import os
        os.environ['DIE_WAND_ORIGIN'] = 'https://wall.example:8443'
        try:
            _, header, _ = self.get('/tiles.json', origin='https://wall.example:8443')
            self.assertEqual(header.get('Access-Control-Allow-Origin'),
                             'https://wall.example:8443')
            status, _, _ = self.get('/tiles.json', origin='https://evil.example')
            self.assertEqual(status, 403)
        finally:
            del os.environ['DIE_WAND_ORIGIN']

    def test_socket_comes_from_the_environment(self):
        # Without LISTEN_PID there is no inherited socket, and precisely then
        # the helper binds itself — that is the path without systemd.
        import os
        self.assertIsNone(self.serve.socket_from_systemd())
        os.environ['LISTEN_FDS'] = '1'
        os.environ['LISTEN_PID'] = '999999'   # foreign id
        self.assertIsNone(self.serve.socket_from_systemd())


class TestIdleStops(unittest.TestCase):
    """The helper must end on its own when the page stops asking.

    This is the whole point of the socket: nothing runs in the background, and
    what ran is gone again. It was broken once because `server.timeout` looks
    like it does that — socketserver.serve_forever documents that it *ignores*
    it. The helper ran for hours with `--seconds 120` and nobody noticed,
    because nothing on the wall looked wrong.
    """

    def setUp(self):
        self.serve = load()
        self.serve.bookmarks_now = lambda: {'version': 1, 'updated': 'x', 'tiles': []}

    def test_it_stops_after_the_stated_number_of_seconds(self):
        import threading
        server = self.serve.Server(('127.0.0.1', 0), self.serve.Response)
        self.addCleanup(server.server_close)
        serving = threading.Thread(target=server.serve_forever, daemon=True)
        serving.start()
        self.addCleanup(server.shutdown)

        watcher = threading.Thread(target=server.stop_when_idle, args=(1,),
                                   daemon=True)
        watcher.start()
        watcher.join(timeout=10)

        self.assertFalse(watcher.is_alive(),
                         'the helper is still running after the idle time')
        # serve_forever returned, which is what lets the process exit.
        serving.join(timeout=10)
        self.assertFalse(serving.is_alive())

    def test_a_request_postpones_the_end(self):
        import threading
        import time
        server = self.serve.Server(('127.0.0.1', 0), self.serve.Response)
        self.addCleanup(server.server_close)
        serving = threading.Thread(target=server.serve_forever, daemon=True)
        serving.start()
        self.addCleanup(server.shutdown)

        watcher = threading.Thread(target=server.stop_when_idle, args=(2,),
                                   daemon=True)
        watcher.start()

        # Three asks over two seconds; the helper must outlive all of them.
        for _ in range(3):
            time.sleep(1.0)
            with urllib.request.urlopen(
                    f'http://127.0.0.1:{server.server_address[1]}/tiles.json',
                    timeout=5) as a:
                a.read()
        self.assertTrue(watcher.is_alive(),
                        'the helper stopped although it was being asked')

        # And once the questions stop, it goes away.
        watcher.join(timeout=10)
        self.assertFalse(watcher.is_alive())


if __name__ == '__main__':
    unittest.main(verbosity=2)
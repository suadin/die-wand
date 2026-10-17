#!/usr/bin/env python3
"""Writes the bookmark bar from Chrome as tiles.json to a server.

    chrome.py [--dry-run]

Chrome does not keep the bookmarks of a signed-in account in a file named
"Bookmarks", but in "AccountBookmarks". That is the file one has to read — it
is plain JSON. Without a signed-in account it does not exist, then the file is
called "Bookmarks" and the script does not abort: that is the normal path.

Next to the bookmarks come the icons from Chrome's own database "Favicons".
That is no luxury: most sites do not put their mark under /favicon.ico but name
it in the HTML — at Microsoft, ING, YouTube and others it sits on a CDN. Chrome
knows the real address, the wall would have had to guess it.

Titles and addresses are never written to the console, only the count.
"""

import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

# Where Chrome keeps its profile. The default is the usual Linux path; a
# Flatpak Chrome lives under ~/.var/app/com.google.Chrome/ instead. Point
# DIE_WAND_CHROME at your profile to override.
PROFILE = Path(os.getenv('DIE_WAND_CHROME')
               or '~/.config/google-chrome').expanduser()
LOCAL_TARGET = Path(os.getenv('DIE_WAND_FILE')
                    or '~/die-wand-tiles.json').expanduser()
# Where the file should land on the server. Without it the script only runs
# locally: the repository knows nothing about whom it belongs to.
NAS_TARGET = Path(os.getenv('DIE_WAND_NAS', '/volume1/docker/die-wand/site/tiles.json'))


# The two files in which Chrome can keep the bookmarks. Both have the same
# structure; all that matters is which one exists in the profile.
FILES = ('AccountBookmarks', 'Bookmarks')


def find_profile():
    """The folder holding the bookmarks — and which file it is.

    With a signed-in Google account everything is in AccountBookmarks. Without
    an account Chrome creates a file named Bookmarks, and that one is not
    broken: it is the normal path. Someone who only bookmarks locally used to
    get "no Chrome account signed in" here, even though the window was full.
    """
    for profile in sorted(PROFILE.glob('*')):
        for name in FILES:
            if (profile / name).exists():
                return profile, name
    return None, None


def read_bookmark_bar(profile, name='AccountBookmarks'):
    with (profile / name).open(encoding='utf-8') as f:
        data = json.load(f)
    bar = data.get('roots', {}).get('bookmark_bar', {})
    return bar.get('children', [])


# Optional list from "this is what it is called in Chrome" to "this is what it
# should be called on the wall". File import/renames.json, one entry per line
# in the format old name:new name. It does not belong in the repository: it is
# a personal quirk, not a property of the tool.
RENAMES = Path(__file__).with_name('renames.json')


def renames(file=None):
    """The local renaming table, or empty when there is none."""
    try:
        return json.loads((file or RENAMES).read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return {}


def readable_title(title, url, replacements=None):
    """Chrome names links from the address bar exactly like their address. On
    the wall the name of the machine should stand, not
    "http://nas:9999/desktop?os=ugospro#/login/account".
    """
    title = (title or '').strip()
    if title and title != url:
        if replacements is None:
            replacements = renames()
        return replacements.get(title, title)
    return url.split('://', 1)[-1].split('/', 1)[0]


def to_tiles(children):
    """Chrome's entries become tiles; folders become groups."""
    tiles = []
    for entry in children:
        if entry.get('type') == 'url':
            url = (entry.get('url') or '').strip()
            if url.startswith(('http://', 'https://')):
                tiles.append({
                    'title': readable_title(entry.get('name'), url), 'url': url})
        elif entry.get('type') == 'folder':
            content = to_tiles(entry.get('children', []))
            if content:
                tiles.append({'title': entry.get('name') or 'Untitled',
                              'children': content})
    return tiles


def copy_icon_db(profile, attempts=3):
    """A readable copy of the icon database, otherwise None.

    Chrome keeps the file locked as long as it runs. Copying is deliberately
    the right thing here: the copy cannot write back, and the number of rows is
    small.

    It still has to be copied more than once: if Chrome writes while the copy
    is made, the copy is incomplete and the icons of the most recently visited
    sites are missing. That was measured once — 23 of 31 instead of 31 — and
    the cause was not the code but the timing. So the copy is checked and
    repeated when damaged.
    """
    source = profile / 'Favicons'
    if not source.exists():
        return None
    target = Path(tempfile.mkdtemp(prefix='chrome-favicons-')) / 'Favicons'

    for attempt in range(attempts):
        shutil.copy2(source, target)
        try:
            connection = sqlite3.connect(target)
            try:
                state = connection.execute('PRAGMA quick_check').fetchone()[0]
            finally:
                connection.close()
        except sqlite3.Error:
            state = 'not a database'
        if state == 'ok':
            return target
        print(f'Copy of the icon database unusable ({state}), '
              f'attempt {attempt + 1} of {attempts}', file=sys.stderr)
        time.sleep(0.4)
    return None


def unwrap(value):
    """Chrome stores some entries as a string with quotation marks.

    From the database comes "('data:image/png;base64,…',)" instead of the
    address. What stands between the first and the last quotation mark is the
    value that was looked for.
    """
    value = (value or '').strip()
    if value.startswith(('http://', 'https://', 'data:image/', '/')):
        return value
    match = re.search(r"""['"]((?:https?://|data:image/|/)[^'"]*)['"]""", value)
    return match.group(1) if match else None


# How large an embedded icon may become. The page accepts up to 60000
# characters; beyond that it would only be a large file.
MAX_EMBED = 45000


def bitmap_for_url(file, url):
    """The image itself as an embedded address, or None.

    Chrome keeps the icons not as files but in the column ``image_data`` of its
    database. We pull the image out and embed it instead of noting the address.
    That removes three disturbances at once, none of which it causes, all of
    which it merely makes visible:

    * The wall runs over https, but the icons of the LAN services run over
      http — the browser blocks that as mixed content and shows the letter.
    * Some CDNs do not let a request without an origin through, others are
      slow.
    * Some addresses are dead (404, 410). The image is still there.

    The price: the file grows by about 40 kB. That is nothing on a local
    machine, and in exchange not a single request is made anymore.
    """
    try:
        connection = sqlite3.connect(f'file:{file}?mode=ro', uri=True)
        try:
            row = connection.execute(
                'SELECT b.image_data FROM icon_mapping m'
                ' JOIN favicon_bitmaps b ON b.icon_id = m.icon_id'
                ' WHERE m.page_url = ?'
                ' ORDER BY m.id DESC, length(b.image_data) DESC LIMIT 1',
                (url,)).fetchone()
        finally:
            connection.close()
    except sqlite3.Error:
        return None
    if not row or not row[0]:
        return None
    image = bytes(row[0])
    if not image.startswith(b'\x89PNG') or len(image) > MAX_EMBED:
        # Embed only PNG: with another format the browser would have to guess,
        # and a guessed type shows a broken image.
        return None
    return 'data:image/png;base64,' + base64.b64encode(image).decode('ascii')


def icon_for_url(file, url):
    """The icon address Chrome stored for this site, or None."""
    try:
        connection = sqlite3.connect(f'file:{file}?mode=ro', uri=True)
        try:
            row = connection.execute(
                'SELECT f.url FROM icon_mapping m JOIN favicons f ON f.id = m.icon_id'
                ' WHERE m.page_url = ? ORDER BY m.id DESC LIMIT 1', (url,)).fetchone()
        finally:
            connection.close()
    except sqlite3.Error:
        return None
    return unwrap(row[0]) if row else None


def add_icons(tiles, file, known=None):
    """Every tile gets the icon Chrome knows.

    `known` are the icons from the last run, by address. Chrome occasionally
    clears old icon bitmaps itself; after that exactly the tile one has not
    visited for months is missing. Such icons are kept instead of lost — they
    lie in the file as an address and continue to be loaded as long as the page
    serves them.
    """
    known = known or {}
    found = 0

    # Walk into the folders. Without that, every tile in a folder counts as "no
    # address, so no icon" — and precisely when the bookmarks were moved into
    # folders, all of them lose their icon at once. Exactly that happened to
    # the user.
    def walk(list_):
        nonlocal found
        for tile in list_:
            if tile.get('children'):
                walk(tile['children'])
                continue
            if not tile.get('url') or tile.get('glyph'):
                continue
            address = bitmap_for_url(file, tile['url']) if file else None
            if not address and file:
                # No image in the database: at least try the address Chrome
                # remembered.
                address = icon_for_url(file, tile['url'])
            if not address:
                address = known.get(tile['url'])
            if address:
                tile['icon'] = address
                found += 1

    walk(tiles)
    return found


def count(tiles):
    return sum(1 if t.get('url') else 1 + count(t.get('children', []))
               for t in tiles)


def nas_credentials():
    """Host, user and key for the target server.

    The environment comes first, so that this script runs on any machine:

        DIE_WAND_NAS_HOST, DIE_WAND_NAS_USER, DIE_WAND_NAS_KEY

    As a convenience on the machine this was written on, those credentials
    stand exactly once in an opencode.json, so it is read when the environment
    is silent. That is a local arrangement, not a requirement: without it,
    simply set the three variables above.
    """
    from_env = {k: os.getenv(k) for k in
                ('DIE_WAND_NAS_HOST', 'DIE_WAND_NAS_USER', 'DIE_WAND_NAS_KEY')}
    if all(from_env.values()):
        return {'host': from_env['DIE_WAND_NAS_HOST'],
                'user': from_env['DIE_WAND_NAS_USER'],
                'key_path': from_env['DIE_WAND_NAS_KEY']}

    file = Path(os.getenv('DIE_WAND_OPENCODE', '~/dev/opencode.json')).expanduser()
    try:
        data = json.loads(file.read_text())
        # SSH_TARGETS stands in that file as text, not as a list.
        entries = json.loads(data['mcp']['ssh']['environment']['SSH_TARGETS'])
    except (OSError, KeyError, json.JSONDecodeError) as error:
        raise RuntimeError(
            f'no server given. Set DIE_WAND_NAS_HOST, _USER and _KEY '
            f'(or provide {file}, which is what this machine uses: {error})'
        ) from error
    for entry in entries:
        if entry.get('name') == 'nas':
            return entry
    raise RuntimeError(f'{file} holds no host named "nas"')


def push_to_nas(file: Path, content: str) -> str:
    """Put the file on the server byte by byte, then compare the checksum.

    Over ssh with base64, not over scp or SFTP: on the NAS this was written
    for, both report "No such file" even though the file exists. And nothing is
    ever typed into a tool by hand — on the first attempt with this file 15
    real tiles were lost and 13 invented ones appeared.
    """
    access = nas_credentials()
    # Absolute paths: ssh starts in the user's home, a relative target landed
    # there and not in the project folder.
    target = str(NAS_TARGET)
    raw = base64.b64encode(content.encode('utf-8'))

    write = subprocess.run(
        ['ssh', '-i', access['key_path'], '-o', 'BatchMode=yes',
         f"{access['user']}@{access['host']}",
         f'base64 -d > {target} && chmod 644 {target}'],
        input=raw, capture_output=True, timeout=60)
    if write.returncode != 0:
        raise RuntimeError(f'ssh said: {write.stderr.decode(errors="replace").strip()}')

    check = subprocess.run(
        ['ssh', '-i', access['key_path'], '-o', 'BatchMode=yes',
         f"{access['user']}@{access['host']}", f'sha256sum {target}'],
        capture_output=True, text=True, timeout=60)
    remote = check.stdout.split()[:1]
    here = hashlib.sha256(content.encode('utf-8')).hexdigest()
    if remote != [here]:
        raise RuntimeError(f'checksum differs: here {here[:12]}, there '
                           f'{(remote[0] if remote else "unknown")[:12]}')
    return target


def icons_from(tiles):
    """The icon addresses of a list, by address — from the folders too."""
    out = {}

    def walk(list_):
        for t in list_:
            if t.get('children'):
                walk(t['children'])
            elif t.get('url') and t.get('icon'):
                out[t['url']] = t['icon']

    walk(tiles or [])
    return out


def existing_tiles(file: Path):
    """What was written last, or None when there is no file.

    Only the tiles, not the timestamp: the comparison is meant to say whether
    something changed.
    """
    try:
        return json.loads(file.read_text())['tiles']
    except (OSError, KeyError, json.JSONDecodeError):
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--dry-run', action='store_true',
                    help='only show, write nothing')
    ap.add_argument('--local-only', action='store_true',
                    help='write only the local file, nothing to the server')
    args = ap.parse_args()

    profile, source_file = find_profile()
    if profile is None:
        print(f'under {PROFILE} lie neither AccountBookmarks nor Bookmarks. '
              'Check the path (DIE_WAND_CHROME) or create bookmarks in Chrome.',
              file=sys.stderr)
        return 1

    tiles = to_tiles(read_bookmark_bar(profile, source_file))
    if not tiles:
        print('The bookmark bar is empty.', file=sys.stderr)
        return 1

    icons = add_icons(tiles, copy_icon_db(profile),
                      icons_from(existing_tiles(LOCAL_TARGET)))

    if args.dry_run:
        print(f'found: {count(tiles)} tiles in {profile.name} '
            f'({source_file}), {icons} of them with an icon from Chrome')
        return 0

    # Write nothing that matches the last time. The page takes a non-empty
    # tiles.json from the server over its own browser copy, so rewriting it on
    # every run would overwrite a tile made by hand on the wall on the next
    # call.
    old = existing_tiles(LOCAL_TARGET)
    if old == tiles:
        print(f'unchanged: {count(tiles)} tiles, {icons} with icon — '
            'nothing written')
        return 0

    content = json.dumps({
        'version': 1,
        'updated': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'tiles': tiles,
    }, indent=2, ensure_ascii=False) + '\n'

    LOCAL_TARGET.parent.mkdir(parents=True, exist_ok=True)
    LOCAL_TARGET.write_text(content, encoding='utf-8')
    print(f'{count(tiles)} tiles, {icons} with icon -> {LOCAL_TARGET}')

    if args.local_only:
        return 0

    try:
        target = push_to_nas(NAS_TARGET, content)
        print(f'{count(tiles)} tiles, {icons} with icon -> server {target}, '
              'checksum matches')
    except (RuntimeError, subprocess.SubprocessError, OSError) as error:
        # The local file stands and is correct; only the wall still waits.
        print(f'Careful, nothing reached the server: {error}', file=sys.stderr)
        print('The local file is done; it can be copied on by hand.',
              file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

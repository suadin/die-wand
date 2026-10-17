#!/usr/bin/env python3
"""Checks the conversion of Chrome bookmarks on an example.

Chrome writes the same structure as an HTML export: a list of entries, each
either an address or a folder with children.
"""

import importlib.util
import json
import pathlib
import sqlite3
import tempfile
import unittest
from pathlib import Path

path = Path(__file__).with_name('chrome.py')
spec = importlib.util.spec_from_file_location('chrome', path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

SAMPLE = {
    'roots': {
        'bookmark_bar': {
            'children': [
                {'type': 'url', 'name': 'GNOME', 'url': 'https://gnome.org/'},
                {'type': 'folder', 'name': 'Tech', 'children': [
                    {'type': 'url', 'name': 'Mutter', 'url': 'https://mutter.gnome.org/'},
                ]},
                {'type': 'url', 'name': 'broken', 'url': 'javascript:x'},
                {'type': 'url', 'url': 'https://no-title.example/'},
                {'type': 'folder', 'name': 'empty', 'children': []},
                {'type': 'separator'},
            ],
        },
    },
}


class TestIcons(unittest.TestCase):
    """The lookup in Chrome's icon database, with the same table."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.db = pathlib.Path(self.dir.name) / 'Favicons'
        self.addCleanup(self.dir.cleanup)
        connection = sqlite3.connect(self.db)
        connection.executescript("""
            CREATE TABLE favicons (id INTEGER PRIMARY KEY, url TEXT, icon_type INTEGER);
            CREATE TABLE icon_mapping (id INTEGER PRIMARY KEY, page_url TEXT,
                                       icon_id INTEGER, page_url_type INTEGER);
            CREATE TABLE favicon_bitmaps (id INTEGER PRIMARY KEY, icon_id INTEGER,
                                         image_data BLOB, width INTEGER,
                                         height INTEGER);
            INSERT INTO favicons VALUES (1, 'https://cdn.ing.de/assets/icon.svg', 1);
            INSERT INTO icon_mapping VALUES (1, 'https://ing.de/', 1, 0);
            INSERT INTO favicons VALUES (2, 'data:image/png;base64,iVBORw0KGgo=', 1);
            INSERT INTO icon_mapping VALUES (2, 'https://notion.site/x', 2, 0);
        """)
        connection.commit()
        connection.close()

    def test_bitmap_is_embedded(self):
        blob = b'\x89PNG\r\n\x1a\n' + b'x' * 40
        connection = sqlite3.connect(self.db)
        connection.execute('INSERT INTO favicon_bitmaps (icon_id, image_data) VALUES (1, ?)',
                           (blob,))
        connection.commit()
        connection.close()
        address = mod.bitmap_for_url(self.db, 'https://ing.de/')
        self.assertTrue(address.startswith('data:image/png;base64,'))
        import base64
        self.assertEqual(base64.b64decode(address.split(',', 1)[1]), blob)

    def test_without_a_bitmap_the_name_remains(self):
        self.assertIsNone(mod.bitmap_for_url(self.db, 'https://ing.de/'))

    def test_no_png_is_not_embedded(self):
        connection = sqlite3.connect(self.db)
        connection.execute(
            'INSERT INTO favicon_bitmaps (icon_id, image_data) VALUES (1, ?)',
            (b'GIF89a' + b'x' * 20,))
        connection.commit()
        connection.close()
        # Better to try the address than to deliver an image with the wrong type.
        self.assertIsNone(mod.bitmap_for_url(self.db, 'https://ing.de/'))

    def test_address_is_found(self):
        self.assertEqual(mod.icon_for_url(self.db, 'https://ing.de/'),
                         'https://cdn.ing.de/assets/icon.svg')

    def test_embedded_image_is_unwrapped(self):
        self.assertEqual(mod.icon_for_url(self.db, 'https://notion.site/x'),
                         'data:image/png;base64,iVBORw0KGgo=')

    def test_unknown_site(self):
        self.assertIsNone(mod.icon_for_url(self.db, 'https://doesnotexist.de/'))

    def test_no_file_is_not_fatal(self):
        self.assertIsNone(mod.icon_for_url(self.dir.name + '/doesnotexist', 'x'))

    def test_tile_gets_the_icon(self):
        tiles = [{'title': 'a', 'url': 'https://ing.de/'},
                 {'title': 'b', 'url': 'https://doesnotexist.de/'},
                 {'title': 'c', 'url': 'https://else.de/', 'glyph': 'C'}]
        found = mod.add_icons(tiles, self.db)
        self.assertEqual(found, 1)
        self.assertEqual(tiles[0]['icon'], 'https://cdn.ing.de/assets/icon.svg')
        self.assertNotIn('icon', tiles[1])
        self.assertNotIn('icon', tiles[2])

    def test_without_a_database_nothing_happens(self):
        tiles = [{'title': 'a', 'url': 'https://ing.de/'}]
        self.assertEqual(mod.add_icons(tiles, None), 0)
        self.assertNotIn('icon', tiles[0])

    def test_unwrap(self):
        self.assertEqual(mod.unwrap("('https://x.de/i.png',)"), 'https://x.de/i.png')
        self.assertEqual(mod.unwrap('https://x.de/i.png'), 'https://x.de/i.png')
        self.assertIsNone(mod.unwrap('nonsense'))
        self.assertIsNone(mod.unwrap(''))


class TestUnchanged(unittest.TestCase):
    """Write only what changed — the timestamp is the signal for the page, and
    every file every five minutes would always be the newer one."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.file = pathlib.Path(self.dir.name) / 'tiles.json'

    def write(self, tiles):
        self.file.write_text(json.dumps({
            'version': 1,
            'updated': '2026-10-01T00:00:00+00:00',
            'tiles': tiles,
        }))

    def test_returns_the_tiles(self):
        self.write([{'title': 'a', 'url': 'https://a/'}])
        self.assertEqual(mod.existing_tiles(self.file),
                         [{'title': 'a', 'url': 'https://a/'}])

    def test_without_a_file_nothing(self):
        self.assertIsNone(mod.existing_tiles(self.file))

    def test_broken_file_nothing(self):
        self.file.write_text('no json')
        self.assertIsNone(mod.existing_tiles(self.file))

    def test_without_the_tiles_key_nothing(self):
        self.file.write_text('{"version": 1}')
        self.assertIsNone(mod.existing_tiles(self.file))

    def test_same_list_is_equal(self):
        tiles = [{'title': 'a', 'url': 'https://a/', 'icon': 'https://a/i.png'}]
        self.write(tiles)
        self.assertEqual(mod.existing_tiles(self.file), tiles)

    def test_timestamp_does_not_count(self):
        self.write([{'title': 'a', 'url': 'https://a/'}])
        self.assertEqual(mod.existing_tiles(self.file),
                         [{'title': 'a', 'url': 'https://a/'}])

    def test_new_icon_counts_as_a_change(self):
        self.write([{'title': 'a', 'url': 'https://a/'}])
        with_icon = [{'title': 'a', 'url': 'https://a/', 'icon': 'https://a/i.png'}]
        self.assertNotEqual(mod.existing_tiles(self.file), with_icon)


class TestSource(unittest.TestCase):
    """Which file is read — with an account and without."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.root = pathlib.Path(self.dir.name)

    def make_profile(self, name, files):
        profile = self.root / name
        profile.mkdir()
        for file in files:
            (profile / file).write_text(json.dumps({
                'roots': {'bookmark_bar': {'children': [
                    {'type': 'url', 'name': 'x', 'url': 'https://x/'}]}}}))
        return profile

    def test_with_an_account(self):
        profile = self.make_profile('Default', ['AccountBookmarks'])
        old = mod.PROFILE
        mod.PROFILE = self.root
        try:
            found, file = mod.find_profile()
        finally:
            mod.PROFILE = old
        self.assertEqual((found, file), (profile, 'AccountBookmarks'))

    def test_without_an_account(self):
        # Without a signed-in account Chrome creates a file named "Bookmarks".
        # That is the normal path and not an error.
        profile = self.make_profile('Default', ['Bookmarks'])
        old = mod.PROFILE
        mod.PROFILE = self.root
        try:
            found, file = mod.find_profile()
        finally:
            mod.PROFILE = old
        self.assertEqual((found, file), (profile, 'Bookmarks'))

    def test_without_anything(self):
        old = mod.PROFILE
        mod.PROFILE = self.root
        try:
            found, file = mod.find_profile()
        finally:
            mod.PROFILE = old
        self.assertIsNone(found)
        self.assertIsNone(file)

    def test_both_present_the_account_file_wins(self):
        profile = self.make_profile('Default', ['Bookmarks', 'AccountBookmarks'])
        old = mod.PROFILE
        mod.PROFILE = self.root
        try:
            found, file = mod.find_profile()
        finally:
            mod.PROFILE = old
        self.assertEqual(file, 'AccountBookmarks')


class TestChrome(unittest.TestCase):
    def setUp(self):
        self.tiles = mod.to_tiles(SAMPLE['roots']['bookmark_bar']['children'])

    def test_addresses_are_taken_over(self):
        self.assertIn({'title': 'GNOME', 'url': 'https://gnome.org/'}, self.tiles)

    def test_non_http_falls_away(self):
        self.assertFalse(any(t.get('url', '').startswith('javascript')
                             for t in self.tiles))

    def test_folders_become_groups(self):
        groups = [t for t in self.tiles if 'url' not in t]
        self.assertEqual([g['title'] for g in groups], ['Tech'])

    def test_folder_content(self):
        group = next(t for t in self.tiles if t.get('title') == 'Tech')
        self.assertEqual(group['children'], [
            {'title': 'Mutter', 'url': 'https://mutter.gnome.org/'}])

    def test_without_a_title_the_machine_name_is_used(self):
        # Chrome names the link exactly like its address; on the wall the host
        # should stand, not the whole address.
        self.assertIn({'title': 'no-title.example',
                       'url': 'https://no-title.example/'}, self.tiles)

    def test_address_with_port_and_path(self):
        tiles = mod.to_tiles([
            {'type': 'url', 'name': 'http://nas:9999/x#/y',
             'url': 'http://nas:9999/x#/y'}])
        self.assertEqual(tiles[0]['title'], 'nas:9999')

    def test_rename_only_when_entered(self):
        # The renaming is a local quirk (import/renames.json) and must not
        # live in the tool.
        self.assertEqual(
            mod.readable_title('Homepage', 'https://wall.local/', {'Homepage': 'DIE WAND'}),
            'DIE WAND')
        self.assertEqual(mod.readable_title('Homepage', 'https://wall.local/', {}),
                         'Homepage')

    def test_own_name_stays(self):
        self.assertEqual(mod.readable_title('My Cloud', 'https://cloud/', {}),
                         'My Cloud')

    def test_without_the_table_chromes_name_counts(self):
        # Otherwise the table comes from the file next to the script; it is
        # local and is therefore passed explicitly empty here.
        self.assertEqual(mod.readable_title('Homepage', 'https://wall.local/', {}),
                         'Homepage')

    def test_icons_arrive_inside_folders_too(self):
        # This is exactly where the user lost the icons: the tiles lay in a
        # folder, and the assignment only went through the top level. Folders
        # have no address, so they counted as without an icon.
        tiles = [{'title': 'Local', 'children': [
            {'title': 'a', 'url': 'https://a/'},
            {'title': 'b', 'url': 'https://b/', 'glyph': 'B'},
        ]}]
        old = mod.icon_for_url
        mod.icon_for_url = lambda file, url: 'https://a/icon.png' if url == 'https://a/' else None
        try:
            found = mod.add_icons(tiles, 'anything')
        finally:
            mod.icon_for_url = old
        self.assertEqual(found, 1)
        self.assertEqual(tiles[0]['children'][0]['icon'], 'https://a/icon.png')
        self.assertNotIn('icon', tiles[0]['children'][1])

    def test_known_icons_are_found_again_in_folders(self):
        tiles = [{'title': 'Local', 'children': [
            {'title': 'a', 'url': 'https://a/'}]}]
        old = mod.icon_for_url
        mod.icon_for_url = lambda file, url: None
        try:
            mod.add_icons(tiles, None,
                          {'https://a/': 'https://a/kept.png'})
        finally:
            mod.icon_for_url = old
        self.assertEqual(tiles[0]['children'][0]['icon'], 'https://a/kept.png')

    def test_icon_memory_reads_folders(self):
        tiles = [{'title': 'Local', 'children': [
            {'title': 'a', 'url': 'https://a/', 'icon': 'https://a/i.png'}]}]
        self.assertEqual(mod.icons_from(tiles), {'https://a/': 'https://a/i.png'})

    def test_local_table_is_read(self):
        import json
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'renames.json'
            file.write_text(json.dumps({'Homepage': 'MY WALL'}))
            self.assertEqual(mod.renames(file), {'Homepage': 'MY WALL'})
            file.write_text('broken')
            self.assertEqual(mod.renames(file), {})

    def test_empty_folder_falls_away(self):
        self.assertFalse(any(t.get('title') == 'empty' for t in self.tiles))

    def test_count(self):
        # GNOME, the one without a title, the folder Tech and Mutter inside it:
        # four.
        self.assertEqual(mod.count(self.tiles), 4)

    def test_bar_missing(self):
        self.assertEqual(mod.to_tiles([]), [])


if __name__ == '__main__':
    unittest.main(verbosity=2)

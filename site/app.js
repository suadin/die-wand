// die-wand: wires the page to bookmarks.js.
//
// What the page is: a view of the bookmark bar from Chrome. The extension is
// the live source when it is installed; the local helper and tiles.json remain
// fallbacks and supply Chrome's icons. Bookmarks can be created, moved into
// folders and deleted through the extension's bookmarks API. Imported files
// only replace the browser's working copy.
//
// Two rules for the import, both deliberate: a file replaces the wall
// completely, and everything lands flat on the wall, without folders.

import {
    fromBookmarks, flatten, hasLocalTiles, iconCandidates, normalize, glyph,
    count,
} from './bookmarks.js';
import {
    extensionCommand, extensionTree, removeBookmark, createBookmark,
    createFolder, moveBookmark, updateBookmark, openBookmark, faviconUrl,
} from './extension.js';

const STORAGE_KEY = 'die-wand.tiles';
const THEME_KEY = 'die-wand.theme';

// The helper that reads Chrome. If it does not run, things continue with the
// file from the server. Nothing is touched in the background: the page asks,
// the helper answers, and afterwards it is gone again.
const HELPER = 'http://127.0.0.1:8124/tiles.json';

// Addresses whose icon has already failed. Without this list the wall would
// retry the same dead path on every redraw.
const iconMissing = new Set();

const state = {
    tiles: [],
    barId: '1',
    folders: [{guid: '1', title: 'Lesezeichenleiste'}],
    extension: false,
    reordering: false,
};

const wall = document.getElementById('wall');
const notice = document.getElementById('notice');
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const themeColor = document.getElementById('theme-color');
const newBookmark = document.getElementById('new-bookmark');
const newFolder = document.getElementById('new-folder');
const deleteFolder = document.getElementById('delete-folder');
const dialog = document.getElementById('entry-dialog');
const form = document.getElementById('entry-form');
const dialogTitle = document.getElementById('dialog-title');
const dialogSubmit = document.getElementById('dialog-submit');
const titleField = document.getElementById('title-field');
const urlField = document.getElementById('url-field');
const folderField = document.getElementById('folder-field');
const entryTitle = document.getElementById('entry-title');
const entryUrl = document.getElementById('entry-url');
const entryFolder = document.getElementById('entry-folder');
const dialogError = document.getElementById('dialog-error');
let dialogMode = null;
let dialogTile = null;

function storedTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch { return null; }
}

function setTheme(theme, persist = false) {
    const dark = theme === 'dark';
    document.documentElement.dataset.bsTheme = theme;
    themeToggle.setAttribute('aria-pressed', String(dark));
    themeIcon.textContent = dark ? '☀' : '☾';
    themeColor.content = dark ? '#212529' : '#f8f9fa';
    if (persist) {
        try { localStorage.setItem(THEME_KEY, theme); } catch {}
    }
}

setTheme(document.documentElement.dataset.bsTheme === 'dark' ? 'dark' : 'light');
themeToggle.addEventListener('click', () => {
    setTheme(document.documentElement.dataset.bsTheme === 'dark' ? 'light' : 'dark', true);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
    if (!storedTheme())
        setTheme(event.matches ? 'dark' : 'light');
});

// How long a message stays. Most messages disappear on their own — an empty
// wall does not, that is a state and not an intermediate step.
const MESSAGE_MS = 7000;
let messageTimer = null;

function announce(text, ms = MESSAGE_MS) {
    notice.hidden = !text;
    notice.textContent = text ?? '';
    clearTimeout(messageTimer);
    messageTimer = null;
    if (text && ms > 0)
        messageTimer = setTimeout(() => announce(null), ms);
}

function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        saved: new Date().toISOString(),
        tiles: state.tiles,
    }));
}

/** What lies in the browser, or null. The timestamp is kept so that the age of
 * the working copy can be told later. */
function load() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    } catch (e) {
        announce(`Tiles stored in the browser are unreadable: ${e}`, 0);
        return null;
    }
}

function render(focusGuid = null) {
    wall.replaceChildren();

    if (!state.tiles.length) {
        announce('No tiles yet. Drag a bookmark file onto the wall, '
            + 'or nobody is answering yet.', 0);
        return;
    }
    announce(null);

    for (const tile of state.tiles) {
        if (tile.url)
            wall.append(tileElement(tile));
    }
    if (focusGuid) {
        const cell = [...wall.children].find(item => item.dataset.guid === focusGuid);
        cell?.querySelector('a')?.focus();
    }
}

/** Keep the icons Chrome's helper found when the extension supplies the newer
 * tree. The extension deliberately has no favicon-database access. */
function mergeIcons(tiles, knownTiles) {
    const icons = new Map();
    const urlIcons = new Map();
    const collect = list => {
        for (const tile of list) {
            if (tile.icon && tile.guid)
                icons.set(tile.guid, tile.icon);
            if (tile.icon && tile.url)
                urlIcons.set(tile.url, tile.icon);
            if (tile.children)
                collect(tile.children);
        }
    };
    collect(knownTiles);

    const walk = list => list.map(tile => {
        if (tile.children)
            return {...tile, children: walk(tile.children)};
        if (!tile.icon) {
            const icon = tile.guid && icons.get(tile.guid)
                || tile.url && urlIcons.get(tile.url);
            if (icon)
                return {...tile, icon};
        }
        return tile;
    });
    return walk(tiles);
}

function collectFolders(tiles, barId, out = [{guid: barId, title: 'Lesezeichenleiste'}]) {
    for (const tile of tiles) {
        if (tile.children) {
            if (tile.guid)
                out.push({guid: tile.guid, title: tile.title});
            collectFolders(tile.children, out);
        }
    }
    return out;
}

function fillFolderSelect(selected = '1', includeRoot = true) {
    entryFolder.replaceChildren();
    for (const folder of state.folders) {
        if (!includeRoot && folder.guid === '1')
            continue;
        const option = document.createElement('option');
        option.value = folder.guid;
        option.textContent = folder.title;
        option.selected = folder.guid === selected;
        entryFolder.append(option);
    }
}

function openEntryDialog(mode, tile = null) {
    dialogMode = mode;
    dialogTile = tile;
    dialogSubmit.disabled = false;
    dialogError.hidden = true;
    dialogError.textContent = '';
    entryTitle.value = tile?.title ?? '';
    entryUrl.value = tile?.url ?? '';
    titleField.hidden = mode === 'move' || mode === 'deleteFolder';
    urlField.hidden = mode !== 'bookmark' && mode !== 'edit';
    folderField.hidden = mode === 'folder';
    entryTitle.required = mode === 'bookmark' || mode === 'folder' || mode === 'edit';
    entryUrl.required = mode === 'bookmark' || mode === 'edit';
    const selectedFolder = mode === 'move' || mode === 'edit'
        ? tile?.parentId || state.barId : state.barId;
    fillFolderSelect(selectedFolder, mode !== 'deleteFolder');

    if (mode === 'bookmark') {
        dialogTitle.textContent = 'Lesezeichen anlegen';
        dialogSubmit.textContent = 'Anlegen';
    } else if (mode === 'edit') {
        dialogTitle.textContent = 'Lesezeichen bearbeiten';
        dialogSubmit.textContent = 'Speichern';
    } else if (mode === 'folder') {
        dialogTitle.textContent = 'Ordner anlegen';
        dialogSubmit.textContent = 'Anlegen';
    } else if (mode === 'deleteFolder') {
        dialogTitle.textContent = 'Ordner löschen';
        dialogSubmit.textContent = 'Ordner löschen';
        dialogSubmit.disabled = entryFolder.options.length === 0;
    } else {
        dialogTitle.textContent = `"${tile.title}" verschieben`;
        dialogSubmit.textContent = 'Verschieben';
        dialogSubmit.disabled = false;
    }
    dialog.showModal();
    (mode === 'move' || mode === 'deleteFolder' ? entryFolder : entryTitle).focus();
}

async function refreshFromExtension(focusGuid = null) {
    const snapshot = await extensionTree();
    state.barId = snapshot.barId;
    const live = normalize({tiles: snapshot.tiles});
    state.folders = collectFolders(live, state.barId);
    state.tiles = flatten(mergeIcons(live, state.tiles));
    save();
    render(focusGuid);
}

function removeGuid(tiles, guid) {
    return tiles
        .filter(tile => tile.guid !== guid)
        .map(tile => tile.children ? {...tile, children: removeGuid(tile.children, guid)} : tile);
}

async function useExtension() {
    try {
        await extensionCommand({action: 'ping'});
    } catch {
        // No extension is the normal static-page case, not an error.
        state.extension = false;
        newBookmark.hidden = true;
        newFolder.hidden = true;
        deleteFolder.hidden = true;
        return;
    }

    state.extension = true;
    newBookmark.hidden = false;
    newFolder.hidden = false;
    deleteFolder.hidden = false;
    try {
        const snapshot = await extensionTree();
        state.barId = snapshot.barId;
        const live = normalize({tiles: snapshot.tiles});
        state.folders = collectFolders(live, state.barId);
        state.tiles = flatten(mergeIcons(live, state.tiles));
        save();
        announce(`${count(state.tiles)} Lesezeichen, live aus der Chrome-Erweiterung.`);
    } catch (error) {
        announce(`Die Chrome-Erweiterung konnte die Lesezeichen nicht lesen: ${error.message}`, 0);
    }
}

async function deleteTile(tile, button) {
    if (!window.confirm(`"${tile.title}" aus Chrome löschen?`))
        return;
    button.disabled = true;
    try {
        await removeBookmark(tile.guid, tile);
        state.tiles = removeGuid(state.tiles, tile.guid);
        save();
        render();
        announce(`"${tile.title}" wurde aus Chrome gelöscht.`);
    } catch (error) {
        button.disabled = false;
        announce(`"${tile.title}" konnte nicht gelöscht werden: ${error.message}`, 0);
    }
}

async function reorderTile(tile, direction) {
    if (state.reordering || !Number.isInteger(tile.index)
        || !Number.isInteger(tile.siblingCount))
        return;
    const index = tile.index + direction;
    if (index < 0 || index >= tile.siblingCount)
        return;
    state.reordering = true;
    try {
        // Chrome's move index is interpreted before removing a node when it
        // moves right, so one step right needs the following API index.
        const apiIndex = direction > 0 ? index + 1 : index;
        await moveBookmark(tile.guid, tile.parentId, apiIndex);
        await refreshFromExtension(tile.guid);
        announce(`"${tile.title}" wurde nach ${direction < 0 ? 'links' : 'rechts'} verschoben.`);
    } catch (error) {
        announce(`"${tile.title}" konnte nicht verschoben werden: ${error.message}`, 0);
    } finally {
        state.reordering = false;
    }
}

/** The glyph shown while no icon is there or none is found. */
function initialNode(tile) {
    const el = document.createElement('span');
    el.className = 'initial';
    el.textContent = glyph(tile.title, tile.glyph);
    el.setAttribute('aria-hidden', 'true');
    return el;
}

/**
 * The icon of the site, otherwise one of the other known paths, otherwise its
 * first character. A self-set glyph takes precedence.
 *
 * The candidates are tried one after another instead of loading them all at
 * once: after a failure the wall knows the path is dead and never asks it
 * again.
 */
function imageOrGlyph(tile, parent) {
    const extensionIcon = state.extension ? faviconUrl(tile.url) : null;
    const candidates = tile.glyph
        ? []
        : [extensionIcon, ...iconCandidates(tile.url, tile.icon)]
            .filter(u => u && !iconMissing.has(u));

    if (!candidates.length) {
        parent.append(initialNode(tile));
        return;
    }

    const img = document.createElement('img');
    img.className = 'icon';
    img.alt = '';
    img.loading = 'lazy';
    img.draggable = false;
    // The page must not learn from where its icon is loaded.
    img.referrerPolicy = 'no-referrer';

    let next = 0;
    img.addEventListener('error', () => {
        iconMissing.add(candidates[next]);
        next += 1;
        if (next < candidates.length) {
            img.src = candidates[next];
            return;
        }
        img.replaceWith(initialNode(tile));
    });

    img.src = candidates[0];
    parent.append(img);
}

function tileElement(tile) {
    const col = document.createElement('div');
    col.className = 'tile-cell';
    if (tile.guid)
        col.dataset.guid = tile.guid;

    const a = document.createElement('a');
    a.className = 'card tile h-100 text-decoration-none text-body ' +
        'align-items-center justify-content-center gap-1 p-2 text-center';
    a.href = tile.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.draggable = false;
    a.addEventListener('click', event => {
        if (state.extension && tile.url.startsWith('chrome://')) {
            event.preventDefault();
            openBookmark(tile.url).catch(error => {
                announce(`Konnte "${tile.title}" nicht öffnen: ${error.message}`, 0);
            });
        }
    });
    a.addEventListener('keydown', event => {
        if (!state.extension)
            return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            reorderTile(tile, event.key === 'ArrowLeft' ? -1 : 1);
        }
    });

    imageOrGlyph(tile, a);

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = tile.title;
    a.append(title);

    col.append(a);

    if (state.extension && tile.guid) {
        const actions = document.createElement('div');
        actions.className = 'tile-actions';

        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'btn btn-sm btn-outline-primary edit-tile';
        edit.textContent = '✎';
        edit.setAttribute('aria-label', `${tile.title} bearbeiten`);
        edit.title = 'Name, Adresse oder Ordner ändern';
        edit.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            openEntryDialog('edit', tile);
        });

        const move = document.createElement('button');
        move.type = 'button';
        move.className = 'btn btn-sm btn-outline-secondary move-tile';
        move.textContent = '↪';
        move.setAttribute('aria-label', `${tile.title} verschieben`);
        move.title = 'In Ordner verschieben';
        move.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            openEntryDialog('move', tile);
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn-sm btn-danger delete-tile';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `${tile.title} löschen`);
        remove.title = 'Aus Chrome löschen';
        remove.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            deleteTile(tile, remove);
        });
        actions.append(edit, move, remove);
        col.append(actions);
    }

    if (state.extension && Number.isInteger(tile.index)
        && Number.isInteger(tile.siblingCount)) {
        if (tile.index > 0) {
            const left = document.createElement('button');
            left.type = 'button';
            left.className = 'btn btn-sm btn-outline-secondary reorder-tile reorder-left';
            left.textContent = '←';
            left.setAttribute('aria-label', `${tile.title} nach links verschieben`);
            left.title = 'Innerhalb des Ordners nach links';
            left.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                reorderTile(tile, -1);
            });
            col.append(left);
        }
        if (tile.index < tile.siblingCount - 1) {
            const right = document.createElement('button');
            right.type = 'button';
            right.className = 'btn btn-sm btn-outline-secondary reorder-tile reorder-right';
            right.textContent = '→';
            right.setAttribute('aria-label', `${tile.title} nach rechts verschieben`);
            right.title = 'Innerhalb des Ordners nach rechts';
            right.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                reorderTile(tile, 1);
            });
            col.append(right);
        }
    }

    return col;
}

/**
 * Read a file of bookmarks — and thereby replace the wall.
 *
 * **Everything is always replaced**, nothing is appended, and everything lands
 * **flat** on the wall: a Chrome file brings its folders with it ("Bookmarks
 * bar" and below), and on a screen that is only meant to show where to go,
 * that gets in the way.
 */
function fromFile(file) {
    if (!file)
        return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const before = state.tiles.length;
            const raw = /\.json$/i.test(file.name)
                ? JSON.parse(String(reader.result))
                : fromBookmarks(String(reader.result));
            const tiles = normalize({tiles: flatten(normalize({tiles: raw}))});
            if (!tiles.length)
                throw new Error('no bookmarks found');
            state.tiles = tiles;
            save();
            render();
            announce(`${count(state.tiles)} tiles from ${file.name}, ` +
                (before ? `the ${before} before it are replaced.` : 'the wall was empty.'));
        } catch (e) {
            announce(`File not readable: ${e}`, 0);
        }
    };
    reader.readAsText(file);
}

newBookmark.addEventListener('click', () => openEntryDialog('bookmark'));
newFolder.addEventListener('click', () => openEntryDialog('folder'));
deleteFolder.addEventListener('click', () => openEntryDialog('deleteFolder'));
document.getElementById('dialog-cancel').addEventListener('click', () => dialog.close());
form.addEventListener('submit', async event => {
    event.preventDefault();
    dialogSubmit.disabled = true;
    const title = entryTitle.value.trim();
    const parentId = dialogMode === 'folder' ? state.barId : entryFolder.value;
    try {
        let message = '';
        if (dialogMode === 'bookmark') {
            await createBookmark({title, url: entryUrl.value.trim(), parentId});
            message = `"${title}" wurde angelegt.`;
        } else if (dialogMode === 'edit') {
            await updateBookmark(dialogTile.guid, {
                title,
                url: entryUrl.value.trim(),
                oldUrl: dialogTile.url,
                oldTitle: dialogTile.title,
            });
            if (parentId !== dialogTile.parentId)
                await moveBookmark(dialogTile.guid, parentId);
            message = `"${title}" wurde gespeichert.`;
        } else if (dialogMode === 'folder') {
            await createFolder({title, parentId});
            message = `Ordner "${title}" wurde angelegt.`;
        } else if (dialogMode === 'move') {
            await moveBookmark(dialogTile.guid, parentId);
            message = `"${dialogTile.title}" wurde verschoben.`;
        } else if (dialogMode === 'deleteFolder') {
            const folder = state.folders.find(item => item.guid === parentId);
            if (!folder)
                throw new Error('Ordner nicht gefunden');
            if (!window.confirm(`Ordner "${folder.title}" und alle enthaltenen Lesezeichen löschen?`)) {
                dialog.close();
                return;
            }
            await removeBookmark(folder.guid, {title: folder.title});
            message = `Ordner "${folder.title}" wurde gelöscht.`;
        }
        await refreshFromExtension();
        dialog.close();
        announce(message);
    } catch (error) {
        dialogError.textContent = `Änderung fehlgeschlagen: ${error.message}`;
        dialogError.hidden = false;
        announce(`Änderung fehlgeschlagen: ${error.message}`, 0);
    } finally {
        dialogSubmit.disabled = false;
    }
});

wall.addEventListener('dragstart', event => event.preventDefault());

const hasFiles = event => event.dataTransfer?.types?.includes('Files');
for (const type of ['dragenter', 'dragover']) {
    document.addEventListener(type, e => {
        if (!hasFiles(e))
            return;
        e.preventDefault();
        document.body.classList.add('dragging');
    });
}
document.addEventListener('dragleave', () => document.body.classList.remove('dragging'));
document.addEventListener('drop', e => {
    if (!hasFiles(e) || !e.dataTransfer?.files?.length)
        return;
    e.preventDefault();
    document.body.classList.remove('dragging');
    fromFile(e.dataTransfer.files[0]);
});

/**
 * Build the wall: helper and file supply the known tiles and icons, then the
 * extension replaces the list with Chrome's live bookmark bar when installed.
 * That order keeps the helper's favicon database useful while making changes
 * survive a reload even when the static tiles.json has not been synced yet.
 *
 * Without the extension the helper wins, then a non-empty tiles.json from the
 * server, then the browser's own working copy.
 */
async function start() {
    let fromHelper = false;
    try {
        const response = await fetch(HELPER, {cache: 'no-store'});
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        state.tiles = normalize({tiles: flatten(normalize(data))});
        save();
        fromHelper = true;
        announce(`${count(state.tiles)} tiles, just read from Chrome.`);
    } catch (e) {
        // No helper, no drama: the file from the server is the fallback.
        announce(`The helper at ${HELPER} is not answering (${e.message}). `
            + 'The file from the server is used instead.', 0);
    }

    if (!fromHelper) {
        const local = load();

        let file = null;
        try {
            const response = await fetch('tiles.json', {cache: 'no-store'});
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            file = await response.json();
        } catch (e) {
            if (!hasLocalTiles(local))
                announce(`No tiles.json found on the server (${e}).`, 0);
        }

        if (file && hasLocalTiles(file)) {
            state.tiles = normalize({tiles: flatten(normalize(file))});
            save();
        } else if (hasLocalTiles(local)) {
            state.tiles = normalize(local);
        }
    }

    await useExtension();
    render();
}

start();

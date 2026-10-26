// DIE WAND: wires the page to logic.js.
//
// What the page is: a view of the bookmark bar from Chrome. It reads nothing
// itself — it asks the helper on the same machine (import/serve.py) and shows
// what the helper returns. If it does not answer, tiles.json from the server
// comes in, the one import/chrome.py wrote.
//
// What the page is not: no place to change and no place to save. Alias,
// address, order and icons live in Chrome, and on the next read tiles changed
// here would be Chrome's again. There is no download button either: Chrome
// exports bookmarks itself, in exactly the format this page reads.
//
// Two rules for the import, both deliberate: a file replaces the wall
// completely, and everything lands flat on the wall, without folders.

import {
    fromBookmarks, flatten, hasLocalTiles, iconCandidates, normalize, glyph,
    count,
} from './logic.js';
import {docsHash, parseRoute, renderMarkdown, splitDocument} from './reader.js';

const STORAGE_KEY = 'die-wand.tiles';

// The documents the reader offers. The Markdown files are copies of the root
// README and GUIDE, rebuilt by ./publish-pages.sh; keeping them next to the
// page is what lets the reader work on the NAS and on GitHub Pages alike.
const DOCUMENTS = [
    {slug: 'readme', title: 'README', file: 'docs/README.md'},
    {slug: 'guide', title: 'GUIDE', file: 'docs/GUIDE.md'},
];

// The helper that reads Chrome. If it does not run, things continue with the
// file from the server. Nothing is touched in the background: the page asks,
// the helper answers, and afterwards it is gone again.
const HELPER = 'http://127.0.0.1:8124/tiles.json';

// Addresses whose icon has already failed. Without this list the wall would
// retry the same dead path on every redraw.
const iconMissing = new Set();

const state = {tiles: [], docs: null, currentDoc: null};

const wall = document.getElementById('wall');
const notice = document.getElementById('notice');
const reader = document.getElementById('reader');
const readerTitle = document.getElementById('reader-title');
const readerTabs = document.getElementById('reader-tabs');
const readerSections = document.getElementById('reader-sections');
const readerSectionTitle = document.getElementById('reader-section-title');
const readerBody = document.getElementById('reader-body');
const unitMetrics = document.getElementById('unit-metrics');
const e2eMetrics = document.getElementById('e2e-metrics');

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

function render() {
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
    const candidates = tile.glyph
        ? []
        : iconCandidates(tile.url, tile.icon).filter(u => !iconMissing.has(u));

    if (!candidates.length) {
        parent.append(initialNode(tile));
        return;
    }

    const img = document.createElement('img');
    img.className = 'icon';
    img.alt = '';
    img.loading = 'lazy';
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
    const a = document.createElement('a');
    a.className = 'tile';
    a.href = tile.url;
    a.target = '_blank';
    a.rel = 'noopener';

    imageOrGlyph(tile, a);

    const label = document.createElement('span');
    label.className = 'label';
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = tile.title;
    label.append(title);
    a.append(label);
    return a;
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
            state.tiles = normalize({tiles: flatten(normalize({tiles: raw}))});
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

for (const type of ['dragenter', 'dragover']) {
    document.addEventListener(type, e => {
        e.preventDefault();
        document.body.classList.add('dragging');
    });
}
document.addEventListener('dragleave', () => document.body.classList.remove('dragging'));
document.addEventListener('drop', e => {
    e.preventDefault();
    document.body.classList.remove('dragging');
    fromFile(e.dataTransfer?.files?.[0]);
});

/**
 * Build the wall: first ask Chrome, then the file.
 *
 * Order matters: if the browser already has tiles, drawing before loading has
 * nothing to paint, and a draw afterwards is missing — the wall then stays
 * empty until something else redraws it. So here it is drawn once at the end
 * and nowhere before.
 *
 * Which list wins: the helper first, then a non-empty tiles.json from the
 * server, then the browser's own working copy. The server file wins over the
 * browser copy whenever it holds anything; the two are not compared by age.
 */
async function start() {
    try {
        const response = await fetch(HELPER, {cache: 'no-store'});
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        state.tiles = normalize({tiles: flatten(normalize(data))});
        save();
        render();
        announce(`${count(state.tiles)} tiles, just read from Chrome.`);
        return;
    } catch (e) {
        // No helper, no drama: the file from the server is the fallback.
        announce(`The helper at ${HELPER} is not answering (${e.message}). `
            + 'The file from the server is used instead.', 0);
    }

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

    render();
}

// ---- Documentation reader ------------------------------------------------

async function loadDocs() {
    if (state.docs)
        return state.docs;
    const docs = [];
    for (const entry of DOCUMENTS) {
        try {
            const response = await fetch(entry.file, {cache: 'no-store'});
            if (!response.ok)
                continue;
            docs.push(splitDocument({
                slug: entry.slug,
                title: entry.title,
                markdown: await response.text(),
            }));
        } catch (e) {
            // A missing document is not fatal: the other tabs still work.
        }
    }
    state.docs = docs;
    return docs;
}

function showReader(open) {
    reader.hidden = !open;
    document.body.classList.toggle('reading', open);
    if (open)
        document.getElementById('reader-close').focus();
}

function docLinkTarget(file, anchor) {
    const name = String(file ?? '').toLowerCase();
    const slug = name === 'readme.md' ? 'readme'
        : name === 'guide.md' ? 'guide' : null;
    if (!slug)
        return null;
    const section = String(anchor ?? '').replace(/^#/, '');
    return docsHash(slug, section || null);
}

async function showDocs(docSlug, sectionSlug) {
    const docs = await loadDocs();
    showReader(true);
    readerTabs.replaceChildren();
    readerSections.replaceChildren();

    if (!docs.length) {
        readerTitle.textContent = 'Documentation';
        readerSectionTitle.hidden = true;
        readerBody.innerHTML = '<p>The documentation is not next to the page. '
            + 'Run <code>./publish-pages.sh</code> to copy it.</p>';
        return;
    }

    const doc = docs.find(item => item.slug === docSlug) ?? docs[0];
    const page = doc.pages.find(item => item.slug === sectionSlug) ?? doc.pages[0];
    state.currentDoc = doc.slug;
    readerTitle.textContent = doc.title;

    for (const item of docs) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = `reader-tab${item.slug === doc.slug ? ' active' : ''}`;
        tab.textContent = item.title;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(item.slug === doc.slug));
        tab.addEventListener('click', () => navigate(docsHash(item.slug)));
        readerTabs.append(tab);
    }

    const continuous = doc.pages.length === 1;
    readerSections.hidden = continuous;
    readerSectionTitle.hidden = continuous;
    if (!continuous) {
        for (const item of doc.pages) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `reader-section${item.slug === page.slug ? ' active' : ''}`;
            button.textContent = item.title;
            button.dataset.tip = item.title;
            button.addEventListener('click', () => navigate(docsHash(doc.slug, item.slug)));
            readerSections.append(button);
        }
        readerSectionTitle.textContent = page.title;
    }
    readerBody.innerHTML = renderMarkdown(page.markdown);
    readerBody.scrollTop = 0;
}

function navigate(hash) {
    if (location.hash === hash) {
        applyRoute();
        return;
    }
    location.hash = hash;
}

async function applyRoute() {
    const route = parseRoute(location.hash);
    if (route.view === 'docs') {
        await showDocs(route.doc, route.section);
        return;
    }
    showReader(false);
}

readerBody.addEventListener('click', event => {
    const link = event.target.closest('a[data-doc-file]');
    if (!link)
        return;
    const target = docLinkTarget(link.dataset.docFile ?? `${state.currentDoc}.md`,
        link.dataset.docAnchor);
    if (!target)
        return;
    event.preventDefault();
    navigate(target);
});

document.getElementById('readme-button').addEventListener('click', () => navigate(docsHash('readme')));
document.getElementById('reader-close').addEventListener('click', () => navigate('#/'));
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !reader.hidden)
        navigate('#/');
});
window.addEventListener('hashchange', () => {
    applyRoute().catch(error => announce(`Documentation not readable: ${error}`, 0));
});

// The footer shows the last measurement written by ./test/metrics.sh. A static
// page cannot start a test run itself, so there is no button here.
async function loadMetrics() {
    try {
        const response = await fetch('test-metrics.json', {cache: 'no-store'});
        if (!response.ok)
            return;
        const metrics = await response.json();
        const unit = metrics.unit;
        if (unit && Number.isFinite(unit.total)) {
            unitMetrics.textContent = `unit ${unit.total} tests`
                + (unit.coverage == null ? ' · coverage not measured' : ` · ${unit.coverage} %`);
            if (unit.measured)
                unitMetrics.dataset.tip = `Measured ${unit.measured}. Run ./test/metrics.sh to measure again`;
        }
        const e2e = metrics.e2e;
        if (e2e && Number.isFinite(e2e.total))
            e2eMetrics.textContent = `e2e ${e2e.total} journeys`;
    } catch (e) {
        // No metrics file: the footer keeps "not measured".
    }
}

// ---- Tooltip -------------------------------------------------------------

const tooltip = document.getElementById('tooltip');
let tipTarget = null;

function placeTip(target) {
    tooltip.textContent = target.dataset.tip;
    tooltip.hidden = false;
    const box = target.getBoundingClientRect();
    const tip = tooltip.getBoundingClientRect();
    const left = Math.min(Math.max(8, box.left + box.width / 2 - tip.width / 2),
        window.innerWidth - tip.width - 8);
    const above = box.top - tip.height - 8;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${above >= 8 ? above : box.bottom + 8}px`;
}

function hideTip() {
    tipTarget = null;
    tooltip.hidden = true;
}

document.addEventListener('pointerover', event => {
    const target = event.target.closest?.('[data-tip]');
    if (!target || target === tipTarget)
        return;
    tipTarget = target;
    placeTip(target);
});
document.addEventListener('pointerout', event => {
    if (tipTarget && !tipTarget.contains(event.relatedTarget))
        hideTip();
});
document.addEventListener('focusin', event => {
    const target = event.target.closest?.('[data-tip]');
    if (target) {
        tipTarget = target;
        placeTip(target);
    }
});
document.addEventListener('focusout', () => hideTip());
window.addEventListener('scroll', hideTip, true);

start();
loadMetrics();
applyRoute().catch(error => announce(`Documentation not readable: ${error}`, 0));

// Pure logic of the tile wall: reading and writing bookmarks, normalizing
// rules, comparing icons and lists. No DOM access except DOMParser while
// reading, so that most of it can be checked with gjs.

/**
 * Turns an HTML file of bookmarks into tiles.
 *
 * In the Netscape format Chrome, Brave and Firefox produce, the name of a
 * folder (H3) and its content (DL) are siblings — depending on the program
 * sometimes nested. Both are accepted here.
 */
export function fromBookmarks(html, document = new DOMParser().parseFromString(html, 'text/html')) {
    const tiles = [];

    const text = node => (node?.textContent ?? '').trim();

    // Some programs put the folder name inside the DL instead of before it.
    const firstH3 = node => {
        for (const child of node?.children ?? []) {
            if (child.tagName === 'H3')
                return text(child);
            const nested = firstH3(child);
            if (nested)
                return nested;
        }
        return '';
    };

    const walk = (list, target) => {
        let pendingName = null;

        for (const child of list.children) {
            // tagName returns DL, A, H3 in upper case, the selection asks for
            // lower case.
            const direct = tag => child.tagName === tag.toUpperCase()
                ? child
                : child.querySelector(`:scope > ${tag}`);
            const a = direct('a');
            const h3 = direct('h3');
            const dl = direct('dl');

            if (a?.getAttribute('href')) {
                target.push({
                    title: text(a) || a.getAttribute('href'),
                    url: a.getAttribute('href'),
                });
                pendingName = null;
                continue;
            }

            if (dl) {
                const content = [];
                walk(dl, content);
                const title = text(h3) || pendingName || firstH3(dl) || 'Untitled';
                if (content.length)
                    target.push({title, children: content});
                pendingName = null;
                continue;
            }

            if (h3) {
                // An H3 without a DL after it: that is the name of the next
                // folder.
                pendingName = text(h3);
            }
        }
    };

    for (const dl of document.querySelectorAll('body > dl')) {
        walk(dl, tiles);
        break;
    }

    // Chrome puts everything into a single wrapper folder ("All bookmarks").
    // That one does not belong on the wall, its content does. The count alone
    // cannot tell — a folder with one bookmark looks the same — so the name
    // decides.
    if (tiles.length === 1 && tiles[0].children && isWrapper((tiles[0].title ?? '').toLowerCase()))
        return tiles[0].children;
    return tiles;
}

/**
 * Names that suggest a wrapper folder.
 *
 * These are data, not text of this program: Chrome names the folder around its
 * export after the interface language, so the list holds the German and the
 * English spellings because both are seen in the wild.
 */
const WRAPPERS = ['alle lesezeichen', 'meine lesezeichen', 'lesezeichenleiste',
                  'bookmarks', 'bookmarks bar', 'favorites', 'favorites bar',
                  'favoriten'];

function isWrapper(title) {
    return WRAPPERS.includes((title ?? '').trim().toLowerCase());
}

/** Turns a loaded object into a validated list. */
export function normalize(raw) {
    const source = Array.isArray(raw?.tiles) ? raw.tiles : [];
    const out = [];
    const seen = new Set();

    // Deliberately no URL object: it exists only in the browser, not in gjs,
    // and all that is asked here is the scheme anyway.
    const clean = (url) => {
        const t = (url ?? '').trim();
        return /^https?:\/\//i.test(t) && !/\s/.test(t) ? t : null;
    };

    const walk = (list, target) => {
        for (const entry of list) {
            if (!entry || typeof entry !== 'object')
                continue;
            const url = clean(entry.url);
            if (url && !seen.has(url)) {
                seen.add(url);
                const tile = {
                    title: (entry.title ?? url).toString().slice(0, 120),
                    url,
                };
                const custom = (entry.glyph ?? '').toString().trim();
                if (custom)
                    tile.glyph = [...custom].slice(0, 8).join('');
                // The icon address from Chrome's database, a self-set path or
                // an embedded image. Nothing else: the file comes from a
                // script, but it does end up in the repository.
                const icon = (entry.icon ?? '').toString().trim();
                if (/^(https?:\/\/|\/)[^\s]{0,300}$/.test(icon))
                    tile.icon = icon;
                else if (/^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]{1,60000}$/.test(icon))
                    tile.icon = icon;
                target.push(tile);
            } else if (entry.children) {
                const children = [];
                walk(Array.isArray(entry.children) ? entry.children : [], children);
                if (children.length)
                    target.push({title: (entry.title ?? 'Untitled').toString().slice(0, 60),
                                 children});
            }
        }
    };

    walk(source, out);
    return out;
}

/**
 * The first character as a grapheme — not as a code point. An emoji can be
 * made of several points (emoji with ZWJ, flags from two letters), and showing
 * only the first of them produces garbage. In the browser Intl.Segmenter does
 * this; in gjs it does not, there the first code point remains.
 */
export function grapheme(text) {
    const t = (text ?? '').trim();
    if (!t)
        return '';
    if (typeof Intl?.Segmenter === 'function') {
        for (const {segment} of new Intl.Segmenter(undefined, {granularity: 'grapheme'})
            .segment(t))
            return segment;
    }
    return [...t][0] ?? '';
}

/**
 * The possible icon addresses of a site, in the order in which one should try
 * them.
 *
 * /favicon.ico is the normal case. After it two paths that cannot be read out
 * in general: Home Assistant answers /favicon.ico with 404 and keeps its mark
 * under /static/icons, many sites carry it as /apple-touch-icon.png. A web app
 * manifest would be the cleaner way, but the page may not read a foreign
 * manifest — the browser will not let it, and <img> can only load one address,
 * not a parsed list.
 *
 * Deliberately a list and no further guessing: every address costs one attempt
 * on every load of the wall.
 */
export function iconCandidates(url, custom = '') {
    const base = /^(https?):\/\/([^/?#]+)/i.exec((url ?? '').trim());
    if (!base)
        return [];
    const root = `${base[1].toLowerCase()}://${base[2]}`;
    const own = (custom ?? '').trim();
    // A full address and an embedded image stay as they are, a path is hung on
    // the host.
    const path = /^(https?:\/\/|data:image\/)/i.test(own)
        ? own
        : own ? (own.startsWith('/') ? own : `/${own}`) : '';

    // The www stays: the host that was booked is the one asked. Some sites have
    // their icon only under one of the two spellings.
    return [...new Set([
        path && path.startsWith('/') ? `${root}${path}` : path,
        `${root}/favicon.ico`,
        `${root}/apple-touch-icon.png`,
        `${root}/static/icons/favicon-192x192.png`,
    ].filter(Boolean))];
}

/**
 * The glyph on the tile: first the one set by hand, otherwise the first
 * character of the title. A title that starts with an emoji shows that emoji;
 * one that starts with a letter shows the letter.
 */
export function glyph(title, custom) {
    const own = (custom ?? '').trim();
    if (own)
        return own;
    return grapheme(title).toUpperCase() || '#';
}


/**
 * Flattens all tiles out of a list, without folders.
 *
 * The user did not want collapsible folders on the wall: a file of bookmarks
 * brings its folder structure with it, and on a screen that is only meant to
 * show where one clicks, that gets in the way. So everything is spread flat,
 * down to the deepest level. Empty folders fall away.
 */
export function flatten(tiles) {
    const out = [];
    const walk = (list) => {
        for (const t of list) {
            if (t.url)
                out.push(t);
            else
                walk(t.children ?? []);
        }
    };
    walk(tiles);
    return out;
}

/** Counts tiles, folders included. */
export function count(tiles) {
    let n = 0;
    for (const t of tiles) {
        n += t.url ? 1 : 1 + count(t.children ?? []);
    }
    return n;
}


/**
 * Decides whether the browser has any tiles at all yet.
 *
 * An empty list counts as nothing: if the wall never held anything, the page
 * fetches tiles.json from the server. Otherwise the wall would stay empty
 * forever after the first empty call, because localStorage remembers the empty
 * list.
 */
export function hasLocalTiles(raw) {
    if (!raw)
        return false;
    try {
        return count(normalize(raw)) > 0;
    } catch (e) {
        return false;
    }
}

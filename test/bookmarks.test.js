// Checks the logic of the tile wall without a browser.
//
// Node has no DOMParser. A minimal DOM is therefore rebuilt that produces
// exactly the structure a browser makes from the Netscape format: every <DT>
// becomes a node, H3/DL/A move into it, and the content of a folder stands as a
// sibling of its name. That separation is what makes fromBookmarks() usable —
// and it is exactly what has to be rebuilt here.
import { describe, expect, it } from 'vitest';

import {
    fromBookmarks, normalize, grapheme, glyph, count, hasLocalTiles,
    iconCandidates, flatten,
} from '../site/bookmarks.js';

// ---- Minimal DOM -------------------------------------------------------

class Node {
    constructor(tag) {
        this.tagName = tag.toUpperCase();
        this.children = [];
        this.textContent = '';
        this.attrs = {};
        this.kind = tag;
    }

    getAttribute(name) { return this.attrs[name] ?? null; }

    querySelector(sel) {
        const wanted = sel.replace(':scope > ', '');
        for (const child of this.children) {
            if (child.kind === wanted)
                return child;
        }
        return null;
    }

    *walk() {
        for (const child of this.children) {
            yield child;
            yield* child.walk();
        }
    }

    addText(text) { this.textContent += text; }
}

class Document {
    constructor() { this.body = new Node('body'); }

    querySelectorAll(sel) {
        const wanted = sel.replace(/^body > /, '');
        const hits = [];
        for (const child of this.body.walk())
            if (child.kind === wanted)
                hits.push(child);
        return hits;
    }
}

function parse(text) {
    const document = new Document();
    const dlStack = [{ node: document.body }];
    let dt = null;
    let openText = null;

    const pattern = /<(\/)?([a-z0-9]+)\b([^>]*?)>([^<]*)/gi;
    let m;
    while ((m = pattern.exec(text)) !== null) {
        const [, closing, rawTag, attr, content] = m;
        const tag = rawTag.toLowerCase();

        if (content && openText) {
            openText.addText(content);
            openText = null;
        }
        if (closing) {
            if (tag === 'dl')
                dlStack.pop();
            else if (tag === 'dt')
                dt = null;
            continue;
        }

        const parent = dlStack[dlStack.length - 1].node;
        const attach = node => {
            if (dt) {
                dt.children.push(node);
                dt = null;
            } else {
                parent.children.push(node);
            }
            return node;
        };

        if (tag === 'dt') {
            dt = new Node('dt');
            parent.children.push(dt);
        } else if (tag === 'dl') {
            dlStack.push({ node: attach(new Node('dl')) });
        } else if (tag === 'h3' || tag === 'a') {
            const n = attach(new Node(tag));
            if (tag === 'a') {
                const href = /href\s*=\s*"([^"]*)"/i.exec(attr ?? '');
                n.attrs.href = href ? href[1] : '';
            }
            // The text stands in the same hit as the opening tag.
            if (content)
                n.addText(content);
            openText = null;
        }
    }
    return document;
}

// ---- Checks ------------------------------------------------------------

// This is how Chrome builds its export: name and content of a folder as
// siblings.
const SAMPLE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><H3>Bookmarks bar</H3>
    <DL><p>
        <DT><H3>Tech</H3>
        <DL><p>
            <DT><A HREF="https://gnome.org/">GNOME</A>
        </DL><p>
        <DT><A HREF="https://wiki.example/">Wiki</A>
    </DL><p>
</DL><p>
`;

// Some programs put the name inside the DL.
const SAMPLE_INSIDE = `<DL><p>
    <DT><DL><p>
        <DT><H3>Tech</H3>
        <DT><A HREF="https://gnome.org/">GNOME</A>
    </DL><p></DT>
</DL><p>
`;

// Count URLs in folders too, otherwise they cannot be seen.
function allUrls(tiles) {
    const out = [];
    for (const t of tiles)
        out.push(...(t.url ? [t.url] : allUrls(t.children ?? [])));
    return out.sort();
}

describe('fromBookmarks', () => {
    const tiles = fromBookmarks(SAMPLE, parse(SAMPLE));

    it('finds the URLs', () => {
        expect(allUrls(tiles)).toEqual(['https://gnome.org/', 'https://wiki.example/']);
    });
    it('groups a folder', () => {
        expect(tiles.filter(t => !t.url).map(t => t.title)).toEqual(['Tech']);
        expect(tiles.find(t => t.title === 'Tech')?.children?.length).toBe(1);
    });
    it('unwraps the wrapper folder', () => {
        expect(tiles.some(t => t.title === 'Bookmarks bar')).toBe(false);
    });
    it('reads a name inside the DL', () => {
        const inside = fromBookmarks(SAMPLE_INSIDE, parse(SAMPLE_INSIDE));
        expect(inside.find(t => t.title === 'Tech')?.children?.length).toBe(1);
    });
});

describe('normalize', () => {
    it('drops invalid addresses', () => {
        expect(normalize({ tiles: [{ title: 'a', url: 'javascript:alert(1)' },
                                   { title: 'b', url: 'https://ok.example/' }] })
            .map(t => t.url)).toEqual(['https://ok.example/']);
    });
    it('keeps duplicate addresses only once', () => {
        expect(normalize({ tiles: [{ title: 'x', url: 'https://a.example/' },
                                   { title: 'y', url: 'https://a.example/' }] }).length).toBe(1);
    });
    it('trims whitespace', () => {
        expect(normalize({ tiles: [{ title: 'x', url: '  https://a.example/  ' }] })[0].url)
            .toBe('https://a.example/');
    });
    it('drops an address with a space', () => {
        expect(normalize({ tiles: [{ title: 'x', url: 'https://a example/' }] })).toEqual([]);
    });
    it('drops an empty folder', () => {
        expect(normalize({ tiles: [{ title: 'empty', children: [] }] })).toEqual([]);
    });
    it('keeps a self-set glyph in the tile', () => {
        expect(normalize({ tiles: [{ title: 'Ice', url: 'https://ice.example/',
                                     glyph: '🧊' }] })[0].glyph).toBe('🧊');
    });
    it('adds no field without a glyph', () => {
        expect(normalize({ tiles: [{ title: 'a', url: 'https://a.example/' }] })[0].glyph)
            .toBeUndefined();
    });
    it('shortens a long glyph', () => {
        expect(normalize({ tiles: [{ title: 'a', url: 'https://a.example/',
                                     glyph: 'abcdefghijk' }] })[0].glyph).toBe('abcdefgh');
    });
    it('accepts an embedded image as icon', () => {
        const embedded = 'data:image/png;base64,iVBORw0KGgo=';
        expect(normalize({ tiles: [{ title: 'n', url: 'https://n/', icon: embedded }] })[0].icon)
            .toBe(embedded);
    });
    it('accepts an svg from a CDN as icon', () => {
        expect(normalize({ tiles: [{ title: 'i', url: 'https://ing.de/',
                                     icon: 'https://cdn.ing.de/i/icon.svg' }] })[0].icon)
            .toBe('https://cdn.ing.de/i/icon.svg');
    });
    it.each([
        ['javascript:alert(1)'],
        ['not allowed'],
    ])('drops %s as icon', (icon) => {
        expect(normalize({ tiles: [{ title: 'x', url: 'https://x/', icon }] })[0].icon)
            .toBeUndefined();
    });
});

describe('glyph', () => {
    it('comes from the title', () => expect(glyph('gnome')).toBe('G'));
    it('falls back to #', () => expect(glyph('')).toBe('#'));
    it('keeps an emoji from the title', () => expect(glyph('🧊 Eis')).toBe('🧊'));
    it('prefers the own glyph', () => expect(glyph('GNOME', '🐧')).toBe('🐧'));
    it('trims the own glyph', () => expect(glyph('GNOME', '  🐧  ')).toBe('🐧'));
    it('puts the own glyph first', () => expect(glyph('Ice', '❄')).toBe('❄'));
    it('grapheme of blanks is empty', () => expect(grapheme('   ')).toBe(''));
});

describe('iconCandidates', () => {
    it('orders the candidates', () => {
        expect(iconCandidates('https://www.example.org/path?x=1')).toEqual([
            'https://www.example.org/favicon.ico',
            'https://www.example.org/apple-touch-icon.png',
            'https://www.example.org/static/icons/favicon-192x192.png',
        ]);
    });
    it('finds nothing without an address', () => {
        expect(iconCandidates('no address')).toEqual([]);
    });
    it('keeps http, as the service speaks it', () => {
        expect(iconCandidates('http://pi.lan:8123/')[0]).toBe('http://pi.lan:8123/favicon.ico');
    });
    it('finds nothing without a scheme', () => {
        expect(iconCandidates('example.org')).toEqual([]);
    });
    it('keeps www as booked', () => {
        expect(iconCandidates('https://www.example.org/')[0])
            .toBe('https://www.example.org/favicon.ico');
    });
    it('puts an own icon path first', () => {
        expect(iconCandidates('https://ha.local:8123/', 'static/icons/favicon-192x192.png')[0])
            .toBe('https://ha.local:8123/static/icons/favicon-192x192.png');
    });
    it('accepts an own path with a leading slash', () => {
        expect(iconCandidates('https://ha.local/', '/only/so.png')[0])
            .toBe('https://ha.local/only/so.png');
    });
    it('keeps an own icon address as it is', () => {
        expect(iconCandidates('https://ha.local/', 'https://other.example/i.png')[0])
            .toBe('https://other.example/i.png');
    });
    it('drops duplicate candidates', () => {
        expect(iconCandidates('https://x/', 'favicon.ico').length).toBe(3);
    });
    it('keeps an embedded image as it is', () => {
        const embedded = 'data:image/png;base64,iVBORw0KGgo=';
        expect(iconCandidates('https://notion.site/', embedded)[0]).toBe(embedded);
    });
});

describe('count and flatten', () => {
    it('counts folders too', () => {
        expect(count([{ url: 'https://a/' }, { title: 'o', children: [
            { url: 'https://b/' }, { url: 'https://c/' }] }])).toBe(4);
    });
    it('flattens folders away', () => {
        expect(flatten([{ url: 'https://a/' }, { title: 'o', children: [
            { url: 'https://b/' }] }]).map(t => t.url))
            .toEqual(['https://a/', 'https://b/']);
    });
});

describe('hasLocalTiles', () => {
    it('counts an empty list as nothing stored', () => {
        expect(hasLocalTiles({ version: 1, saved: 'x', tiles: [] })).toBe(false);
    });
    it('counts a list with tiles as stored', () => {
        expect(hasLocalTiles({ version: 1, tiles: [{ title: 'a', url: 'https://a/' }] }))
            .toBe(true);
    });
    it('counts a folder without content as nothing', () => {
        expect(hasLocalTiles({ version: 1, tiles: [{ title: 'empty', children: [] }] }))
            .toBe(false);
    });
    it('counts a missing entry as nothing', () => {
        expect(hasLocalTiles(null)).toBe(false);
    });
    it('counts a broken entry as nothing', () => {
        expect(hasLocalTiles('nonsense')).toBe(false);
    });
});

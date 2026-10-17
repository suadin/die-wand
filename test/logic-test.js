// Checks the logic of the tile wall without a browser.
//
// gjs has no DOMParser. A minimal DOM is therefore rebuilt that produces
// exactly the structure a browser makes from the Netscape format: every <DT>
// becomes a node, H3/DL/A move into it, and the content of a folder stands as a
// sibling of its name. That separation is what makes fromBookmarks() usable —
// and it is exactly what has to be rebuilt here.
import GLib from 'gi://GLib';

// The path comes from the environment; otherwise from the location of this
// file. A fixed path would be wrong here: it names the user name and the
// folder in which the repository lies on this machine, which differ elsewhere.
const file = GLib.getenv('TEST_LOGIC')
    ?? decodeURIComponent(new URL('../site/logic.js', import.meta.url).pathname);
const {fromBookmarks, normalize, grapheme, glyph, count, hasLocalTiles,
       iconCandidates, flatten}
    = await import(`file://${file}`);

let fails = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok)
        fails++;
    print(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${JSON.stringify(got)}` +
        (ok ? '' : ` (expected ${JSON.stringify(want)})`));
}

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
    const dlStack = [{node: document.body}];
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
            dlStack.push({node: attach(new Node('dl'))});
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

const tiles = fromBookmarks(SAMPLE, parse(SAMPLE));
check('URLs found', allUrls(tiles),
    ['https://gnome.org/', 'https://wiki.example/']);
check('folder as group', tiles.filter(t => !t.url).map(t => t.title), ['Tech']);
check('group content', tiles.find(t => t.title === 'Tech')?.children?.length, 1);
check('wrapper is unwrapped', tiles.some(t => t.title === 'Bookmarks bar'), false);

const inside = fromBookmarks(SAMPLE_INSIDE, parse(SAMPLE_INSIDE));
check('name inside the DL is read', inside.find(t => t.title === 'Tech')?.children?.length, 1);

check('invalid addresses fall away',
    normalize({tiles: [{title: 'a', url: 'javascript:alert(1)'},
                       {title: 'b', url: 'https://ok.example/'}]})
        .map(t => t.url),
    ['https://ok.example/']);

check('duplicate addresses only once',
    normalize({tiles: [{title: 'x', url: 'https://a.example/'},
                       {title: 'y', url: 'https://a.example/'}]}).length, 1);

check('whitespace is trimmed',
    normalize({tiles: [{title: 'x', url: '  https://a.example/  '}]})[0].url,
    'https://a.example/');

check('address with a space falls away',
    normalize({tiles: [{title: 'x', url: 'https://a example/'}]}), []);

check('empty folder falls away',
    normalize({tiles: [{title: 'empty', children: []}]}), []);

check('glyph from the title', glyph('gnome'), 'G');
check('empty glyph', glyph(''), '#');
check('emoji from the title is kept', glyph('🧊 Eis'), '🧊');
check('own glyph takes precedence', glyph('GNOME', '🐧'), '🐧');
check('own glyph is trimmed', glyph('GNOME', '  🐧  '), '🐧');
check('own glyph first', glyph('Ice', '❄'), '❄');
check('grapheme empty', grapheme('   '), '');

// A self-set glyph must survive normalize().
const withGlyph = normalize({tiles: [{title: 'Ice', url: 'https://ice.example/',
                                      glyph: '🧊'}]});
check('glyph stays in the tile', withGlyph[0].glyph, '🧊');
check('no field without a glyph', normalize({tiles: [
    {title: 'a', url: 'https://a.example/'}]})[0].glyph, undefined);
check('long glyph is shortened',
    normalize({tiles: [{title: 'a', url: 'https://a.example/',
                        glyph: 'abcdefghijk'}]})[0].glyph, 'abcdefgh');

check('icon candidates in the right order',
    iconCandidates('https://www.example.org/path?x=1'), [
        'https://www.example.org/favicon.ico',
        'https://www.example.org/apple-touch-icon.png',
        'https://www.example.org/static/icons/favicon-192x192.png',
    ]);
check('icon without an address', iconCandidates('no address'), []);
check('icon over http, as the service speaks it',
    iconCandidates('http://pi.lan:8123/')[0],
    'http://pi.lan:8123/favicon.ico');
check('icon without a scheme', iconCandidates('example.org'), []);
check('icon with www stays as booked', iconCandidates('https://www.example.org/')[0],
    'https://www.example.org/favicon.ico');
check('own icon path comes first',
    iconCandidates('https://ha.local:8123/', 'static/icons/favicon-192x192.png')[0],
    'https://ha.local:8123/static/icons/favicon-192x192.png');
check('own icon path with a leading slash',
    iconCandidates('https://ha.local/', '/only/so.png')[0], 'https://ha.local/only/so.png');
check('own icon address stays as it is',
    iconCandidates('https://ha.local/', 'https://other.example/i.png')[0],
    'https://other.example/i.png');
check('duplicate candidates fall away',
    iconCandidates('https://x/', 'favicon.ico').length, 3);
const embedded = 'data:image/png;base64,iVBORw0KGgo=';
check('embedded image stays as it is',
    iconCandidates('https://notion.site/', embedded)[0], embedded);
check('embedded image is accepted', normalize({tiles: [
    {title: 'n', url: 'https://n/', icon: embedded}]})[0].icon, embedded);
check('svg from a CDN is accepted', normalize({tiles: [
    {title: 'i', url: 'https://ing.de/', icon: 'https://cdn.ing.de/i/icon.svg'}]})[0].icon,
    'https://cdn.ing.de/i/icon.svg');
check('javascript as icon falls away', normalize({tiles: [
    {title: 'x', url: 'https://x/', icon: 'javascript:alert(1)'}]})[0].icon, undefined);
check('nonsense as icon falls away', normalize({tiles: [
    {title: 'x', url: 'https://x/', icon: 'not allowed'}]})[0].icon, undefined);

check('count', count([{url: 'https://a/'}, {title: 'o', children: [
    {url: 'https://b/'}, {url: 'https://c/'}]}]), 4);

check('empty list counts as nothing stored',
    hasLocalTiles({version: 1, saved: 'x', tiles: []}), false);
check('list with tiles counts as stored',
    hasLocalTiles({version: 1, tiles: [{title: 'a', url: 'https://a/'}]}),
    true);
check('folder without content counts as nothing',
    hasLocalTiles({version: 1, tiles: [{title: 'empty', children: []}]}),
    false);
check('missing entry counts as nothing', hasLocalTiles(null), false);
check('broken entry counts as nothing', hasLocalTiles('nonsense'), false);

// The closing part belongs to the test: without it the check passes even on
// errors and reports nothing. That happened once during cleanup, because a
// block was removed along with a function it did not belong to.
print(fails === 0 ? '\nall green' : `\n${fails} errors`);
if (fails > 0)
    throw new Error(`${fails} errors`);

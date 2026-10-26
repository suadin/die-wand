// Checks the documentation reader without a browser. reader.js is pure, so gjs
// can load it directly; only main.js touches the DOM.
import GLib from 'gi://GLib';

const file = GLib.getenv('TEST_READER')
    ?? decodeURIComponent(new URL('../site/reader.js', import.meta.url).pathname);
const {docsHash, escapeHtml, iconFor, parseRoute, renderMarkdown, slugify,
       splitDocument, uniqueIcons}
    = await import(`file://${file}`);

let fails = 0;
let checks = 0;
function check(name, got, want) {
    checks++;
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok)
        fails++;
    print(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${JSON.stringify(got)}` +
        (ok ? '' : ` (expected ${JSON.stringify(want)})`));
}

check('slug from a heading', slugify('Install & setup!'), 'install-setup');
check('slug of nothing', slugify('---'), 'page');

const doc = splitDocument({
    slug: 'readme',
    title: 'README',
    markdown: '# DIE WAND\n\nHello.\n\n## Install\n\nText.\n\n## Tests\n\nGo.\n',
});
check('document slug stays', doc.slug, 'readme');
check('document title stays', doc.title, 'README');
check('overview holds the intro', doc.pages[0], {
    title: 'Overview', slug: 'overview', markdown: 'Hello.',
});
check('first section', doc.pages[1].title, 'Install');
check('second section', doc.pages[2].title, 'Tests');
check('level one is not repeated', doc.pages[1].markdown, 'Text.');

const repeated = splitDocument({
    slug: 'guide', title: 'GUIDE', markdown: '## Same\n\nA\n\n## Same\n\nB\n',
});
check('repeated headings get their own slug',
    repeated.pages.map(page => page.slug), ['same', 'same-2']);

check('docs address', docsHash('readme', 'install'), '#/docs/readme/install');
check('docs address without section', docsHash('readme'), '#/docs/readme');
check('route to a section', parseRoute('#/docs/readme/install'),
    {view: 'docs', doc: 'readme', section: 'install'});
check('route to a document', parseRoute('#/docs/guide'),
    {view: 'docs', doc: 'guide', section: null});
check('route to the wall', parseRoute(''), {view: 'wall'});
check('unknown route is the wall', parseRoute('#/elsewhere'), {view: 'wall'});

check('a play section gets the play icon', iconFor('▶ Play the game'), 'play');
check('a test section gets the flask icon', iconFor('Tests and metrics'), 'flask');
check('a security section gets the shield icon', iconFor('Security'), 'shield');
check('an unknown section gets the dot', iconFor('Something else'), 'dot');

const icons = uniqueIcons(['Overview', 'Tests', 'Tests', 'Something else']);
check('icons in one row are unique', new Set(icons).size, icons.length);
check('the first duplicate keeps its meaning', icons[0], 'book');
check('the second duplicate changes', icons[1] !== icons[2], true);

check('html is escaped', escapeHtml('<b>"x"</b>'),
    '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');

const html = renderMarkdown([
    'A **bold** word and `code`.',
    '',
    '- one',
    '- two',
    '',
    '| a | b |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
    '```',
    '<x>',
    '```',
    '',
    '[GUIDE](GUIDE.md#install), [jump](#tests) and [site](https://example.org/).',
].join('\n'));
check('bold is rendered', html.includes('<strong>bold</strong>'), true);
check('inline code is rendered', html.includes('<code>code</code>'), true);
check('bullet list is rendered', html.includes('<ul><li>one</li><li>two</li></ul>'), true);
check('table is rendered', html.includes('<th>a</th><th>b</th>'), true);
check('code block is escaped', html.includes('<pre><code>&lt;x&gt;</code></pre>'), true);
check('internal document link is marked',
    html.includes('data-doc-file="GUIDE.md"'), true);
check('same-page anchor is marked',
    html.includes('data-doc-anchor="#tests"'), true);
check('external link opens a new tab',
    html.includes('href="https://example.org/" target="_blank"'), true);

print(fails === 0 ? `\n${checks} checks\nall green` : `\n${checks} checks\n${fails} errors`);
if (fails > 0)
    throw new Error(`${fails} errors`);

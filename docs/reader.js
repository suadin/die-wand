// Reading the documentation without leaving the wall.
//
// Everything here is pure: splitting Markdown into pages, turning Markdown
// into HTML, and reading the address bar. The DOM lives in main.js, so gjs can
// check these functions without a browser.

const SLUG = /[^a-z0-9]+/g;

export function slugify(value) {
    return String(value ?? '').toLowerCase().replace(SLUG, '-').replace(/^-+|-+$/g, '')
        || 'page';
}

/**
 * One page per level-two heading, as in the rest of the workspace. Text before
 * the first heading becomes an overview page; the level-one title names the
 * document and is not repeated in the body.
 */
export function splitDocument({slug, title, markdown}) {
    const pages = [];
    const used = {};
    let currentTitle = 'Overview';
    let currentLines = [];

    const push = (pageTitle, lines) => {
        const body = lines.join('\n').trim();
        if (!body)
            return;
        let pageSlug = slugify(pageTitle);
        const seen = used[pageSlug] ?? 0;
        used[pageSlug] = seen + 1;
        if (seen)
            pageSlug = `${pageSlug}-${seen + 1}`;
        pages.push({title: pageTitle, slug: pageSlug, markdown: body});
    };

    for (const line of String(markdown ?? '').split('\n')) {
        if (line.startsWith('# ') && !pages.length && !currentLines.join('').trim())
            continue;
        const heading = /^##\s+(.+?)\s*$/.exec(line);
        if (heading) {
            push(currentTitle, currentLines);
            currentTitle = heading[1].trim();
            currentLines = [];
            continue;
        }
        currentLines.push(line);
    }
    push(currentTitle, currentLines);
    return {slug, title, pages};
}

/** The address of a reader view: `#/docs/readme/install`. */
export function docsHash(doc, section = null) {
    return section ? `#/docs/${doc}/${section}` : `#/docs/${doc}`;
}

/** Reads the address bar. An unknown or empty address shows the wall. */
export function parseRoute(hash) {
    const raw = String(hash ?? '').replace(/^#\/?/, '');
    const [kind, doc, section] = raw.split('/');
    if (kind === 'docs')
        return {view: 'docs', doc: doc || 'readme', section: section || null};
    return {view: 'wall'};
}

export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function inlineMarkdown(text) {
    const codes = [];
    let output = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
        codes.push(code);
        return `\u0000${codes.length - 1}\u0000`;
    });
    output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    output = output.replace(/\[([^\]]+)\]\((#[A-Za-z0-9-]+)\)/g,
        (_, label, anchor) => `<a href="#" data-doc-anchor="${escapeHtml(anchor)}">${label}</a>`);
    output = output.replace(/\[([^\]]+)\]\(([^)\s]+\.md)(#[A-Za-z0-9-]+)?\)/g,
        (_, label, path, anchor) => {
            const file = path.split('/').pop();
            return `<a href="#" data-doc-file="${escapeHtml(file)}"`
                + ` data-doc-anchor="${escapeHtml(anchor ?? '')}">${label}</a>`;
        });
    output = output.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    output = output.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    output = output.replace(/&lt;(https?:\/\/[^\s]+?)&gt;/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    return output.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${codes[Number(index)]}</code>`);
}

/** A small Markdown reader: headings, lists, code, tables, links, emphasis. */
export function renderMarkdown(markdown) {
    const lines = String(markdown ?? '').split('\n');
    const html = [];
    let fence = null;
    let list = null;
    let listItem = -1;
    let paragraph = [];
    let table = null;

    const flushParagraph = () => {
        if (!paragraph.length)
            return;
        html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
        paragraph = [];
    };
    const closeList = () => {
        if (list)
            html.push(`</${list}>`);
        list = null;
        listItem = -1;
    };
    const closeTable = () => {
        if (!table)
            return;
        const rows = table
            .filter(row => !/^\|?[\s:|-]+\|?$/.test(row))
            .map(row => row.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()));
        if (rows.length) {
            const [head, ...body] = rows;
            html.push(`<table><thead><tr>${head.map(cell => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>`);
            for (const row of body)
                html.push(`<tr>${row.map(cell => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`);
            html.push('</tbody></table>');
        }
        table = null;
    };
    const closeBlocks = () => {
        flushParagraph();
        closeList();
        closeTable();
    };

    for (const line of lines) {
        if (line.startsWith('```')) {
            if (fence === null) {
                closeBlocks();
                fence = [];
            } else {
                html.push(`<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`);
                fence = null;
            }
            continue;
        }
        if (fence !== null) {
            fence.push(line);
            continue;
        }
        if (!line.trim()) {
            closeBlocks();
            continue;
        }
        if (line.trimStart().startsWith('|')) {
            flushParagraph();
            closeList();
            table = table ?? [];
            table.push(line.trim());
            continue;
        }
        closeTable();
        if (list && /^\s{2,}\S/.test(line)) {
            html[listItem] = html[listItem].replace(/<\/li>$/,
                ` ${inlineMarkdown(line.trim())}</li>`);
            continue;
        }
        const heading = /^#{1,6}\s+(.*)$/.exec(line);
        if (heading) {
            closeBlocks();
            html.push(`<h4>${inlineMarkdown(heading[1])}</h4>`);
            continue;
        }
        const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
        if (bullet) {
            flushParagraph();
            if (list !== 'ul') {
                closeList();
                html.push('<ul>');
                list = 'ul';
            }
            html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
            listItem = html.length - 1;
            continue;
        }
        const ordered = /^\s*\d+\.\s+(.*)$/.exec(line);
        if (ordered) {
            flushParagraph();
            if (list !== 'ol') {
                closeList();
                html.push('<ol>');
                list = 'ol';
            }
            html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
            listItem = html.length - 1;
            continue;
        }
        closeList();
        paragraph.push(line.trim());
    }
    if (fence !== null)
        html.push(`<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`);
    closeBlocks();
    return html.join('');
}

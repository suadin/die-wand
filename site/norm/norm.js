// The Norm runtime. `mountNorm(options)` renders the footer and the
// documentation reader, and returns a handle. It owns no app content.
//
// Two shapes of app share this one runtime:
//  - a static page with a `#home` section: `autoRoute: true` (the default)
//    lets the runtime own the docs routing and toggle home against the reader.
//  - an app that draws its own views (gate, accounts, keys): `autoRoute:
//    false`. The app drives the handle — `open(slug, section)` fills the
//    reader, `close()` hides it — and keeps its own hashchange routing.
//
// No import may ever require this file by name (NORM-OPT-01): every check
// inspects the rendered page, not the module graph. Apps import it guarded.

import {
  composeSpecs,
  docsHash,
  parseRoute,
  renderMarkdown,
  splitDocument,
  uniqueIcons,
} from './reader.js';
import { icon } from './icons.js';
import { footerHtml, fillFooter } from './footer.js';

function baseName(file) {
  return String(file).split('/').pop();
}

const DEFAULT_DOCS = [
  { slug: 'readme', title: 'README', file: 'docs/README.md' },
  { slug: 'app-specs', title: 'SPECS', file: 'docs/APP-SPECS.md', changelog: 'docs/RELEASE-NOTES.md' },
  { slug: 'norm', title: 'NORM', file: 'norm/NORM.md' },
];

const READER_HTML = [
  '<section id="reader" hidden aria-label="Documentation">',
  '  <div class="reader-head">',
  '    <div>',
  '      <p class="eyebrow">Documentation</p>',
  '      <h2 id="reader-title">README</h2>',
  '    </div>',
  '    <button id="reader-close" class="button" type="button">Back</button>',
  '  </div>',
  '  <div id="reader-tabs" class="reader-tabs" role="tablist" aria-label="Documents"></div>',
  '  <nav id="reader-sections" class="reader-sections" aria-label="Sections"></nav>',
  '  <h3 id="reader-section-title" class="reader-section-title"></h3>',
  '  <article id="reader-body" class="reader-body"></article>',
  '</section>',
  '<div id="tooltip" class="tooltip" role="tooltip" hidden></div>',
].join('\n');

export async function mountNorm(options = {}) {
  const root = options.root ?? document;
  const doc = root.ownerDocument ?? root;
  const win = doc.defaultView ?? root;
  const app = options.app ?? { name: 'App', version: '0.0.0' };
  const normVersion = options.normVersion ?? '0.0.0';
  const source = options.source ?? '';
  const base = options.base ?? '';
  const docs = options.docs ?? DEFAULT_DOCS;
  const autoRoute = options.autoRoute ?? true;
  const homeHash = options.homeHash ?? '';

  const home = options.home ? root.querySelector(options.home) : root.querySelector('#home');
  if (!root.querySelector('#reader')) {
    if (!home) throw new Error('mountNorm: no #reader and no #home element found');
    home.insertAdjacentHTML('afterend', READER_HTML);
  }

  if (options.footer !== false) {
    const markup = footerHtml({ app, source, normVersion });
    const existing = root.querySelector('#norm-footer');
    if (existing) existing.outerHTML = markup;
    else doc.body.insertAdjacentHTML('beforeend', markup);
  }

  const elements = {
    home,
    reader: root.querySelector('#reader'),
    tabs: root.querySelector('#reader-tabs'),
    sections: root.querySelector('#reader-sections'),
    title: root.querySelector('#reader-title'),
    sectionTitle: root.querySelector('#reader-section-title'),
    body: root.querySelector('#reader-body'),
    tooltip: root.querySelector('#tooltip'),
  };

  const state = { docs: [], byslug: {}, current: null };
  let metricsData = {};

  // Which document a `.md` link points at, by basename: `CSV.md` -> `csv`.
  const docByFile = {};
  for (const spec of docs) {
    docByFile[baseName(spec.file)] = spec.slug;
    if (spec.changelog) docByFile[baseName(spec.changelog)] = spec.slug;
  }

  async function loadDocs() {
    const items = await Promise.all(docs.map(async (spec) => {
      const response = await fetch(base + spec.file);
      let markdown = await response.text();
      if (spec.changelog) {
        const notes = await fetch(base + spec.changelog);
        markdown = composeSpecs(markdown, await notes.text());
      }
      return splitDocument({ slug: spec.slug, title: spec.title, markdown });
    }));
    for (const item of items) state.byslug[item.slug] = item;
    return items;
  }

  function fillReader(slug, section = null) {
    const current = state.byslug[slug] ?? state.byslug.readme ?? state.docs[0];
    state.current = current;
    elements.title.textContent = current.title;
    elements.tabs.innerHTML = '';
    for (const item of state.docs) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = `reader-tab${item.slug === current.slug ? ' active' : ''}`;
      button.textContent = item.title;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(item.slug === current.slug));
      button.addEventListener('click', () => open(item.slug));
      elements.tabs.append(button);
    }
    const icons = uniqueIcons(current.pages.map((page) => page.title));
    elements.sections.innerHTML = '';
    current.pages.forEach((page, index) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'reader-section';
      button.dataset.tip = page.title;
      button.setAttribute('aria-label', page.title);
      button.innerHTML = icon(icons[index]);
      button.addEventListener('click', () => {
        win.history.pushState(null, '', docsHash(current.slug, page.slug));
        fillReader(current.slug, page.slug);
      });
      elements.sections.append(button);
    });
    const active = current.pages.find((page) => page.slug === section) ?? current.pages[0];
    for (const [index, button] of [...elements.sections.children].entries()) {
      button.classList.toggle('active', current.pages[index].slug === active.slug);
    }
    elements.sectionTitle.textContent = active.title;
    elements.body.innerHTML = renderMarkdown(active.markdown);
    if (current.slug === 'app-specs' || current.slug === 'norm') {
      renderRequirementTests(active.slug);
    }
    doc.title = `${current.title} — ${app.name}`;
  }

  // NORM-READER-02: the automated test list stays inside the documentation
  // card, below the body. The metrics file carries `requirements`, a map from
  // section slug to the unit and e2e names that protect the rules there.
  function readableTestName(name) {
    return String(name).startsWith('test_') ? String(name).slice(5).replace(/_/g, ' ') : name;
  }

  function renderRequirementTests(slug) {
    const groups = metricsData?.requirements?.[slug];
    if (!groups) return;
    const box = doc.createElement('section');
    box.className = 'doc-tests';
    const heading = doc.createElement('h4');
    heading.textContent = 'Automated tests';
    box.append(heading);
    const unit = groups.unit ?? [];
    const e2e = groups.e2e ?? [];
    if (!unit.length && !e2e.length) {
      const empty = doc.createElement('p');
      empty.textContent = 'No automated test names this requirement yet.';
      box.append(empty);
    }
    for (const [label, names] of [['Unit', unit], ['E2E', e2e]]) {
      if (!names.length) continue;
      const group = doc.createElement('div');
      group.className = 'doc-test-group';
      const kind = doc.createElement('span');
      kind.className = 'doc-test-kind';
      kind.textContent = `${label} · ${names.length}`;
      const list = doc.createElement('ol');
      for (const name of names) {
        const item = doc.createElement('li');
        item.textContent = label === 'Unit' ? readableTestName(name) : name;
        list.append(item);
      }
      group.append(kind, list);
      box.append(group);
    }
    elements.body.append(box);
  }

  function open(slug, section = null) {
    elements.reader.hidden = false;
    fillReader(slug, section);
  }

  function close() {
    elements.reader.hidden = true;
  }

  function showReader(slug, section) {
    if (home) home.hidden = true;
    open(slug, section);
  }

  function showHome() {
    if (home) home.hidden = false;
    elements.reader.hidden = true;
  }

  function readerLink(event) {
    const link = event.target.closest?.('a[data-doc-file], a[data-doc-anchor]');
    if (!link) return;
    event.preventDefault();
    const slug = (link.dataset.docFile && docByFile[link.dataset.docFile]) || state.current?.slug || 'readme';
    const target = state.byslug[slug] ?? state.byslug.readme;
    if (!target) return;
    const anchor = String(link.dataset.docAnchor ?? '').replace(/^#/, '');
    const section = anchor && target.pages.some((page) => page.slug === anchor) ? anchor : null;
    win.history.pushState(null, '', docsHash(slug, section));
    fillReader(slug, section);
  }

  function tooltipFor(target) {
    const text = target.dataset.tip;
    if (!text) return;
    elements.tooltip.textContent = text;
    elements.tooltip.hidden = false;
    elements.tooltip.toggleAttribute('data-wide', target.hasAttribute('data-tip-wide'));
    const box = target.getBoundingClientRect();
    const width = elements.tooltip.offsetWidth;
    const height = elements.tooltip.offsetHeight;
    const left = Math.min(Math.max(8, box.left + box.width / 2 - width / 2), win.innerWidth - width - 8);
    // Above the target normally; a header button is too close to the top, and a
    // tooltip clamped to the edge would cover the very thing it describes.
    const above = box.top - height - 10;
    const below = above < 8;
    elements.tooltip.style.left = `${left}px`;
    elements.tooltip.style.top = `${below ? box.bottom + 10 : above}px`;
    elements.tooltip.toggleAttribute('data-below', below);
    elements.tooltip.style.setProperty('--arrow', `${box.left + box.width / 2 - left}px`);
  }

  const onOver = (event) => {
    const target = event.target.closest?.('[data-tip]');
    if (target) tooltipFor(target);
  };
  const onOut = (event) => {
    if (event.target.closest?.('[data-tip]')) elements.tooltip.hidden = true;
  };
  const onFocusOut = () => { elements.tooltip.hidden = true; };

  doc.addEventListener('mouseover', onOver);
  doc.addEventListener('mouseout', onOut);
  doc.addEventListener('focusin', onOver);
  doc.addEventListener('focusout', onFocusOut);
  elements.body?.addEventListener('click', readerLink);

  const click = (selector, handler) => {
    const el = root.querySelector(selector);
    if (el) el.addEventListener('click', handler);
  };
  click('#readme', () => { win.location.hash = docsHash('readme'); });
  click('#specs', () => { win.location.hash = docsHash('app-specs'); });
  click('#norm', () => { win.location.hash = docsHash('norm'); });
  click('#reader-close', () => {
    win.location.hash = typeof homeHash === 'function' ? homeHash() : homeHash;
  });
  click('#theme', () => {
    doc.documentElement.style.colorScheme = doc.documentElement.style.colorScheme === 'dark' ? 'light' : 'dark';
  });

  let route = null;
  if (autoRoute) {
    route = () => {
      const parsed = parseRoute(win.location?.hash ?? '');
      if (parsed.view === 'docs') showReader(parsed.doc, parsed.section);
      else showHome();
    };
    win.addEventListener('hashchange', route);
    win.addEventListener('popstate', route);
  }

  state.docs = await loadDocs();
  metricsData = await loadMetrics(options.metrics);
  fillFooter(root, { app, normVersion, metrics: metricsData });
  if (route) route();

  return {
    open,
    close,
    unmount: () => {
      doc.removeEventListener('mouseover', onOver);
      doc.removeEventListener('mouseout', onOut);
      doc.removeEventListener('focusin', onOver);
      doc.removeEventListener('focusout', onFocusOut);
      elements.body?.removeEventListener('click', readerLink);
      if (route) {
        win.removeEventListener('hashchange', route);
        win.removeEventListener('popstate', route);
      }
      root.querySelector('#norm-footer')?.remove();
      root.querySelector('#reader')?.remove();
      root.querySelector('#tooltip')?.remove();
    },
  };
}

async function loadMetrics(metrics) {
  if (metrics && typeof metrics === 'object') return metrics;
  if (!metrics) return {};
  try {
    const response = await fetch(metrics);
    return response.ok ? await response.json() : {};
  } catch {
    return {};
  }
}

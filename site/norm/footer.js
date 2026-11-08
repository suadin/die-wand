// The footer: one centred line, six items, four icons, no repeats. `footerHtml`
// builds the skeleton; `fillFooter` writes the values that are known later
// (versions and the measured metrics). All DOM stays here so the reader never
// touches the footer and an app can replace one without the other.

import { icon } from './icons.js';
import { appVersionTip, metricLabel, normVersionTip, tipFor } from './metrics.js';

export function sourceLabel(url) {
  if (!url) return '';
  return String(url)
    .replace(/^https?:\/\//, '')
    .replace(/^github\.com\//, '')
    .replace(/\/+$/, '');
}

export function footerHtml({ app, source, normVersion }) {
  const sourceName = sourceLabel(source);
  return [
    '<footer class="footer" id="norm-footer">',
    '  <div class="footer-items">',
    `    <button id="readme" class="footer-item" type="button" data-tip="Read the documentation">`,
    `      ${icon('book')}<span>README</span>`,
    '    </button>',
    '    <span class="footer-sep" aria-hidden="true">|</span>',
    `    <button id="specs" class="footer-item" type="button" data-tip="${appVersionTip(app.name, app.version)}" aria-label="${app.name} ${app.version}, open SPECS">`,
    `      ${app.logo ? `<img class="footer-logo" src="${app.logo}" alt="">` : icon('book')}`,
    '      <span id="app-version"></span>',
    '    </button>',
    '    <span class="footer-sep" aria-hidden="true">|</span>',
    `    <button id="norm" class="footer-item" type="button" data-tip="${normVersionTip(normVersion)}" aria-label="Norm ${normVersion}, open NORM">`,
    `      ${icon('norm')}<span id="norm-version"></span>`,
    '    </button>',
    '    <span class="footer-sep" aria-hidden="true">|</span>',
    '    <span class="footer-item">',
    `      ${icon('chevrons')}<span>source: ${sourceName ? `<a href="${source}" target="_blank" rel="noopener noreferrer">${sourceName}</a>` : '—'}</span>`,
    '    </span>',
    '    <span class="footer-sep" aria-hidden="true">|</span>',
    '    <span class="footer-item" id="unit-metrics" data-tip-wide>',
    `      ${icon('clipboard')}<span id="unit-label">Unit not executed</span>`,
    '    </span>',
    '    <span class="footer-sep" aria-hidden="true">|</span>',
    '    <span class="footer-item" id="e2e-metrics" data-tip-wide>',
    `      ${icon('browser')}<span id="e2e-label">E2E not executed</span>`,
    '    </span>',
    '  </div>',
    '</footer>',
  ].join('\n');
}

export function fillFooter(root, { app, normVersion, metrics }) {
  const version = root.querySelector('#app-version');
  if (version) version.textContent = app.version;
  const norm = root.querySelector('#norm-version');
  if (norm) norm.textContent = normVersion;

  const unit = root.querySelector('#unit-label');
  const unitItem = root.querySelector('#unit-metrics');
  const e2e = root.querySelector('#e2e-label');
  const e2eItem = root.querySelector('#e2e-metrics');

  const fill = (label, item, name, metricsItem) => {
    if (!metricsItem) {
      label.textContent = `${name} not executed`;
      item.dataset.tip = 'not executed';
      item.classList.add('danger');
    } else {
      label.textContent = metricLabel(name, metricsItem);
      item.dataset.tip = tipFor(metricsItem);
      item.classList.remove('danger');
    }
  };

  if (unit) fill(unit, unitItem, 'Unit', metrics?.unit);
  if (e2e) fill(e2e, e2eItem, 'E2E', metrics?.e2e);
}

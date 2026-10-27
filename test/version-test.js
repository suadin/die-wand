// Checks the version state without a browser.
import GLib from 'gi://GLib';

const file = GLib.getenv('TEST_VERSION')
    ?? decodeURIComponent(new URL('../site/version.js', import.meta.url).pathname);
const {basicVersionTip, compareVersions, parseVersion, updateState}
    = await import(`file://${file}`);

let fails = 0;
let checks = 0;
function check(name, got, want) {
    checks++;
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fails++;
    print(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${JSON.stringify(got)}` +
        (ok ? '' : ` (expected ${JSON.stringify(want)})`));
}

check('[BASIC-VERSION-03] parse', parseVersion('1.2.3'), [1, 2, 3]);
check('[BASIC-VERSION-03] compare', compareVersions('1.2.3', '1.2.2'), 1);
check('[BASIC-VERSION-03] minor stays neutral', updateState('1.0.2', '1.1.0'), 'newer');
check('[BASIC-VERSION-03] major turns red', updateState('1.0.2', '2.0.0'), 'major');
check('[BASIC-VERSION-03] current', updateState('1.1.0', '1.1.0'), 'current');
check('[BASIC-VERSION-04] unknown', updateState('1.1.0', null), 'unknown');
check('[BASIC-VERSION-03] tooltip names latest', basicVersionTip('1.0.2', '2.0.0', 'major'),
    'Basic Specs 1.0.2\n2.0.0 available');
print(`${checks} checks`);
if (fails) throw new Error(`${fails} checks failed`);

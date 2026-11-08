// The footer's view of a test run: a label and a tooltip, plus the pieces to
// read the measured JSON shape. No DOM here — these stay pure for node tests.

export function metricLabel(name, item) {
  if (!item) return `${name} not executed`;
  const tests = item.tests ?? item.total ?? 0;
  if (!tests) return `${name} not executed`;
  const coverage = item.coverage == null ? 'coverage not measured' : `${item.coverage} %`;
  const failures = item.failures ?? item.failed ?? 0;
  return `${name} ${tests} · ${coverage}${failures ? ` · ${failures} fail` : ''}`;
}

export function tipFor(item) {
  if (!item) return 'not executed';
  const measured = item.measuredAt ?? item.measured ?? '—';
  const duration = item.durationSeconds ?? item.duration ?? null;
  const perTest = item.perTest ?? null;
  const value = (number) => (number == null ? '—' : `${number} s`);
  return `Measured ${measured}\nDuration ${value(duration)}\nPer test ${value(perTest)}`;
}

export function appVersionTip(name, version) {
  return `${name} ${version} — open SPECS`;
}

export function normVersionTip(version) {
  return `Norm ${version} — the rules this app follows`;
}

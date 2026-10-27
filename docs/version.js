export const LATEST_URL = 'https://suadin.github.io/basic-specs/version.json';

export function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(value ?? '').trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

/** `major` is the only state that turns the Basic Specs item red. */
export function updateState(pinned, latest) {
  const current = parseVersion(pinned);
  const available = parseVersion(latest);
  if (!current || !available) return 'unknown';
  if (available[0] > current[0]) return 'major';
  if (compareVersions(latest, pinned) > 0) return 'newer';
  return 'current';
}

export function basicVersionTip(pinned, latest, state) {
  if (state === 'unknown') return `Basic Specs ${pinned ?? '—'} — latest not checked`;
  if (state === 'current') return `Basic Specs ${pinned} — current`;
  return `Basic Specs ${pinned}\n${latest} available`;
}

export function appVersionTip(name, version) {
  return `${name} ${version} — open SPECS`;
}

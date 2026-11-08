// The footer and reader line icons, keyed by name. `icon()` renders one as an
// inline SVG. `reader.js` maps section titles to these names.

export const ICONS = {
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z"/><path d="M8 8h8M8 12h8"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
  play: '<path d="m9 7 8 5-8 5Z"/>',
  install: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/>',
  sparkle: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
  sync: '<path d="M4 9a8 8 0 0 1 14-3l2 2M20 5v5h-5M20 15a8 8 0 0 1-14 3l-2-2M4 19v-5h5"/>',
  shield: '<path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  server: '<rect x="4" y="4" width="16" height="6" rx="1"/><rect x="4" y="14" width="16" height="6" rx="1"/><path d="M8 7h.01M8 17h.01"/>',
  pages: '<path d="M6 3h9l4 4v14H6V3Z"/><path d="M15 3v5h5M9 12h6M9 16h6"/>',
  home: '<path d="m3 11 9-8 9 8v10H3V11Z"/><path d="M9 21v-6h6v6"/>',
  flask: '<path d="M9 3h6M10 3v6L5 19a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3L14 9V3"/><path d="M8 15h8"/>',
  pen: '<path d="m4 20 4-1 11-11-3-3L5 16l-1 4Z"/>',
  scale: '<path d="M12 3v18M5 7h14M7 7l-3 6h6L7 7Zm10 0-3 6h6l-3-6Z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  plug: '<path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0V8ZM12 16v5"/>',
  tree: '<path d="M5 4v16M5 8h6M5 16h6M11 5v6M11 13v6"/>',
  gamepad: '<rect x="3" y="8" width="18" height="9" rx="4"/><path d="M8 10v4M6 12h4M16 11h.01M18 13h.01"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8.5 13l2.5 2.5L15.5 10"/>',
  browser: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="m10 12 5 3-5 3z"/>',
  chevrons: '<path d="m9 7.5-4.5 4.5L9 16.5M15 7.5l4.5 4.5L15 16.5"/>',
  norm: '<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 11 8 4 8-4M4 15l8 4 8-4"/>',
};

export function icon(name, size = 16) {
  const path = ICONS[name] ?? ICONS.dot;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

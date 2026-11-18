// آیکون‌های SVG یکپارچه (خطی، ۲۴×۲۴، رنگ از متن). بدون innerHTML؛ با DOM ساخته می‌شوند و برای صفحه‌خوان پنهان‌اند.
const NS = 'http://www.w3.org/2000/svg';

const SHAPES = {
  attach: [['path', { d: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48' }]],
  send: [['path', { d: 'M22 2L11 13' }], ['path', { d: 'M22 2l-7 20-4-9-9-4 20-7z' }]],
  copy: [['rect', { x: 9, y: 9, width: 13, height: 13, rx: 2 }], ['path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }]],
  trash: [['path', { d: 'M3 6h18' }], ['path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }], ['path', { d: 'M10 11v6' }], ['path', { d: 'M14 11v6' }], ['path', { d: 'M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2' }]],
  x: [['path', { d: 'M18 6L6 18' }], ['path', { d: 'M6 6l12 12' }]],
  file: [['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }], ['path', { d: 'M14 2v6h6' }]],
  image: [['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }], ['circle', { cx: 8.5, cy: 8.5, r: 1.5 }], ['path', { d: 'M21 15l-5-5L5 21' }]],
  download: [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }], ['path', { d: 'M7 10l5 5 5-5' }], ['path', { d: 'M12 15V3' }]],
  plus: [['path', { d: 'M12 5v14' }], ['path', { d: 'M5 12h14' }]],
  user: [['path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }], ['circle', { cx: 12, cy: 7, r: 4 }]],
  calendar: [['rect', { x: 3, y: 4, width: 18, height: 18, rx: 2 }], ['path', { d: 'M16 2v4' }], ['path', { d: 'M8 2v4' }], ['path', { d: 'M3 10h18' }]],
  book: [['path', { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' }], ['path', { d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' }]],
  home: [['path', { d: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }], ['path', { d: 'M9 22V12h6v10' }]],
  search: [['circle', { cx: 11, cy: 11, r: 8 }], ['path', { d: 'M21 21l-4.35-4.35' }]],
  'map-pin': [['path', { d: 'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z' }], ['circle', { cx: 12, cy: 10, r: 2.5 }]],
  grid: [['rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }], ['rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }], ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }], ['rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }]],
  mic: [['rect', { x: 9, y: 2, width: 6, height: 12, rx: 3 }], ['path', { d: 'M19 10v1a7 7 0 0 1-14 0v-1' }], ['path', { d: 'M12 18v4' }], ['path', { d: 'M8 22h8' }]],
  scale: [['path', { d: 'M12 3v18' }], ['path', { d: 'M7 21h10' }], ['path', { d: 'M4 7h16' }], ['path', { d: 'M4 7l-2.5 6a2.8 2.8 0 0 0 5 0z' }], ['path', { d: 'M20 7l-2.5 6a2.8 2.8 0 0 0 5 0z' }]],
  cap: [['path', { d: 'M22 10L12 5 2 10l10 5 10-5z' }], ['path', { d: 'M6 12v5c3 2 9 2 12 0v-5' }], ['path', { d: 'M22 10v6' }]],
  folder: [['path', { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' }]],
  receipt: [['path', { d: 'M6 2h12v20l-3-2-3 2-3-2-3 2z' }], ['path', { d: 'M9 7h6' }], ['path', { d: 'M9 11h6' }], ['path', { d: 'M9 15h4' }]],
  briefcase: [['rect', { x: 2, y: 7, width: 20, height: 14, rx: 2 }], ['path', { d: 'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16' }]],
  calculator: [['rect', { x: 4, y: 2, width: 16, height: 20, rx: 2 }], ['path', { d: 'M8 6h8' }], ['path', { d: 'M8 10h.01' }], ['path', { d: 'M12 10h.01' }], ['path', { d: 'M16 10h.01' }], ['path', { d: 'M8 14h.01' }], ['path', { d: 'M12 14h.01' }], ['path', { d: 'M16 14h.01' }], ['path', { d: 'M8 18h8' }]],
  news: [['path', { d: 'M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2' }], ['path', { d: 'M18 14h-8' }], ['path', { d: 'M15 18h-5' }], ['path', { d: 'M10 6h8v4h-8z' }]],
  chart: [['path', { d: 'M18 20V10' }], ['path', { d: 'M12 20V4' }], ['path', { d: 'M6 20v-6' }]],
  edit: [['path', { d: 'M12 20h9' }], ['path', { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' }]],
  gavel: [['path', { d: 'm14 13 7 7' }], ['path', { d: 'm5 4 7 7' }], ['path', { d: 'm8 2 6 6-4 4-6-6z' }], ['path', { d: 'm16 10 6 6-4 4-6-6z' }], ['path', { d: 'M2 22h12' }]],
  landmark: [['path', { d: 'm3 10 9-7 9 7' }], ['path', { d: 'M4 10h16' }], ['path', { d: 'M5 10v9' }], ['path', { d: 'M9 10v9' }], ['path', { d: 'M15 10v9' }], ['path', { d: 'M19 10v9' }], ['path', { d: 'M3 22h18' }], ['path', { d: 'M2 19h20' }]],
  users: [['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }], ['circle', { cx: 10, cy: 7, r: 4 }], ['path', { d: 'M20 21v-2a4 4 0 0 0-3-3.87' }], ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }]],
  'graduation-cap': [['path', { d: 'm2 10 10-5 10 5-10 5z' }], ['path', { d: 'M6 12v5c4 3 8 3 12 0v-5' }], ['path', { d: 'M22 10v6' }]],
  'volume-2': [['path', { d: 'M11 5 6 9H2v6h4l5 4z' }], ['path', { d: 'M15.5 8.5a5 5 0 0 1 0 7' }], ['path', { d: 'M19 5a10 10 0 0 1 0 14' }]],
  'file-text': [['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }], ['path', { d: 'M14 2v6h6' }], ['path', { d: 'M8 13h8' }], ['path', { d: 'M8 17h8' }], ['path', { d: 'M8 9h1' }]],
  headphones: [['path', { d: 'M3 14v-3a9 9 0 0 1 18 0v3' }], ['rect', { x: 2, y: 13, width: 5, height: 8, rx: 2 }], ['rect', { x: 17, y: 13, width: 5, height: 8, rx: 2 }]],
  info: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 16v-4' }], ['path', { d: 'M12 8h.01' }]],
  'clipboard-list': [['rect', { x: 5, y: 4, width: 14, height: 18, rx: 2 }], ['path', { d: 'M9 4V2h6v2' }], ['path', { d: 'M9 10h6' }], ['path', { d: 'M9 14h6' }], ['path', { d: 'M9 18h3' }]],
  'user-round': [['circle', { cx: 12, cy: 8, r: 5 }], ['path', { d: 'M20 21a8 8 0 0 0-16 0' }]],
  'arrow-left': [['path', { d: 'M19 12H5' }], ['path', { d: 'm12 19-7-7 7-7' }]],
  'arrow-right': [['path', { d: 'M5 12h14' }], ['path', { d: 'm12 5 7 7-7 7' }]],
  'arrow-up-left': [['path', { d: 'M17 17 7 7' }], ['path', { d: 'M7 17V7h10' }]],
  'shield-check': [['path', { d: 'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z' }], ['path', { d: 'm9 12 2 2 4-4' }]],
};

export const ICON_NAMES = Object.freeze(Object.keys(SHAPES));

/** @param {string} name یکی از ICON_NAMES  @param {{size?:number}} [opts] */
export function icon(name, { size = 20 } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
    'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: 'icon',
  })) svg.setAttribute(k, String(v));
  for (const [tag, attrs] of SHAPES[name] || []) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.append(el);
  }
  return svg;
}

/** هر عنصر دارای data-icon="نام" را با آیکون SVG همان نام پر می‌کند (برای HTML ایستا). اندازه از data-icon-size یا ۲۴. */
export function mountIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    const size = Number(el.getAttribute('data-icon-size')) || 24;
    el.replaceChildren(icon(el.getAttribute('data-icon'), { size }));
  }
}

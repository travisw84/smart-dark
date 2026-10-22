import { composite, classify, luminance } from "./core.js";
import { resolveColor } from "./color.js";
let compatibilityActive = false;
export function setCompatibilityActive(value) {
  compatibilityActive = value;
}
export function effectiveBackground(el) {
  const layers = [];
  let node = el;
  while (node && layers.length < 24) {
    const c = resolveColor(getComputedStyle(node).backgroundColor);
    if (c) {
      layers.push(c);
      if (c[3] >= 1) break;
    }
    node = node.parentElement || node.getRootNode()?.host;
  }
  let bg =
    getComputedStyle(document.documentElement).colorScheme === "dark"
      ? [18, 18, 18, 1]
      : [255, 255, 255, 1];
  for (let i = layers.length - 1; i >= 0; i--) bg = composite(layers[i], bg);
  return bg;
}
export function withOriginalStyles(fn) {
  const sheets = [
    ...document.querySelectorAll(
      compatibilityActive
        ? "style[data-smart-dark-sheet],style.darkreader"
        : "style[data-smart-dark-sheet]",
    ),
  ]
    .map((s) => s.sheet)
    .filter(Boolean);
  const previous = sheets.map((s) => s.disabled);
  sheets.forEach((s) => {
    s.disabled = true;
  });
  try {
    return fn();
  } finally {
    sheets.forEach((s, i) => {
      s.disabled = previous[i];
    });
  }
}
export function measure() {
  return withOriginalStyles(() => {
    const samples = [];
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 5; x++) {
        let el = document.elementFromPoint(
          (innerWidth * (x + 0.5)) / 5,
          (innerHeight * (y + 0.5)) / 4,
        );
        if (!el || el.closest("img,video,canvas,svg,picture")) continue;
        const st = getComputedStyle(el),
          fg = resolveColor(st.color);
        if (!fg) continue;
        samples.push({
          bg: effectiveBackground(el),
          fg,
          weight: el.closest('main,article,[role="main"]') ? 1.5 : 1,
        });
      }
    const root = document.documentElement;
    return {
      ...classify(samples, {
        dark:
          root.matches('.dark,[data-theme="dark"],[data-color-mode="dark"]') ||
          getComputedStyle(root).colorScheme === "dark",
      }),
      samples,
    };
  });
}
export function hasSensitiveInputs() {
  return [
    ...document.querySelectorAll(
      'input[type="password"],input[autocomplete^="cc-"],input[autocomplete="one-time-code"]',
    ),
  ].some((e) => e.getClientRects().length > 0);
}

// A coarse label for how the visible part of the page looks without our theme.
// Jev results are only applied if this label has not changed in the meantime.
export function viewBucket() {
  return withOriginalStyles(() => {
    let light = 0,
      dark = 0,
      total = 0;
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 4; x++) {
        const el = document.elementFromPoint(
          (innerWidth * (x + 0.5)) / 4,
          (innerHeight * (y + 0.5)) / 3,
        );
        if (!el || el.closest("img,video,canvas,svg,picture")) continue;
        total++;
        const l = luminance(effectiveBackground(el));
        if (l > 0.4) light++;
        else if (l < 0.18) dark++;
      }
    if (!total) return "unknown";
    return light / total >= 0.75
      ? "light"
      : dark / total >= 0.75
        ? "dark"
        : "mixed";
  });
}

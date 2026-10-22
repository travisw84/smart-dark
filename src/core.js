export const DEFAULTS = Object.freeze({
  enabled: true,
  palette: "neutral",
  brightness: 100,
  contrast: 100,
  aiEnabled: false,
  autoVision: false,
  engine: "adaptive",
  sites: {},
});
const clamp = (v, min, max, fallback) =>
  Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
export function safeSettings(input = {}) {
  const sites = Object.fromEntries(
    Object.entries(input.sites || {})
      .filter(
        ([k, v]) =>
          /^https?:\/\//.test(k) && ["auto", "dark", "original"].includes(v),
      )
      .slice(-500),
  );
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    palette: input.palette === "warm" ? "warm" : "neutral",
    brightness: clamp(input.brightness, 80, 120, 100),
    contrast: clamp(input.contrast, 80, 120, 100),
    aiEnabled: input.aiEnabled === true,
    autoVision: input.autoVision === true,
    engine: input.engine === "compatibility" ? "compatibility" : "adaptive",
    sites,
  };
}
export { parseColor } from "./color.js";
export function composite(fg, bg) {
  const a = fg[3] + bg[3] * (1 - fg[3]);
  return a === 0
    ? [0, 0, 0, 0]
    : [0, 1, 2]
        .map((i) => (fg[i] * fg[3] + bg[i] * bg[3] * (1 - fg[3])) / a)
        .concat(a);
}
export function luminance(c) {
  return c
    .slice(0, 3)
    .map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    })
    .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
}
export function contrast(a, b) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function classify(samples, hints = {}) {
  if (!samples.length)
    return { mode: "unknown", darkRatio: 0, lightRatio: 0, sampleCount: 0 };
  let total = 0,
    dark = 0,
    light = 0;
  for (const s of samples) {
    if (!s.bg || !s.fg) continue;
    const w = s.weight || 1;
    total += w;
    const l = luminance(s.bg);
    if (l < 0.18 && contrast(s.bg, s.fg) >= 3) dark += w;
    else if (l > 0.4) light += w;
  }
  if (!total)
    return { mode: "unknown", darkRatio: 0, lightRatio: 0, sampleCount: 0 };
  const darkRatio = dark / total,
    lightRatio = light / total;
  let mode =
    darkRatio >= 0.85 && lightRatio < 0.1
      ? "dark"
      : lightRatio >= 0.8
        ? "light"
        : darkRatio > 0.1 && lightRatio > 0.1
          ? "mixed"
          : "unknown";
  // Explicit theme hints help only when the measured surfaces support them.
  if (mode === "unknown" && hints.dark && darkRatio > 0.65 && lightRatio < 0.1)
    mode = "dark";
  return { mode, darkRatio, lightRatio, sampleCount: samples.length };
}
export function chooseAction(settings, mode, decision) {
  if (!settings.enabled || settings.siteMode === "original") return "original";
  if (settings.siteMode === "dark") return settings.palette || "neutral";
  if (decision?.choice === "use_original") return "original";
  if (decision?.choice === "warmer") return "warm";
  if (decision?.choice === "neutral") return "neutral";
  return mode === "dark" ? "original" : settings.palette || "neutral";
}
// A coarse description of the original page colours. It stays the same while the user
// scrolls or the page updates text, and changes when the overall look of the page changes.
export function fingerprint(summary) {
  const q = (v) => Math.round((Number.isFinite(v) ? v : 0) * 4);
  const text = JSON.stringify({
    mode: summary.mode,
    d: q(summary.darkRatio),
    l: q(summary.lightRatio),
  });
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

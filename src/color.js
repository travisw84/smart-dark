const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const NUM = "[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?";
const NUM_RE = new RegExp("^(" + NUM + ")(%?)$", "i");
const ANGLE_RE = new RegExp("^(" + NUM + ")(deg|grad|rad|turn)?$", "i");
const FUNC_RE = /^([a-z][a-z0-9-]*)\(([\s\S]*)\)$/i;

function number(token, percentScale) {
  if (token === undefined || token === null) return null;
  token = String(token).trim().toLowerCase();
  if (token === "none") return 0;
  const m = NUM_RE.exec(token);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return m[2] ? (v / 100) * percentScale : v;
}
function angle(token) {
  if (token === undefined) return null;
  token = String(token).trim().toLowerCase();
  if (token === "none") return 0;
  const m = ANGLE_RE.exec(token);
  if (!m) return null;
  let v = parseFloat(m[1]);
  const unit = m[2] || "deg";
  if (unit === "turn") v *= 360;
  else if (unit === "grad") v *= 0.9;
  else if (unit === "rad") v = (v * 180) / Math.PI;
  return ((v % 360) + 360) % 360;
}
function alphaOf(token) {
  if (token === null || token === undefined) return 1;
  const v = number(token, 1);
  return v === null ? null : clamp(v, 0, 1);
}
function splitArgs(body) {
  let alpha = null;
  const slash = body.indexOf("/");
  if (slash >= 0) {
    alpha = body.slice(slash + 1).trim();
    body = body.slice(0, slash);
  }
  const parts = body
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (alpha === null && parts.length === 4) alpha = parts.pop();
  if (parts.some((p) => p.includes("("))) return null;
  return { parts, alpha };
}
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function oklabToRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3,
    m = m_ ** 3,
    s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((v) => {
    v = clamp(v, 0, 1);
    return (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255;
  });
}
function fromFunction(name, body) {
  const args = splitArgs(body);
  if (!args) return null;
  const { parts } = args;
  const a = alphaOf(args.alpha);
  if (a === null) return null;
  let rgb = null;
  if (name === "rgb" || name === "rgba") {
    if (parts.length !== 3) return null;
    const v = parts.map((p) => number(p, 255));
    if (v.some((x) => x === null)) return null;
    rgb = v;
  } else if (name === "hsl" || name === "hsla") {
    if (parts.length !== 3) return null;
    const h = angle(parts[0]),
      s = number(parts[1], 100),
      l = number(parts[2], 100);
    if (h === null || s === null || l === null) return null;
    rgb = hslToRgb(h, clamp(s / 100, 0, 1), clamp(l / 100, 0, 1));
  } else if (name === "hwb") {
    if (parts.length !== 3) return null;
    const h = angle(parts[0]);
    let w = number(parts[1], 100),
      k = number(parts[2], 100);
    if (h === null || w === null || k === null) return null;
    w = clamp(w / 100, 0, 1);
    k = clamp(k / 100, 0, 1);
    if (w + k >= 1) {
      const g = (w / (w + k)) * 255;
      rgb = [g, g, g];
    } else {
      rgb = hslToRgb(h, 1, 0.5).map(
        (c) => (c / 255) * (1 - w - k) * 255 + w * 255,
      );
    }
  } else if (name === "oklab" || name === "oklch") {
    if (parts.length !== 3) return null;
    const L = number(parts[0], 1);
    if (L === null) return null;
    if (name === "oklab") {
      const aa = number(parts[1], 0.4),
        bb = number(parts[2], 0.4);
      if (aa === null || bb === null) return null;
      rgb = oklabToRgb(L, aa, bb);
    } else {
      const C = number(parts[1], 0.4),
        h = angle(parts[2]);
      if (C === null || h === null) return null;
      const rad = (h * Math.PI) / 180;
      rgb = oklabToRgb(L, C * Math.cos(rad), C * Math.sin(rad));
    }
  } else if (name === "color") {
    if (parts[0] !== "srgb" || parts.length !== 4) return null;
    const v = parts.slice(1).map((p) => number(p, 1));
    if (v.some((x) => x === null)) return null;
    rgb = v.map((x) => x * 255);
  } else return null;
  return [...rgb.map((c) => clamp(c, 0, 255)), a];
}
export function parseColor(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (v.toLowerCase() === "transparent") return [0, 0, 0, 0];
  if (v[0] === "#") {
    const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(v);
    if (!hex) return null;
    let s = hex[1];
    if (s.length <= 4) s = [...s].map((c) => c + c).join("");
    const n = (i) => parseInt(s.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), s.length === 8 ? n(6) / 255 : 1];
  }
  const f = FUNC_RE.exec(v);
  if (!f || /var\(/i.test(v)) return null;
  return fromFunction(f[1].toLowerCase(), f[2]);
}

const SKIP = new Set([
  "currentcolor",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);
const cache = new Map();
let ctx = null;
function canvasColor(value) {
  if (typeof document === "undefined") return null;
  try {
    if (!ctx) {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      ctx = canvas.getContext("2d", { willReadFrequently: true });
    }
    if (!ctx) return null;
    ctx.fillStyle = "#010203";
    ctx.fillStyle = value;
    // An unparsable value leaves the sentinel in place.
    if (
      ctx.fillStyle === "#010203" &&
      value.replace(/\s/g, "").toLowerCase() !== "#010203"
    )
      return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return d[3] === 0 ? [0, 0, 0, 0] : [d[0], d[1], d[2], d[3] / 255];
  } catch {
    return null;
  }
}
// Resolve any CSS colour to sRGB. Pure parsing handles the common syntaxes.
// A 1x1 canvas readback covers named colours, lab(), lch(), color-mix() and wide gamut colours.
export function resolveColor(value) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (!key || SKIP.has(key.toLowerCase()) || /var\(/i.test(key)) return null;
  if (cache.has(key)) return cache.get(key);
  const c = parseColor(key) ?? canvasColor(key);
  if (cache.size > 5000) cache.clear();
  cache.set(key, c);
  return c;
}

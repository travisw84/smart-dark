import { luminance, contrast, composite } from "./core.js";
export function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min,
    l = (max + min) / 2;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
export function hslToRgb([h, s, l], a = 1) {
  const c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = l - c / 2;
  let v =
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
  return v.map((n) => Math.round((n + m) * 255)).concat(a);
}
export function themeBackground(c, palette = "neutral") {
  const [h, s] = rgbToHsl(c),
    lum = luminance(c);
  if (lum < 0.12) return c;
  if (s > 0.3)
    return hslToRgb(
      [
        h,
        Math.min(s, 0.68),
        Math.max(0.2, Math.min(0.34, 0.25 + (1 - lum) * 0.1)),
      ],
      c[3],
    );
  const level = 0.075 + (1 - Math.min(1, lum)) * 0.12;
  return hslToRgb(
    [palette === "warm" ? 32 : 218, palette === "warm" ? 0.13 : 0.17, level],
    c[3],
  );
}
export function themeText(c, bg, minimum = 4.5) {
  if (c[3] === 0) return c;
  if (contrast(composite(c, bg), bg) >= minimum && luminance(c) > 0.35)
    return c;
  const [h, s, l] = rgbToHsl(c);
  let light = s > 0.25 ? Math.max(l, 0.64) : 0.72 + (1 - l) * 0.17;
  let result = hslToRgb([h, Math.min(s, 0.82), light], c[3]);
  while (contrast(composite(result, bg), bg) < minimum && light < 1) {
    light = Math.min(1, light + 0.025);
    result = hslToRgb([h, Math.min(s, 0.82), light], 1);
  }
  return result;
}
export function elementTreatment(
  { background, effective, color, border },
  palette,
) {
  if (
    luminance(effective) < 0.18 &&
    contrast(effective, composite(color, effective)) >= 3
  )
    return { preserve: true };
  const target = themeBackground(effective, palette);
  return {
    preserve: false,
    background: background[3] > 0 ? themeBackground(background, palette) : null,
    color: themeText(color, target),
    border:
      border && border[3] > 0
        ? hslToRgb(
            [rgbToHsl(border)[0], Math.min(rgbToHsl(border)[1], 0.3), 0.31],
            border[3],
          )
        : null,
  };
}
export const cssColor = (c) =>
  `rgba(${c.slice(0, 3).map(Math.round).join(",")},${+c[3].toFixed(3)})`;
const REF_BG = { neutral: [22, 26, 33, 1], warm: [27, 24, 21, 1] };
// Context free colour mapping used when rewriting a site's stylesheets. The text mapping
// assumes the dark reference surface, so every light-to-dark pair stays readable.
export function mapColor(c, kind, palette = "neutral") {
  if (c[3] === 0) return c;
  if (kind === "bg") return themeBackground(c, palette);
  if (kind === "fg") return themeText(c, REF_BG[palette] || REF_BG.neutral);
  const [h, s] = rgbToHsl(c);
  return hslToRgb([h, Math.min(s, 0.3), 0.31], c[3]);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  themeBackground,
  themeText,
  elementTreatment,
} from "../src/palette.js";
import { parseColor, contrast, luminance } from "../src/core.js";
test("native-like neutral surfaces retain layers without pure black", () => {
  const page = themeBackground(parseColor("#fff"), "neutral"),
    card = themeBackground(parseColor("#f0f0f0"), "neutral");
  assert(luminance(card) > luminance(page));
  assert(luminance(page) > 0.002);
  assert(luminance(card) < 0.1);
});
test("text conversion preserves hue and measurable readability", () => {
  const bg = themeBackground(parseColor("#fff"), "neutral");
  for (const color of ["#111", "#777", "#0066cc", "#cc0000"])
    assert(contrast(themeText(parseColor(color), bg), bg) >= 4.5);
});
test("a readable existing dark region is preserved", () => {
  const p = elementTreatment(
    {
      background: parseColor("#202020"),
      effective: parseColor("#202020"),
      color: parseColor("#eeeeee"),
      border: parseColor("#555"),
    },
    "neutral",
  );
  assert.equal(p.preserve, true);
});
test("transparent surfaces stay transparent", () => {
  const p = elementTreatment(
    {
      background: [0, 0, 0, 0],
      effective: parseColor("#fff"),
      color: parseColor("#111"),
      border: [0, 0, 0, 0],
    },
    "neutral",
  );
  assert.equal(p.background, null);
  assert(
    contrast(p.color, themeBackground(parseColor("#fff"), "neutral")) >= 4.5,
  );
});

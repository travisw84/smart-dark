import { test } from "node:test";
import assert from "node:assert/strict";
import { mapColor } from "../src/palette.js";
import { parseColor, luminance, contrast, composite } from "../src/core.js";

test("maps backgrounds dark, text light and borders to a visible mid tone", () => {
  const bg = mapColor(parseColor("#ffffff"), "bg", "neutral");
  assert.ok(luminance(bg) < 0.05);
  const fg = mapColor(parseColor("#111111"), "fg", "neutral");
  assert.ok(contrast(composite(fg, [22, 26, 33, 1]), [22, 26, 33, 1]) >= 7);
  const bd = mapColor(parseColor("#dddddd"), "bd", "neutral");
  assert.ok(luminance(bd) > luminance(bg));
});
test("keeps alpha and leaves fully transparent colours alone", () => {
  assert.equal(mapColor([255, 255, 255, 0.3], "bg", "neutral")[3], 0.3);
  assert.deepEqual(
    mapColor([255, 255, 255, 0], "bg", "neutral"),
    [255, 255, 255, 0],
  );
});
test("the warm palette is warmer than the neutral one", () => {
  const n = mapColor(parseColor("#f5f5f5"), "bg", "neutral");
  const w = mapColor(parseColor("#f5f5f5"), "bg", "warm");
  assert.ok(w[0] - w[2] > n[0] - n[2]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseColor, resolveColor } from "../src/color.js";
const near = (a, b, tol = 1.5) =>
  a.every((v, i) => Math.abs(v - b[i]) <= (i === 3 ? 0.01 : tol));

test("parses modern space separated rgb with percentage alpha", () => {
  assert.ok(near(parseColor("rgb(0 0 0 / 50%)"), [0, 0, 0, 0.5]));
  assert.ok(near(parseColor("rgb(100% 0% 0%)"), [255, 0, 0, 1]));
  assert.ok(near(parseColor("rgba(10, 20, 30, 0.25)"), [10, 20, 30, 0.25]));
});
test("parses hsl and hwb", () => {
  assert.ok(near(parseColor("hsl(0 100% 50%)"), [255, 0, 0, 1]));
  assert.ok(near(parseColor("hsl(120, 100%, 25%)"), [0, 128, 0, 1]));
  assert.ok(near(parseColor("hsl(240deg 100% 50% / .5)"), [0, 0, 255, 0.5]));
  assert.ok(near(parseColor("hwb(0 0% 0%)"), [255, 0, 0, 1]));
  assert.ok(near(parseColor("hwb(0 100% 0%)"), [255, 255, 255, 1]));
});
test("parses oklch and oklab so Tailwind v4 colours are understood", () => {
  assert.ok(near(parseColor("oklch(1 0 0)"), [255, 255, 255, 1]));
  assert.ok(near(parseColor("oklch(0 0 0)"), [0, 0, 0, 1]));
  assert.ok(near(parseColor("oklch(0.5 0 0)"), [99, 99, 99, 1], 2));
  assert.ok(near(parseColor("oklch(62.8% 0.2577 29.23)"), [255, 0, 0, 1], 8));
  assert.ok(near(parseColor("oklab(1 0 0 / 0.4)"), [255, 255, 255, 0.4]));
  const gray = parseColor("oklch(0.985 0.002 247.839)");
  assert.ok(gray[0] > 240 && gray[1] > 240 && gray[2] > 240);
});
test("parses color(srgb) and hex with alpha", () => {
  assert.ok(near(parseColor("color(srgb 1 0 0 / .5)"), [255, 0, 0, 0.5]));
  assert.ok(near(parseColor("#0f08"), [0, 255, 0, 0.533]));
  assert.ok(near(parseColor("#11223344"), [17, 34, 51, 0.267]));
  assert.ok(near(parseColor("#abc"), [170, 187, 204, 1]));
});
test("rejects values it cannot resolve and unsafe tokens", () => {
  assert.equal(parseColor("url(x)"), null);
  assert.equal(parseColor("currentcolor"), null);
  assert.equal(parseColor("rgb(var(--x) 0 0)"), null);
  assert.equal(parseColor("color-mix(in srgb, red, blue)"), null);
  assert.equal(parseColor(undefined), null);
});
test("resolveColor falls back to null without a DOM", () => {
  assert.equal(resolveColor("color-mix(in srgb, red, blue)"), null);
  assert.ok(near(resolveColor("oklch(1 0 0)"), [255, 255, 255, 1]));
});

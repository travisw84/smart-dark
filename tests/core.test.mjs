import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseColor,
  composite,
  luminance,
  contrast,
  classify,
  chooseAction,
  safeSettings,
  fingerprint,
} from "../src/core.js";
const sample = (bg, fg = "#111111") => ({
  bg: parseColor(bg),
  fg: parseColor(fg),
  weight: 1,
});
test("parses computed CSS and composites transparent surfaces", () => {
  assert.deepEqual(
    parseColor("rgba(255, 255, 255, 0.5)"),
    [255, 255, 255, 0.5],
  );
  assert.deepEqual(
    composite([255, 255, 255, 0.5], [0, 0, 0, 1]),
    [127.5, 127.5, 127.5, 1],
  );
  assert.equal(parseColor("url(secret)"), null);
  assert.deepEqual(parseColor("#abc"), [170, 187, 204, 1]);
});
test("uses linear luminance and WCAG contrast", () => {
  assert.equal(luminance([0, 0, 0, 1]), 0);
  assert.equal(luminance([255, 255, 255, 1]), 1);
  assert.equal(contrast([0, 0, 0, 1], [255, 255, 255, 1]), 21);
});
test("preserves readable native dark content", () => {
  assert.equal(
    classify(Array(10).fill(sample("#121212", "#eeeeee")), {}).mode,
    "dark",
  );
});
test("a dark marker cannot conceal a bright article", () => {
  assert.equal(
    classify(Array(10).fill(sample("#ffffff")), { dark: true }).mode,
    "light",
  );
});
test("mixed page stays eligible for conversion", () => {
  assert.equal(
    classify([sample("#fff"), sample("#fff"), sample("#111", "#eee")], {}).mode,
    "mixed",
  );
});
test("blank/insufficient evidence is uncertain", () => {
  assert.equal(classify([], {}).mode, "unknown");
});
test("global and per-site controls outrank AI", () => {
  assert.equal(
    chooseAction({ enabled: false, siteMode: "dark" }, "light", {
      choice: "neutral",
    }),
    "original",
  );
  assert.equal(
    chooseAction({ enabled: true, siteMode: "original" }, "light", {
      choice: "neutral",
    }),
    "original",
  );
  assert.equal(
    chooseAction({ enabled: true, siteMode: "dark" }, "dark", {
      choice: "use_original",
    }),
    "neutral",
  );
  assert.equal(
    chooseAction({ enabled: true, siteMode: "auto" }, "dark", null),
    "original",
  );
});
test("uncertainty retains immediate local result", () => {
  assert.equal(
    chooseAction(
      { enabled: true, siteMode: "auto", palette: "warm" },
      "mixed",
      { choice: "uncertain" },
    ),
    "warm",
  );
});
test("settings reject out of range and unexpected values", () => {
  const s = safeSettings({
    enabled: "false",
    brightness: 999,
    contrast: NaN,
    palette: "evil",
    aiEnabled: 1,
    autoVision: "yes",
    sites: { "https://example.test": "dark", __proto__: "dark" },
    apiKey: "secret",
  });
  assert.equal(s.enabled, true);
  assert.equal(s.brightness, 120);
  assert.equal(s.contrast, 100);
  assert.equal(s.palette, "neutral");
  assert.equal(s.aiEnabled, false);
  assert.equal(s.autoVision, false);
  assert.equal(s.apiKey, undefined);
  assert.equal(s.sites["https://example.test"], "dark");
});
test("fingerprints depend on styles not sensitive content", () => {
  assert.equal(
    fingerprint({ mode: "light", samples: [sample("#fff")], text: "SECRET" }),
    fingerprint({ mode: "light", samples: [sample("#fff")], text: "OTHER" }),
  );
  assert.notEqual(
    fingerprint({ mode: "dark", samples: [sample("#111")] }),
    fingerprint({ mode: "light", samples: [sample("#fff")] }),
  );
});
test("keep_dark preserves a successful local conversion", () => {
  assert.equal(
    chooseAction(
      { enabled: true, siteMode: "auto", palette: "warm" },
      "light",
      { choice: "keep_dark" },
    ),
    "warm",
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildVisionRequest,
  parseDecision,
  sanitizeSummary,
} from "../src/jev.js";
test("image request uses documented assets with no page text, URL or form values", () => {
  const r = buildVisionRequest(
    "data:image/jpeg;base64,YWJj",
    {
      mode: "mixed",
      darkRatio: 0.4,
      lightRatio: 0.6,
      secret: "do not send",
      url: "https://private.test",
    },
    "image-123",
  );
  assert.equal(r.state.screenshot, "image-123");
  assert.equal(r.assets["image-123"].data_base64, "YWJj");
  assert.equal(r.assets["image-123"].format, "jpg");
  assert.equal(r.model, "jev-latest");
  assert.equal(JSON.stringify(r).includes("private.test"), false);
  assert.equal(JSON.stringify(r).includes("do not send"), false);
  assert.equal(r.questions.treatment.type, "choice");
});
test("rejects bad image payloads and caps input size", () => {
  assert.throws(() => buildVisionRequest("data:text/html;base64,YWJj", {}));
  assert.throws(() =>
    buildVisionRequest("data:image/jpeg;base64," + "a".repeat(6_000_001), {}),
  );
});
test("only accepts bounded, confident treatment choices", () => {
  assert.deepEqual(
    parseDecision({
      answers: { treatment: { choice: "neutral", confidence: 0.95 } },
    }),
    { choice: "neutral", confidence: 0.95 },
  );
  assert.equal(
    parseDecision({
      answers: { treatment: { choice: "javascript:evil", confidence: 1 } },
    }).choice,
    "uncertain",
  );
  assert.equal(
    parseDecision({
      answers: { treatment: { choice: "use_original", confidence: 0.4 } },
    }).choice,
    "uncertain",
  );
  assert.equal(
    parseDecision({
      answers: { treatment: { choice: "neutral", confidence: Infinity } },
    }).choice,
    "uncertain",
  );
  assert.equal(parseDecision(null).choice, "uncertain");
});
test("summary contains only numeric bounded metrics", () => {
  assert.deepEqual(
    sanitizeSummary({
      mode: "mixed",
      darkRatio: Infinity,
      lightRatio: -3,
      sampleCount: 999,
      text: "secret",
    }),
    { mode: "mixed", darkRatio: 0, lightRatio: 0, sampleCount: 20 },
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRewriter } from "../src/cssrewrite.js";
import { parseColor } from "../src/color.js";
const NAMES = {
  red: [255, 0, 0, 1],
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
};
const resolve = (v) => NAMES[String(v).toLowerCase()] ?? parseColor(v);
const map = (c, kind) =>
  kind === "bg"
    ? [10, 11, 12, c[3]]
    : kind === "fg"
      ? [230, 231, 232, c[3]]
      : [60, 61, 62, c[3]];
const make = () =>
  createRewriter({
    map,
    resolve,
    isColorWord: (w) => w in NAMES,
    format: (c) => "rgba(" + c.slice(0, 3).join(",") + "," + c[3] + ")",
  });
const style = (cssText) => ({ cssText });

test("mirrors a background shorthand as colour longhands so other rules keep their layout", () => {
  const r = make();
  assert.equal(
    r.mirrorDeclarations(
      "background: #fff url(a.png) no-repeat center / cover",
    ),
    "background-color:rgba(10,11,12,1)",
  );
  assert.equal(
    r.mirrorDeclarations("background: url(a.png) center / cover no-repeat"),
    "",
  );
  assert.equal(
    r.mirrorDeclarations(
      "background: url(a.png), linear-gradient(white, red) black",
    ),
    "background-color:rgba(10,11,12,1);background-image:url(a.png),linear-gradient(rgba(10,11,12,1), rgba(10,11,12,1))",
  );
});
test("mirrors border, outline and text-decoration shorthands as colour longhands", () => {
  const r = make();
  assert.equal(
    r.mirrorDeclarations("border: 1px solid #ddd"),
    "border-color:rgba(60,61,62,1)",
  );
  assert.equal(
    r.mirrorDeclarations("border-top: 2px dashed red !important"),
    "border-top-color:rgba(60,61,62,1)!important",
  );
  assert.equal(
    r.mirrorDeclarations("outline: 1px solid red"),
    "outline-color:rgba(230,231,232,1)",
  );
  assert.equal(
    r.mirrorDeclarations("text-decoration: underline red"),
    "text-decoration-color:rgba(230,231,232,1)",
  );
  assert.equal(r.mirrorDeclarations("border: 0"), "");
});
test("shorthands with variables map through the variable companions", () => {
  const r = make();
  r.learnRule({
    selectorText: ":root",
    style: style("--c: #fff"),
    cssRules: [],
  });
  assert.equal(
    r.mirrorDeclarations("background: var(--c)"),
    "background-color:var(--sd-bg-c,var(--c));background-image:var(--sd-bg-c,var(--c))",
  );
  assert.equal(
    r.mirrorDeclarations(
      "background: linear-gradient(rgba(255,255,255,0), var(--c, #fff)) no-repeat",
    ),
    "background-image:linear-gradient(rgba(255,255,255,0), var(--sd-bg-c,var(--c,rgba(10,11,12,1))))",
  );
  assert.equal(
    r.mirrorDeclarations("border: 1px solid var(--c)"),
    "border-color:var(--sd-bd-c,var(--c))",
  );
});
test("recovers shorthands that Chrome serialises as blank longhands", () => {
  const r = make();
  const blank = {
    cssText:
      'content: ""; background-image: ; background-position-x: ; background-repeat: no-repeat;',
    getPropertyValue: (p) =>
      p === "background" ? "linear-gradient(white, red) no-repeat" : "",
    getPropertyPriority: () => "",
  };
  const out = r.mirrorDeclarations(blank);
  assert.equal(
    out,
    "background-image:linear-gradient(rgba(10,11,12,1), rgba(10,11,12,1))",
  );
});

test("uses a resolver for colour declarations Chrome exposes only as blanks", () => {
  const calls = [];
  const r = createRewriter({
    map,
    resolve,
    isColorWord: (w) => w in NAMES,
    format: (c) => "rgba(" + c.slice(0, 3).join(",") + "," + c[3] + ")",
    resolveBlank: (rule, props) => {
      calls.push([rule.selectorText, props.join(",")]);
      return "background-image: linear-gradient(white, red)";
    },
  });
  const rule = { selectorText: ".x::after", style: { cssText: 'content: ""; background-image: ; background-color: ;' }, cssRules: [] };
  assert.equal(r.mirrorRule(rule), ".x::after{background-image:linear-gradient(rgba(10,11,12,1), rgba(10,11,12,1))}");
  assert.deepEqual(calls, [[".x::after", "background-image,background-color"]]);
  const plain = { selectorText: ".y", style: { cssText: "color: red" }, cssRules: [] };
  assert.equal(r.mirrorRule(plain), ".y{color:rgba(230,231,232,1)}");
  assert.equal(calls.length, 1);
});

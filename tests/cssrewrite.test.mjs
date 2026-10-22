import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRewriter,
  propKind,
  splitDeclarations,
} from "../src/cssrewrite.js";
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

test("classifies colour properties", () => {
  assert.equal(propKind("background-color"), "bg");
  assert.equal(propKind("background"), "bg");
  assert.equal(propKind("color"), "fg");
  assert.equal(propKind("fill"), "fg");
  assert.equal(propKind("border-top-color"), "bd");
  assert.equal(propKind("border-block-start-color"), "bd");
  assert.equal(propKind("border"), "bd");
  for (const p of [
    "border-radius",
    "border-top-left-radius",
    "width",
    "box-shadow",
    "color-scheme",
    "background-position",
  ])
    assert.equal(propKind(p), null, p);
});
test("splits declarations without breaking on semicolons in urls or strings", () => {
  const d = splitDeclarations(
    'background:url("a;b.png") #fff;content:"x;y";--k:rgb(1,2,3) !important',
  );
  assert.deepEqual(
    d.map((x) => x.prop),
    ["background", "content", "--k"],
  );
  assert.equal(d[2].important, true);
  assert.equal(d[2].value, "rgb(1,2,3)");
});
test("maps colours by property kind and leaves other values untouched", () => {
  const r = make();
  assert.equal(r.rewrite("#fff", "bg"), "rgba(10,11,12,1)");
  assert.equal(r.rewrite("1px solid #ddd", "bd"), "1px solid rgba(60,61,62,1)");
  assert.equal(
    r.rewrite("white url(a#fff.png) no-repeat", "bg"),
    "rgba(10,11,12,1) url(a#fff.png) no-repeat",
  );
  assert.equal(
    r.rewrite("linear-gradient(to right, red 10%, rgba(0,0,0,0))", "bg"),
    "linear-gradient(to right, rgba(10,11,12,1) 10%, rgba(0,0,0,0))",
  );
  assert.equal(r.rewrite("oklch(0.98 0 0)", "bg"), "rgba(10,11,12,1)");
  assert.equal(r.rewrite("transparent", "bg"), "transparent");
  assert.equal(r.rewrite("inherit", "fg"), "inherit");
  assert.equal(
    r.rewrite("light-dark(#fff, #000)", "bg"),
    "light-dark(#fff, #000)",
  );
});
test("keeps Tailwind v3 alpha variables while mapping the colour", () => {
  const r = make();
  assert.equal(
    r.rewrite("rgb(255 255 255 / var(--tw-bg-opacity))", "bg"),
    "rgb(10 11 12 / var(--tw-bg-opacity))",
  );
  assert.equal(
    r.rewrite("rgb(0 0 0 / var(--o, 1))", "fg"),
    "rgb(230 231 232 / var(--o, 1))",
  );
});
test("rewrites mirrored declarations and keeps !important", () => {
  const r = make();
  const css = r.mirrorDeclarations(
    "color: red; width: 10px; background-color: #fff !important; box-shadow: 0 0 red",
  );
  assert.equal(
    css,
    "color:rgba(230,231,232,1);background-color:rgba(10,11,12,1)!important",
  );
});
test("learns colour custom properties and rewrites their uses", () => {
  const r = make();
  r.learnRule({
    selectorText: ":root",
    style: style(
      "--bg: #fff; --text: oklch(0.2 0 0); --gap: 4px; --card: var(--bg); --rgb: 255 255 255",
    ),
    cssRules: [],
  });
  const root = r.mirrorDeclarations(
    "--bg: #fff; --gap: 4px; --card: var(--bg); --rgb: 255 255 255",
  );
  assert.match(root, /--sd-bg-bg:rgba\(10,11,12,1\)/);
  assert.match(root, /--sd-fg-bg:rgba\(230,231,232,1\)/);
  assert.match(root, /--sd-bd-bg:rgba\(60,61,62,1\)/);
  assert.match(root, /--sd-bg-card:var\(--sd-bg-bg,var\(--bg\)\)/);
  assert.match(root, /--sd-bg-rgb:10 11 12/);
  assert.doesNotMatch(root, /--sd-bg-gap/);
  assert.equal(r.rewrite("var(--bg)", "bg"), "var(--sd-bg-bg,var(--bg))");
  assert.equal(r.rewrite("var(--gap)", "bg"), "var(--gap)");
  assert.equal(
    r.rewrite("var(--missing, #fff)", "bg"),
    "var(--missing,rgba(10,11,12,1))",
  );
  assert.equal(
    r.rewrite("rgb(var(--rgb) / .5)", "bg"),
    "rgb(var(--sd-bg-rgb,var(--rgb)) / .5)",
  );
});
test("mirrors grouping, layer, import and nested rules while preserving selectors", () => {
  const r = make();
  const hover = {
    selectorText: "a.b:hover",
    style: style("background: #0a7; color: white"),
    cssRules: [],
  };
  const media = {
    cssText: "@media (min-width: 600px) { a { } }",
    cssRules: [hover],
  };
  const layer = {
    cssText: "@layer components { x }",
    cssRules: [
      { selectorText: ".c", style: style("color: red"), cssRules: [] },
    ],
  };
  const keyframes = {
    cssText: "@keyframes k { from {} }",
    cssRules: [
      { selectorText: "from", style: style("color: red"), cssRules: [] },
    ],
  };
  const nested = {
    selectorText: ".p",
    style: style("color: red"),
    cssRules: [
      { selectorText: "&:hover", style: style("color: white"), cssRules: [] },
    ],
  };
  const imported = {
    styleSheet: {
      cssRules: [
        { selectorText: ".i", style: style("color: red"), cssRules: [] },
      ],
    },
    media: { mediaText: "" },
  };
  assert.equal(
    r.mirrorRule(hover),
    "a.b:hover{background-color:rgba(10,11,12,1);color:rgba(230,231,232,1)}",
  );
  assert.equal(
    r.mirrorRule(media),
    "@media (min-width: 600px){a.b:hover{background-color:rgba(10,11,12,1);color:rgba(230,231,232,1)}}",
  );
  assert.equal(
    r.mirrorRule(layer),
    "@layer components{.c{color:rgba(230,231,232,1)}}",
  );
  assert.equal(r.mirrorRule(keyframes), "");
  assert.equal(
    r.mirrorRule(nested),
    ".p{color:rgba(230,231,232,1);&:hover{color:rgba(230,231,232,1)}}",
  );
  assert.equal(r.mirrorRule(imported), ".i{color:rgba(230,231,232,1)}");
  assert.equal(
    r.mirrorRule({
      selectorText: ".n",
      style: style("width: 1px"),
      cssRules: [],
    }),
    "",
  );
});

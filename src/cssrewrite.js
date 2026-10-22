import { resolveColor } from "./color.js";

const BG = new Set(["background", "background-color", "background-image"]);
const FG = new Set([
  "color",
  "caret-color",
  "text-decoration",
  "text-decoration-color",
  "text-emphasis-color",
  "-webkit-text-fill-color",
  "-webkit-text-stroke-color",
  "-webkit-text-stroke",
  "outline",
  "outline-color",
  "fill",
  "stroke",
  "column-rule-color",
  "accent-color",
]);
const BORDER =
  /^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?$/;
export function propKind(prop) {
  if (BG.has(prop)) return "bg";
  if (FG.has(prop)) return "fg";
  return BORDER.test(prop) ? "bd" : null;
}
const COLOR_FUNCS = new Set([
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
]);
const ALPHA_FUNCS = new Set([
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
]);
const PASS_FUNCS = new Set(["url", "light-dark", "env", "attr", "src"]);
const NOT_COLORS = new Set([
  "currentcolor",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
  "transparent",
  "none",
  "auto",
]);
const HEX = /#[0-9a-f]{3,8}(?![0-9a-z_-])/iy;
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?[a-z%]*/iy;
const IDENT = /-{0,2}[a-z_][a-z0-9_-]*/iy;
const TRIPLE = /^\s*(\d{1,3})(\s*,\s*|\s+)(\d{1,3})\2(\d{1,3})\s*$/;

const wordCache = new Map();
function defaultIsColorWord(word) {
  if (NOT_COLORS.has(word)) return false;
  if (wordCache.has(word)) return wordCache.get(word);
  const ok =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("color", word);
  wordCache.set(word, ok);
  return ok;
}
function skipString(s, i) {
  const q = s[i];
  let j = i + 1;
  while (j < s.length) {
    if (s[j] === "\\") j += 2;
    else if (s[j] === q) return j + 1;
    else j++;
  }
  return s.length;
}
function findClose(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' || ch === "'") {
      i = skipString(s, i) - 1;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return i;
  }
  return -1;
}
function topLevelSlash(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (s[i] === "/" && depth === 0) return i;
  }
  return -1;
}
export function splitDeclarations(text) {
  const out = [];
  let depth = 0,
    start = 0;
  const push = (end) => {
    const piece = text.slice(start, end).trim();
    start = end + 1;
    const colon = piece.indexOf(":");
    if (colon < 1) return;
    let prop = piece.slice(0, colon).trim();
    if (!prop.startsWith("--")) prop = prop.toLowerCase();
    let value = piece.slice(colon + 1).trim();
    const imp = /\s*!\s*important\s*$/i.exec(value);
    if (imp) value = value.slice(0, imp.index).trim();
    out.push({ prop, value, important: !!imp });
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") i = skipString(text, i) - 1;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === ";" && depth === 0) push(i);
  }
  push(text.length);
  return out;
}

function tokenizeTopLevel(value) {
  const out = [];
  let depth = 0,
    start = -1;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '"' || ch === "'") {
      if (start < 0) start = i;
      i = skipString(value, i) - 1;
    } else if (ch === "(") {
      depth++;
      if (start < 0) start = i;
    } else if (ch === ")") depth--;
    else if (/\s/.test(ch) && depth === 0) {
      if (start >= 0) out.push(value.slice(start, i));
      start = -1;
    } else if (start < 0) start = i;
  }
  if (start >= 0) out.push(value.slice(start));
  return out;
}
function splitTopLevel(value, sep) {
  const out = [];
  let depth = 0,
    start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '"' || ch === "'") i = skipString(value, i) - 1;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === sep && depth === 0) {
      out.push(value.slice(start, i));
      start = i + 1;
    }
  }
  out.push(value.slice(start));
  return out;
}
const isImageToken = (t) =>
  /^(url|image-set|-webkit-image-set|cross-fade|element|paint)\(/i.test(t) ||
  /-gradient\(/i.test(t);
// Mirroring a whole shorthand would reset longhands that other rules set. Only the colour
// part is mirrored, through the matching colour longhand.
const COLOR_LONGHAND = {
  border: "border-color",
  "border-top": "border-top-color",
  "border-right": "border-right-color",
  "border-bottom": "border-bottom-color",
  "border-left": "border-left-color",
  "border-block": "border-block-color",
  "border-inline": "border-inline-color",
  "border-block-start": "border-block-start-color",
  "border-block-end": "border-block-end-color",
  "border-inline-start": "border-inline-start-color",
  "border-inline-end": "border-inline-end-color",
  outline: "outline-color",
  "text-decoration": "text-decoration-color",
  "-webkit-text-stroke": "-webkit-text-stroke-color",
};
const SHORTHANDS = ["background", ...Object.keys(COLOR_LONGHAND)];
// Chrome serialises a shorthand that contains var() as blank longhands when the rule also
// sets other longhands. The shorthand text is still available through getPropertyValue.
function declarationsOf(style) {
  const list = splitDeclarations(style.cssText);
  if (
    typeof style.getPropertyValue !== "function" ||
    !/:\s*;/.test(style.cssText)
  )
    return list;
  const have = new Set(list.filter((d) => d.value).map((d) => d.prop));
  for (const prop of SHORTHANDS) {
    if (have.has(prop)) continue;
    const value = style.getPropertyValue(prop);
    if (value && value.trim())
      list.push({
        prop,
        value: value.trim(),
        important: style.getPropertyPriority(prop) === "important",
      });
  }
  return list;
}
function groupHeader(rule) {
  const t = rule.cssText || "";
  const k = t.indexOf("{");
  if (k < 0) return "";
  const head = t.slice(0, k).trim();
  return /^@(media|supports|layer|container)\b/i.test(head) ? head : "";
}
const defaultFormat = (c) =>
  "rgba(" +
  Math.round(c[0]) +
  "," +
  Math.round(c[1]) +
  "," +
  Math.round(c[2]) +
  "," +
  +c[3].toFixed(3) +
  ")";

// Rewrites the colours in a site's own CSS. Selectors, media queries and layers are kept,
// so hover, focus and other states follow the site's rules without per-element snapshots.
export function createRewriter({
  map,
  resolve = resolveColor,
  isColorWord = defaultIsColorWord,
  format = defaultFormat,
  resolveBlank = null,
}) {
  const colorVars = new Set();
  const tripleVars = new Set();
  const deps = new Map();
  let dirty = false;

  function rewriteWith(value, kind, mapFn) {
    const emit = (c) => format(mapFn(c, kind));
    let out = "",
      i = 0;
    const n = value.length;
    const again = (inner) => rewriteWith(inner, kind, mapFn);
    while (i < n) {
      const ch = value[i];
      if (ch === '"' || ch === "'") {
        const j = skipString(value, i);
        out += value.slice(i, j);
        i = j;
        continue;
      }
      if (ch === "#") {
        HEX.lastIndex = i;
        const m = HEX.exec(value);
        if (m && m.index === i && [4, 5, 7, 9].includes(m[0].length)) {
          const c = resolve(m[0]);
          out += c && c[3] > 0 ? emit(c) : m[0];
          i += m[0].length;
          continue;
        }
        out += ch;
        i++;
        continue;
      }
      NUMBER.lastIndex = i;
      const num = NUMBER.exec(value);
      if (num && num.index === i) {
        out += num[0];
        i += num[0].length;
        continue;
      }
      IDENT.lastIndex = i;
      const id = IDENT.exec(value);
      if (id && id.index === i) {
        const word = id[0];
        const j = i + word.length;
        const lower = word.toLowerCase();
        if (value[j] === "(") {
          const close = findClose(value, j);
          if (close < 0) {
            out += value.slice(i);
            break;
          }
          const inner = value.slice(j + 1, close);
          const full = value.slice(i, close + 1);
          if (lower === "var") out += rewriteVar(inner, kind, mapFn);
          else if (PASS_FUNCS.has(lower)) out += full;
          else if (lower === "color-mix")
            out += word + "(" + again(inner) + ")";
          else if (COLOR_FUNCS.has(lower)) {
            if (!inner.includes("var(")) {
              const c = resolve(full);
              out += c && c[3] > 0 ? emit(c) : full;
            } else {
              const slash = topLevelSlash(inner);
              let done = false;
              if (
                slash >= 0 &&
                ALPHA_FUNCS.has(lower) &&
                !inner.slice(0, slash).includes("var(")
              ) {
                const c = resolve(lower + "(" + inner.slice(0, slash) + ")");
                if (c) {
                  const m = mapFn(c, kind);
                  out +=
                    "rgb(" +
                    Math.round(m[0]) +
                    " " +
                    Math.round(m[1]) +
                    " " +
                    Math.round(m[2]) +
                    " / " +
                    inner.slice(slash + 1).trim() +
                    ")";
                  done = true;
                }
              }
              if (!done) out += word + "(" + again(inner) + ")";
            }
          } else out += word + "(" + again(inner) + ")";
          i = close + 1;
          continue;
        }
        if (isColorWord(lower) && !NOT_COLORS.has(lower)) {
          const c = resolve(word);
          out += c && c[3] > 0 ? emit(c) : word;
        } else out += word;
        i = j;
        continue;
      }
      out += ch;
      i++;
    }
    return out;
  }
  function rewriteVar(inner, kind, mapFn) {
    const m = /^\s*(--[^\s,)]+)\s*(?:,([\s\S]*))?$/.exec(inner);
    if (!m) return "var(" + inner + ")";
    const name = m[1];
    const fb =
      m[2] === undefined ? "" : "," + rewriteWith(m[2].trim(), kind, mapFn);
    resolveDeps();
    if (colorVars.has(name.slice(2)))
      return (
        "var(--sd-" + kind + "-" + name.slice(2) + ",var(" + name + fb + "))"
      );
    return "var(" + name + fb + ")";
  }
  const hasColor = (value) => {
    let found = false;
    rewriteWith(value, "bg", (c) => ((found = true), c));
    return found;
  };
  function resolveDeps() {
    if (!dirty) return;
    dirty = false;
    let changed = true;
    while (changed) {
      changed = false;
      for (const [name, refs] of deps) {
        if (!colorVars.has(name) && refs.some((r) => colorVars.has(r))) {
          colorVars.add(name);
          changed = true;
        }
      }
    }
  }
  function learnDeclarations(cssText) {
    if (!cssText.includes("--")) return;
    for (const d of splitDeclarations(cssText)) {
      if (!d.prop.startsWith("--")) continue;
      const name = d.prop.slice(2);
      const t = TRIPLE.exec(d.value);
      if (t && [t[1], t[3], t[4]].every((x) => Number(x) <= 255)) {
        tripleVars.add(name);
        colorVars.add(name);
      } else if (hasColor(d.value)) colorVars.add(name);
      else {
        const refs = [...d.value.matchAll(/var\(\s*--([^\s,)]+)/g)].map(
          (m) => m[1],
        );
        if (refs.length) deps.set(name, refs);
      }
      dirty = true;
    }
  }
  function tripleMap(value, kind) {
    const t = TRIPLE.exec(value);
    const m = map([Number(t[1]), Number(t[3]), Number(t[4]), 1], kind);
    const sep = t[2];
    return Math.round(m[0]) + sep + Math.round(m[1]) + sep + Math.round(m[2]);
  }
  function firstChanged(value, kind) {
    for (const t of tokenizeTopLevel(value)) {
      const m = rewriteWith(t, kind, map);
      if (m !== t) return m;
    }
    return null;
  }
  function mirrorBackground(value, imp) {
    const layers = splitTopLevel(value, ",");
    const images = [];
    let color = null,
      imagesChanged = false,
      lone = false;
    layers.forEach((layer, index) => {
      const tokens = tokenizeTopLevel(layer);
      let image = "none";
      for (const t of tokens)
        if (isImageToken(t)) {
          image = t;
          break;
        }
      if (/-gradient\(/i.test(image)) {
        const m = rewriteWith(image, "bg", map);
        if (m !== image) {
          imagesChanged = true;
          image = m;
        }
      }
      images.push(image);
      if (index === layers.length - 1) {
        for (const t of tokens) {
          if (isImageToken(t)) continue;
          const m = rewriteWith(t, "bg", map);
          if (m !== t) {
            color = m;
            lone =
              tokens.length === 1 && layers.length === 1 && /^var\(/i.test(t);
            break;
          }
        }
      }
    });
    const out = [];
    if (color) out.push("background-color:" + color + imp);
    if (imagesChanged) out.push("background-image:" + images.join(",") + imp);
    else if (lone) out.push("background-image:" + color + imp);
    return out;
  }
  function mirrorDeclarations(input) {
    resolveDeps();
    const out = [];
    for (const d of typeof input === "string"
      ? splitDeclarations(input)
      : declarationsOf(input)) {
      const imp = d.important ? "!important" : "";
      if (d.prop.startsWith("--")) {
        const name = d.prop.slice(2);
        if (!colorVars.has(name)) continue;
        for (const kind of ["bg", "fg", "bd"]) {
          const v =
            tripleVars.has(name) && TRIPLE.test(d.value)
              ? tripleMap(d.value, kind)
              : rewriteWith(d.value, kind, map);
          out.push("--sd-" + kind + "-" + name + ":" + v + imp);
        }
        continue;
      }
      const kind = propKind(d.prop);
      if (!kind || !d.value) continue;
      if (d.prop === "background") {
        out.push(...mirrorBackground(d.value, imp));
        continue;
      }
      if (COLOR_LONGHAND[d.prop]) {
        const c = firstChanged(d.value, kind);
        if (c) out.push(COLOR_LONGHAND[d.prop] + ":" + c + imp);
        continue;
      }
      const nv = rewriteWith(d.value, kind, map);
      if (nv !== d.value) out.push(d.prop + ":" + nv + imp);
    }
    return out.join(";");
  }
  function sheetRules(rule) {
    try {
      return rule.styleSheet ? Array.from(rule.styleSheet.cssRules) : null;
    } catch {
      return [];
    }
  }
  function learnRule(rule) {
    if (rule.selectorText !== undefined && rule.style)
      learnDeclarations(rule.style.cssText);
    const imported = rule.styleSheet ? sheetRules(rule) : null;
    for (const r of imported || rule.cssRules || []) learnRule(r);
  }
  function mirrorRule(rule) {
    if (rule.selectorText !== undefined && rule.style) {
      let decl = mirrorDeclarations(rule.style);
      if (resolveBlank) {
        // Chrome exposes some colour declarations only as blanks. Let the caller resolve them.
        const blank = splitDeclarations(rule.style.cssText)
          .filter((d) => !d.value && propKind(d.prop))
          .map((d) => d.prop);
        if (blank.length) {
          const extra = resolveBlank(rule, blank);
          if (extra)
            decl = [decl, mirrorDeclarations(extra)].filter(Boolean).join(";");
        }
      }
      let nested = "";
      for (const r of rule.cssRules || []) nested += mirrorRule(r);
      if (!decl && !nested) return "";
      return (
        rule.selectorText +
        "{" +
        decl +
        (decl && nested ? ";" : "") +
        nested +
        "}"
      );
    }
    if (rule.styleSheet) {
      let inner = "";
      for (const r of sheetRules(rule)) inner += mirrorRule(r);
      const media = rule.media && rule.media.mediaText;
      return inner && media && media !== "all"
        ? "@media " + media + "{" + inner + "}"
        : inner;
    }
    if (rule.cssRules) {
      const head = groupHeader(rule);
      if (!head) return "";
      let inner = "";
      for (const r of rule.cssRules) inner += mirrorRule(r);
      return inner ? head + "{" + inner + "}" : "";
    }
    return "";
  }
  return {
    rewrite: (value, kind) => rewriteWith(value, kind, map),
    mirrorDeclarations,
    mirrorRule,
    learnRule,
    learnDeclarations,
    isColorVar: (name) => (resolveDeps(), colorVars.has(name)),
  };
}

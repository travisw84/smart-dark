import { resolveColor } from "./color.js";
import { luminance, contrast, composite } from "./core.js";
import { mapColor, themeBackground, themeText, cssColor } from "./palette.js";
import { createRewriter } from "./cssrewrite.js";

const ATTR = "data-smart-dark-sheet";
const EXCLUDED =
  "script,style,link,meta,img,picture,video,canvas,iframe,object,embed,[data-smart-dark-preserve]";
const SVG_NS = "http://www.w3.org/2000/svg";
const ROOT_BASE = [20, 22, 26, 1];
const BUDGET_MS = 6;

let active = false,
  ready = false,
  palette = "neutral",
  rewriter = null,
  fetchCss = null;
let baseStyle = null,
  fixStyle = null,
  frame = 0,
  scanTimer = 0,
  pendingFetches = 0,
  pumpScheduled = false,
  channel = null;
let queue = new Set(),
  jobs = [],
  effCache = new Map();
const mirrors = new Map(); // source sheet -> { style, done, media, rules, fetching }
const fixIds = new Map();
const releaseSet = new WeakSet();

function appendStyle(kind) {
  const style = document.createElement("style");
  style.setAttribute(ATTR, kind);
  (document.head || document.documentElement).append(style);
  return style;
}
function sourceSheets() {
  const list = [];
  for (const sheet of document.styleSheets) {
    const node = sheet.ownerNode;
    if (
      node &&
      node.nodeType === 1 &&
      (node.hasAttribute(ATTR) || node.classList.contains("darkreader"))
    )
      continue;
    if (!sheet.disabled) list.push(sheet);
  }
  try {
    for (const sheet of document.adoptedStyleSheets || [])
      if (!sheet.disabled) list.push(sheet);
  } catch {
    /* Some pages restrict adopted sheets. */
  }
  return list;
}
// Reads the resolved colours for a rule whose own text hides them, using an element that
// the rule matches. Pseudo-elements are read through their own computed style.
const PSEUDO_ELEMENT =
  /(::?(?:before|after|first-line|first-letter|marker|placeholder))\s*$/i;
const STATE_CLASSES =
  /:(hover|focus|focus-visible|focus-within|active|visited|target|checked|disabled)\b/gi;
function resolveBlank(rule, props) {
  try {
    const pseudo = PSEUDO_ELEMENT.exec(rule.selectorText);
    const base =
      (pseudo ? rule.selectorText.slice(0, pseudo.index) : rule.selectorText)
        .replace(STATE_CLASSES, "")
        .trim() || "*";
    const el = document.querySelector(base);
    if (!el) return "";
    const st = getComputedStyle(el, pseudo ? pseudo[1] : null);
    const wanted = new Set(props);
    // background-image and background-color come from the same hidden shorthand.
    if (wanted.has("background-image") || wanted.has("background-color")) {
      wanted.add("background-image");
      wanted.add("background-color");
    }
    const out = [];
    for (const prop of wanted) {
      const v = st.getPropertyValue(prop);
      if (v && v !== "none" && v !== "rgba(0, 0, 0, 0)")
        out.push(
          prop +
            ":" +
            v +
            (rule.style.getPropertyPriority(prop) === "important"
              ? "!important"
              : ""),
        );
    }
    return out.join(";");
  } catch {
    return "";
  }
}
function newMirror(sheet) {
  const media = sheet.media && sheet.media.mediaText;
  const state = {
    style: appendStyle("mirror"),
    done: 0,
    learned: 0,
    rules: null,
    fetching: false,
    constructed: false,
    media: media && media !== "all" ? media : "",
  };
  mirrors.set(sheet, state);
  return state;
}
function learnNew(state, rules) {
  for (; state.learned < rules.length; state.learned++) {
    try {
      rewriter.learnRule(rules[state.learned]);
    } catch {
      /* Ignore a rule the browser cannot serialise. */
    }
  }
}
async function fetchSheet(sheet) {
  const state = newMirror(sheet);
  state.fetching = true;
  pendingFetches++;
  ready = false;
  try {
    const response = await fetchCss(sheet.href);
    if (!active || mirrors.get(sheet) !== state) return;
    if (response && response.ok) {
      const copy = new CSSStyleSheet();
      copy.replaceSync(response.css);
      state.constructed = true;
      state.rules = copy.cssRules;
      learnNew(state, state.rules);
      jobs.push(state);
    }
  } catch {
    /* A sheet we cannot read keeps its original colours. */
  } finally {
    state.fetching = false;
    pendingFetches = Math.max(0, pendingFetches - 1);
    if (active) schedulePump();
  }
}
function scan() {
  if (!active) return;
  ensureStyles();
  const present = new Set(sourceSheets());
  for (const [sheet, state] of mirrors) {
    if (!present.has(sheet)) {
      state.style.remove();
      mirrors.delete(sheet);
      jobs = jobs.filter((j) => j !== state);
    }
  }
  for (const sheet of present) {
    let state = mirrors.get(sheet);
    if (state && (state.constructed || state.fetching)) continue;
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      if (!state && sheet.href && fetchCss) void fetchSheet(sheet);
      continue;
    }
    if (!state) state = newMirror(sheet);
    if (rules.length < state.done) {
      // Rules were removed. Rebuild this mirror from scratch.
      state.style.remove();
      mirrors.delete(sheet);
      jobs = jobs.filter((j) => j !== state);
      state = newMirror(sheet);
    }
    learnNew(state, rules);
    if (rules.length > state.done) {
      state.rules = rules;
      if (!jobs.includes(state)) jobs.push(state);
      ready = false;
    }
  }
  schedulePump();
}
function schedulePump() {
  if (pumpScheduled) return;
  pumpScheduled = true;
  if (!channel) {
    channel = new MessageChannel();
    channel.port1.onmessage = pump;
  }
  channel.port2.postMessage(0);
}
function pump() {
  pumpScheduled = false;
  if (!active) return;
  const t0 = performance.now();
  while (jobs.length && performance.now() - t0 < BUDGET_MS) {
    const state = jobs[0];
    const rules = state.rules;
    while (state.done < rules.length && performance.now() - t0 < BUDGET_MS) {
      const rule = rules[state.done++];
      let css = "";
      try {
        css = rewriter.mirrorRule(rule);
      } catch {
        css = "";
      }
      if (!css) continue;
      if (state.media) css = "@media " + state.media + "{" + css + "}";
      try {
        state.style.sheet.insertRule(css, state.style.sheet.cssRules.length);
      } catch {
        /* Skip rules this browser rejects. */
      }
    }
    if (state.done >= rules.length) jobs.shift();
  }
  if (jobs.length) schedulePump();
  else if (!pendingFetches) {
    ready = true;
    queue.add(document.documentElement);
    if (!frame) frame = requestAnimationFrame(process);
  }
}
function insertFixRule(kind, css, id) {
  const prop = kind === "bg" ? "background-color" : "color";
  try {
    fixStyle.sheet.insertRule(
      "[data-sd-" + kind + '="' + id + '"]{' + prop + ":" + css + "!important}",
      fixStyle.sheet.cssRules.length,
    );
  } catch {
    /* Ignore. */
  }
}
function setFix(el, kind, color) {
  const css = cssColor(color);
  const key = kind + css;
  let id = fixIds.get(key);
  if (id === undefined) {
    id = fixIds.size + 1;
    fixIds.set(key, id);
    insertFixRule(kind, css, id);
  }
  el.setAttribute("data-sd-" + kind, String(id));
}
// Some sites remove unknown nodes from the head while they render. Put our styles back.
function ensureStyles() {
  const host = () => document.head || document.documentElement;
  if (baseStyle && !baseStyle.isConnected) host().append(baseStyle);
  if (fixStyle && !fixStyle.isConnected) {
    host().append(fixStyle);
    // A re-attached style element starts with an empty sheet.
    for (const [key, id] of fixIds)
      insertFixRule(key.slice(0, 2), key.slice(2), id);
  }
  for (const state of mirrors.values()) {
    if (state.style.isConnected || state.fetching) continue;
    state.style = appendStyle("mirror");
    state.done = 0;
    if (state.rules && !jobs.includes(state)) jobs.push(state);
    ready = false;
  }
}
// The colour behind an element, using current computed styles. Returns null when a
// background image sits in the way, because the real backdrop is then unknown.
function effectiveBackground(el) {
  const chain = [];
  let acc;
  for (let node = el; node; node = node.parentElement) {
    if (effCache.has(node)) {
      acc = effCache.get(node);
      break;
    }
    const st = getComputedStyle(node);
    if (st.backgroundImage !== "none") {
      chain.push({ node, own: null });
      acc = null;
      break;
    }
    const own = resolveColor(st.backgroundColor) || [0, 0, 0, 0];
    chain.push({ node, own, opaque: own[3] >= 0.99 });
    if (own[3] >= 0.99) {
      acc = own;
      break;
    }
  }
  if (acc === undefined) acc = ROOT_BASE;
  for (let i = chain.length - 1; i >= 0; i--) {
    const { node, own, opaque } = chain[i];
    if (own === null) acc = null;
    else if (opaque) acc = own;
    else acc = acc === null ? null : composite(own, acc);
    effCache.set(node, acc);
  }
  return acc;
}
// Fixes what stylesheet mirroring cannot reach: inline styles, colours built from
// unknown variables and anything else that is still light after mirroring.
function fixElement(el) {
  const st = getComputedStyle(el);
  const bg = resolveColor(st.backgroundColor);
  if (bg && bg[3] >= 0.5 && luminance(bg) > 0.38) {
    setFix(el, "bg", themeBackground(bg, palette));
    effCache.delete(el);
  }
  const eff = effectiveBackground(el);
  if (eff && luminance(eff) < 0.3) {
    const fg = resolveColor(st.color);
    if (fg && contrast(composite(fg, eff), eff) < 3.2)
      setFix(el, "fg", themeText(fg, eff));
  }
}
let imageContext = null;
const imageChecked = new WeakSet();
// A dark logo with a transparent background disappears on a dark page. Lighten it.
// Cross origin images cannot be read, so they are left alone.
function looksDarkOnTransparent(img) {
  try {
    if (!imageContext) {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      imageContext = canvas.getContext("2d", { willReadFrequently: true });
    }
    imageContext.clearRect(0, 0, 32, 32);
    imageContext.drawImage(img, 0, 0, 32, 32);
    const d = imageContext.getImageData(0, 0, 32, 32).data;
    let opaque = 0,
      transparent = 0,
      lum = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 32) transparent++;
      else if (d[i + 3] > 128) {
        opaque++;
        lum += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      }
    }
    const total = d.length / 4;
    return (
      opaque > total * 0.02 && transparent > total * 0.2 && lum / opaque < 0.22
    );
  } catch {
    return false;
  }
}
function fixImage(img) {
  if (imageChecked.has(img)) return;
  if (!img.complete || !img.naturalWidth) {
    img.addEventListener("load", () => enqueue(img), { once: true });
    return;
  }
  imageChecked.add(img);
  if (img.naturalWidth * img.naturalHeight > 360000) return;
  const eff = effectiveBackground(img);
  if (eff && luminance(eff) < 0.3 && looksDarkOnTransparent(img))
    img.setAttribute("data-sd-invert", "1");
}
function process() {
  frame = 0;
  if (!active || !ready) return;
  effCache = new Map();
  const t0 = performance.now();
  let n = 0;
  for (const el of queue) {
    queue.delete(el);
    if (releaseSet.delete(el)) {
      el.removeAttribute("data-sd-bg");
      el.removeAttribute("data-sd-fg");
    }
    if (el.tagName === "IMG") {
      if (el.isConnected) fixImage(el);
      continue;
    }
    if (!el.isConnected || el.namespaceURI === SVG_NS || el.matches(EXCLUDED))
      continue;
    for (const child of el.children)
      if (
        (child.tagName === "IMG" || !child.matches(EXCLUDED)) &&
        child.namespaceURI !== SVG_NS
      )
        queue.add(child);
    fixElement(el);
    if (++n >= 300 || performance.now() - t0 > BUDGET_MS) break;
  }
  if (queue.size) frame = requestAnimationFrame(process);
}
export function stopRenderer() {
  active = false;
  ready = false;
  cancelAnimationFrame(frame);
  frame = 0;
  clearInterval(scanTimer);
  queue.clear();
  jobs = [];
  pendingFetches = 0;
  for (const state of mirrors.values()) state.style.remove();
  mirrors.clear();
  baseStyle?.remove();
  fixStyle?.remove();
  baseStyle = fixStyle = null;
  fixIds.clear();
  rewriter = null;
  for (const el of document.querySelectorAll(
    "[data-sd-bg],[data-sd-fg],[data-sd-invert]",
  )) {
    el.removeAttribute("data-sd-bg");
    el.removeAttribute("data-sd-fg");
    el.removeAttribute("data-sd-invert");
  }
}
export function startRenderer(nextPalette, options = {}) {
  if (active && palette === nextPalette) return;
  stopRenderer();
  palette = nextPalette;
  fetchCss = options.fetchCss || null;
  rewriter = createRewriter({
    map: (c, kind) => mapColor(c, kind, palette),
    resolveBlank,
  });
  baseStyle = appendStyle("base");
  baseStyle.textContent =
    "html:root{color-scheme:dark!important}::selection{background:#47649a!important;color:#fff!important}[data-sd-invert]{filter:invert(1) hue-rotate(180deg)!important}";
  fixStyle = appendStyle("fix");
  active = true;
  scan();
  // Mirror the first slice now so the first paint is already dark. The rest follows in slices.
  pumpScheduled = false;
  pump();
  scanTimer = setInterval(() => {
    if (!document.hidden) scan();
  }, 1500);
}
export function rescanSheets() {
  scan();
}
export function enqueue(el, { release = false } = {}) {
  if (
    !active ||
    !el ||
    el.nodeType !== 1 ||
    (el.tagName !== "IMG" && el.matches(EXCLUDED)) ||
    el.closest("[data-smart-dark-preserve]")
  )
    return;
  if (release) releaseSet.add(el);
  queue.add(el);
  if (ready && !frame) frame = requestAnimationFrame(process);
}
export function refreshRenderer() {
  if (active) enqueue(document.documentElement);
}

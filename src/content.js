import { sendMessage } from "./runtime.js";
import {
  enable as enableCompatibility,
  disable as disableCompatibility,
  setFetchMethod,
} from "darkreader";
import { chooseAction, fingerprint } from "./core.js";
import {
  measure,
  viewBucket,
  hasSensitiveInputs,
  setCompatibilityActive,
} from "./detect.js";
import {
  startRenderer,
  stopRenderer,
  enqueue,
  rescanSheets,
} from "./renderer.js";
import {
  tryNative,
  releaseNative,
  nativeChangedExternally,
  withOriginalNative,
} from "./native.js";

const OWN = "style[data-smart-dark-sheet],style.darkreader";
const THEME_ATTRS = [
  "class",
  "style",
  "data-theme",
  "data-color-mode",
  "data-bs-theme",
  "data-mode",
  "data-darkreader-inline-color",
];
let settings = null,
  source = { mode: "unknown", samples: [] },
  decision = null,
  action = "original",
  renderer = "none",
  revision = 0,
  lastFingerprint = "",
  duration = 0,
  timer = 0,
  autoTimer = 0,
  autoAttempts = 0,
  lastRenderAt = 0,
  ready = false,
  lastURL = location.href,
  lastSignature = "",
  nativeRetry = false,
  nativeBlocked = false,
  nativeCheck = 0,
  busy = false;
const token = crypto.randomUUID();

const fetchCss = (url) => sendMessage({ type: "FETCH_CSS", url });
setFetchMethod(async (url) => {
  const r = await fetchCss(url);
  if (!r || !r.ok) throw new Error((r && r.error) || "Stylesheet unavailable");
  return new Response(r.css, { headers: { "Content-Type": "text/css" } });
});

function snapshot(deep) {
  return {
    token,
    revision,
    url: location.href,
    fingerprint: lastFingerprint,
    // The original appearance of the visible page. Only computed for image checks.
    view: deep ? withOriginalNative(viewBucket) : undefined,
    source: {
      mode: source.mode,
      darkRatio: source.darkRatio,
      lightRatio: source.lightRatio,
      sampleCount: source.sampleCount,
    },
    action,
    renderer,
    durationMs: Math.round(duration),
    sensitive: hasSensitiveInputs(),
  };
}
function cleanup() {
  stopRenderer();
  if (renderer === "compatibility") disableCompatibility();
  setCompatibilityActive(false);
  releaseNative();
  renderer = "none";
  lastSignature = "";
}
function autoEligible() {
  return (
    window === window.top &&
    !document.hidden &&
    settings &&
    settings.aiEnabled &&
    settings.autoVision &&
    settings.enabled &&
    settings.siteMode === "auto" &&
    ["mixed", "unknown"].includes(source.mode) &&
    !decision &&
    autoAttempts < 3
  );
}
function scheduleAuto(delay) {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(async () => {
    if (!autoEligible()) return;
    autoAttempts++;
    let r = null;
    try {
      r = await sendMessage({ type: "ANALYZE" });
    } catch {
      r = null;
    }
    if (!(r && r.ok) && autoEligible()) scheduleAuto(5000);
  }, delay);
}
// Measures the original page colours and picks a treatment. Measuring briefly switches our
// own sheets off, so this runs on page level changes and not on every DOM update.
function render() {
  lastRenderAt = performance.now();
  if (!settings || !document.body) return;
  const start = performance.now();
  busy = true;
  try {
    if (
      renderer !== "compatibility" &&
      document.querySelector("style.darkreader")
    ) {
      cleanup();
      source = measure();
      lastFingerprint = fingerprint(source);
      action = "original";
      renderer = "external";
      duration = performance.now() - start;
      return;
    }
    if (nativeChangedExternally()) {
      releaseNative();
      if (renderer === "native") {
        // The site reset the attribute we set. Do not fight it. Use the adaptive theme.
        renderer = "none";
        lastSignature = "";
        nativeBlocked = true;
      }
    }
    source = withOriginalNative(measure);
    const fp = fingerprint(source);
    if (fp !== lastFingerprint) {
      lastFingerprint = fp;
      decision = null;
      revision++;
      autoAttempts = 0;
    }
    action = chooseAction(settings, source.mode, decision);
    const signature = JSON.stringify([
      action,
      settings.engine,
      settings.brightness,
      settings.contrast,
    ]);
    if (signature !== lastSignature) {
      cleanup();
      lastSignature = signature;
      if (action !== "original") {
        if (
          settings.engine === "adaptive" &&
          !nativeBlocked &&
          tryNative(() => measure().mode === "dark")
        ) {
          renderer = "native";
          watchNative();
        } else if (settings.engine === "compatibility") {
          setCompatibilityActive(true);
          enableCompatibility(
            {
              brightness: settings.brightness,
              contrast: settings.contrast,
              sepia: action === "warm" ? 15 : 0,
              darkSchemeBackgroundColor:
                action === "warm" ? "#1d1a17" : "#141820",
              darkSchemeTextColor: "#e5e7eb",
            },
            {
              ignoreImageAnalysis: ["*"],
              ignoreInlineStyle: ["svg *"],
              disableStyleSheetsProxy: true,
            },
          );
          renderer = "compatibility";
        } else {
          startRenderer(action, { fetchCss });
          renderer = "adaptive";
        }
      }
    }
    if (
      signature === lastSignature &&
      nativeRetry &&
      !nativeBlocked &&
      renderer === "adaptive" &&
      settings.engine === "adaptive"
    ) {
      // A stylesheet that arrived after the first render may bring the site's own dark theme.
      if (tryNative(() => measure().mode === "dark")) {
        stopRenderer();
        renderer = "native";
        watchNative();
      }
    }
    nativeRetry = false;
    duration = performance.now() - start;
    observer.takeRecords();
    if (autoEligible()) scheduleAuto(1000);
  } finally {
    busy = false;
  }
}
// Some sites set their own theme attribute straight after we do. Check once that ours stuck.
function watchNative() {
  clearTimeout(nativeCheck);
  nativeCheck = setTimeout(() => {
    if (renderer === "native" && nativeChangedExternally()) render();
  }, 900);
}
function schedule(delay = 100) {
  clearTimeout(timer);
  // Measuring switches our sheets off for a moment. Space measures out on heavy pages.
  const gap = Math.max(500, duration * 8);
  const wait = Math.max(delay, lastRenderAt + gap - performance.now(), 0);
  timer = setTimeout(render, wait);
}
function onNavigate() {
  nativeBlocked = false;
  revision++;
  decision = null;
  autoAttempts = 0;
  schedule(300);
}
const observer = new MutationObserver((mutations) => {
  if (busy) return;
  let sheetsChanged = false,
    rootChanged = false;
  for (const m of mutations) {
    const target = m.target;
    if (target.nodeType === 1 && target.closest && target.closest(OWN))
      continue;
    if (m.type === "characterData") {
      const parent = target.parentElement;
      if (parent && parent.closest(OWN)) continue;
      if (parent && parent.nodeName === "STYLE") sheetsChanged = true;
      continue;
    }
    if (m.type === "attributes") {
      if (m.attributeName.startsWith("data-darkreader")) continue;
      if (target === document.documentElement || target === document.body)
        rootChanged = true;
      else if (renderer === "adaptive") enqueue(target, { release: true });
      continue;
    }
    for (const n of m.addedNodes) {
      if (n.nodeType !== 1 || n.matches(OWN)) continue;
      if (n.matches("style,link") || n.querySelector("style,link"))
        sheetsChanged = true;
      if (renderer === "adaptive") enqueue(n);
    }
    for (const n of m.removedNodes)
      if (n.nodeType === 1 && n.matches("style,link")) sheetsChanged = true;
  }
  if (sheetsChanged) {
    nativeRetry = true;
    if (renderer === "adaptive") rescanSheets();
    schedule(400);
  }
  // Theme classes on the page root can change the original look. render() only restarts
  // the theme when the measured result differs, so a menu class on body costs one measure.
  if (rootChanged) schedule(400);
});
async function reloadSettings() {
  const r = await sendMessage({ type: "GET_SETTINGS" });
  if (!r || !r.ok) return;
  settings = r.settings;
  decision = null;
  revision++;
  autoAttempts = 0;
  clearTimeout(autoTimer);
  if (!settings.enabled || settings.siteMode === "original") {
    cleanup();
    action = "original";
  }
  render();
}
chrome.runtime.onMessage.addListener((m, _sender, reply) => {
  if (m.type === "FRAME_SAFETY") {
    reply({
      token,
      revision,
      url: location.href,
      sensitive: hasSensitiveInputs(),
    });
    return false;
  }
  if (m.type === "STATUS") {
    reply(snapshot(m.deep === true));
    return false;
  }
  if (m.type === "SETTINGS_CHANGED") {
    void reloadSettings();
    reply({ ok: true });
    return false;
  }
  if (m.type === "AI_DECISION") {
    if (
      settings &&
      settings.aiEnabled &&
      settings.enabled &&
      settings.siteMode === "auto" &&
      m.token === token &&
      m.revision === revision &&
      m.fingerprint === lastFingerprint &&
      m.url === location.href
    ) {
      decision = m.decision;
      render();
      reply({ ok: true });
    } else reply({ ok: false });
    return false;
  }
  return false;
});
function start() {
  if (ready || !document.body) return;
  ready = true;
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: THEME_ATTRS,
  });
  document.addEventListener(
    "load",
    (e) => {
      if (e.target && e.target.tagName === "LINK") {
        nativeRetry = true;
        if (renderer === "adaptive") rescanSheets();
        schedule(400);
      }
    },
    true,
  );
  addEventListener("load", () => {
    nativeRetry = true;
    schedule(300);
  });
  addEventListener("popstate", onNavigate);
  addEventListener("hashchange", onNavigate);
  addEventListener("visibilitychange", () => {
    if (!document.hidden && location.href !== lastURL) {
      lastURL = location.href;
      onNavigate();
    }
  });
  // Single page apps change the address without a page load.
  setInterval(() => {
    if (location.href !== lastURL) {
      lastURL = location.href;
      onNavigate();
    }
  }, 1000);
  void reloadSettings();
}
if (document.body) start();
else {
  const startup = new MutationObserver(() => {
    if (document.body) {
      startup.disconnect();
      start();
    }
  });
  startup.observe(document, { childList: true, subtree: true });
}
document.addEventListener(
  "DOMContentLoaded",
  () => {
    start();
    schedule();
  },
  { once: true },
);

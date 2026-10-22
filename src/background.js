import { safeSettings } from "./core.js";
import { allowStylesheetFetch } from "./netguard.js";
import {
  ENDPOINT,
  buildVisionRequest,
  parseDecision,
  sanitizeSummary,
} from "./jev.js";
let epoch = 0,
  focusRevision = 0;
chrome.tabs.onActivated.addListener(() => {
  focusRevision++;
});
chrome.windows.onFocusChanged.addListener(() => {
  focusRevision++;
});
const flights = new Map();
let budgetLock = Promise.resolve();
let settingsLock = Promise.resolve();
const ready = chrome.storage.local.setAccessLevel({
  accessLevel: "TRUSTED_CONTEXTS",
});
const isWeb = (url) => typeof url === "string" && /^https?:\/\//.test(url);
const isTrusted = (sender) =>
  sender.id === chrome.runtime.id &&
  ["popup.html", "options.html"].some(
    (path) => sender.url === chrome.runtime.getURL(path),
  );
async function read() {
  await ready;
  const raw = await chrome.storage.local.get(["settings", "apiKey"]);
  return {
    settings: safeSettings(raw.settings),
    key: typeof raw.apiKey === "string" ? raw.apiKey : "",
  };
}
async function publicSettings(sender) {
  const { settings, key } = await read();
  let origin = "";
  try {
    origin = new URL(sender.tab?.url || "").origin;
  } catch {}
  return {
    ...settings,
    siteMode: settings.sites[origin] || "auto",
    hasKey: isTrusted(sender) ? !!key : undefined,
  };
}
async function broadcast() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs
      .filter((t) => isWeb(t.url))
      .map((t) => chrome.tabs.sendMessage(t.id, { type: "SETTINGS_CHANGED" })),
  );
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || (!changes.settings && !changes.apiKey)) return;
  epoch++;
  for (const { controller } of flights.values()) controller.abort();
  void broadcast();
});
async function currentTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const active = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.active || active[0]?.id !== tab.id || !isWeb(tab.url))
    throw new Error("Keep this website active in the focused Chrome window.");
  const win = await chrome.windows.get(tab.windowId);
  if (!win.focused)
    throw new Error("Focus the Chrome window before checking this page.");
  return tab;
}
async function currentStatus(tabId) {
  // deep asks the page for its original appearance, which needs a brief style toggle.
  return chrome.tabs.sendMessage(
    tabId,
    { type: "STATUS", deep: true },
    { frameId: 0 },
  );
}
function sameDocument(a, b) {
  return (
    a?.token === b?.token &&
    a?.revision === b?.revision &&
    a?.fingerprint === b?.fingerprint &&
    a?.view === b?.view &&
    a?.url === b?.url
  );
}
async function digest(value) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");
}
async function frameSafety(tabId) {
  const frames = await chrome.webNavigation.getAllFrames({ tabId });
  if (!frames?.length)
    throw new Error("Cannot verify embedded content. Nothing was sent.");
  return Promise.all(
    frames
      .sort((a, b) => a.frameId - b.frameId)
      .map(async (frame) => {
        let status;
        try {
          status = await chrome.tabs.sendMessage(
            tabId,
            { type: "FRAME_SAFETY" },
            { frameId: frame.frameId },
          );
        } catch {
          throw new Error(
            "Cannot verify an embedded frame. Image sharing is paused.",
          );
        }
        if (!status?.token)
          throw new Error(
            "Embedded frame is not ready. Image sharing is paused.",
          );
        if (status.sensitive)
          throw new Error(
            "Image checks are paused while password or payment fields are visible, including embedded frames.",
          );
        return {
          frameId: frame.frameId,
          token: status.token,
          revision: status.revision,
          url: status.url,
        };
      }),
  );
}
const sameFrames = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function useBudget(tabId, automatic) {
  const operation = budgetLock.then(async () => {
    const day = new Date().toISOString().slice(0, 10),
      data = await chrome.storage.local.get("visionBudget");
    const budget =
      data.visionBudget?.day === day
        ? data.visionBudget
        : { day, count: 0, last: {} };
    if (budget.count >= 30)
      throw new Error(
        "Daily image-check limit reached (30). Local dark mode still works.",
      );
    if (automatic && Date.now() - (budget.last[tabId] || 0) < 30000)
      throw new Error("Automatic image check is cooling down.");
    budget.count++;
    budget.last[tabId] = Date.now();
    await chrome.storage.local.set({ visionBudget: budget });
  });
  budgetLock = operation.catch(() => {});
  return operation;
}
async function analyze(message, sender) {
  const { settings, key } = await read();
  if (!settings.aiEnabled)
    throw new Error("Enable Jev image sharing in settings first.");
  if (!key) throw new Error("Add your TypeSafe API key in settings.");
  const trusted = isTrusted(sender),
    automatic = !trusted;
  if (automatic && (!settings.autoVision || sender.frameId !== 0))
    throw new Error("Automatic image checks are disabled.");
  const tabId = trusted ? message.tabId : sender.tab?.id;
  if (!Number.isInteger(tabId)) throw new Error("No website selected.");
  if (flights.has(tabId))
    throw new Error("An image check is already running for this tab.");
  const controller = new AbortController();
  flights.set(tabId, { controller });
  const startEpoch = epoch;
  const startFocus = focusRevision;
  try {
    const tab = await currentTab(tabId),
      initial = await currentStatus(tabId);
    const origin = new URL(tab.url).origin;
    if (!settings.enabled || (settings.sites[origin] || "auto") !== "auto")
      throw new Error(
        "Select Auto and enable dark mode before checking this page.",
      );
    if (initial.sensitive)
      throw new Error(
        "Image checks are paused while password or payment fields are visible.",
      );
    if (automatic && !["mixed", "unknown"].includes(initial.source.mode))
      throw new Error("Local detection is already decisive.");
    const initialFrames = await frameSafety(tabId);
    const cacheKey = await digest(
      initial.url +
        "\n" +
        initial.fingerprint +
        "\n" +
        initial.action +
        "\n" +
        initial.view,
    );
    const cache =
      (await chrome.storage.session.get("visionCache")).visionCache || {};
    if (
      automatic &&
      cache[cacheKey] &&
      Date.now() - cache[cacheKey].time < 3600000
    ) {
      if (
        epoch !== startEpoch ||
        focusRevision !== startFocus ||
        !sameDocument(initial, await currentStatus(tabId))
      )
        throw new Error("The page changed. Try again.");
      const applied = await chrome.tabs.sendMessage(
        tabId,
        {
          type: "AI_DECISION",
          decision: cache[cacheKey].decision,
          token: initial.token,
          revision: initial.revision,
          fingerprint: initial.fingerprint,
          url: initial.url,
        },
        { frameId: 0 },
      );
      if (!applied?.ok)
        throw new Error(
          "The cached result was discarded because the page changed.",
        );
      return { ok: true, decision: cache[cacheKey].decision, cached: true };
    }
    await useBudget(tabId, automatic);
    await currentTab(tabId);
    const image = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "jpeg",
      quality: 45,
    });
    await currentTab(tabId);
    const afterCapture = await currentStatus(tabId);
    if (
      epoch !== startEpoch ||
      focusRevision !== startFocus ||
      !sameDocument(initial, afterCapture) ||
      afterCapture.sensitive
    )
      throw new Error("The page changed during capture. Nothing was sent.");
    if (!sameFrames(initialFrames, await frameSafety(tabId)))
      throw new Error(
        "Embedded page changed during capture. Nothing was sent.",
      );
    const body = buildVisionRequest(image, sanitizeSummary(initial.source));
    if (
      epoch !== startEpoch ||
      focusRevision !== startFocus ||
      !sameDocument(initial, await currentStatus(tabId)) ||
      !sameFrames(initialFrames, await frameSafety(tabId))
    )
      throw new Error("Page changed before upload. Nothing was sent.");
    const timer = setTimeout(() => controller.abort(), 12000);
    let response, data;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "TypeSafe-Danger-Zone-Images": "true",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
      });
      if (!response.ok)
        throw new Error(
          `TypeSafe returned HTTP ${response.status}. Local dark mode is still active.`,
        );
      const text = await response.text();
      if (text.length > 65536)
        throw new Error("TypeSafe response exceeded the size limit.");
      data = JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }
    const decision = parseDecision(data);
    const latest = await read();
    if (!sameFrames(initialFrames, await frameSafety(tabId)))
      throw new Error(
        "Embedded content changed. The old result was discarded.",
      );
    await currentTab(tabId);
    if (
      epoch !== startEpoch ||
      focusRevision !== startFocus ||
      !latest.settings.aiEnabled ||
      !sameDocument(initial, await currentStatus(tabId))
    )
      throw new Error(
        "Page or settings changed. The old result was discarded.",
      );
    const applied = await chrome.tabs.sendMessage(
      tabId,
      {
        type: "AI_DECISION",
        decision,
        token: initial.token,
        revision: initial.revision,
        fingerprint: initial.fingerprint,
        url: initial.url,
      },
      { frameId: 0 },
    );
    if (!applied?.ok)
      throw new Error("The page changed. The old result was discarded.");
    cache[cacheKey] = { decision, time: Date.now() };
    const trimmed = Object.fromEntries(
      Object.entries(cache)
        .sort((a, b) => b[1].time - a[1].time)
        .slice(0, 100),
    );
    await chrome.storage.session.set({ visionCache: trimmed });
    return { ok: true, decision, cached: false };
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error(
        "Image check timed out or settings changed. Local mode continues.",
      );
    throw error;
  } finally {
    flights.delete(tabId);
  }
}
async function fetchCSS(message, sender) {
  if (
    !isWeb(message.url) ||
    !allowStylesheetFetch(message.url, sender.tab?.url)
  )
    throw new Error("This stylesheet address is not allowed.");
  const res = await fetch(message.url, {
    credentials: "omit",
    signal: AbortSignal.timeout(6000),
    redirect: "error",
  });
  if (!res.ok || !res.headers.get("content-type")?.includes("text/css"))
    throw new Error("Only public CSS stylesheets can be fetched.");
  const reader = res.body.getReader(),
    chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 1_000_000) {
      await reader.cancel();
      throw new Error("Stylesheet exceeds size limit.");
    }
    chunks.push(value);
  }
  const data = new Uint8Array(bytes);
  let at = 0;
  for (const c of chunks) {
    data.set(c, at);
    at += c.length;
  }
  return { ok: true, css: new TextDecoder().decode(data) };
}
async function handle(m, sender) {
  if (sender.id !== chrome.runtime.id) throw new Error("Unknown sender.");
  if (m?.type === "GET_SETTINGS")
    return { ok: true, settings: await publicSettings(sender) };
  if (m?.type === "UPDATE_SETTINGS") {
    if (!isTrusted(sender))
      throw new Error("Settings can only be changed in the extension.");
    const operation = settingsLock.then(async () => {
      const { settings } = await read(),
        patch = m.patch || {};
      if (Object.hasOwn(patch, "apiKey")) {
        if (
          typeof patch.apiKey !== "string" ||
          patch.apiKey.length > 1000 ||
          /[\r\n]/.test(patch.apiKey)
        )
          throw new Error("Invalid API key.");
        await chrome.storage.local.set({ apiKey: patch.apiKey.trim() });
      }
      const next = safeSettings({ ...settings, ...patch });
      await chrome.storage.local.set({ settings: next });
      return { ok: true, settings: await publicSettings(sender) };
    });
    settingsLock = operation.catch(() => {});
    return operation;
  }
  if (m?.type === "ANALYZE") return analyze(m, sender);
  if (m?.type === "FETCH_CSS" && sender.tab) return fetchCSS(m, sender);
  return { ok: false, error: "Unsupported request." };
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  handle(m, sender)
    .then(reply)
    .catch((e) => reply({ ok: false, error: e.message || "Request failed." }));
  return true;
});

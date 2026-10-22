const $ = (id) => document.getElementById(id);
let settings, tab;
const request = (m) => chrome.runtime.sendMessage(m);
async function update(patch) {
  const r = await request({ type: "UPDATE_SETTINGS", patch });
  if (!r.ok) {
    $("status").textContent = r.error;
    return;
  }
  settings = r.settings;
  await load();
}
async function load() {
  const r = await request({ type: "GET_SETTINGS" });
  if (!r.ok) {
    $("status").textContent = r.error;
    return;
  }
  settings = r.settings;
  $("enabled").checked = settings.enabled;
  $("enabled").disabled = false;
  $("palette").disabled = false;
  $("engine").disabled = false;
  $("palette").value = settings.palette;
  $("engine").value = settings.engine;
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let origin = "";
  try {
    origin = new URL(tab?.url).origin;
  } catch {}
  const web = /^https?:/.test(tab?.url || "");
  $("site").textContent = web ? new URL(origin).hostname : "Open a website";
  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.disabled = !web;
    b.setAttribute(
      "aria-pressed",
      String((settings.sites[origin] || "auto") === b.dataset.mode),
    );
    b.onclick = () =>
      update({ sites: { ...settings.sites, [origin]: b.dataset.mode } });
  });
  if (web) {
    try {
      const s = await chrome.tabs.sendMessage(
        tab.id,
        { type: "STATUS" },
        { frameId: 0 },
      );
      $("status").textContent = !settings.enabled
        ? "Dark mode is off"
        : s.renderer === "external"
          ? "Another dark-mode extension is active"
          : s.renderer === "native"
            ? "Using this site's own dark theme"
            : s.action === "original"
              ? "Keeping the original appearance"
              : s.renderer === "compatibility"
                ? "Dark Reader compatibility mode"
                : "Smart Dark theme active";
      $("detail").textContent =
        {
          light: "The original page is light.",
          dark: "The original page is dark.",
          mixed: "The original page mixes light and dark.",
          unknown: "The original page could not be classified.",
        }[s.source.mode] || "";
    } catch {
      $("status").textContent = "Reload this tab to activate Smart Dark.";
      $("detail").textContent =
        "Existing tabs need one reload after installation.";
    }
  } else {
    $("status").textContent = "Chrome protects this page from extensions.";
    $("detail").textContent = "Visit a normal website to use Smart Dark.";
  }
  $("analyze").disabled =
    !web ||
    !settings.enabled ||
    !settings.aiEnabled ||
    !settings.hasKey ||
    (settings.sites[origin] || "auto") !== "auto";
  $("ai-status").textContent = !settings.aiEnabled
    ? "Enable screenshot sharing in settings to use Jev."
    : !settings.hasKey
      ? "Add your TypeSafe key in settings."
      : settings.autoVision
        ? "Automatic checks run when Smart Dark is unsure."
        : "Manual checks only. Sends the visible page to TypeSafe.";
}
$("enabled").onchange = () => update({ enabled: $("enabled").checked });
$("palette").onchange = () => update({ palette: $("palette").value });
$("engine").onchange = () => update({ engine: $("engine").value });
$("options").onclick = () => chrome.runtime.openOptionsPage();
$("analyze").onclick = async () => {
  const tabId = tab?.id;
  $("analyze").disabled = true;
  $("ai-status").textContent = "Checking the screenshot with Jev...";
  try {
    const r = await request({ type: "ANALYZE", tabId });
    $("ai-status").textContent = r.ok
      ? {
          keep_dark: "Jev kept the current theme.",
          use_original: "Jev restored the original appearance.",
          warmer: "Jev chose warm charcoal.",
          neutral: "Jev chose charcoal.",
          uncertain: "No change. Jev was unsure.",
        }[r.decision.choice] || "No change to the current theme."
      : r.error;
  } catch {
    $("ai-status").textContent =
      "Could not check this page. Local mode continues.";
  } finally {
    $("analyze").disabled = false;
  }
};
void load();

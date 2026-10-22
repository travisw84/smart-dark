const $ = (id) => document.getElementById(id);
let removeKey = false;
function consentState() {
  $("autoVision").disabled = !$("aiEnabled").checked;
  if (!$("aiEnabled").checked) $("autoVision").checked = false;
}
async function load() {
  const r = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  if (!r.ok) {
    $("saved").textContent = r.error;
    return;
  }
  const s = r.settings;
  $("aiEnabled").checked = s.aiEnabled;
  $("autoVision").checked = s.autoVision;
  $("palette").value = s.palette;
  $("engine").value = s.engine;
  $("key-status").textContent = s.hasKey
    ? "A key is saved. Leave this blank to keep it."
    : "No key saved. Local dark mode works without a key.";
  consentState();
}
$("aiEnabled").onchange = consentState;
$("remove-key").onclick = () => {
  removeKey = true;
  $("key").value = "";
  $("key-status").textContent = "Key will be removed when you save.";
};
$("settings").onsubmit = async (e) => {
  e.preventDefault();
  const patch = {
    aiEnabled: $("aiEnabled").checked,
    autoVision: $("autoVision").checked,
    palette: $("palette").value,
    engine: $("engine").value,
  };
  if (removeKey || $("key").value.trim())
    patch.apiKey = removeKey ? "" : $("key").value.trim();
  const r = await chrome.runtime.sendMessage({
    type: "UPDATE_SETTINGS",
    patch,
  });
  $("saved").textContent = r.ok
    ? "Saved. Changes apply to open websites."
    : r.error;
  if (r.ok) {
    $("key").value = "";
    removeKey = false;
    await load();
  }
};
void load();

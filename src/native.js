let active = null;
function restore(state) {
  const { el, attr, before, after } = state;
  if (attr === "class") {
    const oldClasses = new Set((before || "").split(/\s+/).filter(Boolean));
    const newClasses = new Set(after.split(/\s+/).filter(Boolean));
    // Only undo the tokens we changed. Preserve unrelated application classes.
    for (const name of newClasses)
      if (!oldClasses.has(name)) el.classList.remove(name);
    for (const name of oldClasses)
      if (!newClasses.has(name)) el.classList.add(name);
    if (before === null && el.classList.length === 0)
      el.removeAttribute("class");
  } else if (el.getAttribute(attr) === after) {
    if (before === null) el.removeAttribute(attr);
    else el.setAttribute(attr, before);
  }
}
export function releaseNative() {
  if (!active) return;
  if (!nativeChangedExternally()) restore(active);
  active = null;
}
export function nativeChangedExternally() {
  if (!active) return false;
  if (active.attr === "class") {
    const expected = new Set(active.after.split(/\s+/));
    return ["dark", "light"].some(
      (name) => active.el.classList.contains(name) !== expected.has(name),
    );
  }
  return active.el.getAttribute(active.attr) !== active.after;
}
export function tryNative(isDark) {
  if (active) return true;
  let selectors = "",
    count = 0;
  function scan(rules) {
    for (const rule of rules) {
      if (++count > 4000) return;
      if (rule.selectorText) selectors += " " + rule.selectorText;
      if (rule.cssRules) scan(rule.cssRules);
    }
  }
  for (const sheet of document.styleSheets) {
    try {
      if (!sheet.ownerNode?.matches?.("[data-smart-dark-sheet],.darkreader"))
        scan(sheet.cssRules);
    } catch {
      /* Cross-origin stylesheets are not readable. */
    }
  }
  const root = document.documentElement,
    candidates = [];
  for (const attr of [
    "data-theme",
    "data-color-mode",
    "data-bs-theme",
    "data-mode",
  ]) {
    if (new RegExp(`\\[${attr}\\s*=\\s*["']?dark["']?\\s*\\]`).test(selectors))
      candidates.push({ el: root, attr, after: "dark" });
  }
  if (/\.dark(?=[\s:.[#>+~,)])/m.test(selectors))
    candidates.push({
      el: root,
      attr: "class",
      after: [...root.classList]
        .filter((c) => c !== "light")
        .concat("dark")
        .join(" "),
    });
  for (const candidate of candidates) {
    const before = candidate.el.getAttribute(candidate.attr);
    candidate.el.setAttribute(candidate.attr, candidate.after);
    if (isDark()) {
      active = { ...candidate, before };
      return true;
    }
    if (before === null) candidate.el.removeAttribute(candidate.attr);
    else candidate.el.setAttribute(candidate.attr, before);
  }
  return false;
}
export function withOriginalNative(fn) {
  if (!active || nativeChangedExternally()) return fn();
  const { el, attr } = active,
    current = el.getAttribute(attr);
  restore(active);
  try {
    return fn();
  } finally {
    if (current === null) el.removeAttribute(attr);
    else el.setAttribute(attr, current);
  }
}

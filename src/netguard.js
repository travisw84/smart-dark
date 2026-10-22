// Guards the service worker stylesheet fetcher. A page may ask for any URL, so private
// network targets are only allowed when the page itself lives at that origin.
export function isPrivateHost(host) {
  let h = String(host || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  )
    return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (h.includes(":"))
    return h === "::1" || h === "::" || /^f[cd]/.test(h) || /^fe[89ab]/.test(h);
  return false;
}
export function allowStylesheetFetch(target, tabUrl) {
  let t, p;
  try {
    t = new URL(target);
    p = new URL(tabUrl);
  } catch {
    return false;
  }
  if (t.protocol !== "http:" && t.protocol !== "https:") return false;
  if (!isPrivateHost(t.hostname)) return true;
  return t.origin === p.origin;
}

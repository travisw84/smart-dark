import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const dist = fileURLToPath(new URL("../../dist", import.meta.url));
const big = (n) =>
  '<style>body{margin:0;background:#fff;color:#222;font:14px system-ui}.c{display:inline-block;width:60px;height:24px;margin:2px;background:#f3f3f3;color:#333;border:1px solid #ddd}</style><div id=r></div><script>let h="";for(let i=0;i<' +
  n +
  ';i++)h+="<span class=c>"+i+"</span>";r.innerHTML=h</script>';
const server = createServer((q, s) => {
  s.setHeader("Content-Type", "text/html");
  const u = q.url.split("?")[0];
  if (u.startsWith("/big/")) return s.end(big(+u.slice(5)));
  if (u === "/ticker")
    return s.end(
      '<style>body{margin:0;background:#808080;color:#111;font:18px system-ui;height:900px}</style><h1 id=t>tick 0</h1><script>let n=0;setInterval(()=>{t.textContent="tick "+(++n)},500)</script>',
    );
  s.end("<p>ok</p>");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const profile = await mkdtemp(path.join(tmpdir(), "sd-probe-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  args: ["--disable-extensions-except=" + dist, "--load-extension=" + dist],
});
const worker =
  ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
const id = worker.url().split("/")[2];
const control = await ctx.newPage();
await control.goto("chrome-extension://" + id + "/options.html");
const out = { scaling: [] };
for (const n of [300, 1000, 3000]) {
  const p = await ctx.newPage();
  const t0 = Date.now();
  await p.goto(origin + "/big/" + n);
  const samples = [];
  for (const at of [500, 1500, 3000, 6000]) {
    await p.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
    samples.push([
      at,
      await p.evaluate(
        () => document.querySelectorAll("[data-smart-dark]").length,
      ),
    ]);
  }
  out.scaling.push({ elements: n, themed_at_ms: samples });
  await p.close();
}
await worker.evaluate(async () => {
  await chrome.storage.local.set({ apiKey: "synthetic" });
  const s = (await chrome.storage.local.get("settings")).settings || {};
  await chrome.storage.local.set({
    settings: { ...s, aiEnabled: true, autoVision: false },
  });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        answers: { treatment: { choice: "use_original", confidence: 0.97 } },
      }),
    );
});
{
  const p = await ctx.newPage();
  await p.goto(origin + "/ticker");
  await p.bringToFront();
  await p.waitForTimeout(1500);
  const tabId = await worker.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id,
    p.url(),
  );
  const errs = [];
  for (let i = 0; i < 3; i++) {
    const r = await control.evaluate(
      async (tabId) => chrome.runtime.sendMessage({ type: "ANALYZE", tabId }),
      tabId,
    );
    errs.push(r.ok ? "ok" : r.error);
    await new Promise((r) => setTimeout(r, 1300));
  }
  out.ticker_manual_check_results = errs;
  await p.close();
}
console.log(JSON.stringify(out));
await ctx.close();
server.close();
await rm(profile, { recursive: true, force: true });

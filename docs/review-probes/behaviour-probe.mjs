import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const dist = fileURLToPath(new URL("../../dist", import.meta.url));
const pages = {
  "/hover":
    "<style>body{margin:0;background:#fff;color:#222;font:18px system-ui;height:2000px}a.b{display:inline-block;margin:20px;padding:14px;background:#eee;color:#333}a.b:hover{background:#0a7;color:#fff}</style><a class=b href=#>Hover me</a>",
  "/oklch":
    "<style>body{margin:0;background:oklch(0.99 0 0);color:oklch(0.2 0 0);font:18px system-ui;height:900px}.card{margin:20px;padding:20px;background:oklch(0.95 0.01 250);color:oklch(0.25 0.02 250)}</style><div class=card>Tailwind v4 style card</div><p>Body text</p>",
  "/scroll":
    "<style>body{margin:0;background:#fff;color:#222;font:18px system-ui;height:3000px}</style><h1>Tall page</h1>",
  "/ticker":
    '<style>body{margin:0;background:#808080;color:#111;font:18px system-ui;height:900px}</style><h1 id=t>tick 0</h1><script>let n=0;setInterval(()=>{document.getElementById("t").textContent="tick "+(++n)},500)</script>',
  "/big":
    '<style>body{margin:0;background:#fff;color:#222;font:14px system-ui}.c{display:inline-block;width:60px;height:24px;margin:2px;background:#f3f3f3;color:#333;border:1px solid #ddd}</style><div id=root></div><script>const r=document.getElementById("root");let h="";for(let i=0;i<8000;i++)h+="<span class=c>"+i+"</span>";r.innerHTML=h</script>',
};
const server = createServer((q, s) => {
  s.setHeader("Content-Type", "text/html");
  s.end(pages[q.url.split("?")[0]] || "<p>ok</p>");
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
const set = async (patch) => {
  await worker.evaluate(async (p) => {
    const s = (await chrome.storage.local.get("settings")).settings || {};
    await chrome.storage.local.set({ settings: { ...s, ...p } });
  }, patch);
  await new Promise((r) => setTimeout(r, 300));
};
const bg = (p, sel = "body") =>
  p.locator(sel).evaluate((e) => getComputedStyle(e).backgroundColor);
const out = {};
await set({
  enabled: true,
  sites: {},
  engine: "adaptive",
  aiEnabled: false,
  autoVision: false,
});
// B: hover
{
  const p = await ctx.newPage();
  await p.goto(origin + "/hover");
  await p.waitForTimeout(600);
  out.hover_before = await bg(p, "a.b");
  await p.hover("a.b");
  await p.waitForTimeout(300);
  out.hover_during = await bg(p, "a.b");
  out.hover_text = await p
    .locator("a.b")
    .evaluate((e) => getComputedStyle(e).color);
  // control: same page with extension disabled
  await set({ enabled: false });
  await p.waitForTimeout(400);
  await p.mouse.move(0, 0);
  await p.hover("a.b");
  await p.waitForTimeout(300);
  out.hover_native = await bg(p, "a.b");
  await set({ enabled: true });
  await p.close();
}
// C: oklch
{
  const p = await ctx.newPage();
  await p.goto(origin + "/oklch");
  await p.waitForTimeout(700);
  out.oklch_body = await bg(p);
  out.oklch_card = await bg(p, ".card");
  out.oklch_raw = await p
    .locator(".card")
    .evaluate((e) => getComputedStyle(e).backgroundColor);
  out.oklch_status = await worker.evaluate(async (url) => {
    const t = (await chrome.tabs.query({})).find((t) => t.url === url);
    return chrome.tabs.sendMessage(t.id, { type: "STATUS" });
  }, p.url());
  await p.close();
}
// A: decision persistence
await worker.evaluate(async () => {
  await chrome.storage.local.set({ apiKey: "synthetic" });
  globalThis.visionCalls = 0;
  globalThis.fetch = async () => {
    visionCalls++;
    return new Response(
      JSON.stringify({
        answers: { treatment: { choice: "use_original", confidence: 0.97 } },
      }),
    );
  };
});
await set({ aiEnabled: true });
{
  const p = await ctx.newPage();
  await p.goto(origin + "/scroll");
  await p.waitForTimeout(600);
  await p.bringToFront();
  out.scroll_dark_initial = await bg(p);
  const tabId = await worker.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id,
    p.url(),
  );
  await new Promise((r) => setTimeout(r, 1200));
  const r = await control.evaluate(
    async (tabId) => chrome.runtime.sendMessage({ type: "ANALYZE", tabId }),
    tabId,
  );
  out.analyze_ok = r.ok;
  out.analyze_error = r.error;
  await p.waitForTimeout(300);
  out.after_decision = await bg(p);
  await p.evaluate(() => window.scrollBy(0, 400));
  await p.waitForTimeout(500);
  out.after_scroll = await bg(p);
  await p.close();
}
// A2: decision then trivial DOM mutation
{
  await new Promise((r) => setTimeout(r, 1200));
  const p = await ctx.newPage();
  await p.goto(origin + "/scroll");
  await p.waitForTimeout(600);
  await p.bringToFront();
  const tabId = await worker.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id,
    p.url(),
  );
  const r = await control.evaluate(
    async (tabId) => chrome.runtime.sendMessage({ type: "ANALYZE", tabId }),
    tabId,
  );
  out.analyze2_ok = r.ok;
  await p.waitForTimeout(300);
  out.mut_before = await bg(p);
  await p.evaluate(() => {
    document.body.append(document.createTextNode(" "));
    const d = document.createElement("div");
    d.textContent = "cookie banner dismissed";
    document.body.append(d);
  });
  await p.waitForTimeout(500);
  out.mut_after = await bg(p);
  await p.close();
}
// D: auto-vision on a ticking ambiguous page
await set({ enabled: true, sites: {}, aiEnabled: true, autoVision: true });
await worker.evaluate(async () => {
  await chrome.storage.local.remove("visionBudget");
  globalThis.captures = 0;
  const real = chrome.tabs.captureVisibleTab.bind(chrome.tabs);
  chrome.tabs.captureVisibleTab = async (...a) => {
    captures++;
    return real(...a);
  };
  globalThis.visionCalls = 0;
  globalThis.fetch = async () => {
    visionCalls++;
    return new Response(
      JSON.stringify({
        answers: { treatment: { choice: "uncertain", confidence: 0.9 } },
      }),
    );
  };
});
{
  const p = await ctx.newPage();
  await p.goto(origin + "/ticker");
  await p.bringToFront();
  await p.waitForTimeout(14000);
  out.auto_captures_14s = await worker.evaluate(() => captures);
  out.auto_provider_calls_14s = await worker.evaluate(() => visionCalls);
  await p.close();
}
await set({ autoVision: false, aiEnabled: false });
// E: big DOM
{
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    window.__lt = [];
    new PerformanceObserver((l) =>
      l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration))),
    ).observe({ type: "longtask", buffered: true });
  });
  const t0 = Date.now();
  await p.goto(origin + "/big");
  await p
    .waitForFunction(
      () => document.querySelectorAll("[data-smart-dark]").length >= 8000,
      null,
      { timeout: 30000 },
    )
    .then(() => {
      out.big_ms_to_all_themed = Date.now() - t0;
    })
    .catch(async () => {
      out.big_timeout_themed = await p.evaluate(
        () => document.querySelectorAll("[data-smart-dark]").length,
      );
    });
  out.big_longtasks = await p.evaluate(() => window.__lt);
  await p.close();
}
console.log(JSON.stringify(out, null, 1));
await ctx.close();
server.close();
await rm(profile, { recursive: true, force: true });

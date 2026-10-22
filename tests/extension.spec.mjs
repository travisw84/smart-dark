import { test, expect, chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
let context, worker, origin, server, cssServer, profile, extensionId, control;
const fixture = (route) =>
  `<!doctype html><html ${route === "/dark" ? 'data-theme="dark"' : ""}><head><style>html,body{margin:0;min-height:100%;background:${route.startsWith("/ambiguous") ? "#808080" : route === "/dark" ? "#121212" : "white"};color:${route === "/dark" ? "#eeeeee" : "#202020"};font:18px system-ui}main{padding:40px;min-height:90vh}input,button,.card{padding:15px;background:white;color:#111;border:1px solid #bbb}.photo{width:90px;height:70px}</style></head><body><main><h1>Synthetic ${route.slice(1)} page</h1><p>This is a labelled test fixture. No customer data.</p><input aria-label="Example field" placeholder="Example text"><button>Continue</button><img class="photo" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='70'%3E%3Crect width='90' height='70' fill='red'/%3E%3C/svg%3E">${route === "/frame" ? '<iframe src="/light"></iframe>' : ""}</main></body></html>`;

const big = function () {
  var h = "";
  for (var i = 0; i < 6000; i++) h += '<span class="c">' + i + "</span>";
  return (
    "<style>body{margin:0;background:#fff;color:#222;font:14px system-ui}.c{display:inline-block;width:60px;height:24px;margin:2px;background:#f3f3f3;color:#333;border:1px solid #ddd}</style><div>" +
    h +
    "</div>"
  );
};
const ticker =
  '<style>body{margin:0;background:#808080;color:#111;font:18px system-ui;height:900px}</style><h1 id="t">tick 0</h1><script>var n=0;setInterval(function(){document.getElementById("t").textContent="tick "+(++n)},500)</script>';
function special(route, cssPort) {
  const path = route.split("?")[0];
  const pages = {
    "/resetting":
      '<style>body{margin:0;background:#fff;color:#222;font:18px system-ui;height:900px}[data-theme="dark"] body{background:#101820;color:#eee}</style><h1>Resetting theme</h1><script>new MutationObserver(function(){if(document.documentElement.getAttribute("data-theme")==="dark")document.documentElement.setAttribute("data-theme","light")}).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]})</script>',
    "/logos":
      '<style>body{margin:0;background:#fff;color:#222;font:18px system-ui}header{padding:16px;background:#fff}</style><header><img id="logo" width="120" height="40" src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27120%27 height=%2740%27%3E%3Ctext x=%278%27 y=%2728%27 font-size=%2726%27 font-family=%27sans-serif%27 font-weight=%27bold%27 fill=%27%23111%27%3ELogo%3C/text%3E%3C/svg%3E"><img id="brand" width="120" height="40" src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27120%27 height=%2740%27%3E%3Ctext x=%278%27 y=%2728%27 font-size=%2726%27 font-family=%27sans-serif%27 font-weight=%27bold%27 fill=%27%230b57d0%27%3EBrand%3C/text%3E%3C/svg%3E"><img id="photo" width="120" height="40" src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27120%27 height=%2740%27%3E%3Crect width=%27120%27 height=%2740%27 fill=%27%23222%27/%3E%3C/svg%3E"></header>',
    "/hover":
      '<style>body{margin:0;background:#fff;color:#222;font:18px system-ui;height:2000px}a.b{display:inline-block;margin:20px;padding:14px;background:#eee;color:#333}a.b:hover{background:#0a7;color:#fff}</style><a class="b" href="#">Hover me</a>',
    "/oklch":
      '<style>body{margin:0;background:oklch(0.99 0 0);color:oklch(0.2 0 0);font:18px system-ui;height:900px}.card{margin:20px;padding:20px;background:oklch(0.95 0.01 250);color:oklch(0.25 0.02 250)}</style><div class="card">Tailwind v4 style card</div><p>Body text</p>',
    "/vars":
      '<style>:root{--page:#ffffff;--ink:#222222;--card:var(--page)}body{margin:0;background:var(--page);color:var(--ink);font:18px system-ui;height:900px}.card{margin:20px;padding:20px;background:var(--card);border:1px solid #ddd}</style><div class="card">Variables</div>',
    "/tw3":
      "<style>:root{--tw-bg-opacity:1;--tw-text-opacity:1}body{margin:0;height:900px;font:18px system-ui;background-color:rgb(255 255 255 / var(--tw-bg-opacity));color:rgb(17 24 39 / var(--tw-text-opacity))}</style><p>Tailwind v3 style</p>",
    "/inline":
      '<style>body{margin:0;background:#fff;color:#222;font:18px system-ui}</style><div id="i" style="background:#f0f0f0;color:#000;padding:20px">Inline styled</div><div id="di" style="background:#111122;color:#eee;padding:20px">Existing dark inline</div>',
    "/big": big(),
    "/tall":
      "<style>body{margin:0;background:#fff;color:#222;font:18px system-ui;height:3000px}</style><h1>Tall page</h1>",
    "/ticker": ticker,
    "/xsheet":
      '<link rel="stylesheet" href="http://cdn.test:' +
      cssPort +
      '/x.css"><div class="card">Cross origin sheet</div>',
    "/xprivate":
      '<link rel="stylesheet" href="http://127.0.0.1:' +
      cssPort +
      '/x.css"><div class="card">Private cross origin sheet</div>',
  };
  return pages[path];
}
async function settings(patch) {
  return worker.evaluate(async (patch) => {
    const s = (await chrome.storage.local.get("settings")).settings || {};
    await chrome.storage.local.set({ settings: { ...s, ...patch } });
    const tabs = await chrome.tabs.query({});
    await Promise.all(
      tabs.map((t) =>
        chrome.tabs
          .sendMessage(t.id, { type: "SETTINGS_CHANGED" })
          .catch(() => {}),
      ),
    );
  }, patch);
}
async function status(page) {
  return worker.evaluate(async (url) => {
    const t = (await chrome.tabs.query({})).find((t) => t.url === url);
    return chrome.tabs.sendMessage(t.id, { type: "STATUS" });
  }, page.url());
}
async function dark(page, selector = "body") {
  return page.locator(selector).evaluate((el) => {
    const c = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    return c && Number(c[0]) < 100 && Number(c[1]) < 100 && Number(c[2]) < 100;
  });
}
test.beforeAll(async () => {
  cssServer = createServer((req, res) => {
    res.setHeader("Content-Type", "text/css");
    res.end(
      "body{background:#fff;color:#111}.card{background:#f4f4f4;padding:20px}.card:hover{background:#0a7}",
    );
  });
  await new Promise((r) => cssServer.listen(0, "127.0.0.1", r));
  const cssPort = cssServer.address().port;
  server = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(special(req.url, cssPort) ?? fixture(req.url));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${server.address().port}`;
  profile = await mkdtemp(path.join(tmpdir(), "smart-dark-"));
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${path.resolve("dist")}`,
      `--load-extension=${path.resolve("dist")}`,
      // A public looking name that resolves to this machine, for the cross origin stylesheet test.
      "--host-resolver-rules=MAP cdn.test 127.0.0.1",
    ],
  });
  context.on("page", (p) =>
    p.on("pageerror", (e) => console.log("PAGE ERROR", e.message)),
  );
  worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  extensionId = worker.url().split("/")[2];
  control = await context.newPage();
  await control.goto(`chrome-extension://${extensionId}/options.html`);
});
test.afterAll(async () => {
  await context?.close();
  await new Promise((r) => server?.close(r));
  await new Promise((r) => cssServer?.close(r));
  await rm(profile, { recursive: true, force: true });
});
test.afterEach(async () => {
  for (const page of context.pages())
    if (page !== control) await page.close().catch(() => {});
});
test.beforeEach(async ({}, info) => {
  // Chrome permits at most two visible-tab captures per second.
  if (
    /Jev receives|in-flight|AI opt-out|provider timeout|Jev decision|Jev check|automatic image/.test(
      info.title,
    )
  )
    await control.waitForTimeout(1100);
  await worker.evaluate(() => {
    globalThis.realFetch ??= globalThis.fetch;
    globalThis.fetch = globalThis.realFetch;
    globalThis.visionCalls = [];
  });
  await worker.evaluate(async () => {
    await chrome.storage.local.remove("visionBudget");
    await chrome.storage.session.remove("visionCache");
  });
  await settings({
    enabled: true,
    sites: {},
    palette: "neutral",
    engine: "adaptive",
    brightness: 100,
    contrast: 100,
    aiEnabled: false,
    autoVision: false,
  });
});
test("light page converts promptly, new content converts, disable restores exactly", async () => {
  const p = await context.newPage();
  const start = Date.now();
  await p.goto(origin + "/light");
  await expect.poll(() => dark(p)).toBe(true);
  const elapsed = Date.now() - start;
  console.log(`fixture navigation to dark: ${elapsed}ms`);
  expect(elapsed).toBeLessThan(2500);
  await expect.poll(async () => (await status(p)).source.mode).toBe("light");
  await p.evaluate(() => {
    const n = document.createElement("div");
    n.className = "card";
    n.textContent = "Dynamically inserted card";
    document.querySelector("main").append(n);
  });
  await expect.poll(() => dark(p, ".card")).toBe(true);
  await settings({ enabled: false });
  await expect
    .poll(() =>
      p.locator("body").evaluate((e) => getComputedStyle(e).backgroundColor),
    )
    .toBe("rgb(255, 255, 255)");
  await expect
    .poll(() =>
      p.locator("style[data-smart-dark-sheet],style.darkreader").count(),
    )
    .toBe(0);
  await p.close();
});
test("native dark page is preserved and detects theme switches both ways", async () => {
  const p = await context.newPage();
  await p.goto(origin + "/dark");
  await expect.poll(async () => (await status(p)).source.mode).toBe("dark");
  expect(
    await p.locator("style[data-smart-dark-sheet],style.darkreader").count(),
  ).toBe(0);
  await p.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    document.querySelector("style").textContent +=
      "html,body{background:#fff;color:#111}";
  });
  await expect.poll(async () => (await status(p)).source.mode).toBe("light");
  await expect.poll(() => dark(p)).toBe(true);
  await p.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
    document.querySelector("style").textContent +=
      "html,body{background:#121212;color:#eee}";
  });
  await expect.poll(async () => (await status(p)).source.mode).toBe("dark");
  await expect
    .poll(() =>
      p.locator("style[data-smart-dark-sheet],style.darkreader").count(),
    )
    .toBe(0);
  await p.close();
});
test("per-site original and forced dark survive navigation", async () => {
  const p = await context.newPage();
  await settings({ sites: { [origin]: "original" } });
  await p.goto(origin + "/light");
  await expect.poll(async () => (await status(p)).action).toBe("original");
  expect(await dark(p)).toBe(false);
  await settings({ sites: { [origin]: "dark" } });
  await p.goto(origin + "/dark");
  await expect
    .poll(() =>
      p.locator("style[data-smart-dark-sheet],style.darkreader").count(),
    )
    .toBeGreaterThan(0);
  await p.close();
});
test("frames receive theme and global disable", async () => {
  const p = await context.newPage();
  await p.goto(origin + "/frame");
  await expect
    .poll(async () => {
      const f = p.frames().find((f) => f.url() === origin + "/light");
      return (
        f &&
        f
          .locator("body")
          .evaluate(
            (e) => getComputedStyle(e).backgroundColor !== "rgb(255, 255, 255)",
          )
      );
    })
    .toBe(true);
  await settings({ enabled: false });
  await expect
    .poll(async () => {
      const f = p.frames().find((f) => f.url() === origin + "/light");
      return f
        .locator("body")
        .evaluate((e) => getComputedStyle(e).backgroundColor);
    })
    .toBe("rgb(255, 255, 255)");
  await p.close();
});
test("popup global switch and site override work", async () => {
  const p = await context.newPage();
  await p.goto(origin + "/light");
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(
    popup.getByRole("switch", { name: "Dark mode enabled" }),
  ).toBeChecked();
  await popup.getByRole("switch", { name: "Dark mode enabled" }).click();
  await expect.poll(() => dark(p)).toBe(false);
  await popup.getByRole("switch", { name: "Dark mode enabled" }).click();
  await expect.poll(() => dark(p)).toBe(true);
  await popup.close();
  await p.close();
});
test("AI off blocks capture and provider requests; credentials stay inaccessible", async () => {
  const p = await context.newPage();
  await p.goto(origin + "/light");
  const result = await control.evaluate(async () =>
    chrome.runtime.sendMessage({ type: "ANALYZE", tabId: 999 }),
  );
  expect(result.ok).toBe(false);
  expect(result.error).toContain("Enable");
  const exposed = await p.evaluate(() => typeof chrome?.storage);
  expect(exposed).toBe("undefined");
  await p.close();
});
test("uses genuine native CSS and restores original theme attribute on disable", async () => {
  const p = await context.newPage();
  await p.goto(origin + "/native");
  await p.evaluate(() => {
    document.querySelector("style").textContent +=
      'html[data-theme="dark"],html[data-theme="dark"] body{background:#18242e;color:#eef4fa}';
    document.documentElement.dataset.theme = "light";
  });
  await expect.poll(async () => (await status(p)).renderer).toBe("native");
  await expect(p.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await p
      .locator("body")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(24, 36, 46)");
  await p.setViewportSize({ width: 1200, height: 850 });
  await expect.poll(async () => (await status(p)).renderer).toBe("native");
  await settings({ enabled: false });
  await expect(p.locator("html")).toHaveAttribute("data-theme", "light");
  await p.close();
});
test("Jev receives a real captured image; its bounded decision can restore light mode", async () => {
  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      apiKey: "synthetic-key-not-a-real-credential",
    });
    globalThis.fetch = async (url, o) => {
      visionCalls.push({ url, headers: o.headers, body: JSON.parse(o.body) });
      return new Response(
        JSON.stringify({
          answers: { treatment: { choice: "use_original", confidence: 0.96 } },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    };
  });
  await settings({ aiEnabled: true });
  const p = await context.newPage();
  await p.goto(origin + "/light");
  await expect.poll(() => dark(p)).toBe(true);
  await p.bringToFront();
  const tabId = await worker.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id,
    p.url(),
  );
  const result = await control.evaluate(
    async (tabId) => chrome.runtime.sendMessage({ type: "ANALYZE", tabId }),
    tabId,
  );
  expect(result.ok, result.error).toBe(true);
  await expect.poll(() => dark(p)).toBe(false);
  const calls = await worker.evaluate(() => visionCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0].headers["TypeSafe-Danger-Zone-Images"]).toBe("true");
  const img = Object.values(calls[0].body.assets)[0];
  expect(img.format).toBe("jpg");
  expect(img.data_base64.length).toBeGreaterThan(1000);
  expect(JSON.stringify(calls[0].body)).not.toContain(origin);
  await p.close();
});
test("visible password fields prevent screenshots from reaching Jev", async () => {
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ apiKey: "synthetic-key" });
    globalThis.fetch = async () => {
      visionCalls.push("unexpected");
      return new Response("{}");
    };
  });
  await settings({ aiEnabled: true });
  const p = await context.newPage();
  await p.goto(origin + "/light");
  await p.evaluate(() => {
    const input = document.createElement("input");
    input.type = "password";
    document.body.prepend(input);
  });
  const tabId = await worker.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id,
    p.url(),
  );
  await p.bringToFront();
  const r = await control.evaluate(
    async (tabId) => chrome.runtime.sendMessage({ type: "ANALYZE", tabId }),
    tabId,
  );
  expect(r.ok).toBe(false);
  expect(r.error).toContain("password");
  expect(await worker.evaluate(() => visionCalls.length)).toBe(0);
  await p.close();
});
test("navigation invalidates an in-flight image decision", async () => {
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ apiKey: "synthetic-key" });
    globalThis.fetch = async () => {
      visionCalls.push("captured");
      await new Promise((r) => (globalThis.releaseVision = r));
      return new Response(
        JSON.stringify({
          answers: { treatment: { choice: "use_original", confidence: 0.99 } },
        }),
      );
    };
  });
  await settings({ aiEnabled: true });
  const p = await context.newPage();
  await p.goto(origin + "/light");
  await expect.poll(() => dark(p)).toBe(true);
  await p.bringToFront();
  const tabId = await worker.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id,
    p.url(),
  );
  const pending = control.evaluate(
    async (tabId) => chrome.runtime.sendMessage({ type: "ANALYZE", tabId }),
    tabId,
  );
  await expect.poll(() => worker.evaluate(() => visionCalls.length)).toBe(1);
  await p.goto(origin + "/other");
  await worker.evaluate(() => releaseVision());
  const r = await pending;
  expect(r.ok).toBe(false);
  expect(r.error).toContain("discarded");
  await expect.poll(() => dark(p)).toBe(true);
  await p.close();
});
test("AI opt-out wins over an in-flight image response", async () => {
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ apiKey: "synthetic-key" });
    globalThis.fetch = async () => {
      visionCalls.push("captured");
      await new Promise((r) => (globalThis.releaseVision = r));
      return new Response(
        JSON.stringify({
          answers: { treatment: { choice: "use_original", confidence: 0.99 } },
        }),
      );
    };
  });
  await settings({ aiEnabled: true });
  const p = await context.newPage();
  await p.goto(origin + "/light");
  await expect.poll(() => dark(p)).toBe(true);
  await p.bringToFront();
  const tabId = await worker.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id,
    p.url(),
  );
  const pending = control.evaluate(
    async (tabId) => chrome.runtime.sendMessage({ type: "ANALYZE", tabId }),
    tabId,
  );
  await expect.poll(() => worker.evaluate(() => visionCalls.length)).toBe(1);
  await settings({ aiEnabled: false });
  await worker.evaluate(() => releaseVision());
  const r = await pending;
  expect(r.ok).toBe(false);
  await expect.poll(() => dark(p)).toBe(true);
  await p.close();
});
test("settings require screenshot consent and never display the stored key", async () => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(
    options.getByLabel("Check pages automatically when Smart Dark is unsure"),
  ).toBeDisabled();
  await options
    .getByLabel("Enable screenshot sharing with TypeSafe / Jev")
    .check();
  await options
    .getByLabel("Your TypeSafe API key")
    .fill("synthetic-options-key");
  await options.getByRole("button", { name: "Save settings" }).click();
  await expect(options.getByRole("status")).toContainText("Saved");
  await expect(options.getByLabel("Your TypeSafe API key")).toHaveValue("");
  expect(await options.locator("body").innerText()).not.toContain(
    "synthetic-options-key",
  );
  await options.getByRole("button", { name: "Remove saved key" }).click();
  await options.getByRole("button", { name: "Save settings" }).click();
  await expect(options.locator("#key-status")).toContainText("No key saved");
  await options.close();
});
test("native class restoration preserves unrelated classes added by the site", async () => {
  const p = await context.newPage();
  await p.goto(origin + "/native-class");
  await p.evaluate(() => {
    document.querySelector("style").textContent +=
      "html.dark,html.dark body{background:#142130;color:#eef4fa}";
    document.documentElement.className = "light";
  });
  await expect.poll(async () => (await status(p)).renderer).toBe("native");
  await p.evaluate(() => document.documentElement.classList.add("app-loaded"));
  await settings({ enabled: false });
  await expect(p.locator("html")).toHaveClass(/app-loaded/);
  await expect(p.locator("html")).not.toHaveClass(/\bdark\b/);
  await expect(p.locator("html")).toHaveClass(/\blight\b/);
  await p.close();
});
test("provider timeout leaves the local theme responsive", async () => {
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ apiKey: "synthetic-key" });
    globalThis.fetch = async (_url, o) =>
      new Promise((_resolve, reject) =>
        o.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        ),
      );
  });
  await settings({ aiEnabled: true });
  const p = await context.newPage();
  await p.goto(origin + "/light");
  await expect.poll(() => dark(p)).toBe(true);
  await p.bringToFront();
  const tabId = await worker.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id,
    p.url(),
  );
  const pending = control.evaluate(
    async (tabId) => chrome.runtime.sendMessage({ type: "ANALYZE", tabId }),
    tabId,
  );
  await p.getByRole("button", { name: "Continue" }).click();
  expect(await dark(p)).toBe(true);
  const r = await pending;
  expect(r.ok).toBe(false);
  expect(r.error).toContain("timed out");
  expect(await dark(p)).toBe(true);
  await p.close();
});
test("compatibility engine remains optional and restores styling", async () => {
  await settings({ engine: "compatibility" });
  const p = await context.newPage();
  await p.goto(origin + "/light");
  await expect.poll(() => dark(p)).toBe(true);
  await expect
    .poll(async () => (await status(p)).renderer)
    .toBe("compatibility");
  await settings({ enabled: false });
  await expect
    .poll(() =>
      p.locator("body").evaluate((e) => getComputedStyle(e).backgroundColor),
    )
    .toBe("rgb(255, 255, 255)");
  await p.close();
});
test("renders the visual gallery and saves a before-after image", async () => {
  await settings({ enabled: false });
  const p = await context.newPage();
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.goto("http://127.0.0.1:4178");
  const adaptive = p.frameLocator('iframe[title="Adaptive dark website"]');
  await expect
    .poll(() =>
      adaptive
        .locator(".card")
        .first()
        .evaluate((e) => getComputedStyle(e).backgroundColor),
    )
    .not.toBe("rgb(242, 244, 247)");
  await p.screenshot({ path: "docs/preview.png", fullPage: true });
  await p.close();
});
test("does not remove styles belonging to another dark-mode extension", async () => {
  await settings({ enabled: false });
  const p = await context.newPage();
  await p.goto(origin + "/light");
  await p.evaluate(() => {
    const s = document.createElement("style");
    s.className = "darkreader";
    s.id = "foreign-theme";
    s.textContent =
      "body{background:rgb(22,22,22)!important;color:#eee!important}";
    document.head.append(s);
  });
  await settings({ enabled: true });
  await settings({ enabled: false });
  expect(await p.locator("#foreign-theme").count()).toBe(1);
  expect(
    await p
      .locator("body")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(22, 22, 22)");
  await p.close();
});
test("password fields inside embedded frames block image upload", async () => {
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ apiKey: "synthetic-key" });
    globalThis.fetch = async () => {
      visionCalls.push("unexpected");
      return new Response("{}");
    };
  });
  await settings({ aiEnabled: true });
  const p = await context.newPage();
  await p.goto(origin + "/frame");
  await p
    .frames()
    .find((f) => f.url() === origin + "/light")
    .evaluate(() => {
      const i = document.createElement("input");
      i.type = "password";
      document.body.prepend(i);
    });
  await p.bringToFront();
  const tabId = await worker.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id,
    p.url(),
  );
  const r = await control.evaluate(
    async (tabId) => chrome.runtime.sendMessage({ type: "ANALYZE", tabId }),
    tabId,
  );
  expect(r.ok).toBe(false);
  expect(r.error).toContain("password");
  expect(await worker.evaluate(() => visionCalls.length)).toBe(0);
  await p.close();
});
test("concurrent settings changes preserve both patches", async () => {
  const r = await control.evaluate(async () => {
    await Promise.all([
      chrome.runtime.sendMessage({
        type: "UPDATE_SETTINGS",
        patch: { enabled: false },
      }),
      chrome.runtime.sendMessage({
        type: "UPDATE_SETTINGS",
        patch: { palette: "warm" },
      }),
    ]);
    return chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  });
  expect(r.settings.enabled).toBe(false);
  expect(r.settings.palette).toBe("warm");
});
test("automatic image judgments are not reused across different visual pages", async () => {
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ apiKey: "synthetic-key" });
    globalThis.fetch = async () => {
      visionCalls.push("image");
      return new Response(
        JSON.stringify({
          answers: { treatment: { choice: "use_original", confidence: 0.99 } },
        }),
      );
    };
  });
  await settings({ aiEnabled: true, autoVision: true });
  const first = await context.newPage();
  await first.goto(origin + "/ambiguous-art");
  await first.bringToFront();
  await expect
    .poll(() => worker.evaluate(() => visionCalls.length), { timeout: 10000 })
    .toBe(1);
  await expect.poll(async () => (await status(first)).action).toBe("original");
  const second = await context.newPage();
  await second.goto(origin + "/ambiguous-article");
  await second.bringToFront();
  await expect
    .poll(() => worker.evaluate(() => visionCalls.length), { timeout: 10000 })
    .toBe(2);
  await first.close();
  await second.close();
});
test("captures the popup and settings UI for visual review", async () => {
  const p = await context.newPage();
  await p.goto(origin + "/light");
  await expect.poll(() => dark(p)).toBe(true);
  await p.bringToFront();
  // Headless Chromium does not expose action popups as Playwright pages.
  // Render the shipped popup document in a tab, retaining the website as active.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await p.bringToFront();
  await popup.reload();
  await expect(popup.locator("#site")).toContainText("127.0.0.1");
  await popup.locator("body").screenshot({ path: "docs/popup.png" });
  await popup.close();
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.locator("#key-status")).toBeVisible();
  await options.screenshot({ path: "docs/settings.png", fullPage: true });
  await options.close();
  await p.close();
});

test("hover and focus rules from the site keep working", async () => {
  const p = await context.newPage();
  await p.goto(origin + "/hover");
  await expect.poll(() => dark(p)).toBe(true);
  const bg = () =>
    p.locator("a.b").evaluate((e) => getComputedStyle(e).backgroundColor);
  const resting = await bg();
  await p.hover("a.b");
  await expect.poll(bg).not.toBe(resting);
  const channels = (await bg())
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number);
  expect(Math.max(...channels)).toBeLessThan(160);
  expect(channels[1]).toBeGreaterThan(channels[0]);
  await p.close();
});
test("oklch colours are themed", async () => {
  const p = await context.newPage();
  await p.goto(origin + "/oklch");
  await expect.poll(() => dark(p)).toBe(true);
  expect(await dark(p, ".card")).toBe(true);
  const text = await p
    .locator(".card")
    .evaluate((e) => getComputedStyle(e).color);
  expect(Number(text.match(/[\d.]+/g)[0])).toBeGreaterThan(150);
  await p.close();
});
test("custom properties and Tailwind alpha variables are themed", async () => {
  const p = await context.newPage();
  await p.goto(origin + "/vars");
  await expect.poll(() => dark(p)).toBe(true);
  expect(await dark(p, ".card")).toBe(true);
  const ink = await p
    .locator("body")
    .evaluate((e) => getComputedStyle(e).color);
  expect(Number(ink.match(/[\d.]+/g)[0])).toBeGreaterThan(150);
  const tw = await context.newPage();
  await tw.goto(origin + "/tw3");
  await expect.poll(() => dark(tw)).toBe(true);
  await tw.close();
  await p.close();
});
test("inline styles are fixed and existing dark inline styles are left alone", async () => {
  const p = await context.newPage();
  await p.goto(origin + "/inline");
  await expect.poll(() => dark(p, "#i")).toBe(true);
  const text = await p.locator("#i").evaluate((e) => getComputedStyle(e).color);
  expect(Number(text.match(/[\d.]+/g)[0])).toBeGreaterThan(150);
  expect(await p.locator("#di").getAttribute("data-sd-bg")).toBeNull();
  expect(
    await p.locator("#di").evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(17, 17, 34)");
  await p.close();
});
test("a page with thousands of elements is themed quickly without long blocking", async () => {
  const p = await context.newPage();
  await p.addInitScript(() => {
    window.__long = [];
    new PerformanceObserver((l) =>
      l.getEntries().forEach((e) => window.__long.push(e.duration)),
    ).observe({ type: "longtask", buffered: true });
  });
  const t0 = Date.now();
  await p.goto(origin + "/big");
  await p.waitForFunction(
    () =>
      [...document.querySelectorAll(".c")].every(
        (e) =>
          Number(getComputedStyle(e).backgroundColor.match(/[\d.]+/g)[0]) < 100,
      ),
    null,
    { timeout: 20000 },
  );
  const ms = Date.now() - t0;
  console.log("6000 element page fully dark in " + ms + " ms");
  expect(ms).toBeLessThan(10000);
  const long = await p.evaluate(() => window.__long);
  console.log("longest task " + Math.round(Math.max(0, ...long)) + " ms");
  expect(Math.max(0, ...long)).toBeLessThan(1000);
  await p.close();
});
test("cross origin stylesheets are mirrored through the worker, keeping hover rules", async () => {
  await worker.evaluate(() => {
    globalThis.fetched = [];
    const real = globalThis.realFetch;
    globalThis.fetch = (u, o) => (
      globalThis.fetched.push(String(u)),
      real(u, o)
    );
  });
  const p = await context.newPage();
  await p.goto(origin + "/xsheet");
  await expect.poll(() => dark(p)).toBe(true);
  expect(await dark(p, ".card")).toBe(true);
  const bg = () =>
    p.locator(".card").evaluate((e) => getComputedStyle(e).backgroundColor);
  const resting = await bg();
  await p.hover(".card");
  await expect.poll(bg).not.toBe(resting);
  expect(
    (await worker.evaluate(() => globalThis.fetched)).some((u) =>
      u.includes("cdn.test"),
    ),
  ).toBe(true);
  await p.close();
});
test("private network stylesheets on another origin are never fetched by the worker", async () => {
  await worker.evaluate(() => {
    globalThis.fetched = [];
    const real = globalThis.realFetch;
    globalThis.fetch = (u, o) => (
      globalThis.fetched.push(String(u)),
      real(u, o)
    );
  });
  const p = await context.newPage();
  await p.goto(origin + "/xprivate");
  await expect.poll(() => dark(p)).toBe(true);
  expect(
    await worker.evaluate(() =>
      globalThis.fetched.filter((u) => u.endsWith("/x.css")),
    ),
  ).toEqual([]);
  await p.close();
});
async function mockJev(choice, delay = 0) {
  await worker.evaluate(
    async ({ choice, delay }) => {
      await chrome.storage.local.set({ apiKey: "synthetic-key" });
      globalThis.visionCalls = [];
      globalThis.fetch = async () => {
        globalThis.visionCalls.push("call");
        // A real provider takes a while. A slow answer arrives after the page has changed.
        if (delay) await new Promise((r) => setTimeout(r, delay));
        return new Response(
          JSON.stringify({
            answers: { treatment: { choice, confidence: 0.97 } },
          }),
        );
      };
    },
    { choice, delay },
  );
  await settings({ aiEnabled: true });
}
const tabIdOf = (page) =>
  worker.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id,
    page.url(),
  );
test("a Jev decision persists through scrolling and page updates", async () => {
  await mockJev("use_original");
  const p = await context.newPage();
  await p.goto(origin + "/tall");
  await expect.poll(() => dark(p)).toBe(true);
  await p.bringToFront();
  const tabId = await tabIdOf(p);
  const r = await control.evaluate(
    async (tabId) => chrome.runtime.sendMessage({ type: "ANALYZE", tabId }),
    tabId,
  );
  expect(r.ok, r.error).toBe(true);
  await expect.poll(() => dark(p)).toBe(false);
  await p.evaluate(() => window.scrollBy(0, 500));
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    const d = document.createElement("div");
    d.textContent = "Updated";
    document.body.append(d);
    document.body.classList.add("menu-open");
  });
  await p.waitForTimeout(2200);
  expect(await dark(p)).toBe(false);
  await p.close();
});
test("an automatic Jev check lands on a page that keeps updating", async () => {
  await mockJev("use_original", 1200);
  await settings({ autoVision: true });
  const p = await context.newPage();
  await p.goto(origin + "/ticker");
  await p.bringToFront();
  await expect.poll(() => dark(p), { timeout: 12000 }).toBe(false);
  expect(
    await worker.evaluate(() => globalThis.visionCalls.length),
  ).toBeGreaterThanOrEqual(1);
  await p.close();
});
test("text only page updates keep an in-flight image decision", async () => {
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ apiKey: "synthetic-key" });
    globalThis.fetch = async () => {
      globalThis.visionCalls.push("captured");
      await new Promise((r) => (globalThis.releaseVision = r));
      return new Response(
        JSON.stringify({
          answers: { treatment: { choice: "use_original", confidence: 0.99 } },
        }),
      );
    };
  });
  await settings({ aiEnabled: true });
  const p = await context.newPage();
  await p.goto(origin + "/light");
  await expect.poll(() => dark(p)).toBe(true);
  await p.bringToFront();
  const tabId = await tabIdOf(p);
  const pending = control.evaluate(
    async (tabId) => chrome.runtime.sendMessage({ type: "ANALYZE", tabId }),
    tabId,
  );
  await expect
    .poll(() => worker.evaluate(() => globalThis.visionCalls.length))
    .toBe(1);
  await p
    .locator("h1")
    .evaluate((e) => (e.textContent = "Different text, same look"));
  await worker.evaluate(() => globalThis.releaseVision());
  const r = await pending;
  expect(r.ok, r.error).toBe(true);
  await expect.poll(() => dark(p)).toBe(false);
  await p.close();
});
test("a different original appearance discards an in-flight image decision", async () => {
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ apiKey: "synthetic-key" });
    globalThis.fetch = async () => {
      globalThis.visionCalls.push("captured");
      await new Promise((r) => (globalThis.releaseVision = r));
      return new Response(
        JSON.stringify({
          answers: { treatment: { choice: "use_original", confidence: 0.99 } },
        }),
      );
    };
  });
  await settings({ aiEnabled: true });
  const p = await context.newPage();
  await p.goto(origin + "/light");
  await expect.poll(() => dark(p)).toBe(true);
  await p.bringToFront();
  const tabId = await tabIdOf(p);
  const pending = control.evaluate(
    async (tabId) => chrome.runtime.sendMessage({ type: "ANALYZE", tabId }),
    tabId,
  );
  await expect
    .poll(() => worker.evaluate(() => globalThis.visionCalls.length))
    .toBe(1);
  await p.evaluate(() => {
    document.documentElement.style.background = "#101010";
    document.body.style.background = "#101010";
    document.body.style.color = "#eee";
    document.querySelector("main").style.background = "#101010";
  });
  await worker.evaluate(() => globalThis.releaseVision());
  const r = await pending;
  expect(r.ok).toBe(false);
  expect(r.error).toContain("discarded");
  await p.close();
});
test("dynamic replacements share stylesheet rules", async () => {
  const p = await context.newPage();
  await p.goto(origin + "/light");
  await expect.poll(() => dark(p)).toBe(true);
  for (let i = 0; i < 25; i++) {
    await p.evaluate((i) => {
      const n = document.createElement("div");
      n.className = "replace-me";
      n.style.cssText = "background:white;color:black;padding:4px";
      n.textContent = "item " + i;
      const old = document.querySelector(".replace-me");
      if (old) old.replaceWith(n);
      else document.querySelector("main").append(n);
    }, i);
    await expect
      .poll(() => p.locator(".replace-me").getAttribute("data-sd-bg"))
      .not.toBeNull();
  }
  const rules = await p
    .locator('style[data-smart-dark-sheet="fix"]')
    .evaluate((e) => e.sheet.cssRules.length);
  expect(rules).toBeLessThan(6);
  expect(await dark(p, ".replace-me")).toBe(true);
  await p.close();
});

test("a site that resets our dark attribute falls back to the adaptive theme", async () => {
  const p = await context.newPage();
  await p.goto(origin + "/resetting");
  await expect.poll(() => dark(p), { timeout: 8000 }).toBe(true);
  await expect
    .poll(async () => (await status(p)).renderer, { timeout: 8000 })
    .toBe("adaptive");
  await p.waitForTimeout(1500);
  expect(await dark(p)).toBe(true);
  await p.close();
});
test("dark logos with transparent backgrounds are lightened on dark pages and photos are left alone", async () => {
  const p = await context.newPage();
  await p.goto(origin + "/logos");
  await expect.poll(() => dark(p)).toBe(true);
  await expect
    .poll(() => p.locator("#logo").getAttribute("data-sd-invert"))
    .not.toBeNull();
  expect(
    await p.locator("#logo").evaluate((e) => getComputedStyle(e).filter),
  ).toContain("invert");
  expect(await p.locator("#brand").getAttribute("data-sd-invert")).toBeNull();
  expect(await p.locator("#photo").getAttribute("data-sd-invert")).toBeNull();
  await p.close();
});
test("theme styles removed by the page are restored", async () => {
  const p = await context.newPage();
  await p.goto(origin + "/light");
  await expect.poll(() => dark(p)).toBe(true);
  await p.evaluate(() =>
    document
      .querySelectorAll("[data-smart-dark-sheet]")
      .forEach((n) => n.remove()),
  );
  await expect.poll(() => dark(p), { timeout: 4000 }).toBe(true);
  await p.close();
});

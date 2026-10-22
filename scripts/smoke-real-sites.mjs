import { chromium } from "@playwright/test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Loads a few real websites with the built extension and saves screenshots. Needs network access.
const dist = path.resolve("dist");
const shots = path.resolve("test-results/real-sites");
const defaults = [
  "https://example.com/",
  "https://news.ycombinator.com/",
  "https://en.wikipedia.org/wiki/Dark_mode",
  "https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme",
  "https://tailwindcss.com/",
  "https://github.com/darkreader/darkreader",
  "https://docs.python.org/3/",
  "https://www.bbc.com/news",
];
const urls = process.argv.length > 2 ? process.argv.slice(2) : defaults;
await mkdir(shots, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), "smart-dark-smoke-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: ["--disable-extensions-except=" + dist, "--load-extension=" + dist],
});
const worker =
  context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
for (const url of urls) {
  const page = await context.newPage();
  let result = "ok";
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
  } catch (e) {
    result = "navigation failed: " + e.message.slice(0, 60);
  }
  await page.waitForTimeout(5500);
  // Ask the top frame. Embedded frames also answer a plain tab message.
  const status = await worker.evaluate(async (u) => {
    const tab = (await chrome.tabs.query({})).find(
      (t) => t.url && t.url.startsWith(u.slice(0, 30)),
    );
    try {
      const s = await chrome.tabs.sendMessage(
        tab.id,
        { type: "STATUS" },
        { frameId: 0 },
      );
      return s.source.mode + " page, " + s.renderer + " renderer";
    } catch {
      return "extension not active";
    }
  }, url);
  const name = new URL(url).hostname.replace(/[^a-z0-9]+/gi, "-");
  await page.screenshot({ path: path.join(shots, name + ".png") });
  console.log(url + " | " + result + " | " + status);
  await page.close();
}
await context.close();
await rm(profile, { recursive: true, force: true });

import { test } from "node:test";
import assert from "node:assert/strict";
import { isPrivateHost, allowStylesheetFetch } from "../src/netguard.js";

test("flags loopback, private and link local hosts", () => {
  for (const h of [
    "localhost",
    "app.localhost",
    "printer.local",
    "127.0.0.1",
    "10.1.2.3",
    "192.168.0.5",
    "172.16.0.1",
    "172.31.255.1",
    "169.254.1.1",
    "0.0.0.0",
    "[::1]",
    "::1",
    "fd12:3456::1",
    "fe80::1",
  ])
    assert.equal(isPrivateHost(h), true, h);
  for (const h of [
    "example.com",
    "172.15.0.1",
    "172.32.0.1",
    "8.8.8.8",
    "cdn.jsdelivr.net",
  ])
    assert.equal(isPrivateHost(h), false, h);
});
test("allows public stylesheets and same origin private ones only", () => {
  assert.equal(
    allowStylesheetFetch(
      "https://cdn.example.com/a.css",
      "https://site.test/page",
    ),
    true,
  );
  assert.equal(
    allowStylesheetFetch("http://192.168.1.1/a.css", "https://site.test/"),
    false,
  );
  assert.equal(
    allowStylesheetFetch(
      "http://127.0.0.1:3000/a.css",
      "http://127.0.0.1:3000/app",
    ),
    true,
  );
  assert.equal(
    allowStylesheetFetch(
      "http://127.0.0.1:3001/a.css",
      "http://127.0.0.1:3000/app",
    ),
    false,
  );
  assert.equal(
    allowStylesheetFetch("file:///etc/passwd", "https://site.test/"),
    false,
  );
  assert.equal(allowStylesheetFetch("not a url", "https://site.test/"), false);
});

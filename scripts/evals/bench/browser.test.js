"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { findBrowser, serveDirectory } = require("./browser.js");

test("findBrowser prefers BENCH_CHROMIUM, then the first installed browser of the platform", () => {
  const present = new Set(["/opt/chrome", path.join("/usr/bin", "google-chrome"), "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"]);
  const exists = (file) => present.has(file);
  assert.equal(findBrowser({ env: { BENCH_CHROMIUM: "/opt/chrome", PATH: "/usr/bin" }, platform: "linux", exists }), "/opt/chrome");
  assert.equal(findBrowser({ env: { BENCH_CHROMIUM: "/missing" }, platform: "linux", exists }), null);
  assert.equal(findBrowser({ env: { PATH: `/bin${path.delimiter}/usr/bin` }, platform: "linux", exists }), path.join("/usr/bin", "google-chrome"));
  assert.equal(findBrowser({ env: {}, platform: "win32", exists }), "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
  assert.equal(findBrowser({ env: { PATH: "/nothing" }, platform: "linux", exists }), null);
});

test("serveDirectory serves the workspace and nothing outside it", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bench-serve-"));
  fs.writeFileSync(path.join(root, "index.html"), "<p>hola</p>");
  const served = await serveDirectory(root);
  try {
    const page = await fetch(served.url);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    assert.equal(await page.text(), "<p>hola</p>");
    assert.equal((await fetch(new URL("missing.js", served.url))).status, 404);
    assert.equal((await fetch(new URL("/..%2f..%2fetc%2fpasswd", served.url))).status, 404);
  } finally {
    await served.close();
  }
});

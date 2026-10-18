"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const crypto = require("node:crypto");
const http = require("node:http");
const { spawn } = require("node:child_process");

const { LAUNCH_TIMEOUT_MS, connect, findBrowser, serveDirectory, startBrowser } = require("./browser.js");

// A stand-in for a Chromium start: `cold` hangs on its first start and opens
// its port on the next, as a first start on a cold CI runner did (E4.7);
// `crash` writes to stderr and exits; `hang` never opens a port and writes to
// stderr a second late, as a Node start on a loaded Windows runner did (#362).
const FAKE_BROWSER = `
const fs = require("node:fs");
const path = require("node:path");
const [state, mode, ...args] = process.argv.slice(2);
const starts = (fs.existsSync(state) ? Number(fs.readFileSync(state, "utf8")) : 0) + 1;
fs.writeFileSync(state, String(starts));
const profile = args.find((arg) => arg.startsWith("--user-data-dir=")).slice("--user-data-dir=".length);
if (mode === "crash") {
  process.stderr.write("boom: missing shared library\\n");
  process.exit(3);
}
const announce = () => process.stderr.write("start " + starts + "\\n");
if (mode === "hang") setTimeout(announce, 1000);
else announce();
if (mode === "cold" && starts > 1) fs.writeFileSync(path.join(profile, "DevToolsActivePort"), "9222\\n/devtools/browser/fake\\n");
setInterval(() => {}, 1000);
`;

function fakeBrowser(t, mode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-fake-browser-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const script = path.join(dir, "browser.js");
  const state = path.join(dir, "starts");
  fs.writeFileSync(script, FAKE_BROWSER);
  return {
    starts: () => Number(fs.readFileSync(state, "utf8")),
    spawnProcess: (_executable, args, options) => spawn(process.execPath, [script, state, mode, ...args], options),
  };
}

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

test("startBrowser retries a start that does not open its DevTools port in time", async (t) => {
  const fake = fakeBrowser(t, "cold");
  const started = await startBrowser({ executable: "chromium", timeoutMs: 500, spawnProcess: fake.spawnProcess });
  try {
    assert.equal(started.port, "9222");
    assert.equal(started.browserPath, "/devtools/browser/fake");
    assert.equal(fake.starts(), 2);
  } finally {
    await started.stop();
  }
});

test("startBrowser reports the exit code and stderr of a browser that exits on both starts", async (t) => {
  const fake = fakeBrowser(t, "crash");
  await assert.rejects(
    startBrowser({ executable: "chromium", timeoutMs: 5000, spawnProcess: fake.spawnProcess }),
    /the browser exited with code 3 before opening its DevTools port; stderr: boom: missing shared library/,
  );
  assert.equal(fake.starts(), 2);
});

test("startBrowser reports the timeout and stderr of a browser that never opens its port", async (t) => {
  const fake = fakeBrowser(t, "hang");
  await assert.rejects(
    startBrowser({ executable: "chromium", timeoutMs: 5000, spawnProcess: fake.spawnProcess }),
    /the browser did not open its DevTools port within 5000 ms; stderr: start 2/,
  );
  assert.equal(fake.starts(), 2);
});

// A DevTools endpoint that accepts the WebSocket handshake and drops the
// connection on the first request, as a browser that dies mid-check does.
async function closingDevTools(t) {
  const server = http.createServer();
  server.on("upgrade", (request, socket) => {
    const accept = crypto.createHash("sha1").update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.once("data", () => socket.destroy());
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  return `ws://127.0.0.1:${server.address().port}/devtools/browser/fake`;
}

test("a request the browser never answers fails when its DevTools connection closes", async (t) => {
  const connection = await connect(await closingDevTools(t));
  const outcome = await Promise.race([
    connection.send("Browser.getVersion").then(() => "answered", (error) => error.message),
    new Promise((resolve) => setTimeout(resolve, 3000, "still pending")),
  ]);
  assert.match(outcome, /Browser\.getVersion: the browser closed its DevTools connection/);
});

test("a start waits up to 60 s before its retry, because a loaded CI runner outlasts 20 s twice", () => {
  // PR #328, Windows: under the rest of the suite, the first four starts of
  // todo-spa ran out of 20 s on both tries, and the next ones took seconds.
  assert.ok(LAUNCH_TIMEOUT_MS >= 60000, `LAUNCH_TIMEOUT_MS is ${LAUNCH_TIMEOUT_MS}`);
});

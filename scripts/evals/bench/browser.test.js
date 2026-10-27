"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const crypto = require("node:crypto");
const http = require("node:http");
const { EventEmitter } = require("node:events");

const { LAUNCH_TIMEOUT_MS, connect, createPage, findBrowser, serveDirectory, startBrowser } = require("./browser.js");

// A browser that writes to stderr and never opens its port, kept in this
// process: a Node start on a loaded Windows runner wrote its stderr after
// the timeout (#362, #365), and outlasted it on a retry (E1.30). The start
// numbered `opensPortOn` writes DevToolsActivePort before it returns, as a
// warm start after a cold CI runner's first one did (E4.7). stop() ends it
// with child.kill() on Windows and with process.kill(-pid) elsewhere, so the
// mock sends that kill to it. args() lists the arguments of each start.
function hangingBrowser(t, { opensPortOn } = {}) {
  const children = new Map();
  const starts = [];
  const kill = process.kill;
  t.mock.method(process, "kill", (pid, signal) => (children.has(-pid) ? children.get(-pid).kill(signal) : kill.call(process, pid, signal)));
  return {
    starts: () => children.size,
    args: () => starts,
    spawnProcess: (_executable, args) => {
      starts.push(args);
      const child = new EventEmitter();
      // Above any pid_max, so it names no real process.
      child.pid = 2 ** 30 + children.size;
      child.exitCode = null;
      child.signalCode = null;
      child.stderr = new EventEmitter();
      child.kill = (signal = "SIGTERM") => {
        if (child.signalCode !== null) return false;
        child.signalCode = signal;
        child.emit("exit", null, signal);
        child.stderr.emit("close");
        return true;
      };
      children.set(child.pid, child);
      if (children.size === opensPortOn) {
        const profile = args.find((arg) => arg.startsWith("--user-data-dir=")).slice("--user-data-dir=".length);
        fs.writeFileSync(path.join(profile, "DevToolsActivePort"), "9222\n/devtools/browser/fake\n");
      }
      const announce = `start ${children.size}\n`;
      process.nextTick(() => child.stderr.emit("data", announce));
      return child;
    },
  };
}

// A browser that writes to stderr and exits with code 3, kept in this process:
// a Node start on a loaded Windows runner took longer than the 5 s timeout, so
// the first start ended before it was counted (E1.30, 2026-10-23).
function crashingBrowser() {
  let starts = 0;
  return {
    starts: () => starts,
    spawnProcess: () => {
      starts += 1;
      const child = new EventEmitter();
      child.pid = 2 ** 30 + starts;
      child.exitCode = null;
      child.signalCode = null;
      child.stderr = new EventEmitter();
      child.kill = () => false;
      process.nextTick(() => {
        child.stderr.emit("data", "boom: missing shared library\n");
        child.exitCode = 3;
        child.emit("exit", 3, null);
        child.stderr.emit("close");
      });
      return child;
    },
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
  const fake = hangingBrowser(t, { opensPortOn: 2 });
  const started = await startBrowser({ executable: "chromium", timeoutMs: 100, spawnProcess: fake.spawnProcess });
  try {
    assert.equal(started.port, "9222");
    assert.equal(started.browserPath, "/devtools/browser/fake");
    assert.equal(fake.starts(), 2);
  } finally {
    await started.stop();
  }
});

test("startBrowser starts the browser without the desktop keyring", async (t) => {
  // Chromium asks the desktop keyring for the key of its cookies before its
  // first request, and a keyring that never answered left every page of the
  // bench unloaded (E1.56). A CI runner has no desktop keyring, so only the
  // arguments show it here: basic on Linux, a mock keychain on macOS.
  const fake = hangingBrowser(t, { opensPortOn: 1 });
  const started = await startBrowser({ executable: "chromium", timeoutMs: 100, spawnProcess: fake.spawnProcess });
  try {
    assert.equal(fake.args().length, 1);
    assert.ok(fake.args()[0].includes("--password-store=basic"), fake.args()[0].join(" "));
    assert.ok(fake.args()[0].includes("--use-mock-keychain"), fake.args()[0].join(" "));
  } finally {
    await started.stop();
  }
});

test("startBrowser reports the exit code and stderr of a browser that exits on both starts", async (t) => {
  const fake = crashingBrowser();
  await assert.rejects(
    startBrowser({ executable: "chromium", timeoutMs: 5000, spawnProcess: fake.spawnProcess }),
    /the browser exited with code 3 before opening its DevTools port; stderr: boom: missing shared library/,
  );
  assert.equal(fake.starts(), 2);
});

test("startBrowser reports the timeout and stderr of a browser that never opens its port", async (t) => {
  const fake = hangingBrowser(t);
  await assert.rejects(
    startBrowser({ executable: "chromium", timeoutMs: 100, spawnProcess: fake.spawnProcess }),
    /the browser did not open its DevTools port within 100 ms; stderr: start 2/,
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

// A DevTools connection that never answers a navigation or a reload, as a
// Chromium waiting on the desktop keyring did (E1.56); every other command
// succeeds.
function stalledNavigation() {
  return {
    send: (method) => (method === "Page.navigate" || method === "Page.reload" ? new Promise(() => {}) : Promise.resolve({})),
    on: () => () => {},
  };
}

test("open() and reload() fail with the load timeout when the browser never answers the navigation", async () => {
  // The timeout used to reject with nobody awaiting it, and Node ended the
  // check runner before it closed its browser and removed the profile.
  const page = createPage(stalledNavigation(), "session", "http://127.0.0.1:9/", { loadTimeoutMs: 50 });
  for (const action of [() => page.open(), () => page.reload()]) {
    const outcome = await Promise.race([
      action().then(() => "loaded", (error) => error.message),
      new Promise((resolve) => setTimeout(resolve, 2000, "still pending")),
    ]);
    assert.equal(outcome, "the page did not finish loading");
  }
});

test("a start waits up to 60 s before its retry, because a loaded CI runner outlasts 20 s twice", () => {
  // PR #328, Windows: under the rest of the suite, the first four starts of
  // todo-spa ran out of 20 s on both tries, and the next ones took seconds.
  assert.ok(LAUNCH_TIMEOUT_MS >= 60000, `LAUNCH_TIMEOUT_MS is ${LAUNCH_TIMEOUT_MS}`);
});

"use strict";

// A headless Chromium for the hidden checks of browser scenarios (E4.5),
// driven over the DevTools protocol with Node's own WebSocket and http, so the
// bench needs no dependency. The delivered workspace is served over HTTP on
// 127.0.0.1, and every check gets its own browser profile, so localStorage and
// history never pass from one check to the next.

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const LAUNCH_TIMEOUT_MS = 20000;
const LOAD_TIMEOUT_MS = 15000;
const CANDIDATES = Object.freeze({
  linux: ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"],
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
});
const MIME = Object.freeze({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" });
const KEYS = Object.freeze({
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
  Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
});

/** The Chromium-family executable to use: BENCH_CHROMIUM, else the first one installed. */
function findBrowser({ env = process.env, platform = process.platform, exists = fs.existsSync } = {}) {
  if (env.BENCH_CHROMIUM) return exists(env.BENCH_CHROMIUM) ? env.BENCH_CHROMIUM : null;
  const paths = platform === "win32" ? path.win32 : path.posix;
  for (const candidate of CANDIDATES[platform] || []) {
    if (paths.isAbsolute(candidate)) {
      if (exists(candidate)) return candidate;
      continue;
    }
    for (const dir of String(env.PATH || "").split(path.delimiter).filter(Boolean)) {
      if (exists(path.join(dir, candidate))) return path.join(dir, candidate);
    }
  }
  return null;
}

/** Serves `root` read-only on 127.0.0.1; paths outside it are 404. */
function serveDirectory(root) {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = path.resolve(root, `.${pathname.endsWith("/") ? `${pathname}index.html` : pathname}`);
    if (!file.startsWith(path.resolve(root)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    response.end(fs.readFileSync(file));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((done) => { server.close(() => done()); }) });
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

async function waitForFile(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let lines = [];
    try {
      lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    } catch {
      // not written yet, or still held by the browser (EBUSY on Windows)
    }
    if (lines.length >= 2) return lines;
    await delay(50);
  }
  throw new Error("the browser did not open its DevTools port");
}

/** One DevTools connection: commands by id and events by name, per session. */
function connect(url) {
  const socket = new WebSocket(url);
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject, method } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result);
      return;
    }
    for (const listener of listeners) listener(message);
  });
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error(`could not connect to ${url}`)));
  });
  return opened.then(() => ({
    send(method, params = {}, sessionId = undefined) {
      nextId += 1;
      const id = nextId;
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, method }); });
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      socket.close();
    },
  }));
}

function createPage(connection, sessionId, baseUrl) {
  const send = (method, params) => connection.send(method, params, sessionId);
  const errors = [];
  connection.on((message) => {
    if (message.sessionId === sessionId && message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      errors.push((details.exception && details.exception.description) || details.text);
    }
  });

  function loaded() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { stop(); reject(new Error("the page did not finish loading")); }, LOAD_TIMEOUT_MS);
      const stop = connection.on((message) => {
        if (message.sessionId === sessionId && message.method === "Page.loadEventFired") {
          clearTimeout(timer);
          stop();
          resolve();
        }
      });
    });
  }

  async function evaluate(fn, ...args) {
    const expression = typeof fn === "function" ? `(${fn})(...${JSON.stringify(args)})` : fn;
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error(`page error: ${(details.exception && details.exception.description) || details.text}`);
    }
    return result.result.value;
  }

  async function centerOf(selector, index) {
    const box = await evaluate((sel, i) => {
      const element = document.querySelectorAll(sel)[i];
      if (!element) return null;
      element.scrollIntoView({ block: "center", inline: "center" });
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, visible: rect.width > 0 && rect.height > 0 };
    }, selector, index);
    if (!box) throw new Error(`no element matches ${selector} [${index}]`);
    if (!box.visible) throw new Error(`${selector} [${index}] is not visible`);
    return box;
  }

  async function mouse(x, y, clickCount) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount });
  }

  return {
    errors,
    evaluate,
    /** Opens `relative` (default index.html) of the served workspace, with an optional hash. */
    async open(relative = "index.html") {
      const done = loaded();
      await send("Page.navigate", { url: new URL(relative, baseUrl).href });
      await done;
    },
    async reload() {
      const done = loaded();
      await send("Page.reload", {});
      await done;
    },
    async click(selector, index = 0) {
      const { x, y } = await centerOf(selector, index);
      await mouse(x, y, 1);
    },
    async doubleClick(selector, index = 0) {
      const { x, y } = await centerOf(selector, index);
      await mouse(x, y, 1);
      await mouse(x, y, 2);
    },
    async focus(selector, index = 0) {
      const found = await evaluate((sel, i) => {
        const element = document.querySelectorAll(sel)[i];
        if (!element) return false;
        element.focus();
        return true;
      }, selector, index);
      if (!found) throw new Error(`no element matches ${selector} [${index}]`);
    },
    /** Types into the focused element as a user would (input events per text). */
    async type(text) {
      await send("Input.insertText", { text });
    },
    async press(name) {
      const key = KEYS[name];
      if (!key) throw new Error(`unknown key ${name}`);
      await send("Input.dispatchKeyEvent", { type: key.text ? "keyDown" : "rawKeyDown", ...key });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: key.key, code: key.code, windowsVirtualKeyCode: key.windowsVirtualKeyCode });
    },
    /** Lets pending timers, microtasks and renders run. */
    async settle(ms = 50) {
      await evaluate("new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))");
      if (ms > 0) await delay(ms);
    },
    /** The computed accessible name of each element `selector` matches, as assistive technology reads it. */
    async accessibleNames(selector) {
      const { root } = await send("DOM.getDocument", { depth: 0 });
      const { nodeIds } = await send("DOM.querySelectorAll", { nodeId: root.nodeId, selector });
      const names = [];
      for (const nodeId of nodeIds) {
        const { nodes } = await send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
        const node = nodes.find((entry) => !entry.ignored) || nodes[0];
        names.push(node && node.name ? String(node.name.value || "").trim() : "");
      }
      return names;
    },
  };
}

/**
 * Launches a headless browser on a fresh profile and serves `root`. Returns
 * { newPage(), close() }; close() also removes the profile.
 */
async function launchBrowser({ root, executable = findBrowser() }) {
  if (!executable) throw new Error("no Chromium-family browser found (set BENCH_CHROMIUM)");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "bench-browser-"));
  const served = await serveDirectory(root);
  const child = spawn(executable, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore", windowsHide: true, detached: process.platform !== "win32" });
  const exited = new Promise((resolve) => { child.once("exit", resolve); });
  let connection = null;
  const close = async () => {
    if (connection) {
      try {
        await Promise.race([connection.send("Browser.close"), delay(2000)]);
      } catch {
        // already gone
      }
      connection.close();
    }
    // The browser and its helper processes (renderers, crash handler) keep
    // writing to the profile until they exit, so the whole process group goes
    // on POSIX, and the profile is removed once the browser has exited.
    if (child.exitCode === null && child.signalCode === null) {
      try {
        if (process.platform === "win32") child.kill();
        else process.kill(-child.pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
    await Promise.race([exited, delay(5000)]);
    await served.close();
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // A profile a late helper still writes to stays in the temp directory;
      // it never changes a check's verdict.
    }
  };
  try {
    const [port, browserPath] = await waitForFile(path.join(profile, "DevToolsActivePort"), LAUNCH_TIMEOUT_MS);
    connection = await connect(`ws://127.0.0.1:${port}${browserPath}`);
  } catch (error) {
    await close();
    throw error;
  }
  return {
    url: served.url,
    async newPage() {
      const { targetId } = await connection.send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await connection.send("Target.attachToTarget", { targetId, flatten: true });
      for (const domain of ["Page.enable", "Runtime.enable", "DOM.enable", "Accessibility.enable"]) await connection.send(domain, {}, sessionId);
      return createPage(connection, sessionId, served.url);
    },
    close,
  };
}

module.exports = { findBrowser, launchBrowser, serveDirectory };

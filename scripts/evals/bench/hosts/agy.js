"use strict";

// Antigravity CLI host for the bench (E4.5): headless `agy --print` turns
// resumed with `--conversation`, so the same harness measures a non-Claude model
// without spending the Claude quota. Each workspace gets its own HOME, copied
// from the arm's template (ospec installed for antigravity, or gentle-ai), so
// no conversation, summary, or knowledge item of one run reaches another, and
// none of the user's rules reach any. agy keeps its credentials outside HOME,
// so an isolated HOME stays logged in.
//
// agy reports `usage` accumulated over the conversation, with no cost: a turn
// counts the difference from the conversation's previous turn. Its
// `total_tokens` leaves out `cache_read_tokens`, which the bench adds apart,
// and `output_tokens` already includes the thinking tokens.
//
// Every prompt goes on stdin as one stream-json message, so no prompt meets
// the length limit of a command-line argument, and the transcript keeps every
// step of the turn. The persona runs on agy too, with no rules (a fresh HOME
// per call), in plan mode, and answers through `--json-schema`. agy has no
// system prompt flag, so the persona's instructions precede the agent's
// message.
//
// agy reads the whole disk (`--sandbox` does not stop it), and an agent that
// finds an earlier delivery, or the bench's hidden checks, uses them. So every
// agy process runs in bubblewrap (`sandbox`): its own PID namespace (no `ps`
// of the bench), an empty system temp directory and user HOME, the hidden
// roots (the bench, other runs) emptied, and only the run's own directory (the
// workspace's parent), the arm's template, and the tools it needs (agy, Node)
// mounted back. The template goes back as a copy without agy's runtime state,
// mounted over its own path (`templateView`): a log of agy there named this
// repository. agy's web tools stay out too: `search_web` runs on Google's side,
// so no network rule stops it, and the repository is public; each workspace
// HOME carries a PreToolUse hook that denies them, read-only in the sandbox.
// The shell keeps its network, since cutting it cuts agy's API. As a safety net, a tool step that names a path inside a hidden
// root that is neither mounted back nor above something mounted back is an
// escape, and the driver voids the run.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const { PERSONA_SCHEMA, buildPersonaPrompt, buildPersonaSystemPrompt, normalizePersonaReply } = require("../persona.js");
const { emptyUsage } = require("../transcript.js");
const { listFiles } = require("../scenarios.js");
const { homeAsTilde, setupEngram } = require("./engram.js");

const DEFAULT_TURN_TIMEOUT_MS = 60 * 60 * 1000;
const PERSONA_TIMEOUT_MS = 5 * 60 * 1000;
const STDERR_TAIL = 2000;
const QUOTA_PATTERN = /RESOURCE_EXHAUSTED|\b429\b|quota exceeded|rate limit/i;
// Only what a process needs to run reaches agy: the calling session's
// markers and keys, the bench's own directory (PWD, npm's variables) and
// whatever a terminal or editor adds (ORCA_WORKSPACE_ID names this repository)
// never do.
const INHERITED_ENV = [/^PATH$/, /^LANG$/, /^LANGUAGE$/, /^LC_[A-Z]+$/, /^TZ$/, /^TERM$/, /^COLORTERM$/, /^USER$/, /^LOGNAME$/, /^SHELL$/,
  /^TMPDIR$/, /^XDG_RUNTIME_DIR$/, /^DBUS_SESSION_BUS_ADDRESS$/, /^(HTTPS?|NO|ALL)_PROXY$/i, /^SSL_CERT_(FILE|DIR)$/, /^NODE_EXTRA_CA_CERTS$/];
// What agy writes while it runs: conversations, summaries, knowledge, logs.
// A template HOME keeps only what an install wrote.
const RUNTIME_STATE = new Set(["annotations", "brain", "cache", "cli.log", "conversations", "conversation_summaries.db",
  "conversation_summaries.db-shm", "conversation_summaries.db-wal", "crashes", "history.jsonl", "implicit", "jetbox_summaries_proto.pb",
  "log", "presence", "updater", "last_check.timestamp", "installation_id", "jetski_state.pbtxt"]);
// The PreToolUse hook every workspace HOME carries: agy's web and browser
// tools are denied, whatever the permission mode.
const OFFLINE_HOOK = "ospec-bench-offline";
const OFFLINE_DENIAL = JSON.stringify({ decision: "deny", reason: "The bench runs offline: web and browser tools are disabled." });
const OFFLINE_HOOKS = Object.freeze({
  PreToolUse: [{ matcher: "search_web|read_url_content|open_browser_url|browser_.*", hooks: [{ command: `cat >/dev/null; printf '%s\\n' '${OFFLINE_DENIAL}'` }] }],
});
const PERSONA_FALLBACK = Object.freeze({
  kind: "stopped",
  answer: "Continúa, por favor.",
  facts_disclosed: [],
  deviates_from_recommendation: false,
  unknown_facts: [],
});

const inheritedEnv = (baseEnv) => Object.fromEntries(Object.entries(baseEnv).filter(([key]) => INHERITED_ENV.some((pattern) => pattern.test(key))));

/** HOME and the XDG directories inside `home`, so nothing of the user's configuration is read. */
function isolatedEnv(baseEnv, home) {
  return {
    ...inheritedEnv(baseEnv),
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    XDG_STATE_HOME: path.join(home, ".local", "state"),
  };
}

function usageFrom(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  return {
    input: Number(value.input_tokens) || 0,
    output: Number(value.output_tokens) || 0,
    cache_read: Number(value.cache_read_tokens) || 0,
    cache_creation: 0,
  };
}

const minus = (a, b) => Object.fromEntries(Object.keys(a).map((key) => [key, Math.max(0, a[key] - (b[key] || 0))]));

// The final result of a stream-json transcript: its last `result` event.
function resultOf(bytes) {
  const events = String(bytes).split("\n").flatMap((line) => {
    try {
      const event = JSON.parse(line);
      return event && typeof event === "object" ? [event] : [];
    } catch {
      return [];
    }
  });
  const last = [...events].reverse().find((event) => event.event === "result" && event.result && typeof event.result === "object");
  return last ? last.result : null;
}

// Tool parameters that carry paths; file contents never do.
const PATH_PARAMETER = /(path|file|directory|dir|cwd|commandline)$/i;
const ABSOLUTE = /(?:^|[\s"'`=:,(])(\/[^\s"'`;|&<>(),*?]*)/g;
const WORD = /"([^"]*)"|'([^']*)'|([^\s;|&<>()"']+)/g;
const SEGMENT = /&&|\|\||[;|\n]/;

const isWithin = (child, parent) => child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : `${parent}${path.sep}`);

// Whether `named` lies in a copy of `root` under another prefix, as a
// filesystem snapshot keeps it (/home/u/repo as /home/.snapshots/85/snapshot/u/repo):
// it holds `root` without its first segment, when two or more segments remain.
function inCopyOf(named, root) {
  const tail = root.split(path.sep).filter(Boolean).slice(1);
  if (tail.length < 2) return false;
  const segments = named.split(path.sep).filter(Boolean);
  for (let start = 1; start + tail.length <= segments.length; start += 1) {
    if (tail.every((segment, offset) => segments[start + offset] === segment)) return true;
  }
  return false;
}

const beforeGlob = (value) => value.split(/[*?[{]/)[0];

// Paths a value names. A path parameter is one path. A command line names
// every absolute path in it, the relative ones that climb (`..`) and, once a
// `cd` has left the starting directory, every relative word that looks like a
// path, each resolved against the directory the line's `cd`s leave.
function namedPaths(value, isCommand, cwd) {
  if (!isCommand) return [path.resolve(cwd, beforeGlob(value))];
  const start = cwd;
  const found = [...value.matchAll(ABSOLUTE)].map((match) => match[1]);
  for (const segment of value.split(SEGMENT)) {
    const words = [...segment.matchAll(WORD)].map((match) => match[1] ?? match[2] ?? match[3]);
    for (const [index, raw] of words.entries()) {
      const word = beforeGlob(raw.includes("=") ? raw.slice(raw.lastIndexOf("=") + 1) : raw);
      if (!word || word.startsWith("/")) continue;
      const climbs = /(^|\/)\.\.(\/|$)/.test(word);
      const moved = cwd !== start && (word.startsWith(".") || word.includes("/"));
      if (climbs || moved) found.push(path.resolve(cwd, word));
      if (words[index - 1] === "cd") cwd = path.resolve(cwd, word);
    }
  }
  return found;
}

/**
 * The tool steps of a stream-json transcript that name a path inside a
 * `forbidden` root or a copy of one under another prefix, outside the
 * `allowed` roots and not above one of them: in
 * the sandbox such a path does not exist, so naming it means the agent learned
 * it from somewhere it should not have, or the sandbox let it through.
 */
function findEscapes(bytes, { cwd, allowed, forbidden }) {
  const escapes = [];
  const seen = new Set();
  for (const line of String(bytes).split("\n")) {
    let step;
    try {
      step = JSON.parse(line).step_update;
    } catch {
      continue;
    }
    const parameters = step && step.tool_info && step.tool_info.parameters;
    if (!parameters || typeof parameters !== "object" || seen.has(step.step_index)) continue;
    const base = typeof parameters.Cwd === "string" ? path.resolve(cwd, parameters.Cwd) : cwd;
    const paths = Object.entries(parameters)
      .filter(([key, value]) => PATH_PARAMETER.test(key) && typeof value === "string" && value !== "")
      .flatMap(([key, value]) => namedPaths(value, /commandline/i.test(key), base))
      .map((named) => path.resolve(named))
      .filter((named) => forbidden.some((root) => isWithin(named, root) || inCopyOf(named, root)))
      .filter((named) => !allowed.some((root) => isWithin(named, root) || isWithin(root, named)));
    if (paths.length === 0) continue;
    seen.add(step.step_index);
    escapes.push({ step: step.step_index, tool: step.tool_name || step.tool_info.name, paths: [...new Set(paths)] });
  }
  return escapes;
}

/** The stdin of one turn: the prompt as a stream-json user message. */
function streamInput(prompt) {
  return `${JSON.stringify({ event: "user", message: { content: prompt } })}\n`;
}

/**
 * Reads one `agy --output-format stream-json` turn. `previous` is the
 * conversation's accumulated usage before this turn ({ usage, turns }).
 */
function summarizeAgyTurn(bytes, previous = { usage: emptyUsage(), turns: 0 }) {
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const result = resultOf(bytes);
  if (!result) {
    return {
      session_id: null, final_text: "", usage: emptyUsage(), cumulative: previous, cost_usd: 0, duration_ms: 0,
      agent_turns: 0, subagents: 0, is_error: true, error: "no result event from agy", quota_exhausted: false, sha256,
    };
  }
  const cumulative = { usage: usageFrom(result.usage), turns: Number(result.num_turns) || previous.turns };
  const text = typeof result.response === "string" ? result.response : "";
  const isError = result.status !== "SUCCESS";
  const turn = {
    session_id: result.conversation_id || null,
    final_text: text,
    usage: minus(cumulative.usage, previous.usage),
    cumulative,
    cost_usd: 0,
    duration_ms: Math.round((Number(result.duration_seconds) || 0) * 1000),
    agent_turns: Math.max(0, cumulative.turns - previous.turns),
    subagents: 0,
    is_error: isError,
    quota_exhausted: isError && QUOTA_PATTERN.test(`${result.status} ${text} ${result.error || ""}`),
    sha256,
  };
  if (isError) turn.error = String(result.error || result.status || "error");
  return turn;
}

// `--print=` takes its prompt from stdin; a bare `-p` would read the next flag
// as the prompt.
const STREAM = Object.freeze(["--input-format", "stream-json", "--output-format", "stream-json"]);

function turnArgs({ model, conversationId }) {
  return [
    "--model", model,
    ...STREAM,
    "--dangerously-skip-permissions",
    ...(conversationId ? ["--conversation", conversationId] : []),
    "--print=",
  ];
}

function personaArgs({ model }) {
  return ["--model", model, ...STREAM, "--json-schema", JSON.stringify(PERSONA_SCHEMA), "--mode", "plan", "--print="];
}

function runProcess({ executable, args, cwd, env, input, stdoutPath, timeoutMs, children = null }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(executable, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    if (children) children.add(child);
    const chunks = [];
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (chunk) => { chunks.push(chunk); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-STDERR_TAIL); });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const finish = (code, error) => {
      clearTimeout(timer);
      if (children) children.delete(child);
      const stdout = Buffer.concat(chunks);
      if (stdoutPath) fs.writeFileSync(stdoutPath, stdout);
      resolve({ code, error, timedOut, stderr, stdout: stdout.toString("utf8"), wall_ms: Date.now() - started });
    };
    child.on("error", (error) => finish(null, error));
    child.on("close", (code) => finish(code, null));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

const depth = (dir) => dir.split(path.sep).length;

/**
 * bubblewrap's arguments to run a command in `cwd` that sees the system but
 * none of `hide` (each emptied), except `expose` (read-only; a path, or a
 * [source, target] pair that mounts `source` at `target`) and `root`
 * (writable, but for `readOnly`), in a PID namespace of its own.
 */
function sandboxArgs({ hide, expose, root, cwd, readOnly = [] }) {
  const hidden = [...new Set(hide.map((dir) => path.resolve(dir)))]
    .filter((dir) => fs.existsSync(dir))
    .sort((a, b) => depth(a) - depth(b))
    .filter((dir, index, all) => !all.slice(0, index).some((parent) => isWithin(dir, parent)));
  const mounts = new Map(expose.map((entry) => (Array.isArray(entry) ? entry : [entry, entry]).map((target) => path.resolve(target)))
    .filter(([source]) => fs.existsSync(source))
    .map(([source, target]) => [target, source]));
  return [
    "--dev-bind", "/", "/",
    ...hidden.flatMap((dir) => ["--tmpfs", dir]),
    ...[...mounts].flatMap(([target, source]) => ["--ro-bind", source, target]),
    "--bind", root, root,
    ...readOnly.flatMap((target) => ["--ro-bind", target, target]),
    "--unshare-pid", "--proc", "/proc", "--die-with-parent",
    "--chdir", cwd,
    "--",
  ];
}

/**
 * Copies an arm's template HOME into `dest`, leaving out what agy wrote while
 * running and, unless `bin`, the binaries.
 */
function copyHome(template, dest, { bin = false } = {}) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(template, dest, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(template, source).split(path.sep);
      if (relative[0] === "bin" && !bin) return false;
      return !(relative[0] === ".gemini" && relative[1] === "antigravity-cli" && relative.length === 3 && RUNTIME_STATE.has(relative[2]));
    },
  });
}

/** Adds the hook that denies agy's web tools to the hooks of `home`; returns its file. */
function blockWeb(home) {
  const file = path.join(home, ".gemini", "config", "hooks.json");
  const hooks = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ ...hooks, [OFFLINE_HOOK]: OFFLINE_HOOKS }, null, 2)}\n`);
  return file;
}

/**
 * SHA-256 over the files under `root` a run reads, skipping install manifests
 * that carry a timestamp. It identifies the content, not the machine
 * (OSP-026): the absolute `root` the installers write into hooks and skills
 * reads as `~`, and binaries (the hook launcher built from Go) stay out, since
 * the record's `repo_commit` pins their source.
 */
function hashFiles(root, relatives) {
  const hash = crypto.createHash("sha256");
  for (const relative of relatives) {
    const full = path.join(root, relative);
    if (!fs.existsSync(full)) continue;
    const files = fs.statSync(full).isDirectory() ? listFiles(full).map((file) => `${relative}/${file}`) : [relative];
    for (const file of files) {
      if (path.basename(file) === ".ospec-workflow-install.json") continue;
      const bytes = fs.readFileSync(path.join(root, file));
      if (bytes.includes(0)) continue;
      hash.update(`${file}\0`);
      hash.update(crypto.createHash("sha256").update(homeAsTilde(bytes.toString("utf8"), root)).digest("hex"));
      hash.update("\n");
    }
  }
  return hash.digest("hex");
}

/**
 * Installs ospec for antigravity, built from `repoRoot`, into the template
 * HOME `home` (its `.gemini/config`), without SDD, and identifies it. A
 * `--dest` install skips Engram, so with `engram` (a binary) it runs
 * `engram setup antigravity-cli` in the template, as the gentle-ai arm has
 * Engram (OSP-025): its MCP server in `.gemini/config/mcp_config.json` and
 * its protocol in `.gemini/GEMINI.md`, both part of the digest.
 */
function buildOspecHome({ repoRoot, home, engram = null, baseEnv = process.env, spawnSyncImpl = spawnSync }) {
  fs.rmSync(home, { recursive: true, force: true });
  const configDir = path.join(home, ".gemini", "config");
  const result = spawnSyncImpl(process.execPath, [
    path.join(repoRoot, "scripts", "configure", "install-antigravity.js"),
    "--no-sdd",
    "--source", repoRoot,
    "--dest", configDir,
  ], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`ospec install for antigravity failed: ${result.stderr || result.stdout}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(configDir, ".ospec-workflow-install.json"), "utf8"));
  const memory = engram ? setupEngram({ engram, home, host: "agy", env: isolatedEnv(baseEnv, home), spawnSyncImpl }) : null;
  return {
    home,
    version: memory ? `${manifest.version} (engram ${memory.version})` : manifest.version,
    digest: hashFiles(home, [".gemini/config", ".gemini/GEMINI.md"]),
  };
}

function createAgyHost({
  executable,
  prefixArgs = [],
  template,
  model,
  personaModel,
  personaDir,
  gentleAi = null,
  engram = null,
  forbidden = [],
  sandbox = null,
  personaInvoke = null,
  baseEnv = process.env,
  turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS,
}) {
  // `sandbox`: { bwrap, hide, expose, bin, templateView }, where `bin` are
  // directories of `expose` that go first on the PATH, since the user's own
  // PATH may lie under a hidden root, and `templateView` is where the template
  // is copied without agy's runtime state, to be mounted over it.
  if (sandbox && sandbox.templateView) copyHome(template, sandbox.templateView, { bin: true });
  const templateMount = sandbox && sandbox.templateView ? [sandbox.templateView, template] : template;

  function command(args, { root, cwd, env, extraExpose = [], readOnly = [] }) {
    if (!sandbox) return { file: executable, args: [...prefixArgs, ...args], env };
    return {
      file: sandbox.bwrap,
      args: [...sandboxArgs({ hide: sandbox.hide, expose: [...sandbox.expose, ...extraExpose], root, cwd, readOnly }), executable, ...prefixArgs, ...args],
      env: { ...env, PATH: [...(sandbox.bin || []), env.PATH || ""].join(path.delimiter) },
    };
  }

  const homes = new Map();
  const conversations = new Map();
  const engrams = new Map();
  const children = new Set();

  // The agent's HOME for one workspace: a fresh copy of the template under
  // .git/ (never part of the delivery), with agy's web tools denied. Every arm with Engram (gentle-ai, and
  // an ospec template set up with `engram`: { startEngram }) gets an empty one,
  // with the template's engram first on the PATH for its hooks.
  const memory = gentleAi || engram;
  async function workspaceEnv(cwd) {
    if (!homes.has(cwd)) {
      const home = path.join(cwd, ".git", "agy-home");
      copyHome(template, home);
      blockWeb(home);
      homes.set(cwd, home);
      if (memory) engrams.set(cwd, await memory.startEngram({ home: template, workspaceRoot: cwd, baseEnv: inheritedEnv(baseEnv) }));
    }
    const home = homes.get(cwd);
    if (!gentleAi) {
      const env = isolatedEnv(baseEnv, home);
      if (!engram) return { ...env, PWD: cwd };
      return { ...env, PATH: `${path.join(template, "bin")}${path.delimiter}${env.PATH || ""}`, ...engrams.get(cwd).env, PWD: cwd };
    }
    return { ...gentleAi.homeEnv(inheritedEnv(baseEnv), home), PATH: `${path.join(template, "bin")}${path.delimiter}${baseEnv.PATH || ""}`, ...engrams.get(cwd).env, PWD: cwd };
  }

  async function turn({ cwd, prompt, sessionId, transcriptPath }) {
    fs.mkdirSync(path.dirname(transcriptPath), { recursive: true });
    const env = await workspaceEnv(cwd);
    const hooks = path.join(homes.get(cwd), ".gemini", "config", "hooks.json");
    const spawned = command(turnArgs({ model, conversationId: sessionId }), { root: path.dirname(cwd), cwd, env, extraExpose: [templateMount], readOnly: [hooks] });
    const run = await runProcess({
      executable: spawned.file,
      args: spawned.args,
      cwd,
      env: spawned.env,
      input: streamInput(prompt),
      stdoutPath: transcriptPath,
      timeoutMs: turnTimeoutMs,
      children,
    });
    const previous = (sessionId && conversations.get(sessionId)) || { usage: emptyUsage(), turns: 0 };
    const bytes = fs.readFileSync(transcriptPath);
    const summary = summarizeAgyTurn(bytes, previous);
    if (summary.session_id) conversations.set(summary.session_id, summary.cumulative);
    const failure = run.timedOut ? "timeout" : run.error ? run.error.message : run.code !== 0 ? `exit ${run.code}: ${run.stderr.trim()}` : null;
    const quota = summary.quota_exhausted || (failure !== null && QUOTA_PATTERN.test(run.stderr));
    const { cumulative, ...rest } = summary;
    return {
      ...rest,
      quota_exhausted: quota,
      escapes: findEscapes(bytes, { cwd, allowed: [path.dirname(cwd), template], forbidden }),
      wall_ms: run.wall_ms,
      ...(failure ? { is_error: true, error: summary.is_error ? `${failure} (${summary.error})` : failure } : {}),
    };
  }

  async function askPersona(scenario, goal, message) {
    const home = path.join(personaDir, "home");
    fs.rmSync(home, { recursive: true, force: true });
    fs.mkdirSync(home, { recursive: true });
    const prompt = `${buildPersonaSystemPrompt(scenario, { goal })}\n\n${buildPersonaPrompt(message)}`;
    // The persona's conversation holds the hidden facts: it never outlives the call.
    let run;
    try {
      const spawned = command(personaArgs({ model: personaModel }), { root: personaDir, cwd: personaDir, env: { ...isolatedEnv(baseEnv, home), PWD: personaDir } });
      run = await runProcess({
        executable: spawned.file,
        args: spawned.args,
        cwd: personaDir,
        env: spawned.env,
        input: streamInput(prompt),
        timeoutMs: PERSONA_TIMEOUT_MS,
        children,
      });
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
    const result = resultOf(run.stdout);
    if (!result) throw new Error(`no result event from agy: ${run.stderr.trim()}`);
    return { usage: usageFrom(result.usage), reply: normalizePersonaReply(result.structured_output, scenario) };
  }

  async function persona({ scenario, goal, message }) {
    const ask = personaInvoke
      ? () => personaInvoke({ scenario, goal, message })
      : () => askPersona(scenario, goal, message);
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { usage, reply } = await ask();
        return { reply, usage, cost_usd: 0, error: null };
      } catch (error) {
        lastError = error;
      }
    }
    return { reply: { ...PERSONA_FALLBACK }, usage: emptyUsage(), cost_usd: 0, error: String(lastError && lastError.message) };
  }

  function version() {
    const result = spawnSync(executable, [...prefixArgs, "--version"], { env: isolatedEnv(baseEnv, personaDir), encoding: "utf8" });
    return (result.stdout || "").trim();
  }

  /** Ends what the host keeps for a workspace (its Engram). */
  function release(cwd) {
    const engram = engrams.get(cwd);
    if (engram) engram.stop();
    engrams.delete(cwd);
    homes.delete(cwd);
  }

  function releaseAll() {
    for (const child of children) child.kill();
    for (const cwd of [...homes.keys()]) release(cwd);
  }

  return { name: "agy", turn, persona, version, release, releaseAll };
}

module.exports = { buildOspecHome, copyHome, createAgyHost, findEscapes, hashFiles, isolatedEnv, sandboxArgs, personaArgs, resultOf, streamInput, summarizeAgyTurn, turnArgs, usageFrom };

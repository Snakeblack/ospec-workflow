"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { spawnSync } = require("node:child_process");

const { buildOspecHome, copyHome, createAgyHost, findEscapes, isolatedEnv, sandboxArgs, streamInput, summarizeAgyTurn, turnArgs } = require("./agy.js");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bench-agy-"));
}

const scenario = {
  id: "s",
  brief: "Haz una lista de tareas.",
  facts: [{ id: "F1", text: "El título tiene como máximo 200 caracteres." }],
};

// A stand-in for agy: reads the stream-json message on stdin; an agent turn
// echoes what it saw and reports usage accumulated over the conversation (kept
// in its HOME); a persona call (--json-schema) answers with structured output.
function fakeAgy(dir) {
  const script = path.join(dir, "fake-agy.js");
  fs.writeFileSync(script, `
    const fs = require("node:fs");
    const path = require("node:path");
    const args = process.argv.slice(2);
    if (args[0] === "--version") { process.stdout.write("1.3.3\\n"); process.exit(0); }
    let input = "";
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const prompt = JSON.parse(input).message.content;
      const emit = (result) => process.stdout.write(JSON.stringify({ event: "init", conversation_id: result.conversation_id }) + "\\n" + JSON.stringify({ event: "result", result }) + "\\n");
      if (args.includes("--json-schema")) {
        emit({
          conversation_id: "persona", status: "SUCCESS", num_turns: 1,
          structured_output: { kind: "question", answer: JSON.stringify({ home: process.env.HOME, prompt, args }), facts_disclosed: ["F1", "F9"], deviates_from_recommendation: false },
          usage: { input_tokens: 7, output_tokens: 1, thinking_tokens: 0, cache_read_tokens: 2, total_tokens: 8 },
        });
        return;
      }
      const conversation = args.includes("--conversation") ? args[args.indexOf("--conversation") + 1] : "c-1";
      const counter = path.join(process.env.HOME, "turns");
      const n = (fs.existsSync(counter) ? Number(fs.readFileSync(counter, "utf8")) : 0) + 1;
      fs.writeFileSync(counter, String(n));
      emit({
        conversation_id: conversation, status: "SUCCESS", duration_seconds: 0.5, num_turns: n,
        response: JSON.stringify({ args, prompt, home: process.env.HOME, engramPort: process.env.ENGRAM_PORT || null, pathHead: (process.env.PATH || "").split(path.delimiter)[0], nested: process.env.CLAUDECODE || null, rules: fs.existsSync(path.join(process.env.HOME, ".gemini", "config", "rules", "r.md")) }),
        usage: { input_tokens: 100 * n, output_tokens: 10 * n, thinking_tokens: 3, cache_read_tokens: 50 * n, total_tokens: 110 * n },
      });
    });
  `);
  return script;
}

const stream = (result) => `${JSON.stringify({ event: "init" })}\n${JSON.stringify({ event: "step_update", step_update: {} })}\n${JSON.stringify({ event: "result", result })}\n`;

function template(dir) {
  const home = path.join(dir, "template");
  fs.mkdirSync(path.join(home, ".gemini", "config", "rules"), { recursive: true });
  fs.writeFileSync(path.join(home, ".gemini", "config", "rules", "r.md"), "rule");
  fs.mkdirSync(path.join(home, ".gemini", "antigravity-cli", "conversations"), { recursive: true });
  fs.writeFileSync(path.join(home, ".gemini", "antigravity-cli", "conversations", "old.pb"), "x");
  fs.writeFileSync(path.join(home, ".gemini", "antigravity-cli", "settings.json"), "{}");
  return home;
}

function workspace(dir) {
  const root = path.join(dir, "ws");
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  return root;
}

test("turnArgs reads the prompt from stdin as stream-json and resumes by conversation", () => {
  const args = turnArgs({ model: "gemini-3.8-flash-high", conversationId: null });
  assert.equal(args[args.length - 1], "--print=");
  assert.equal(args[args.indexOf("--input-format") + 1], "stream-json");
  assert.equal(args[args.indexOf("--output-format") + 1], "stream-json");
  assert.ok(args.includes("--dangerously-skip-permissions"));
  assert.ok(!args.includes("--conversation"));
  const resumed = turnArgs({ model: "m", conversationId: "c-1" });
  assert.equal(resumed[resumed.indexOf("--conversation") + 1], "c-1");
  assert.deepEqual(JSON.parse(streamInput("hola\nqué tal")), { event: "user", message: { content: "hola\nqué tal" } });
});

test("a turn counts its difference from the conversation's accumulated usage, cache reads included", () => {
  const first = summarizeAgyTurn(stream({ conversation_id: "c", status: "SUCCESS", response: "a", num_turns: 1, duration_seconds: 2, usage: { input_tokens: 100, output_tokens: 10, cache_read_tokens: 40, total_tokens: 110 } }));
  assert.deepEqual(first.usage, { input: 100, output: 10, cache_read: 40, cache_creation: 0 });
  assert.equal(first.duration_ms, 2000);
  assert.equal(first.session_id, "c");
  const second = summarizeAgyTurn(stream({ conversation_id: "c", status: "SUCCESS", response: "b", num_turns: 2, usage: { input_tokens: 250, output_tokens: 15, cache_read_tokens: 90 } }), first.cumulative);
  assert.deepEqual(second.usage, { input: 150, output: 5, cache_read: 50, cache_creation: 0 });
  assert.equal(second.agent_turns, 1);
  assert.equal(second.is_error, false);
});

test("a failed or unreadable turn is an error, and an exhausted quota is recognised", () => {
  const failed = summarizeAgyTurn(stream({ conversation_id: "c", status: "ERROR", error: "RESOURCE_EXHAUSTED: quota", usage: {} }));
  assert.equal(failed.is_error, true);
  assert.equal(failed.quota_exhausted, true);
  const other = summarizeAgyTurn(stream({ conversation_id: "c", status: "ERROR", error: "tool failed" }));
  assert.equal(other.quota_exhausted, false);
  const garbage = summarizeAgyTurn("not json");
  assert.equal(garbage.is_error, true);
  assert.deepEqual(garbage.usage, { input: 0, output: 0, cache_read: 0, cache_creation: 0 });
});

test("isolatedEnv passes only what a process needs, never the calling session's markers, keys or paths", () => {
  const env = isolatedEnv({
    PATH: "x", LANG: "es_ES.UTF-8", LC_TIME: "es_ES.UTF-8", TERM: "xterm", XDG_RUNTIME_DIR: "/run/user/1000", HTTPS_PROXY: "http://p",
    HOME: "/user", CLAUDECODE: "1", CLAUDE_CODE_ENTRYPOINT: "cli", GEMINI_API_KEY: "k", XDG_CONFIG_HOME: "/user/.config",
    ORCA_WORKSPACE_ID: "id::/home/u/repo", PWD: "/home/u/repo", OLDPWD: "/home/u", INIT_CWD: "/home/u/repo", npm_package_json: "/home/u/repo/package.json",
  }, "/bench/home");
  assert.equal(env.HOME, "/bench/home");
  assert.equal(env.XDG_CONFIG_HOME, path.join("/bench/home", ".config"));
  assert.deepEqual(
    Object.fromEntries(Object.entries(env).filter(([key]) => !["HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME"].includes(key))),
    { PATH: "x", LANG: "es_ES.UTF-8", LC_TIME: "es_ES.UTF-8", TERM: "xterm", XDG_RUNTIME_DIR: "/run/user/1000", HTTPS_PROXY: "http://p" },
  );
});

const toolStep = (index, name, parameters, state = "DONE") => JSON.stringify({ event: "step_update", step_update: { step_index: index, state, step_type: "tool", tool_name: name, tool_info: { name, parameters } } });

test("findEscapes flags tool steps that name a hidden path the sandbox never mounts, and nothing of the run's own or above it", { skip: process.platform === "win32" ? "agy runs only under bubblewrap, on Linux; its paths are POSIX" : false }, () => {
  const cwd = "/tmp/ospec-bench/k3x9qa/todo-spa";
  const options = { cwd, allowed: [path.dirname(cwd), "/tmp/ospec-bench/idd-agy-2/agy-ospec-home"], forbidden: ["/tmp/ospec-bench", "/home/u/repo"] };
  const allowed = [
    toolStep(1, "view_file", { AbsolutePath: `${cwd}/.git/agy-home/.gemini/config/skills/idd/SKILL.md` }),
    toolStep(2, "run_command", { CommandLine: "ls -la .. && node /tmp/ospec-bench/idd-agy-2/agy-ospec-home/.gemini/config/scripts/ospec.js next --json" }),
    toolStep(3, "run_command", { CommandLine: "node -e \"console.log('/'.repeat(3))\" > /tmp/scratch.txt 2>/dev/null" }),
    toolStep(4, "write_to_file", { TargetFile: `${cwd}/index.html`, CodeContent: "fetch('/tmp/ospec-bench/other')" }),
    toolStep(5, "find_by_name", { SearchDirectory: "test", Pattern: "*.js" }),
    toolStep(6, "run_command", { CommandLine: "ls -la ../.. /tmp/ospec-bench/idd-agy-2 && grep -rn \"nueva-tarea\" /tmp/ 2>/dev/null || true" }),
    toolStep(7, "run_command", { CommandLine: "ls /home/u && cd .. && ls -la todo-spa" }),
  ];
  assert.deepEqual(findEscapes(allowed.join("\n"), options), [], "the sandbox shows nothing of the bench there");

  const escaped = [
    toolStep(8, "run_command", { CommandLine: "cd .. && cd .. && ls -la ./idd-agy-1" }),
    toolStep(9, "view_file", { AbsolutePath: "/tmp/ospec-bench/w1b2c3/todo-spa/index.html" }, "ACTIVE"),
    toolStep(9, "view_file", { AbsolutePath: "/tmp/ospec-bench/w1b2c3/todo-spa/index.html" }),
    toolStep(10, "list_dir", { DirectoryPath: "/tmp/ospec-bench/idd-agy-2/persona" }),
    toolStep(11, "run_command", { CommandLine: "npm --prefix=../../w1b2c3/todo-spa test" }),
    toolStep(12, "grep_search", { SearchPath: "/home/u/repo/scripts/evals/bench/scenarios-greenfield/*" }),
  ];
  const found = findEscapes(escaped.join("\n"), options);
  assert.deepEqual(found.map((escape) => escape.step), [8, 9, 10, 11, 12]);
  assert.deepEqual(found[0], { step: 8, tool: "run_command", paths: ["/tmp/ospec-bench/idd-agy-1"] }, "each cd moves the directory the next relative path resolves against");
  assert.deepEqual(found[3].paths, ["/tmp/ospec-bench/w1b2c3/todo-spa"]);
  assert.deepEqual(found[4].paths, ["/home/u/repo/scripts/evals/bench/scenarios-greenfield"]);
});

test("findEscapes flags a copy of a hidden root under another prefix, such as a filesystem snapshot", { skip: process.platform === "win32" ? "agy runs only under bubblewrap, on Linux; its paths are POSIX" : false }, () => {
  const cwd = "/tmp/ospec-bench/k3x9qa/cli-local";
  const options = { cwd, allowed: [path.dirname(cwd)], forbidden: ["/tmp/ospec-bench", "/home/u/repo", "/home/u/.ospec-bench"] };
  const snapshot = "/home/.snapshots/85/snapshot/u/repo";
  const escaped = [
    toolStep(1, "run_command", { CommandLine: `ls -la ${snapshot}/scripts/evals/` }),
    toolStep(2, "read_file", { Path: `${snapshot}/scripts/evals/bench/scenarios/cli-local/scenario.json` }),
    toolStep(3, "run_command", { CommandLine: "cat /mnt/backup/home/u/.ospec-bench/gentle-ai-agy/bin/engram" }),
  ];
  const found = findEscapes(escaped.join("\n"), options);
  assert.deepEqual(found.map((escape) => escape.step), [1, 2, 3]);
  assert.deepEqual(found[1].paths, [`${snapshot}/scripts/evals/bench/scenarios/cli-local/scenario.json`]);

  const unrelated = [
    toolStep(4, "run_command", { CommandLine: "ls /home/.snapshots /srv/repo /opt/u/other && cat /var/tmp/ospec-bench/notes" }),
    toolStep(5, "read_file", { Path: `${cwd}/.git/agy-home/u/repo/notes.md` }),
  ];
  assert.deepEqual(findEscapes(unrelated.join("\n"), options), [], "a lone segment or the run's own directory is no copy of the bench");
});

test("sandboxArgs empties each hidden root once, outermost first, and mounts back the exposed paths and the run's directory", () => {
  const dir = tempDir();
  const home = path.join(dir, "home");
  const repo = path.join(home, "repo");
  const tool = path.join(home, ".local", "bin", "agy");
  fs.mkdirSync(path.dirname(tool), { recursive: true });
  fs.writeFileSync(tool, "");
  fs.mkdirSync(repo);
  const root = path.join(dir, "k3x9qa");
  const args = sandboxArgs({ hide: [repo, home, path.join(dir, "missing")], expose: [tool, path.join(dir, "nope")], root, cwd: path.join(root, "todo-spa") });
  assert.deepEqual(args, [
    "--dev-bind", "/", "/",
    "--tmpfs", home,
    "--ro-bind", tool, tool,
    "--bind", root, root,
    "--unshare-pid", "--proc", "/proc", "--die-with-parent",
    "--chdir", path.join(root, "todo-spa"),
    "--",
  ]);
});

test("sandboxArgs mounts an exposed source over another target, and the read-only paths over the run's directory", () => {
  const dir = tempDir();
  const view = path.join(dir, "view");
  const target = path.join(dir, "home", "template");
  fs.mkdirSync(view);
  const root = path.join(dir, "k3x9qa");
  const hooks = path.join(root, "todo-spa", ".git", "agy-home", ".gemini", "config", "hooks.json");
  const args = sandboxArgs({ hide: [], expose: [[view, target], [path.join(dir, "nope"), target]], root, cwd: path.join(root, "todo-spa"), readOnly: [hooks] });
  assert.deepEqual(args, [
    "--dev-bind", "/", "/",
    "--ro-bind", view, target,
    "--bind", root, root,
    "--ro-bind", hooks, hooks,
    "--unshare-pid", "--proc", "/proc", "--die-with-parent",
    "--chdir", path.join(root, "todo-spa"),
    "--",
  ]);
});

test("each workspace HOME denies agy's web tools through a PreToolUse hook, beside the arm's own hooks", { skip: process.platform === "win32" ? "the hook runs through sh" : false }, async () => {
  const dir = tempDir();
  const root = workspace(dir);
  const home = template(dir);
  const own = { ospec: { PreToolUse: [{ matcher: "run_command", hooks: [{ command: "./own.sh" }] }] } };
  fs.writeFileSync(path.join(home, ".gemini", "config", "hooks.json"), JSON.stringify(own));
  const host = createAgyHost({ executable: process.execPath, prefixArgs: [fakeAgy(dir)], template: home, model: "m", personaModel: "p", personaDir: dir });
  await host.turn({ cwd: root, prompt: "hola", sessionId: null, transcriptPath: path.join(dir, "t.json") });
  const hooks = JSON.parse(fs.readFileSync(path.join(root, ".git", "agy-home", ".gemini", "config", "hooks.json"), "utf8"));
  assert.deepEqual(hooks.ospec, own.ospec, "the arm's own hooks stay as they were");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, ".gemini", "config", "hooks.json"), "utf8")), own, "the template is untouched");
  const offline = Object.values(hooks).flatMap((hook) => hook.PreToolUse || []).filter((group) => group.matcher !== "run_command");
  assert.equal(offline.length, 1);
  const matcher = new RegExp(`^(?:${offline[0].matcher})$`);
  for (const tool of ["search_web", "read_url_content", "open_browser_url", "browser_subagent"]) assert.match(tool, matcher);
  for (const tool of ["run_command", "view_file", "write_to_file", "grep_search"]) assert.doesNotMatch(tool, matcher);
  const run = spawnSync("sh", ["-c", offline[0].hooks[0].command], { input: JSON.stringify({ toolCall: { name: "search_web", args: { query: "x" } } }), encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).decision, "deny");
});

const bwrap = ["/usr/bin/bwrap", "/bin/bwrap"].find((file) => fs.existsSync(file));

test("in the sandbox the template shows none of agy's runtime state, and the agent cannot edit its web block", { skip: process.platform !== "linux" || !bwrap ? "needs bubblewrap" : false }, async () => {
  const dir = tempDir();
  const root = path.join(dir, "k3x9qa", "todo-spa");
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  const home = template(dir);
  const log = path.join(home, ".gemini", "antigravity-cli", "log", "cli-1.log");
  fs.mkdirSync(path.dirname(log));
  fs.writeFileSync(log, "workspaceDirs=[/home/u/dev/ospec-workflow]");
  fs.mkdirSync(path.join(home, "bin"));
  fs.writeFileSync(path.join(home, "bin", "engram"), "");
  const tools = path.join(dir, "tools");
  fs.mkdirSync(tools);
  const script = path.join(tools, "probe-agy.js");
  const hooks = path.join(root, ".git", "agy-home", ".gemini", "config", "hooks.json");
  fs.writeFileSync(script, `
    const fs = require("node:fs");
    process.stdin.resume();
    process.stdin.on("end", () => {
      const seen = {
        log: fs.existsSync(${JSON.stringify(log)}),
        conversations: fs.existsSync(${JSON.stringify(path.join(home, ".gemini", "antigravity-cli", "conversations"))}),
        rules: fs.existsSync(${JSON.stringify(path.join(home, ".gemini", "config", "rules", "r.md"))}),
        engram: fs.existsSync(${JSON.stringify(path.join(home, "bin", "engram"))}),
        editsHooks: (() => { try { fs.writeFileSync(${JSON.stringify(hooks)}, "{}"); return true; } catch { return false; } })(),
      };
      process.stdout.write(JSON.stringify({ event: "result", result: { conversation_id: "c", status: "SUCCESS", response: JSON.stringify(seen), num_turns: 1, usage: {} } }) + "\\n");
    });
  `);
  const host = createAgyHost({
    executable: process.execPath,
    prefixArgs: [script],
    template: home,
    model: "m",
    personaModel: "p",
    personaDir: dir,
    forbidden: [dir],
    sandbox: { bwrap, hide: [os.tmpdir(), dir], expose: [path.dirname(path.dirname(process.execPath)), tools], bin: [path.dirname(process.execPath)], templateView: path.join(dir, "view") },
  });
  const turn = await host.turn({ cwd: root, prompt: "hola", sessionId: null, transcriptPath: path.join(os.tmpdir(), `bench-agy-view-${process.pid}.jsonl`) });
  assert.equal(turn.is_error, false, turn.error);
  assert.deepEqual(JSON.parse(turn.final_text), { log: false, conversations: false, rules: true, engram: true, editsHooks: false });
  assert.ok(fs.existsSync(log), "the template itself is untouched");
});

test("in the sandbox agy sees its run, its template and its tools, but no other process, run, or hidden file", { skip: process.platform !== "linux" || !bwrap ? "needs bubblewrap" : false }, async () => {
  const dir = tempDir();
  const root = path.join(dir, "k3x9qa", "todo-spa");
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  const other = path.join(dir, "w1b2c3", "todo-spa");
  fs.mkdirSync(other, { recursive: true });
  fs.writeFileSync(path.join(other, "index.html"), "otra entrega");
  const tools = path.join(dir, "tools");
  fs.mkdirSync(tools);
  const script = path.join(tools, "probe-agy.js");
  fs.writeFileSync(script, `
    const fs = require("node:fs");
    const { execSync } = require("node:child_process");
    process.stdin.resume();
    process.stdin.on("end", () => {
      const seen = {
        processes: fs.readdirSync("/proc").filter((entry) => /^\\d+$/.test(entry)).length,
        other: fs.existsSync(${JSON.stringify(path.join(other, "index.html"))}),
        siblings: fs.readdirSync(${JSON.stringify(dir)}).sort(),
        template: fs.existsSync(${JSON.stringify(path.join(dir, "template", ".gemini", "config", "rules", "r.md"))}),
        writes: (() => { fs.writeFileSync("delivery.txt", "x"); return true; })(),
        pwd: process.env.PWD,
      };
      process.stdout.write(JSON.stringify({ event: "result", result: { conversation_id: "c", status: "SUCCESS", response: JSON.stringify(seen), num_turns: 1, usage: {} } }) + "\\n");
    });
  `);
  const host = createAgyHost({
    executable: process.execPath,
    prefixArgs: [script],
    template: template(dir),
    model: "m",
    personaModel: "p",
    personaDir: dir,
    forbidden: [dir],
    sandbox: { bwrap, hide: [os.tmpdir(), dir], expose: [path.dirname(path.dirname(process.execPath)), tools], bin: [path.dirname(process.execPath)] },
  });
  const turn = await host.turn({ cwd: root, prompt: "hola", sessionId: null, transcriptPath: path.join(os.tmpdir(), `bench-agy-sandbox-${process.pid}.jsonl`) });
  assert.equal(turn.is_error, false, turn.error);
  const seen = JSON.parse(turn.final_text);
  assert.ok(seen.processes <= 3, `only the sandbox's own processes, saw ${seen.processes}`);
  assert.equal(seen.other, false, "another run's delivery is out of reach");
  assert.deepEqual(seen.siblings, ["k3x9qa", "template", "tools"]);
  assert.equal(seen.template, true);
  assert.equal(seen.pwd, root);
  assert.equal(fs.readFileSync(path.join(root, "delivery.txt"), "utf8"), "x", "the run's own directory stays writable");
});

test("a turn reports the escapes of its transcript, and the agent's PWD is its workspace", async () => {
  const dir = tempDir();
  const root = path.join(dir, "k3x9qa", "todo-spa");
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  const script = path.join(dir, "escaping-agy.js");
  fs.writeFileSync(script, `
    process.stdin.resume();
    process.stdin.on("end", () => {
      const step = (path) => JSON.stringify({ event: "step_update", step_update: { step_index: 1, state: "DONE", step_type: "tool", tool_name: "list_dir", tool_info: { name: "list_dir", parameters: { DirectoryPath: path } } } });
      process.stdout.write(step(process.env.PWD) + "\\n" + step(${JSON.stringify(path.join(dir, "other-run"))}) + "\\n");
      process.stdout.write(JSON.stringify({ event: "result", result: { conversation_id: "c", status: "SUCCESS", response: process.env.PWD, num_turns: 1, usage: {} } }) + "\\n");
    });
  `);
  const host = createAgyHost({ executable: process.execPath, prefixArgs: [script], template: template(dir), model: "m", personaModel: "p", personaDir: dir, forbidden: [dir], baseEnv: { ...process.env, PWD: "/home/u/repo", INIT_CWD: "/home/u/repo" } });
  const turn = await host.turn({ cwd: root, prompt: "hola", sessionId: null, transcriptPath: path.join(dir, "runs", "t.jsonl") });
  assert.equal(turn.final_text, root);
  assert.deepEqual(turn.escapes, [{ step: 1, tool: "list_dir", paths: [path.join(dir, "other-run")] }]);
});

test("copyHome keeps what an install wrote and leaves out agy's runtime state and the binaries", () => {
  const dir = tempDir();
  const source = template(dir);
  fs.mkdirSync(path.join(source, "bin"));
  fs.writeFileSync(path.join(source, "bin", "engram"), "");
  const dest = path.join(dir, "copy");
  copyHome(source, dest);
  assert.ok(fs.existsSync(path.join(dest, ".gemini", "config", "rules", "r.md")));
  assert.ok(fs.existsSync(path.join(dest, ".gemini", "antigravity-cli", "settings.json")));
  assert.ok(!fs.existsSync(path.join(dest, ".gemini", "antigravity-cli", "conversations")));
  assert.ok(!fs.existsSync(path.join(dest, "bin")));
});

test("each workspace runs in a fresh copy of the template under .git, and a resumed turn reports only its own usage", async () => {
  const dir = tempDir();
  const root = workspace(dir);
  const host = createAgyHost({
    executable: process.execPath,
    prefixArgs: [fakeAgy(dir)],
    template: template(dir),
    model: "gemini-3.8-flash-high",
    personaModel: "claude-sonnet-5-5-medium",
    personaDir: dir,
    baseEnv: { ...process.env, CLAUDECODE: "1" },
  });
  const first = await host.turn({ cwd: root, prompt: "hola", sessionId: null, transcriptPath: path.join(dir, "runs", "t1.json") });
  const seen = JSON.parse(first.final_text);
  assert.equal(seen.home, path.join(root, ".git", "agy-home"));
  assert.equal(seen.rules, true);
  assert.equal(seen.nested, null);
  assert.equal(seen.prompt, "hola");
  assert.equal(first.session_id, "c-1");
  assert.deepEqual(first.usage, { input: 100, output: 10, cache_read: 50, cache_creation: 0 });
  assert.ok(fs.existsSync(path.join(dir, "runs", "t1.json")));
  assert.ok(!fs.existsSync(path.join(root, ".git", "agy-home", ".gemini", "antigravity-cli", "conversations")));

  const second = await host.turn({ cwd: root, prompt: "sigue", sessionId: "c-1", transcriptPath: path.join(dir, "runs", "t2.json") });
  const resumed = JSON.parse(second.final_text);
  assert.equal(resumed.prompt, "sigue");
  assert.equal(resumed.args[resumed.args.indexOf("--conversation") + 1], "c-1");
  assert.deepEqual(second.usage, { input: 100, output: 10, cache_read: 50, cache_creation: 0 });
  assert.equal(host.name, "agy");
  assert.equal(host.version(), "1.3.3");
});

test("gentle-ai gets an empty Engram per workspace, stopped on release", async () => {
  const dir = tempDir();
  const root = workspace(dir);
  const started = [];
  let stopped = 0;
  const gentleAi = {
    homeEnv: (env, home) => ({ ...env, HOME: home, GENTLE_AI_HOME: path.join(home, ".gentle-ai") }),
    startEngram: async ({ workspaceRoot }) => {
      started.push(workspaceRoot);
      return { env: { ENGRAM_DATA_DIR: path.join(workspaceRoot, ".git", "bench-engram"), ENGRAM_PORT: "4242" }, stop: () => { stopped += 1; } };
    },
  };
  const host = createAgyHost({ executable: process.execPath, prefixArgs: [fakeAgy(dir)], template: template(dir), model: "m", personaModel: "p", personaDir: dir, gentleAi });
  const turn = await host.turn({ cwd: root, prompt: "hola", sessionId: null, transcriptPath: path.join(dir, "t.json") });
  await host.turn({ cwd: root, prompt: "sigue", sessionId: "c-1", transcriptPath: path.join(dir, "t2.json") });
  assert.equal(JSON.parse(turn.final_text).engramPort, "4242");
  assert.deepEqual(started, [root]);
  host.release(root);
  assert.equal(stopped, 1);
});

test("the persona answers through structured output from a fresh, rule-free HOME, with its instructions first", async () => {
  const dir = tempDir();
  const host = createAgyHost({ executable: process.execPath, prefixArgs: [fakeAgy(dir)], template: template(dir), model: "m", personaModel: "claude-sonnet-5-5-medium", personaDir: dir });
  fs.mkdirSync(path.join(dir, "home"), { recursive: true });
  fs.writeFileSync(path.join(dir, "home", "stale"), "x");
  const { reply, usage, error } = await host.persona({ scenario, goal: "terminado", message: "¿Qué longitud máxima?" });
  assert.equal(error, null);
  assert.equal(reply.kind, "question");
  assert.deepEqual(reply.facts_disclosed, ["F1"]);
  assert.deepEqual(reply.unknown_facts, ["F9"]);
  assert.deepEqual(usage, { input: 7, output: 1, cache_read: 2, cache_creation: 0 });
  const seen = JSON.parse(reply.answer);
  assert.equal(seen.home, path.join(dir, "home"));
  assert.ok(!fs.existsSync(path.join(dir, "home")), "the persona's conversation, which holds the facts, does not outlive the call");
  assert.equal(seen.args[seen.args.indexOf("--model") + 1], "claude-sonnet-5-5-medium");
  assert.equal(seen.args[seen.args.indexOf("--mode") + 1], "plan");
  assert.ok(seen.prompt.startsWith("Simulas a la persona"));
  assert.ok(seen.prompt.includes("¿Qué longitud máxima?"));
});

test("a cursor persona replaces the agy persona call", async () => {
  const dir = tempDir();
  const seen = [];
  const host = createAgyHost({
    executable: path.join(dir, "missing"),
    template: template(dir),
    model: "gemini-3.8-flash-high",
    personaModel: "grok-4.7-high",
    personaDir: dir,
    personaInvoke: async (input) => {
      seen.push(input.message);
      return {
        usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 },
        reply: { kind: "question", answer: "El título tiene como máximo 200 caracteres.", facts_disclosed: ["F1"], deviates_from_recommendation: false, unknown_facts: [] },
      };
    },
  });
  const { reply, error } = await host.persona({ scenario, goal: "terminado", message: "¿cuál es el límite?" });
  assert.equal(error, null);
  assert.deepEqual(seen, ["¿cuál es el límite?"]);
  assert.equal(reply.kind, "question");
  assert.deepEqual(reply.facts_disclosed, ["F1"]);
});

test("a persona that cannot answer falls back to asking the agent to continue", async () => {
  const dir = tempDir();
  const broken = path.join(dir, "broken.js");
  fs.writeFileSync(broken, "process.stdout.write('nope');");
  const host = createAgyHost({ executable: process.execPath, prefixArgs: [broken], template: template(dir), model: "m", personaModel: "p", personaDir: dir });
  const { reply, error } = await host.persona({ scenario, goal: "terminado", message: "hola" });
  assert.equal(reply.kind, "stopped");
  assert.ok(error);
});

test("buildOspecHome installs ospec for antigravity without SDD and identifies it by content", () => {
  const dir = tempDir();
  const home = path.join(dir, "home");
  const first = buildOspecHome({ repoRoot: REPO_ROOT, home });
  const version = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")).version;
  assert.equal(first.version, version);
  assert.ok(fs.existsSync(path.join(home, ".gemini", "config", "rules", "ospec-router.instructions.md")));
  assert.ok(fs.existsSync(path.join(home, ".gemini", "config", "skills", "idd", "SKILL.md")));
  assert.ok(!fs.existsSync(path.join(home, ".gemini", "config", "skills", "sdd-orchestrator")));
  // OSP-026 (#341): the digest identifies what a run reads, not where the
  // template HOME lives: another HOME of the same checkout gives the same digest.
  const again = buildOspecHome({ repoRoot: REPO_ROOT, home: path.join(dir, "elsewhere", "home") });
  assert.equal(again.digest, first.digest);
});

// OSP-025 (#340): the ospec template gets Engram the way `engram setup
// antigravity-cli` installs it, and the digest covers it from any HOME. The
// ospec install is faked too: the real one rebuilds dist/antigravity, which
// other suites digest while they run.
function withFakeEngramSetup(bin, args, options) {
  if (path.basename(bin) !== "engram") {
    const configDir = args[args.indexOf("--dest") + 1];
    const home = path.dirname(path.dirname(configDir));
    fs.mkdirSync(path.join(configDir, "scripts", "hooks"), { recursive: true });
    fs.writeFileSync(path.join(configDir, ".ospec-workflow-install.json"), JSON.stringify({ version: "2.142.2", installed_at: String(Math.random()) }));
    fs.writeFileSync(path.join(configDir, "hooks.json"), JSON.stringify({ command: `node "${path.join(home, ".gemini", "config", "scripts", "hook.js")}"` }));
    fs.writeFileSync(path.join(configDir, "scripts", "hooks", "ospec-hooks"), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, Math.floor(Math.random() * 255)]));
    return { status: 0, stdout: "" };
  }
  if (args[0] === "version") return { status: 0, stdout: "engram 3.4.0\n" };
  const gemini = path.join(options.env.HOME, ".gemini");
  fs.writeFileSync(path.join(gemini, "config", "mcp_config.json"), JSON.stringify({ mcpServers: { engram: { command: bin, args: ["mcp", "--tools=agent"] } } }));
  fs.writeFileSync(path.join(gemini, "GEMINI.md"), "<!-- engram -->\nEngram Memory Protocol\n");
  return { status: 0, stdout: "" };
}

test("buildOspecHome with engram sets it up in the template, names its version, and digests it from any HOME", () => {
  const dir = tempDir();
  const engram = path.join(dir, "engram-src");
  fs.writeFileSync(engram, "binary");
  const first = buildOspecHome({ repoRoot: REPO_ROOT, home: path.join(dir, "a"), engram, spawnSyncImpl: withFakeEngramSetup });
  assert.equal(first.version, "2.142.2 (engram 3.4.0)");
  assert.equal(fs.readFileSync(path.join(dir, "a", "bin", "engram"), "utf8"), "binary");
  assert.match(fs.readFileSync(path.join(dir, "a", ".gemini", "config", "mcp_config.json"), "utf8"), /a[\\/]+bin[\\/]+engram/);
  const second = buildOspecHome({ repoRoot: REPO_ROOT, home: path.join(dir, "elsewhere", "b"), engram, spawnSyncImpl: withFakeEngramSetup });
  assert.equal(second.digest, first.digest, "the HOME reads as ~ and the hook binary stays out");
  const bare = buildOspecHome({ repoRoot: REPO_ROOT, home: path.join(dir, "c"), spawnSyncImpl: withFakeEngramSetup });
  assert.notEqual(bare.digest, first.digest, "Engram's MCP server and protocol are part of the digest");
  assert.equal(bare.version, "2.142.2");
});

test("an ospec template with engram gets an empty Engram per workspace, with its engram first on the PATH", async () => {
  const dir = tempDir();
  const root = workspace(dir);
  const home = template(dir);
  const started = [];
  let stopped = 0;
  const engram = {
    startEngram: async ({ home: at, workspaceRoot }) => {
      started.push({ at, workspaceRoot });
      return { env: { ENGRAM_DATA_DIR: path.join(workspaceRoot, ".git", "bench-engram"), ENGRAM_PORT: "4343" }, stop: () => { stopped += 1; } };
    },
  };
  const host = createAgyHost({ executable: process.execPath, prefixArgs: [fakeAgy(dir)], template: home, model: "m", personaModel: "p", personaDir: dir, engram });
  const turn = await host.turn({ cwd: root, prompt: "hola", sessionId: null, transcriptPath: path.join(dir, "t.json") });
  const seen = JSON.parse(turn.final_text);
  assert.equal(seen.engramPort, "4343");
  assert.equal(seen.pathHead, path.join(home, "bin"));
  assert.equal(seen.home, path.join(root, ".git", "agy-home"), "the agent keeps its own HOME, not gentle-ai's");
  assert.deepEqual(started, [{ at: home, workspaceRoot: root }]);
  host.release(root);
  assert.equal(stopped, 1);
});

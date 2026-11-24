"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { validate, validateInstalled } = require("./validate-antigravity.js");

function createFakeTree(files = {}) {
  const fileMap = new Map();
  const dirSet = new Set();

  for (const [rel, content] of Object.entries(files)) {
    const full = path.resolve("/dist", rel);
    fileMap.set(full, content);
    let p = path.dirname(full);
    while (p && p !== path.dirname(p)) {
      dirSet.add(p);
      p = path.dirname(p);
    }
  }

  return {
    existsSync(p) {
      const full = path.resolve(p);
      return fileMap.has(full) || dirSet.has(full);
    },
    readFileSync(p) {
      const full = path.resolve(p);
      if (!fileMap.has(full)) throw new Error(`ENOENT: ${p}`);
      return fileMap.get(full);
    },
    statSync(p) {
      const full = path.resolve(p);
      if (fileMap.has(full)) return { isFile: () => true, isDirectory: () => false };
      if (dirSet.has(full)) return { isFile: () => false, isDirectory: () => true };
      throw new Error(`ENOENT: ${p}`);
    },
    readdirSync(p, options) {
      const full = path.resolve(p);
      const entries = [];
      const childNames = new Set();
      for (const f of fileMap.keys()) {
        if (f.startsWith(full + path.sep)) {
          const seg = f.slice((full + path.sep).length).split(path.sep)[0];
          if (!childNames.has(seg)) {
            childNames.add(seg);
            const isDir = dirSet.has(path.join(full, seg));
            entries.push(
              options?.withFileTypes
                ? { name: seg, isFile: () => !isDir, isDirectory: () => isDir }
                : seg,
            );
          }
        }
      }
      return entries;
    },
  };
}

const WRAPPER = 'node "./scripts/hooks/ospec-antigravity-hook.js"';
const MANIFEST_JSON = JSON.stringify({ name: "ospec-workflow", version: "2.186.0", description: "Workflow.", logo: "assets/logo.svg" });

test("validate-antigravity passes for a valid generated tree", () => {
  const fakeFs = createFakeTree({
    ".antigravity-plugin/plugin.json": MANIFEST_JSON,
    "assets/logo.svg": "<svg/>",
    "agents/sdd-apply.agent.md": "---\nname: sdd-apply\ndescription: Apply.\ntools: ['read_file', 'write_file', 'edit_file', 'run_command']\n---\nbody",
    "agents/review-trust.agent.md": "---\nname: review-trust\ndescription: Trust.\ntools: ['read_file']\nmainAgent: false\nsubagent: true\nmodel: pro\ncommandExecutionPolicy: off\ninheritMcp: false\n---\nbody",
    "rules/agent-rules.instructions.md": "---\ntrigger: always_on\n---\n# Rules",
    "rules/sdd-openspec.instructions.md": "---\ntrigger: glob\nglobs: \"**/openspec/**\"\n---\n# OpenSpec",
    "skills/accessibility/SKILL.md": "---\nname: accessibility\n---\nbody",
    "scripts/hooks/ospec-hooks-launch.js": "console.log('hook')",
    "hooks.json": JSON.stringify({
      "ospec-session-start": { enabled: true, SessionStart: [{ type: "command", command: `${WRAPPER} session-start` }] },
      "ospec-pre-tool-use": { enabled: true, PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: `${WRAPPER} pre-tool-use` }] }] },
      "ospec-stop": { enabled: true, Stop: [{ type: "command", command: `${WRAPPER} stop` }] },
    }),
  });

  const res = validate(path.resolve("/dist"), { fs: fakeFs });
  assert.deepEqual(res.errors, []);
});

// agy 1.4.2 discards the whole hooks.json when one handler lacks `command`:
// a matcher group under a flat event is read as a handler without one.
test("validate-antigravity flags hook shapes agy rejects", () => {
  const fakeFs = createFakeTree({
    "hooks.json": JSON.stringify({
      "ospec-session-start": { SessionStart: [{ matcher: ".*", hooks: [{ type: "command", command: "x" }] }] },
      "ospec-pre-tool-use": { PreToolUse: [{ type: "command", command: "x" }] },
      "ospec-stop": { Stop: [{ type: "command", command: `${WRAPPER} stop` }] },
    }),
  });

  const errors = validate(path.resolve("/dist"), { fs: fakeFs }).errors.filter((e) => e.startsWith("hooks.json"));
  assert.deepEqual(errors, [
    "hooks.json ospec-session-start.SessionStart must run ./scripts/hooks/ospec-antigravity-hook.js",
    "hooks.json ospec-session-start.SessionStart[0] must be a handler with a string command",
    "hooks.json ospec-pre-tool-use.PreToolUse[0] must be a matcher group with hooks",
  ]);
});

test("validate-antigravity flags missing required directories and forbidden paths", () => {
  const fakeFs = createFakeTree({
    ".claude-plugin/plugin.json": "{}",
  });

  const res = validate(path.resolve("/dist"), { fs: fakeFs });
  assert.ok(res.errors.some((e) => e.includes("missing required path")));
  assert.ok(res.errors.some((e) => e.includes("forbidden target residue")));
});

// E1.51: only the wrapper makes the launcher answer in agy's shape.
test("validate-antigravity flags a Stop or SessionStart that skips the agy wrapper or uses ${PLUGIN_ROOT}", () => {
  const launcher = 'node "./scripts/hooks/ospec-hooks-launch.js"';
  const fakeFs = createFakeTree({
    "hooks.json": JSON.stringify({
      "ospec-session-start": { SessionStart: [{ type: "command", command: 'node "${PLUGIN_ROOT}/scripts/hooks/ospec-antigravity-hook.js" session-start' }] },
      "ospec-pre-tool-use": { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: `${WRAPPER} pre-tool-use` }] }] },
      "ospec-stop": { Stop: [{ type: "command", command: `${launcher} stop` }] },
    }),
  });
  const errors = validate(path.resolve("/dist"), { fs: fakeFs }).errors.filter((e) => e.startsWith("hooks.json"));
  assert.deepEqual(errors, [
    "hooks.json ospec-stop.Stop must run ./scripts/hooks/ospec-antigravity-hook.js",
    "hooks.json ospec-session-start.SessionStart must run ./scripts/hooks/ospec-antigravity-hook.js",
    "hooks.json must use relative ./scripts/hooks/... instead of ${PLUGIN_ROOT}",
  ]);
});

test("validate-antigravity rejects bad agent tools, invalid model, broken review isolation, relative globs, dead paths, bad manifest and ${input:}", () => {
  const fakeFs = createFakeTree({
    ".antigravity-plugin/plugin.json": JSON.stringify({ name: "ospec-workflow", version: "", description: "x", agents: "agents/", logo: "assets/missing.svg" }),
    "agents/review-trust.agent.md": "---\nname: review-trust\ntools: ['grep_search']\nmodel: gemini-4-neon-high\n---\n${input:x}",
    "rules/bad.instructions.md": "---\ntrigger: glob\nglobs: \"openspec/**\"\n---\nbody",
    "commands/dead.prompt.md": "dead",
    ".mcp.json": "{}",
    "skills/idd/SKILL.md": "---\nname: idd\n---\nbody",
    "scripts/hooks/ospec-hooks-launch.js": "",
    "hooks.json": JSON.stringify({
      "ospec-session-start": { SessionStart: [{ type: "command", command: `${WRAPPER} session-start` }] },
      "ospec-pre-tool-use": { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: `${WRAPPER} pre-tool-use` }] }] },
      "ospec-stop": { Stop: [{ type: "command", command: `${WRAPPER} stop` }] },
    }),
  });
  const joined = validate(path.resolve("/dist"), { fs: fakeFs }).errors.join("\n");
  for (const re of [/missing required string field: version/, /unsupported manifest key: agents/, /logo asset missing/, /forbidden target residue.*commands/, /forbidden target residue.*\.mcp\.json/, /description/, /unsupported Antigravity tool: grep_search/, /invalid Antigravity model tier/, /mainAgent: false/, /inheritMcp: false/, /commandExecutionPolicy: off/, /tools: \['read_file'\]/, /prefixed with \*\*\//, /\$\{input:/]) {
    assert.match(joined, re);
  }
});

test("validateInstalled rejects unrendered placeholders and ignores user-owned files outside manifest.files", () => {
  const base = {
    ".antigravity-plugin/plugin.json": MANIFEST_JSON,
    "assets/logo.svg": "<svg/>",
    "agents/sdd-apply.agent.md": "---\nname: sdd-apply\ndescription: Apply.\ntools: ['read_file']\n---\nbody",
    "agents/user-custom.md": "---\nname: mine\n---\nno description or tools",
    "rules/ospec-router.instructions.md": "---\ntrigger: always_on\n---\nbody",
    "skills/idd/SKILL.md": "---\nname: idd\n---\nrun /home/u/.gemini/config/plugins/ospec-workflow/bin/ospec",
    "scripts/hooks/ospec-antigravity-hook.js": "",
    "hooks.json": JSON.stringify({
      "ospec-session-start": { SessionStart: [{ type: "command", command: `${WRAPPER} session-start` }] },
      "ospec-pre-tool-use": { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: `${WRAPPER} pre-tool-use` }] }] },
      "ospec-stop": { Stop: [{ type: "command", command: `${WRAPPER} stop` }] },
    }),
    ".ospec-workflow-install.json": JSON.stringify({ target: "antigravity", files: [".antigravity-plugin/plugin.json", "assets/logo.svg", "agents/sdd-apply.agent.md", "rules/ospec-router.instructions.md", "skills/idd/SKILL.md", "hooks.json"] }),
  };
  assert.deepEqual(validateInstalled(path.resolve("/dist"), { fs: createFakeTree(base) }).errors, []);
  const bad = validateInstalled(path.resolve("/dist"), { fs: createFakeTree({ ...base, "skills/idd/SKILL.md": "---\nname: idd\n---\n__OSPEC_RUNTIME_DIR__" }) }).errors;
  assert.ok(bad.some((e) => e.includes("unrendered placeholder: __OSPEC_RUNTIME_DIR__")));
});

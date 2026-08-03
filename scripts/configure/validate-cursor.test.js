"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { hostBinarySuffix } = require("./install-target.js");
const { validate, validateInstalled } = require("./validate-cursor.js");

function tmpRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-cursor-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

function cleanTree(root) {
  write(
    root,
    "agents/sdd-apply.md",
    "---\nname: sdd-apply\ndescription: Apply phase\nmodel: composer-2.5[fast=false]\n---\n\nUse `Write` and `Grep`.\n",
  );
  write(
    root,
    "agents/review-change.md",
    "---\nname: review-change\ndescription: Review\nmodel: composer-2.5[fast=false]\nreadonly: true\n---\n\nRead-only review.\n",
  );
  write(
    root,
    "commands/sdd-apply.md",
    "---\nname: sdd-apply\ndescription: Run apply\nagent: sdd-orchestrator\n---\n\nRun apply for ${input:changeName}.\n",
  );
  write(
    root,
    "rules/sdd-common.mdc",
    '---\ndescription: "Shared protocol"\nglobs: ["*"]\nalwaysApply: true\n---\n\nbody\n',
  );
  write(
    root,
    "rules/agents-protocol.mdc",
    '---\ndescription: "Post-archive release flow and bounded review lifecycle rules."\nglobs: ["*"]\nalwaysApply: true\n---\n\nprotocol\n',
  );
  write(root, "skills/sdd-apply/SKILL.md", "---\nname: sdd-apply\n---\n\nskill\n");
  write(root, "scripts/hooks/ospec-hooks-launch.js", "module.exports = {};\n");
  write(
    root,
    "hooks.json",
    JSON.stringify(
      {
        version: 1,
        hooks: {
          beforeSubmitPrompt: [
            { command: "node __OSPEC_CURSOR_ROOT__/scripts/hooks/ospec-hooks-launch.js session-start" },
          ],
          beforeShellExecution: [
            { command: "node __OSPEC_CURSOR_ROOT__/scripts/hooks/ospec-hooks-launch.js pre-tool-use" },
          ],
          stop: [{ command: "node __OSPEC_CURSOR_ROOT__/scripts/hooks/ospec-hooks-launch.js stop" }],
        },
      },
      null,
      2,
    ),
  );
}

function installedTree(root) {
  cleanTree(root);
  const cursorRootPosix = path.resolve(root).split(path.sep).join("/");
  write(
    root,
    "hooks.json",
    JSON.stringify({
      version: 1,
      hooks: {
        stop: [
          {
            command: `node "${cursorRootPosix}/scripts/hooks/ospec-hooks-launch.js" stop`,
          },
        ],
      },
    }),
  );
  const { ext } = hostBinarySuffix();
  const binary = path.join(root, "scripts", "hooks", `ospec-hooks${ext}`);
  fs.writeFileSync(binary, "binary-fixture");
  if (process.platform !== "win32") fs.chmodSync(binary, 0o755);
  return { cursorRootPosix, binary };
}

test("validate-cursor accepts a clean tree with zero errors", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  const result = validate(root);
  assert.deepEqual(result.errors, []);
});

test("validate-cursor reports missing required structure paths", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  fs.rmSync(path.join(root, "agents"), { recursive: true, force: true });
  const result = validate(root);
  assert.ok(result.errors.some((e) => e.includes("missing required path: agents")));
});

test("validate-cursor requires agent frontmatter name/description/model and review readonly", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  write(root, "agents/sdd-apply.md", "---\nname: sdd-apply\n---\n\nbody\n");
  write(root, "agents/review-change.md", "---\nname: review-change\ndescription: d\nmodel: x\n---\n\nbody\n");
  const result = validate(root);
  assert.ok(result.errors.some((e) => e.includes("agents/sdd-apply.md") && e.includes("description")));
  assert.ok(result.errors.some((e) => e.includes("agents/sdd-apply.md") && e.includes("model")));
  assert.ok(result.errors.some((e) => e.includes("agents/review-change.md") && e.includes("readonly")));
});

test("validate-cursor requires mdc frontmatter and agents-protocol.mdc", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  write(root, "rules/sdd-common.mdc", "---\ndescription: only\n---\n\nbody\n");
  fs.rmSync(path.join(root, "rules/agents-protocol.mdc"), { force: true });
  const result = validate(root);
  assert.ok(result.errors.some((e) => e.includes("rules/sdd-common.mdc") && (e.includes("globs") || e.includes("alwaysApply"))));
  assert.ok(result.errors.some((e) => e.includes("agents-protocol.mdc")));
});

test("validate-cursor rejects bad hooks shape, SubagentStop, and missing placeholder", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  write(
    root,
    "hooks.json",
    JSON.stringify({
      version: 2,
      hooks: {
        SubagentStop: [{ command: "node x.js" }],
        beforeSubmitPrompt: [{ command: "node /tmp/x.js session-start" }],
      },
    }),
  );
  const result = validate(root);
  assert.ok(result.errors.some((e) => e.includes("version")));
  assert.ok(result.errors.some((e) => /SubagentStop/i.test(e)));
  assert.ok(result.errors.some((e) => e.includes("__OSPEC_CURSOR_ROOT__")));
});

test("validate-cursor fails on agent vscode/AskUserQuestion/abstract residue", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  write(
    root,
    "agents/sdd-apply.md",
    "---\nname: sdd-apply\ndescription: d\nmodel: x\n---\n\nAsk via vscode/askQuestions or AskUserQuestion. Use `edit`.\n",
  );
  const result = validate(root);
  assert.ok(result.errors.some((e) => /vscode\//i.test(e)));
  assert.ok(result.errors.some((e) => e.includes("AskUserQuestion")));
  assert.ok(result.errors.some((e) => e.includes("`edit`") || e.includes("abstract tool")));
});

test("validate-cursor does NOT fail solely because commands retain ${input:} or agent:", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  write(
    root,
    "commands/sdd-apply.md",
    "---\nname: sdd-apply\ndescription: d\nagent: sdd-orchestrator\n---\n\nRun for ${input:changeName} and ${input}.\n",
  );
  const result = validate(root);
  assert.deepEqual(result.errors, [], `unexpected errors: ${result.errors.join("; ")}`);
});

test("validate-cursor triangulation: stray vscode/ in agent body fails; commands with input do not", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  write(
    root,
    "agents/sdd-propose.md",
    "---\nname: sdd-propose\ndescription: d\nmodel: x\n---\n\nCall vscode/askQuestions.\n",
  );
  write(
    root,
    "commands/sdd-propose.md",
    "---\nname: sdd-propose\nagent: sdd-orchestrator\n---\n\n${input:name}\n",
  );
  const result = validate(root);
  assert.ok(result.errors.some((e) => e.includes("agents/sdd-propose.md")));
  assert.ok(!result.errors.some((e) => e.includes("commands/sdd-propose.md")));
});

test("validate-cursor triangulation: unmapped abstract tool token in agent fails", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  write(
    root,
    "agents/sdd-apply.md",
    "---\nname: sdd-apply\ndescription: d\nmodel: x\n---\n\nPrefer `search` over Glob.\n",
  );
  const result = validate(root);
  assert.ok(result.errors.some((e) => e.includes("agents/sdd-apply.md") && (e.includes("`search`") || e.includes("abstract"))));
});

test("validateInstalled accepts expanded hooks and a regular host binary", (t) => {
  const root = tmpRoot(t);
  installedTree(root);
  assert.deepEqual(validateInstalled(root).errors, []);
});

test("validateInstalled rejects an unresolved Cursor root placeholder", (t) => {
  const root = tmpRoot(t);
  installedTree(root);
  write(
    root,
    "hooks.json",
    JSON.stringify({
      version: 1,
      hooks: { stop: [{ command: "node __OSPEC_CURSOR_ROOT__/scripts/hooks/ospec-hooks-launch.js stop" }] },
    }),
  );
  assert.ok(validateInstalled(root).errors.some((error) => /unresolved|placeholder/i.test(error)));
});

test("validateInstalled rejects a hook command rooted outside the installed Cursor home", (t) => {
  const root = tmpRoot(t);
  installedTree(root);
  const outside = path.resolve(root, "..", "outside", "scripts", "hooks", "ospec-hooks-launch.js")
    .split(path.sep)
    .join("/");
  write(
    root,
    "hooks.json",
    JSON.stringify({ version: 1, hooks: { stop: [{ command: `node "${outside}" stop` }] } }),
  );
  assert.ok(validateInstalled(root).errors.some((error) => /outside|installed Cursor root/i.test(error)));
});

test("validateInstalled rejects a missing or non-regular host binary", (t) => {
  const missingRoot = tmpRoot(t);
  const { binary } = installedTree(missingRoot);
  fs.rmSync(binary);
  assert.ok(validateInstalled(missingRoot).errors.some((error) => /binary.*missing|required binary/i.test(error)));

  const directoryRoot = tmpRoot(t);
  const installed = installedTree(directoryRoot);
  fs.rmSync(installed.binary);
  fs.mkdirSync(installed.binary);
  assert.ok(validateInstalled(directoryRoot).errors.some((error) => /binary.*regular file|not a file/i.test(error)));
});

test(
  "validateInstalled rejects a non-executable host binary on POSIX",
  (t) => {
    const root = tmpRoot(t);
    const { binary } = installedTree(root);
    fs.chmodSync(binary, 0o644);
    assert.ok(validateInstalled(root, { platform: "linux" }).errors.some((error) => /executable/i.test(error)));
  },
);

test("validateInstalled fails closed for missing roots and unreadable installed artifacts", (t) => {
  const missing = path.join(tmpRoot(t), "missing");
  assert.ok(validateInstalled(missing).errors.some((error) => /not a directory/i.test(error)));

  const fileRoot = path.join(tmpRoot(t), "cursor-file");
  fs.writeFileSync(fileRoot, "not-a-directory");
  assert.ok(validateInstalled(fileRoot).errors.some((error) => /not a directory/i.test(error)));

  const inaccessibleRoot = tmpRoot(t);
  const rootFs = new Proxy(fs, {
    get(target, property) {
      if (property === "statSync") return () => { throw new Error("root stat denied"); };
      const value = target[property];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  assert.ok(validateInstalled(inaccessibleRoot, { fs: rootFs }).errors.some((error) => /root stat denied/i.test(error)));

  const hooksRoot = tmpRoot(t);
  installedTree(hooksRoot);
  const hooksPath = path.join(hooksRoot, "hooks.json");
  const hooksFs = new Proxy(fs, {
    get(target, property) {
      if (property === "readFileSync") {
        return (candidate, ...args) => {
          if (path.resolve(candidate) === path.resolve(hooksPath)) throw new Error("hooks read denied");
          return target.readFileSync(candidate, ...args);
        };
      }
      const value = target[property];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  assert.ok(validateInstalled(hooksRoot, { fs: hooksFs }).errors.some((error) => /hooks read denied/i.test(error)));

  const binaryRoot = tmpRoot(t);
  const { binary } = installedTree(binaryRoot);
  const binaryFs = new Proxy(fs, {
    get(target, property) {
      if (property === "lstatSync") {
        return (candidate, ...args) => {
          if (path.resolve(candidate) === path.resolve(binary)) throw new Error("binary stat denied");
          return target.lstatSync(candidate, ...args);
        };
      }
      const value = target[property];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  assert.ok(validateInstalled(binaryRoot, { fs: binaryFs }).errors.some((error) => /binary stat denied/i.test(error)));
});

test("validateInstalled reports malformed hook JSON and invalid hook shapes", (t) => {
  const malformedRoot = tmpRoot(t);
  installedTree(malformedRoot);
  write(malformedRoot, "hooks.json", "{");
  assert.ok(validateInstalled(malformedRoot).errors.some((error) => /valid JSON/i.test(error)));

  const invalidRoot = tmpRoot(t);
  installedTree(invalidRoot);
  write(
    invalidRoot,
    "hooks.json",
    JSON.stringify({
      version: 2,
      hooks: {
        SubagentStop: [{ command: 42 }],
        futureEvent: "not-an-array",
        stop: [null, { command: "node ./relative.js stop" }],
      },
    }),
  );
  const errors = validateInstalled(invalidRoot).errors.join("\n");
  assert.match(errors, /version: 1/);
  assert.match(errors, /SubagentStop/);
  assert.match(errors, /unmapped event: futureEvent/);
  assert.match(errors, /must map to an array/);
  assert.match(errors, /must be an action object/);
  assert.match(errors, /command must be a string/);
  assert.match(errors, /outside the installed Cursor root/);

  write(invalidRoot, "hooks.json", JSON.stringify({ version: 1, hooks: [] }));
  assert.ok(validateInstalled(invalidRoot).errors.some((error) => /hooks object/i.test(error)));
});

function failingFs(method, predicate, message) {
  return new Proxy(fs, {
    get(target, property) {
      if (property === method) {
        return (...args) => {
          if (predicate(...args)) throw new Error(message);
          return target[property](...args);
        };
      }
      const value = target[property];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

test("validate generated converts root stat, walk, read, and hook races into errors", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);

  const rootStatFs = failingFs(
    "statSync",
    (candidate) => path.resolve(candidate) === path.resolve(root),
    "generated root stat denied",
  );
  assert.doesNotThrow(() => validate(root, { fs: rootStatFs }));
  assert.ok(validate(root, { fs: rootStatFs }).errors.some((error) => /root stat denied/i.test(error)));

  const agentsDir = path.join(root, "agents");
  const walkFs = failingFs(
    "readdirSync",
    (candidate) => path.resolve(candidate) === path.resolve(agentsDir),
    "agents walk denied",
  );
  assert.ok(validate(root, { fs: walkFs }).errors.some((error) => /agents walk denied/i.test(error)));

  const agentFile = path.join(root, "agents", "sdd-apply.md");
  const readFs = failingFs(
    "readFileSync",
    (candidate) => path.resolve(candidate) === path.resolve(agentFile),
    "agent read denied",
  );
  assert.ok(validate(root, { fs: readFs }).errors.some((error) => /agent read denied/i.test(error)));

  const hooksPath = path.join(root, "hooks.json");
  const hooksRaceFs = failingFs(
    "statSync",
    (candidate) => path.resolve(candidate) === path.resolve(hooksPath),
    "hooks stat race",
  );
  assert.ok(validate(root, { fs: hooksRaceFs }).errors.some((error) => /hooks stat race/i.test(error)));
});

test("validateInstalled converts common-tree walk failures into errors", (t) => {
  const root = tmpRoot(t);
  installedTree(root);
  const rulesDir = path.join(root, "rules");
  const ioFs = failingFs(
    "readdirSync",
    (candidate) => path.resolve(candidate) === path.resolve(rulesDir),
    "installed rules walk denied",
  );
  assert.doesNotThrow(() => validateInstalled(root, { fs: ioFs }));
  assert.ok(validateInstalled(root, { fs: ioFs }).errors.some((error) => /rules walk denied/i.test(error)));

  const hooksPath = path.join(root, "hooks.json");
  const hookRaceFs = failingFs(
    "statSync",
    (candidate) => path.resolve(candidate) === path.resolve(hooksPath),
    "installed hooks stat race",
  );
  assert.doesNotThrow(() => validateInstalled(root, { fs: hookRaceFs }));
  assert.ok(validateInstalled(root, { fs: hookRaceFs }).errors.some((error) => /hooks stat race/i.test(error)));
});

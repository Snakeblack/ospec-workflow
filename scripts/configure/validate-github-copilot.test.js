"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure } = require("./cli.js");
const { validate } = require("./validate-github-copilot.js");

const SOURCE = path.join(__dirname, "__fixtures__", "source");

function tmpOut(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-github-copilot-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("validate accepts generated github-copilot output", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });

  const result = validate(out);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("validate rejects prompt target residue and forbidden paths", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  fs.mkdirSync(path.join(out, ".claude-plugin"));
  const promptPath = path.join(out, ".github/prompts/sdd-apply.prompt.md");
  const prompt = fs.readFileSync(promptPath, "utf8");
  fs.writeFileSync(promptPath, prompt.replace("---\n\n", "target: github-copilot\n---\n\n"));

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("forbidden path present: .claude-plugin")));
  assert.ok(result.errors.some((error) => error.includes("must not include target frontmatter")));
});

test("validate requires the skills tree so agent skill references resolve", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  // A clean generated tree ships skills/ — removing it must fail the gate.
  assert.equal(validate(out).errors.length, 0);
  fs.rmSync(path.join(out, "skills"), { recursive: true, force: true });

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("missing required path: skills")));
});

test("validate rejects malformed Copilot hooks", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  fs.writeFileSync(
    path.join(out, ".github/hooks/hooks.json"),
    JSON.stringify({ version: 1, hooks: { sessionStart: [{ type: "command" }] } }, null, 2),
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("must include bash or powershell")));
});

test("validate reports required path type mismatches without throwing", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  fs.rmSync(path.join(out, ".github/agents"), { recursive: true, force: true });
  fs.writeFileSync(path.join(out, ".github/agents"), "not a directory\n");
  fs.rmSync(path.join(out, ".mcp.json"), { force: true });
  fs.mkdirSync(path.join(out, ".mcp.json"));

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("required directory is not a directory: .github/agents")));
  assert.ok(result.errors.some((error) => error.includes("required file is not a file: .mcp.json")));
});

test("validate rejects an agent that references a skill the tree does not ship", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  fs.writeFileSync(
    path.join(out, ".github/agents/ghost.agent.md"),
    "---\nname: ghost\ntarget: github-copilot\n---\n\nRead `skills/ghost/SKILL.md` before work.\n",
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("references missing skill: skills/ghost/SKILL.md")));
});

test("validate rejects a hook that invokes a missing script", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  fs.writeFileSync(
    path.join(out, ".github/hooks/hooks.json"),
    JSON.stringify(
      { version: 1, hooks: { sessionStart: [{ type: "command", bash: 'node "scripts/hooks/ghost.js"' }] } },
      null,
      2,
    ),
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("references missing script: scripts/hooks/ghost.js")));
});

test("validate rejects a malformed .mcp.json (missing servers and missing transport)", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });

  fs.writeFileSync(path.join(out, ".mcp.json"), JSON.stringify({}, null, 2));
  assert.ok(validate(out).errors.some((error) => error.includes("must have an mcpServers object")));

  fs.writeFileSync(path.join(out, ".mcp.json"), JSON.stringify({ mcpServers: { bad: { type: "stdio" } } }, null, 2));
  assert.ok(validate(out).errors.some((error) => error.includes("server bad must define a command")));
});

test("validate rejects residual ${input: placeholder in .mcp.json", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  // Poison the generated .mcp.json with an unresolved input placeholder.
  fs.writeFileSync(
    path.join(out, ".mcp.json"),
    JSON.stringify(
      { mcpServers: { svc: { command: "npx", env: { RESIDUAL_KEY: "${input:RESIDUAL_KEY}" } } } },
      null,
      2,
    ),
  );

  const result = validate(out);

  assert.ok(result.errors.length > 0, "must report at least one error");
  assert.ok(
    result.errors.some((error) => error.includes("${input:")),
    "at least one error must reference the residual placeholder",
  );
});

test("validate rejects case-insensitive vscode residue and unexpected Copilot markdown suffixes", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  fs.mkdirSync(path.join(out, ".github/agents/VSCodeResidue"));
  fs.writeFileSync(path.join(out, ".github/prompts/unexpected.md"), "---\n---\n");
  fs.writeFileSync(path.join(out, ".github/instructions/unexpected.md"), "---\napplyTo: '**'\n---\n");

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("vscode path residue: .github/agents/VSCodeResidue")));
  assert.ok(result.errors.some((error) => error.includes("must use .prompt.md suffix")));
  assert.ok(result.errors.some((error) => error.includes("must use .instructions.md suffix")));
});

test("validate ignores forbidden-looking strings in binary hook content", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  const residue = Buffer.from("C:\\Users\\alice\\src /Users/alice/src ${PLUGIN_ROOT} vscode/askQuestions");
  const binaries = [
    ["ospec-hooks.exe", Buffer.concat([Buffer.from([0x4d, 0x5a]), residue])],
    ["ospec-hooks", Buffer.concat([Buffer.from("binary\0payload"), residue])],
    ["invalid-utf8-runtime", Buffer.concat([Buffer.from([0xc3, 0x28]), residue])],
    ["control-byte-runtime", Buffer.concat([Buffer.from([0x01]), residue])],
    ["elf-runtime", Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), residue])],
    ["macho-runtime", Buffer.concat([Buffer.from([0xfe, 0xed, 0xfa, 0xcf]), residue])],
  ];
  for (const [name, binary] of binaries) {
    fs.writeFileSync(path.join(out, "scripts/hooks", name), binary);
  }

  const result = validate(out);

  assert.deepEqual(result.errors, []);
});

test("validate still rejects forbidden text in an extensionless script", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  fs.writeFileSync(
    path.join(out, "scripts/hooks/leaky-runtime"),
    "C:\\Users\\alice\\src\n/Users/alice/src\n${PLUGIN_ROOT}\nvscode/askQuestions\n",
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("absolute Windows path residue")));
  assert.ok(result.errors.some((error) => error.includes("absolute macOS user path residue")));
  assert.ok(result.errors.some((error) => error.includes("literal ${PLUGIN_ROOT}")));
  assert.ok(result.errors.some((error) => error.includes("vscode namespace residue")));
});

test("validate classifies textual exe content by content rather than extension", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  fs.writeFileSync(path.join(out, "scripts/hooks/not-really-binary.exe"), "${CLAUDE_PLUGIN_ROOT}\n");

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("literal ${CLAUDE_PLUGIN_ROOT}")));
});

test("validate fails closed when a file cannot be read for forbidden-text inspection", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  const unreadable = path.join(out, "scripts/hooks/session-start.js");

  const result = validate(out, {
    readFileSync(file, ...args) {
      if (path.resolve(file) === path.resolve(unreadable)) {
        const error = new Error("synthetic EACCES");
        error.code = "EACCES";
        throw error;
      }
      return fs.readFileSync(file, ...args);
    },
  });

  assert.ok(
    result.errors.some(
      (error) => error.includes("unable to inspect forbidden text") && error.includes("session-start.js"),
    ),
  );
});

test("validate converts filesystem stat, readdir, read, and race failures into errors", async (t) => {
  const cases = [
    {
      name: "stat",
      mutate(fsImpl, out) {
        const original = fsImpl.statSync.bind(fsImpl);
        fsImpl.statSync = (target, ...args) => {
          if (path.resolve(target) === path.resolve(out)) throw new Error("synthetic stat failure");
          return original(target, ...args);
        };
      },
    },
    {
      name: "readdir",
      mutate(fsImpl, out) {
        const original = fsImpl.readdirSync.bind(fsImpl);
        const agents = path.join(out, ".github", "agents");
        fsImpl.readdirSync = (target, ...args) => {
          if (path.resolve(target) === path.resolve(agents)) throw new Error("synthetic readdir failure");
          return original(target, ...args);
        };
      },
    },
    {
      name: "read",
      mutate(fsImpl, out) {
        const original = fsImpl.readFileSync.bind(fsImpl);
        const mcp = path.join(out, ".mcp.json");
        fsImpl.readFileSync = (target, ...args) => {
          if (path.resolve(target) === path.resolve(mcp)) throw new Error("synthetic read failure");
          return original(target, ...args);
        };
      },
    },
    {
      name: "race",
      mutate(fsImpl, out) {
        const original = fsImpl.statSync.bind(fsImpl);
        const hooks = path.join(out, ".github", "hooks", "hooks.json");
        fsImpl.statSync = (target, ...args) => {
          if (path.resolve(target) === path.resolve(hooks)) {
            const error = new Error("synthetic race ENOENT");
            error.code = "ENOENT";
            throw error;
          }
          return original(target, ...args);
        };
      },
    },
  ];

  for (const fault of cases) {
    await t.test(fault.name, () => {
      const out = tmpOut(t);
      runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
      const fsImpl = Object.create(fs);
      fault.mutate(fsImpl, out);

      let result;
      assert.doesNotThrow(() => {
        result = validate(out, { fs: fsImpl });
      });
      assert.ok(
        result.errors.some((error) => error.includes(`synthetic ${fault.name}`)),
        `expected ${fault.name} failure to be reported: ${JSON.stringify(result.errors)}`,
      );
    });
  }
});

test("validate continues independent checks after a filesystem failure", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  fs.writeFileSync(path.join(out, ".mcp.json"), "{}\n");
  const fsImpl = Object.create(fs);
  const original = fsImpl.readFileSync.bind(fsImpl);
  const unreadable = path.join(out, "scripts", "hooks", "session-start.js");
  fsImpl.readFileSync = (target, ...args) => {
    if (path.resolve(target) === path.resolve(unreadable)) throw new Error("synthetic independent read failure");
    return original(target, ...args);
  };

  const result = validate(out, { fs: fsImpl });

  assert.ok(result.errors.some((error) => error.includes("synthetic independent read failure")));
  assert.ok(result.errors.some((error) => error.includes("must have an mcpServers object")));
});

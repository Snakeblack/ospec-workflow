"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadTree, gatherRuntimeScripts, parseModels, runConfigure: runConfigureStrict, defaultRunValidator, resolveClaudeBin, isWindowsInteropPath, spawnCliSync, PROFILES } = require("./cli.js");
const { transform } = require("../lib/target-transform.js");
const runConfigure = options => runConfigureStrict(options);
const { rootedEvidencePath } = require("../lib/strict-tdd-evidence-remediation.js");

const FIXTURES = path.join(__dirname, "__fixtures__");
const SOURCE = fs.mkdtempSync(path.join(os.tmpdir(), "configure-source-"));
fs.cpSync(path.join(FIXTURES, "source"), SOURCE, { recursive: true });
fs.copyFileSync(path.join(process.cwd(), "models.yaml"), path.join(SOURCE, "models.yaml"));
test.after(() => fs.rmSync(SOURCE, { recursive: true, force: true }));

function tmpOut(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "configure-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function readTree(dir) {
  const out = {};
  const walk = (abs, rel) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childAbs = path.join(abs, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(childAbs, childRel);
      } else {
        out[childRel] = fs.readFileSync(childAbs, "utf8");
      }
    }
  };
  walk(dir, "");
  return out;
}
function withoutModelPolicy(tree) {
  return Object.fromEntries(Object.entries(tree).map(([file, content]) => [file, file === "models.yaml" ? "<model-policy>" : content.replace(/^model(?:_reasoning_effort|_verbosity)?\s*[:=].*\r?\n/gm, "")]));
}

// ---------------------------------------------------------------------------
// Requirement: writes a dist/<target>/ tree from a source fixture
// ---------------------------------------------------------------------------

test("runConfigure writes a claude tree to the out dir", (t) => {
  const out = tmpOut(t);
  const result = runConfigure({ sourceDir: SOURCE, target: "claude", outDir: out, validate: false, withSdd: true });

  assert.equal(result.exitCode, 0);
  assert.ok(fs.existsSync(path.join(out, "agents/sdd-apply.md")));
  assert.ok(fs.existsSync(path.join(out, "commands/sdd-apply.md")));
  // orchestrator ships as a skill, not a sub-agent
  assert.ok(fs.existsSync(path.join(out, "skills/sdd-orchestrator/SKILL.md")));
  assert.ok(!fs.existsSync(path.join(out, "agents/sdd-orchestrator.md")));
  assert.ok(!fs.existsSync(path.join(out, "rules")));
  assert.ok(fs.existsSync(path.join(out, "models.yaml")));
});

test("runConfigure omits the unsupported codex config artifact", (t) => {
  const out = tmpOut(t);

  runConfigure({ sourceDir: SOURCE, target: "codex", outDir: out, validate: false, withSdd: true });

  assert.ok(!fs.existsSync(path.join(out, ".codex", "config.toml")));
});

// ---------------------------------------------------------------------------
// Requirement: Source Non-Regression
// ---------------------------------------------------------------------------

test("the source fixture is left byte-for-byte unchanged", (t) => {
  const before = readTree(SOURCE);
  runConfigure({ sourceDir: SOURCE, target: "claude", outDir: tmpOut(t), validate: false, withSdd: true });
  runConfigure({ sourceDir: SOURCE, target: "vscode", outDir: tmpOut(t), validate: false, withSdd: true });
  const after = readTree(SOURCE);

  assert.deepEqual(after, before);
});

test("runConfigure applies a model override only to its generated tree", (t) => {
  const out = tmpOut(t);
  const modelsPath = path.join(SOURCE, "models.yaml");
  const before = fs.readFileSync(modelsPath, "utf8");

  const result = runConfigure({
    sourceDir: SOURCE,
    target: "claude",
    outDir: out,
    validate: false,
    withSdd: true,
    modelOverrides: { "sdd-apply": "temporary-model" },
  });

  assert.equal(result.exitCode, 0);
  assert.match(fs.readFileSync(path.join(out, "agents", "sdd-apply.md"), "utf8"), /^model: temporary-model$/m);
  assert.equal(fs.readFileSync(modelsPath, "utf8"), before);
});

// ---------------------------------------------------------------------------
// Requirement: Validation Gate
// ---------------------------------------------------------------------------

test("--no-validate skips the gate (validator not invoked)", (t) => {
  let called = false;
  const runValidator = () => {
    called = true;
    return { status: 0, stdout: "", stderr: "" };
  };
  const result = runConfigure({
    sourceDir: SOURCE,
    target: "claude",
    outDir: tmpOut(t),
    validate: false,
    runValidator,
  });

  assert.equal(called, false);
  assert.equal(result.exitCode, 0);
});

test("a validator failure yields a non-zero exit without throwing", (t) => {
  const runValidator = () => ({ status: 1, stdout: "1 errors, 0 warnings", stderr: "boom" });
  const result = runConfigure({
    sourceDir: SOURCE,
    target: "claude",
    outDir: tmpOut(t),
    validate: true,
    runValidator,
  });

  assert.notEqual(result.exitCode, 0);
});

test("reported warnings also fail the strict gate even on a zero status", (t) => {
  const runValidator = () => ({ status: 0, stdout: "0 errors, 2 warnings", stderr: "" });
  const result = runConfigure({
    sourceDir: SOURCE,
    target: "claude",
    outDir: tmpOut(t),
    validate: true,
    runValidator,
  });

  assert.notEqual(result.exitCode, 0);
});

test("a clean validator run keeps a zero exit", (t) => {
  const runValidator = () => ({ status: 0, stdout: "Validation passed", stderr: "" });
  const result = runConfigure({
    sourceDir: SOURCE,
    target: "claude",
    outDir: tmpOut(t),
    validate: true,
    runValidator,
  });

  assert.equal(result.exitCode, 0);
});

test("github-copilot validation uses the profile-level validator command", (t) => {
  const out = tmpOut(t);
  let validatorProfile = null;
  let validatorOut = null;
  const runValidator = (profile, outDir) => {
    validatorProfile = profile;
    validatorOut = outDir;
    return { status: 0, stdout: "0 errors, 0 warnings\n", stderr: "" };
  };

  const result = runConfigure({
    sourceDir: SOURCE,
    target: "github-copilot",
    outDir: out,
    validate: true,
    runValidator,
  });

  assert.equal(result.exitCode, 0);
  assert.notEqual(validatorOut, out);
  assert.equal(path.dirname(validatorOut), path.dirname(out));
  assert.match(path.basename(validatorOut), /^\..+\.configure-stage-/);
  assert.ok(
    validatorProfile.validate.some((part) => part.includes("validate-github-copilot.js")),
    "profile.validate argv must reference the github-copilot validator",
  );
});

test("defaultRunValidator runs the validator without a shell, passing {out} as one literal argv element", () => {
  // Without a shell, metacharacters in the output path cannot be reinterpreted:
  // the path arrives as a single argv element, proving the injection vector is gone.
  const profile = {
    validate: [process.execPath, "-e", "process.stdout.write(JSON.stringify(process.argv))", "{out}"],
  };
  const hostileOut = "a b & echo pwned > owned.txt";

  const result = defaultRunValidator(profile, hostileOut);
  const argv = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(argv[argv.length - 1], hostileOut);
});

// ---------------------------------------------------------------------------
// Golden snapshots
// ---------------------------------------------------------------------------

for (const target of ["claude", "github-copilot", "opencode", "codex", "cursor"]) {
  test(`generated ${target} tree matches the committed golden`, (t) => {
    const out = tmpOut(t);
    runConfigure({ sourceDir: SOURCE, target, outDir: out, validate: false, withSdd: true });

    const generated = withoutModelPolicy(readTree(out));
    const golden = withoutModelPolicy(readTree(path.join(FIXTURES, "golden", target)));

    assert.deepEqual(Object.keys(generated).sort(), Object.keys(golden).sort());
    for (const file of Object.keys(golden)) {
      assert.equal(generated[file], golden[file], `mismatch in ${file}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Safe + deterministic output
// ---------------------------------------------------------------------------

test("regenerating prunes stale generated files but keeps unrelated entries", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "claude", outDir: out, validate: false, withSdd: true });

  // A stale artifact under a managed root (a renamed/removed skill) and unrelated
  // user data outside any managed root.
  const stale = path.join(out, "skills", "ghost", "SKILL.md");
  fs.mkdirSync(path.dirname(stale), { recursive: true });
  fs.writeFileSync(stale, "stale\n");
  const keep = path.join(out, "NOTES.md");
  fs.writeFileSync(keep, "user notes\n");

  runConfigure({ sourceDir: SOURCE, target: "claude", outDir: out, validate: false, withSdd: true });

  assert.ok(!fs.existsSync(stale), "stale generated file must be pruned");
  assert.ok(!fs.existsSync(path.dirname(stale)), "emptied stale directory must be pruned");
  assert.ok(fs.existsSync(keep), "unrelated top-level file must be kept");
});

test("regenerating codex removes the formerly managed bundled .mcp.json", (t) => {
  const out = tmpOut(t);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, ".mcp.json"), "{\"legacy\":true}\n");

  runConfigure({ sourceDir: SOURCE, target: "codex", outDir: out, validate: false, withSdd: true });

  assert.ok(!fs.existsSync(path.join(out, ".mcp.json")));
});

// ---------------------------------------------------------------------------
// loadTree + parseModels
// ---------------------------------------------------------------------------

test("gatherRuntimeScripts walks hook requires, excluding tests and generator code", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "scripts/hooks"), { recursive: true });
  fs.mkdirSync(path.join(dir, "scripts/lib"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts/hooks/start.js"), 'require("../lib/dep.js");\n');
  fs.writeFileSync(path.join(dir, "scripts/hooks/start.test.js"), '// test, must not ship\n');
  fs.writeFileSync(path.join(dir, "scripts/lib/dep.js"), "module.exports = {};\n");
  fs.writeFileSync(path.join(dir, "scripts/lib/generator-only.js"), "// not required by hooks\n");

  const paths = gatherRuntimeScripts(dir).map((f) => f.path);

  assert.ok(paths.includes("scripts/hooks/start.js"));
  assert.ok(paths.includes("scripts/lib/dep.js"));
  assert.ok(!paths.includes("scripts/hooks/start.test.js"), "test files must be excluded");
  assert.ok(!paths.includes("scripts/lib/generator-only.js"), "unreferenced (generator) files excluded");
});

test("loadTree reads the plugin source roots into {path, content}", () => {
  const files = loadTree(SOURCE);
  const paths = files.map((f) => f.path);

  assert.ok(paths.includes(".claude-plugin/plugin.json"));
  assert.ok(paths.includes("agents/sdd-orchestrator.agent.md"));
  assert.ok(paths.includes("rules/agent-teams.instructions.md"));
  for (const file of files) {
    assert.equal(typeof file.content, "string");
  }
});

test("parseModels reads the two-table shape with scalars and inline arrays", () => {
  const models = parseModels(
    ["agents:", "  sdd-apply: default", "  _default: default", "tiers:", "  default:", "    claude: sonnet", '    vscode: ["A (copilot)", "B (copilot)"]', "    copilot-cli: inherit"].join("\n"),
  );

  assert.equal(models.agents["sdd-apply"], "default");
  assert.equal(models.tiers.default.claude, "sonnet");
  assert.deepEqual(models.tiers.default.vscode, ["A (copilot)", "B (copilot)"]);
  assert.equal(models.tiers.default["copilot-cli"], "inherit");
});

test("parseModels reads block-sequence target models", () => {
  const models = parseModels(
    ["tiers:", "  default:", "    vscode:", '      - "A (copilot)"', '      - "B (copilot)"'].join("\n"),
  );

  assert.deepEqual(models.tiers.default.vscode, ["A (copilot)", "B (copilot)"]);
});

test("parseModels reads inline capability mappings without a YAML dependency", () => {
  const models = parseModels("installer:\n  capabilities:\n    claude:\n      sonnet:\n        effort: { values: [low, medium], default: medium }");
  assert.deepEqual(models.installer.capabilities.claude.sonnet.effort, { values: ["low", "medium"], default: "medium" });
});

test("runConfigure accepts configurable reviewer and Codex policy from models.yaml", (t) => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "configure-policy-"));
  t.after(() => fs.rmSync(source, { recursive: true, force: true }));
  fs.cpSync(SOURCE, source, { recursive: true });
  const models = fs.readFileSync(path.join(process.cwd(), "models.yaml"), "utf8")
    .replace("  review-trust: default", "  review-trust: premium")
    .replace("model_reasoning_effort: low", "model_reasoning_effort: xhigh");
  fs.writeFileSync(path.join(source, "models.yaml"), models);
  const out = tmpOut(t);
  const result = runConfigureStrict({ sourceDir: source, target: "claude", outDir: out, validate: false, withSdd: true });
  assert.equal(result.exitCode, 0);
  assert.equal(fs.existsSync(path.join(out, "agents", "sdd-apply.md")), true);
});

test("runConfigure aborts before writing on a structural model policy error", (t) => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "configure-policy-"));
  t.after(() => fs.rmSync(source, { recursive: true, force: true }));
  fs.cpSync(SOURCE, source, { recursive: true });
  const invalid = fs.readFileSync(path.join(process.cwd(), "models.yaml"), "utf8")
    .replace(/^  sdd-propose: .*\r?\n/m, "");
  fs.writeFileSync(path.join(source, "models.yaml"), invalid);
  const out = tmpOut(t);
  const result = runConfigureStrict({ sourceDir: source, target: "claude", outDir: out, validate: false, withSdd: true });
  assert.notEqual(result.exitCode, 0);
  assert.equal(fs.existsSync(path.join(out, "agents", "sdd-apply.md")), false);
});

test("RED: evidence authorization rejects a symlinked change root", (t) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-outside-"));
  const link = path.join(process.cwd(), "openspec", "changes", "evidence-link");
  t.after(() => {
    // Node 24 rejects rmSync on a junction unless it is recursive, and recursive
    // would delete the target. Unlink removes the junction only.
    try {
      fs.unlinkSync(link);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    fs.rmSync(outside, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(outside, "apply-progress.md"), "evidence");
  fs.symlinkSync(outside, link, "junction");
  assert.equal(rootedEvidencePath(process.cwd(), "openspec/changes/evidence-link/apply-progress.md", "evidence-link"), null);
});

test("parseModels rejects duplicate mapping keys before overwrite", () => {
  assert.throws(
    () => parseModels(["agents:", "  sdd-apply: default", "  sdd-apply: cheap"].join("\n")),
    /duplicate key.*sdd-apply.*line 3/i,
  );
});

// ---------------------------------------------------------------------------
// G1 — Skill entry-point scripts present in dist
// ---------------------------------------------------------------------------

test("G1: gatherRuntimeScripts includes all four skill entry-point scripts as additional BFS roots", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-g1-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.mkdirSync(path.join(dir, "scripts/hooks"), { recursive: true });
  fs.mkdirSync(path.join(dir, "scripts/lib"), { recursive: true });

  // Stub hook with no requires — should not interfere with entry script detection
  fs.writeFileSync(path.join(dir, "scripts/hooks/stub.js"), '"use strict";\n');

  // The four skill entry-point scripts that must always ship in dist
  const entryScripts = [
    "federation-marker.js",
    "federation-explore.js",
    "workspace-general-baseline.js",
    "federation-baseline-orchestrator.js",
  ];
  for (const name of entryScripts) {
    fs.writeFileSync(path.join(dir, "scripts/lib", name), `"use strict";\n`);
  }

  const paths = gatherRuntimeScripts(dir).map((f) => f.path);

  assert.ok(paths.includes("scripts/lib/federation-marker.js"), "federation-marker.js must be in dist");
  assert.ok(paths.includes("scripts/lib/federation-explore.js"), "federation-explore.js must be in dist");
  assert.ok(paths.includes("scripts/lib/workspace-general-baseline.js"), "workspace-general-baseline.js must be in dist");
  assert.ok(paths.includes("scripts/lib/federation-baseline-orchestrator.js"), "federation-baseline-orchestrator.js must be in dist");
});

// ---------------------------------------------------------------------------
// G2 — Generator-only modules excluded from dist (guard on transitive deps)
// ---------------------------------------------------------------------------

test("G2: gatherRuntimeScripts excludes target-* modules even when required by an entry script", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-g2-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.mkdirSync(path.join(dir, "scripts/hooks"), { recursive: true });
  fs.mkdirSync(path.join(dir, "scripts/lib"), { recursive: true });

  // Hook that requires federation-marker — makes the entry script reachable from hooks BFS
  fs.writeFileSync(
    path.join(dir, "scripts/hooks/hook.js"),
    '"use strict";\nrequire("../lib/federation-marker.js");\n',
  );
  // Entry script that requires a generator-only target-* module
  fs.writeFileSync(
    path.join(dir, "scripts/lib/federation-marker.js"),
    '"use strict";\nrequire("./target-foo");\n',
  );
  // Generator-only module — must not appear in dist regardless of reachability
  fs.writeFileSync(path.join(dir, "scripts/lib/target-foo.js"), '"use strict";\n');

  const paths = gatherRuntimeScripts(dir).map((f) => f.path);

  assert.ok(!paths.includes("scripts/lib/target-foo.js"), "target-* modules must be excluded from dist");
});

// ---------------------------------------------------------------------------
// G3 — Transitive dependency of an entry script included
// ---------------------------------------------------------------------------

test("G3: gatherRuntimeScripts includes a non-excluded transitive dep of a skill entry script", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-g3-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // Empty hooks dir — no hooks contribute deps; entry scripts are the only roots
  fs.mkdirSync(path.join(dir, "scripts/hooks"), { recursive: true });
  fs.mkdirSync(path.join(dir, "scripts/lib"), { recursive: true });

  // Entry script requires a non-excluded transitive dep
  fs.writeFileSync(
    path.join(dir, "scripts/lib/federation-marker.js"),
    '"use strict";\nrequire("./some-dep");\n',
  );
  fs.writeFileSync(path.join(dir, "scripts/lib/some-dep.js"), '"use strict";\n');

  const paths = gatherRuntimeScripts(dir).map((f) => f.path);

  assert.ok(paths.includes("scripts/lib/some-dep.js"), "non-excluded transitive dep must be in dist");
});

// ---------------------------------------------------------------------------
// G4 — Transitive require to scripts/configure/ is excluded from dist
// ---------------------------------------------------------------------------

test("G4: gatherRuntimeScripts excludes modules under scripts/configure/ required transitively", (t) => {
  // Guard under test: isExcludedRuntimeScript — branch
  // `if (rel.startsWith("scripts/configure/")) return true`.
  // If that branch were removed, scripts/configure/some-generator.js would
  // be enqueued and appear in the output, failing the assertion below.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-g4-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.mkdirSync(path.join(dir, "scripts/hooks"), { recursive: true });
  fs.mkdirSync(path.join(dir, "scripts/configure"), { recursive: true });

  // Hook that transitively requires a module under scripts/configure/
  fs.writeFileSync(
    path.join(dir, "scripts/hooks/hook.js"),
    '"use strict";\nrequire("../configure/some-generator.js");\n',
  );
  fs.writeFileSync(path.join(dir, "scripts/configure/some-generator.js"), '"use strict";\n');

  const paths = gatherRuntimeScripts(dir).map((f) => f.path);

  assert.ok(paths.includes("scripts/hooks/hook.js"), "hook must be in dist");
  assert.ok(
    !paths.includes("scripts/configure/some-generator.js"),
    "modules under scripts/configure/ must be excluded even when required transitively",
  );
});

// ---------------------------------------------------------------------------
// G5 — Transitive require to frontmatter.js / model-resolver.js is excluded
// ---------------------------------------------------------------------------

test("G5: gatherRuntimeScripts excludes frontmatter.js and model-resolver.js required transitively", (t) => {
  // Guard under test: isExcludedRuntimeScript — branch
  // `if (base === "frontmatter.js" || base === "model-resolver.js") return true`.
  // If that branch were removed, both files would appear in the output,
  // failing the assertions below.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-g5-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.mkdirSync(path.join(dir, "scripts/hooks"), { recursive: true });
  fs.mkdirSync(path.join(dir, "scripts/lib"), { recursive: true });

  // Hook that transitively requires both generator-only named modules
  fs.writeFileSync(
    path.join(dir, "scripts/hooks/hook.js"),
    '"use strict";\nrequire("../lib/frontmatter.js");\nrequire("../lib/model-resolver.js");\n',
  );
  fs.writeFileSync(path.join(dir, "scripts/lib/frontmatter.js"), '"use strict";\n');
  fs.writeFileSync(path.join(dir, "scripts/lib/model-resolver.js"), '"use strict";\n');

  const paths = gatherRuntimeScripts(dir).map((f) => f.path);

  assert.ok(paths.includes("scripts/hooks/hook.js"), "hook must be in dist");
  assert.ok(
    !paths.includes("scripts/lib/frontmatter.js"),
    "frontmatter.js must be excluded from dist even when required transitively",
  );
  assert.ok(
    !paths.includes("scripts/lib/model-resolver.js"),
    "model-resolver.js must be excluded from dist even when required transitively",
  );
});

test("gatherRuntimeScripts handles fs permission errors gracefully", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-err-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.mkdirSync(path.join(dir, "scripts/hooks"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts/hooks/hook.js"), '"use strict";\n');

  const realReaddirSync = fs.readdirSync;
  fs.readdirSync = (p, options) => {
    if (p === path.join(dir, "scripts/hooks") || p === dir) {
      const err = new Error("EACCES: permission denied");
      err.code = "EACCES";
      throw err;
    }
    return realReaddirSync(p, options);
  };

  t.after(() => {
    fs.readdirSync = realReaddirSync;
  });

  const paths = gatherRuntimeScripts(dir).map((f) => f.path);
  assert.equal(paths.length, 0); // Should handle error and return empty array or ignore unreadable folders
});

test("RED: runConfigure aborts without output when a managed source read fails", (t) => {
  const readFileSync = fs.readFileSync;
  fs.readFileSync = (file, ...args) => String(file).endsWith("plugin.json") ? (() => { throw new Error("EACCES"); })() : readFileSync(file, ...args);
  t.after(() => { fs.readFileSync = readFileSync; });
  const out = tmpOut(t);
  assert.throws(() => runConfigure({ sourceDir: SOURCE, target: "claude", outDir: out, validate: false, withSdd: true }), /EACCES/);
  assert.equal(fs.existsSync(path.join(out, "agents")), false);
});

test("K3 readiness: every generated target receives the Candidate v2 schema and runtime closure", () => {
  const source = loadTree(process.cwd());
  const required = [
    "schemas/kernel/manifest.json",
    "schemas/kernel/candidate/v2.schema.json",
    "scripts/lib/execution-identities/index.js",
  ];
  for (const target of Object.keys(PROFILES)) {
    const files = transform({ files: source, profile: PROFILES[target] }).files;
    for (const requiredPath of required) {
      assert.ok(files.some((file) => file.path === requiredPath), `${target} is missing ${requiredPath}`);
    }
  }
});

// --- Guard de interop WSL (wsl-claude-interop-guard) ------------------------

function withPlatform(platform, fn) {
  const original = process.platform;
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  try {
    fn();
  } finally {
    Object.defineProperty(process, "platform", { value: original, configurable: true });
  }
}

test("isWindowsInteropPath flags /mnt/<letra>/ paths as Windows interop only on linux", () => {
  withPlatform("linux", () => {
    assert.equal(isWindowsInteropPath("/mnt/c/Users/x/claude.exe"), true);
    assert.equal(isWindowsInteropPath("/mnt/d/tools/claude"), true);
  });
});

test("isWindowsInteropPath ignores native paths and non-linux platforms", () => {
  withPlatform("linux", () => {
    assert.equal(isWindowsInteropPath("/usr/bin/claude"), false);
    assert.equal(isWindowsInteropPath("/mnt/claude"), false);
    assert.equal(isWindowsInteropPath("/mnt/tools/claude"), false);
  });
  withPlatform("win32", () => {
    assert.equal(isWindowsInteropPath("/mnt/c/Users/x/claude.exe"), false);
    assert.equal(isWindowsInteropPath("C:\\Users\\x\\claude.exe"), false);
  });
});

test("resolveClaudeBin never returns a /mnt/<letra>/ interop path on linux", () => {
  withPlatform("linux", () => {
    const resolved = resolveClaudeBin();
    assert.ok(
      resolved === null || !/^\/mnt\/[a-z]\//.test(resolved),
      `resolveClaudeBin devolvió una ruta interop de Windows: ${resolved}`,
    );
  });
});

test("defaultRunValidator degrades to a fail-soft skip when no usable claude binary exists", () => {
  const originalPath = process.env.PATH;
  const originalLocalApp = process.env.LOCALAPPDATA;
  process.env.PATH = "";
  delete process.env.LOCALAPPDATA;
  try {
    const result = defaultRunValidator(PROFILES.claude, "/tmp/ospec-out-unused");
    assert.deepEqual(result, { status: 0, stdout: "claude validator skipped: no usable native binary\n", stderr: "" });
  } finally {
    process.env.PATH = originalPath;
    if (originalLocalApp !== undefined) {
      process.env.LOCALAPPDATA = originalLocalApp;
    } else {
      delete process.env.LOCALAPPDATA;
    }
  }
});

test("spawnCliSync runs a real Windows npm shim (.cmd) when present", { skip: process.platform === "win32" ? false : "windows-only probe" }, () => {
  const resolved = resolveClaudeBin();
  if (!resolved || !/\.cmd$/i.test(resolved)) {
    return; // native binary or not installed; quoting path not exercised
  }
  const probe = spawnCliSync(resolved, ["--version"], { stdio: "ignore", encoding: "utf8" });
  assert.equal(probe.error, undefined);
  assert.equal(probe.status, 0);
});

// E1.4 (d): every script a shipped skill, agent, rule, command or hook cites
// must reach a consumer's runtime; tests and illustrative paths that do not
// exist in this repository are not runtime.
test("every script cited by shipped content is distributed in the runtime", () => {
  const repo = path.join(__dirname, "..", "..");
  const runtime = new Set(gatherRuntimeScripts(repo).map((f) => f.path.split(path.sep).join("/")));
  const missing = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(md|json|ya?ml|toml)$/.test(entry.name)) {
        for (const [script] of fs.readFileSync(file, "utf8").matchAll(/scripts\/[A-Za-z0-9_/.-]+\.js/g)) {
          if (script.endsWith(".test.js") || !fs.existsSync(path.join(repo, script))) continue;
          if (!runtime.has(script)) missing.push(`${script} (cited by ${path.relative(repo, file).split(path.sep).join("/")})`);
        }
      }
    }
  };
  for (const dir of ["skills", "agents", "rules", "commands", "hooks"]) {
    if (fs.existsSync(path.join(repo, dir))) walk(path.join(repo, dir));
  }
  assert.deepEqual([...new Set(missing)].sort(), []);
});

// E1.9 install-cli-ux (REQ-install-038): VS Code loads dist/vscode live, so on Windows renaming
// that directory fails with EPERM while VS Code (or a shell inside it) is open.
function lockedRename(phase) {
  return event => {
    if (event.operation === "rename" && event.phase === phase) {
      throw Object.assign(new Error(`EPERM: operation not permitted, rename '${event.from}'`), { code: "EPERM" });
    }
  };
}

function configureSiblings(parent, name) {
  return fs.readdirSync(parent).filter(entry => entry.startsWith(`.${name}.configure`));
}

test("E1.9 repro: vscode publishes in place when the live destination cannot be renamed", t => {
  const parent = tmpOut(t);
  const out = path.join(parent, "vscode");
  runConfigure({ sourceDir: SOURCE, target: "vscode", outDir: out, validate: false });
  fs.writeFileSync(path.join(out, "NOTES.md"), "unmanaged\n");
  fs.mkdirSync(path.join(out, "skills", "retired"), { recursive: true });
  fs.writeFileSync(path.join(out, "skills", "retired", "SKILL.md"), "stale\n");
  const expected = readTree(out);
  delete expected["skills/retired/SKILL.md"];

  const result = runConfigure({
    sourceDir: SOURCE,
    target: "vscode",
    outDir: out,
    validate: false,
    retryOptions: { maxRetries: 0 },
    operationObserver: lockedRename("backup"),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.publication, "in-place");
  assert.deepEqual(readTree(out), expected);
  assert.deepEqual(configureSiblings(parent, "vscode"), []);
});

test("E1.9 repro: a locked destination of a target without in-place publication names operation, path and action", t => {
  const parent = tmpOut(t);
  const out = path.join(parent, "cursor");
  runConfigure({ sourceDir: SOURCE, target: "cursor", outDir: out, validate: false });
  const before = readTree(out);

  assert.throws(() => runConfigure({
    sourceDir: SOURCE,
    target: "cursor",
    outDir: out,
    validate: false,
    retryOptions: { maxRetries: 0 },
    operationObserver: lockedRename("backup"),
  }), error => {
    assert.equal(error.code, "EPERM");
    assert.equal(error.path, path.resolve(out));
    assert.match(error.message, /no se pudo renombrar/);
    assert.ok(error.message.includes(path.resolve(out)));
    assert.match(error.message, /Cierra Cursor/);
    return true;
  });
  assert.deepEqual(readTree(out), before);
  assert.deepEqual(configureSiblings(parent, "cursor"), []);
});

test("E1.9 repro: an in-place publication that also hits a lock fails with the path, the action and the partial state", t => {
  const parent = tmpOut(t);
  const out = path.join(parent, "vscode");
  runConfigure({ sourceDir: SOURCE, target: "vscode", outDir: out, validate: false });
  const lockAll = event => {
    lockedRename("backup")(event);
    if (event.phase === "in-place" && event.operation === "write") {
      throw Object.assign(new Error(`EBUSY: resource busy or locked, open '${event.path}'`), { code: "EBUSY" });
    }
  };

  assert.throws(() => runConfigure({
    sourceDir: SOURCE,
    target: "vscode",
    outDir: out,
    validate: false,
    retryOptions: { maxRetries: 0 },
    operationObserver: lockAll,
  }), error => {
    assert.equal(error.code, "EBUSY");
    assert.match(error.message, /no se pudo escribir/);
    assert.match(error.message, /Cierra VS Code/);
    assert.match(error.message, /a medio actualizar/);
    return true;
  });
  assert.deepEqual(configureSiblings(parent, "vscode"), []);
});

// E1.10 (REQ-install-039): prepareTree finishes the validated stage before it is
// published, and the destination itself when the build is written in place.
test("REQ-install-039: prepareTree runs on the stage before publication, and a failure keeps the destination", t => {
  const parent = tmpOut(t);
  const out = path.join(parent, "vscode");
  const prepared = [];
  runConfigure({
    sourceDir: SOURCE,
    target: "vscode",
    outDir: out,
    validate: false,
    prepareTree: dir => {
      prepared.push(dir);
      assert.equal(fs.existsSync(out), false, "the destination is not published before prepareTree");
      fs.writeFileSync(path.join(dir, "PREPARED.md"), "prepared\n");
    },
  });
  assert.equal(prepared.length, 1);
  assert.notEqual(path.resolve(prepared[0]), path.resolve(out));
  assert.equal(fs.readFileSync(path.join(out, "PREPARED.md"), "utf8"), "prepared\n");

  const before = readTree(out);
  assert.throws(() => runConfigure({
    sourceDir: SOURCE,
    target: "vscode",
    outDir: out,
    validate: false,
    prepareTree: () => {
      throw new Error("prepare failed");
    },
  }), /prepare failed/);
  assert.deepEqual(readTree(out), before);
  assert.deepEqual(configureSiblings(parent, "vscode"), []);
});

test("REQ-install-039: an in-place publication prepares the destination after writing it", t => {
  const parent = tmpOut(t);
  const out = path.join(parent, "vscode");
  runConfigure({ sourceDir: SOURCE, target: "vscode", outDir: out, validate: false });
  const prepared = [];
  const result = runConfigure({
    sourceDir: SOURCE,
    target: "vscode",
    outDir: out,
    validate: false,
    retryOptions: { maxRetries: 0 },
    operationObserver: lockedRename("backup"),
    prepareTree: dir => {
      prepared.push(path.resolve(dir));
      fs.writeFileSync(path.join(dir, "PREPARED.md"), "prepared\n");
    },
  });
  assert.equal(result.publication, "in-place");
  assert.equal(prepared.at(-1), path.resolve(out));
  assert.equal(fs.readFileSync(path.join(out, "PREPARED.md"), "utf8"), "prepared\n");
  assert.deepEqual(configureSiblings(parent, "vscode"), []);
});

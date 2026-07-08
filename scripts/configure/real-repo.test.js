"use strict";

// Real-repo integration: the golden snapshots exercise a reduced fixture tree,
// so these tests generate from the actual repository root to catch issues that
// only surface against the full source (e.g. a skill file with namespace/path
// residue, or a phase agent that references a skill the target drops). No
// external CLI is required, so this runs cross-platform in CI.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure } = require("./cli.js");
const { validate } = require("./validate-github-copilot.js");
const { validate: validateOpencode } = require("./validate-opencode.js");
const { validate: validateCodex } = require("./validate-codex.js");
const { matchConditions, parseRoutingTable, validateRouteTable } = require("../lib/route-dispatcher.js");

const ROOT = path.resolve(__dirname, "..", "..");

function tmpOut(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-real-repo-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function walk(root, relDir = "", acc = []) {
  const absDir = path.join(root, relDir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    return acc;
  }
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walk(root, rel, acc);
    } else if (entry.isFile()) {
      acc.push(rel);
    }
  }
  return acc;
}

test("real repo: all five targets generate non-empty trees", (t) => {
  for (const target of ["claude", "vscode", "github-copilot", "opencode", "codex"]) {
    const out = tmpOut(t);
    const result = runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
    assert.ok(result.files.length > 0, `${target} produced no files`);
  }
});

test("real repo: codex output passes its own validator", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "codex", outDir: out, validate: false });

  const result = validateCodex(out);

  assert.deepEqual(result.errors, [], `validator errors:\n${result.errors.join("\n")}`);
});

test("validate-codex rejects AskUserQuestion residue in an existing codex tree", (t) => {
  const out = tmpOut(t);

  fs.mkdirSync(path.join(out, ".codex-plugin"), { recursive: true });
  fs.mkdirSync(path.join(out, ".codex", "agents"), { recursive: true });
  fs.mkdirSync(path.join(out, "skills", "foo"), { recursive: true });

  fs.writeFileSync(
    path.join(out, ".codex-plugin", "plugin.json"),
    JSON.stringify({ skills: "skills/", mcpServers: ".mcp.json", apps: [], hooks: "hooks/hooks.json", interface: { displayName: "x", icon: "icon.png" } }, null, 2)
  );
  fs.writeFileSync(
    path.join(out, ".codex", "agents", "sdd-apply.toml"),
    'name = "sdd-apply"\ndescription = "d"\nsandbox_mode = "workspace-write"\ndeveloper_instructions = """clean"""\n'
  );
  fs.writeFileSync(path.join(out, "skills", "foo", "SKILL.md"), "AskUserQuestion must not survive here.\n");

  const result = validateCodex(out);

  assert.match(result.errors.join("\n"), /AskUserQuestion/i);
});

test("real repo: codex ships every source context-doc skill file unchanged, regardless of command-name overlap", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "codex", outDir: out, validate: false });

  const sourceSkills = walk(ROOT, "skills").filter((rel) => rel.endsWith(".md"));
  assert.ok(sourceSkills.length > 0, "source must contain skills to test");
  for (const rel of sourceSkills) {
    // skills/commands/ is the reserved namespace for command-derived skills
    // (REQ-codex-target-004); no real source skill lives there today, but the
    // separation itself is what prevents the collision this test guards.
    assert.ok(fs.existsSync(path.join(out, rel)), `context-doc skill dropped from codex output: ${rel}`);
  }
});

// Resolved design-mismatch (see apply-progress.md / appr-003): commandFile.format:"skill"
// now emits every commands/<name>.prompt.md to skills/commands/<name>/SKILL.md,
// namespaced away from the repo's pre-existing skills/<name>/SKILL.md convention
// (phase-agent-loaded context docs, referenced by literal path from agent prose
// across ALL targets). 15 of the 18 SDD commands share their base name with an
// existing skills/<name>/ folder; this test asserts BOTH files coexist at two
// distinct paths with distinct content, per REQ-codex-target-004 Scenario
// "Command-derived skill does not collide with existing context-doc skill".
test("real repo: codex command-derived skill coexists with an existing context-doc skill of the same base name, without collision", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "codex", outDir: out, validate: false });

  const sourceSkillNames = new Set(walk(ROOT, "skills").map((rel) => rel.split("/")[1]));
  const collidingCommands = walk(ROOT, "commands")
    .filter((rel) => rel.endsWith(".prompt.md"))
    .map((rel) => rel.slice("commands/".length, rel.length - ".prompt.md".length))
    .filter((base) => sourceSkillNames.has(base));

  assert.ok(collidingCommands.length > 0, "fixture assumption: at least one command must collide with an existing skill name");

  for (const base of collidingCommands) {
    const commandSkillPath = path.join(out, "skills", "commands", base, "SKILL.md");
    const contextDocPath = path.join(out, "skills", base, "SKILL.md");
    assert.ok(fs.existsSync(commandSkillPath), `command-derived skill missing: skills/commands/${base}/SKILL.md`);
    assert.ok(fs.existsSync(contextDocPath), `context-doc skill missing: skills/${base}/SKILL.md`);
    const commandSkill = fs.readFileSync(commandSkillPath, "utf8");
    assert.match(
      commandSkill,
      /Spawn the `[^`]+` agent/,
      `skills/commands/${base}/SKILL.md must carry the command-derived spawn instruction`
    );
  }
});

test("real repo: codex emits every source agent as TOML outside the plugin bundle", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "codex", outDir: out, validate: false });

  const sourceAgents = walk(ROOT, "agents").filter((rel) => rel.endsWith(".agent.md"));
  assert.ok(sourceAgents.length > 0, "source must contain agents to test");
  for (const rel of sourceAgents) {
    const base = rel.slice("agents/".length, rel.length - ".agent.md".length);
    assert.ok(
      fs.existsSync(path.join(out, ".codex", "agents", `${base}.toml`)),
      `agent not emitted as TOML: .codex/agents/${base}.toml`
    );
  }

  const bundle = JSON.parse(fs.readFileSync(path.join(out, ".codex-plugin", "plugin.json"), "utf8"));
  assert.ok(!("agents" in bundle), "codex plugin bundle must not reference agents");
});

test("real repo: codex synthesizes a single AGENTS.md from the rules tree", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "codex", outDir: out, validate: false });

  assert.ok(fs.existsSync(path.join(out, "AGENTS.md")), "AGENTS.md must be synthesized");
  assert.ok(!fs.existsSync(path.join(out, "rules")), "rules/ must not survive in codex output");
});

test("real repo: no AskUserQuestion residue survives anywhere in the codex tree", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "codex", outDir: out, validate: false });

  for (const file of walk(out)) {
    if (!file.endsWith(".md") && !file.endsWith(".toml")) {
      continue;
    }
    const text = fs.readFileSync(path.join(out, file), "utf8");
    assert.doesNotMatch(text, /AskUserQuestion/, `AskUserQuestion residue in ${file}`);
  }
});

test("real repo: github-copilot output passes its own validator", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "github-copilot", outDir: out, validate: false });

  const result = validate(out);

  assert.deepEqual(result.errors, [], `validator errors:\n${result.errors.join("\n")}`);
});

test("real repo: opencode output passes its own validator", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "opencode", outDir: out, validate: false });

  const result = validateOpencode(out);

  assert.deepEqual(result.errors, [], `validator errors:\n${result.errors.join("\n")}`);
});

test("real repo: opencode ships every source skill file the agents read by path", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "opencode", outDir: out, validate: false });

  const sourceSkills = walk(ROOT, "skills").filter((rel) => rel.endsWith(".md"));
  assert.ok(sourceSkills.length > 0, "source must contain skills to test");
  for (const rel of sourceSkills) {
    assert.ok(fs.existsSync(path.join(out, rel)), `skill dropped from opencode output: ${rel}`);
  }
});

test("real repo: opencode plugin bridges ospec-hooks binary with correct subcommands", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "opencode", outDir: out, validate: false });

  const plugin = fs.readFileSync(path.join(out, ".opencode", "plugins", "ospec.js"), "utf8");
  // The plugin now calls the Go binary via spawnSync — not require() of JS files.
  assert.match(plugin, /spawnSync/, "plugin must use spawnSync to invoke the binary");
  assert.match(plugin, /ospec-hooks/, "plugin must reference the ospec-hooks binary");
  assert.match(plugin, /pre-tool-use/, "plugin must bridge the pre-tool-use subcommand");
  assert.match(plugin, /session-start/, "plugin must bridge the session-start subcommand");
  // JS hook scripts still ship in the tree (fallback). Verify they are present.
  for (const rel of ["scripts/hooks/pre-tool-use.js", "scripts/hooks/session-start.js"]) {
    assert.ok(fs.existsSync(path.join(out, rel)), `fallback script not shipped: ${rel}`);
  }
});

test("real repo: github-copilot ships every source skill file", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "github-copilot", outDir: out, validate: false });

  const sourceSkills = walk(ROOT, "skills").filter((rel) => rel.endsWith(".md"));
  assert.ok(sourceSkills.length > 0, "source must contain skills to test");
  for (const rel of sourceSkills) {
    assert.ok(fs.existsSync(path.join(out, rel)), `skill dropped from github-copilot output: ${rel}`);
  }
});

test("real repo: every skill a phase agent says to load exists in github-copilot output", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "github-copilot", outDir: out, validate: false });

  const agentDir = path.join(out, ".github", "agents");
  const reference = /`(skills\/[^`]+\.md)`/g;
  let checked = 0;
  for (const file of walk(agentDir)) {
    const text = fs.readFileSync(path.join(agentDir, file), "utf8");
    for (const match of text.matchAll(reference)) {
      const rel = match[1];
      assert.ok(fs.existsSync(path.join(out, rel)), `${file} loads ${rel}, but it is not shipped`);
      checked += 1;
    }
  }
  assert.ok(checked > 0, "expected at least one agent to reference a skill file");
});

test("real repo: no foreign vscode/ namespace survives in the claude tree", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "claude", outDir: out, validate: false });

  for (const file of walk(out)) {
    if (!file.endsWith(".md")) {
      continue;
    }
    const text = fs.readFileSync(path.join(out, file), "utf8");
    assert.doesNotMatch(text, /vscode\//, `vscode/ namespace residue in ${file}`);
  }
});

test("real repo: sdd-clarify agent propagates to all four targets", (t) => {
  const targetPaths = {
    claude: "agents/sdd-clarify.md",
    vscode: "agents/sdd-clarify.agent.md",
    "github-copilot": ".github/agents/sdd-clarify.agent.md",
    opencode: ".opencode/agents/sdd-clarify.md",
  };

  for (const [target, expectedPath] of Object.entries(targetPaths)) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
    assert.ok(
      fs.existsSync(path.join(out, expectedPath)),
      `sdd-clarify agent missing from ${target} output at ${expectedPath}`
    );
  }
});

test("real repo: sdd-clarify skill propagates to opencode and github-copilot", (t) => {
  const skillRel = "skills/sdd-clarify/SKILL.md";

  for (const target of ["opencode", "github-copilot"]) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
    assert.ok(
      fs.existsSync(path.join(out, skillRel)),
      `sdd-clarify SKILL.md missing from ${target} output`
    );
  }
});

test("real repo: orchestrator conditional clarify references residual_ambiguity", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "vscode", outDir: out, validate: false });

  const orchestratorPath = path.join(out, "agents", "sdd-orchestrator.agent.md");
  assert.ok(
    fs.existsSync(orchestratorPath),
    "sdd-orchestrator.agent.md missing from vscode output"
  );

  const text = fs.readFileSync(orchestratorPath, "utf8");
  assert.match(
    text,
    /residual_ambiguity/,
    "sdd-orchestrator must reference residual_ambiguity for conditional clarify gate"
  );
});

test("real repo: sdd-foundation agent mentions markitdown degradation", (t) => {
  const targetPaths = {
    claude: "agents/sdd-foundation.md",
    vscode: "agents/sdd-foundation.agent.md",
    "github-copilot": ".github/agents/sdd-foundation.agent.md",
    opencode: ".opencode/agents/sdd-foundation.md",
  };

  for (const [target, expectedPath] of Object.entries(targetPaths)) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });

    assert.ok(
      fs.existsSync(path.join(out, expectedPath)),
      `sdd-foundation agent missing from ${target} output at ${expectedPath}`
    );

    const text = fs.readFileSync(path.join(out, expectedPath), "utf8");
    assert.match(
      text,
      /mcp__microsoft_markitdown__convert_to_markdown/,
      `sdd-foundation agent (${target}) must reference mcp__microsoft_markitdown__convert_to_markdown`
    );
    assert.match(
      text,
      /fallback|degradation/i,
      `sdd-foundation agent (${target}) must contain a fallback/degradation reference`
    );
  }
});

test("real repo: orchestrator brownfield route replaces standalone Baseline Advisory", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "vscode", outDir: out, validate: false });

  const orchestratorPath = path.join(out, "agents", "sdd-orchestrator.agent.md");
  assert.ok(
    fs.existsSync(orchestratorPath),
    "sdd-orchestrator.agent.md missing from vscode output"
  );

  const text = fs.readFileSync(orchestratorPath, "utf8");
  assert.doesNotMatch(
    text,
    /### Baseline Advisory \(optional, brownfield repos only\)/,
    "sdd-orchestrator must NOT contain the standalone Baseline Advisory heading"
  );
  assert.match(
    text,
    /Brownfield Route Handler/,
    "sdd-orchestrator must contain Brownfield Route Handler section"
  );
});

test("real repo: review-risk agent propagates to all four targets", (t) => {
  const targetPaths = {
    claude: "agents/review-risk.md",
    vscode: "agents/review-risk.agent.md",
    "github-copilot": ".github/agents/review-risk.agent.md",
    opencode: ".opencode/agents/review-risk.md",
  };

  for (const [target, expectedPath] of Object.entries(targetPaths)) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
    assert.ok(
      fs.existsSync(path.join(out, expectedPath)),
      `review-risk agent missing from ${target} output at ${expectedPath}`
    );
  }
});

test("real repo: review-readability agent propagates to all four targets", (t) => {
  const targetPaths = {
    claude: "agents/review-readability.md",
    vscode: "agents/review-readability.agent.md",
    "github-copilot": ".github/agents/review-readability.agent.md",
    opencode: ".opencode/agents/review-readability.md",
  };

  for (const [target, expectedPath] of Object.entries(targetPaths)) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
    assert.ok(
      fs.existsSync(path.join(out, expectedPath)),
      `review-readability agent missing from ${target} output at ${expectedPath}`
    );
  }
});

test("real repo: review-reliability agent propagates to all four targets", (t) => {
  const targetPaths = {
    claude: "agents/review-reliability.md",
    vscode: "agents/review-reliability.agent.md",
    "github-copilot": ".github/agents/review-reliability.agent.md",
    opencode: ".opencode/agents/review-reliability.md",
  };

  for (const [target, expectedPath] of Object.entries(targetPaths)) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
    assert.ok(
      fs.existsSync(path.join(out, expectedPath)),
      `review-reliability agent missing from ${target} output at ${expectedPath}`
    );
  }
});

test("real repo: review-resilience agent propagates to all four targets", (t) => {
  const targetPaths = {
    claude: "agents/review-resilience.md",
    vscode: "agents/review-resilience.agent.md",
    "github-copilot": ".github/agents/review-resilience.agent.md",
    opencode: ".opencode/agents/review-resilience.md",
  };

  for (const [target, expectedPath] of Object.entries(targetPaths)) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
    assert.ok(
      fs.existsSync(path.join(out, expectedPath)),
      `review-resilience agent missing from ${target} output at ${expectedPath}`
    );
  }
});

test("real repo: all four review-* skills propagate to opencode and github-copilot", (t) => {
  const skillRels = [
    "skills/review-risk/SKILL.md",
    "skills/review-readability/SKILL.md",
    "skills/review-reliability/SKILL.md",
    "skills/review-resilience/SKILL.md",
  ];

  for (const target of ["opencode", "github-copilot"]) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
    for (const skillRel of skillRels) {
      assert.ok(
        fs.existsSync(path.join(out, skillRel)),
        `${skillRel} missing from ${target} output`
      );
    }
  }
});

// config.yaml is tracked by git and normally present, but this guard self-skips the
// live-config assertion defensively when the file is absent for any reason (matching
// e2e.test.js); the matchConditions/parser behavior itself is covered deterministically
// by the route-dispatcher unit tests.
const LIVE_CONFIG_PATH = path.join(ROOT, "openspec", "config.yaml");
const HAS_LIVE_CONFIG = fs.existsSync(LIVE_CONFIG_PATH);

test(
  "real repo: live brownfield routing entry matches brownfield ctx and rejects baselined ctx",
  { skip: HAS_LIVE_CONFIG ? false : "openspec/config.yaml not present (unexpected; local dev only)" },
  () => {
  // (a) read live config.yaml from repo root
  const content = fs.readFileSync(LIVE_CONFIG_PATH, "utf8");

  // (b) parse and find brownfield entry
  const parsed = parseRoutingTable(content);
  const brownfield = parsed.find((r) => r.name === "brownfield");
  assert.ok(brownfield, "brownfield route must exist in openspec/config.yaml");

  const { conditions } = brownfield;

  // (c) match mode is 'any'
  assert.equal(conditions.match, "any", "brownfield conditions.match must be 'any'");

  // (d) baseline.status is JS array ['pending', 'partial']
  assert.deepEqual(
    conditions["baseline.status"],
    ["pending", "partial"],
    "brownfield conditions baseline.status must deep-equal ['pending','partial']",
  );

  // (e) specs_empty_with_code is native boolean true
  assert.equal(conditions.specs_empty_with_code, true);
  assert.equal(typeof conditions.specs_empty_with_code, "boolean", "specs_empty_with_code must be a boolean");

  // (f) code_without_specs is native boolean true
  assert.equal(conditions.code_without_specs, true);
  assert.equal(typeof conditions.code_without_specs, "boolean", "code_without_specs must be a boolean");

  // (g) matchConditions with pending baseline returns true
  assert.equal(
    matchConditions(conditions, { "baseline.status": "pending" }),
    true,
    "brownfield conditions must match a pending-baseline ctx",
  );

  // (h) matchConditions with done baseline and all signals false returns false
  assert.equal(
    matchConditions(conditions, {
      "baseline.status": "done",
      specs_empty_with_code: false,
      code_without_specs: false,
    }),
    false,
    "brownfield conditions must NOT match a done-baseline ctx with all signals false",
  );

  // (i) validateRouteTable on the full parsed table returns valid: true
  const tableResult = validateRouteTable(parsed);
  assert.equal(
    tableResult.valid,
    true,
    `routing table must be valid after C1 update; errors: ${JSON.stringify(tableResult.errors)}`,
  );
});

test(
  "real repo: live bugfix/refactor/hotfix routing entries match a native-boolean ctx (I2 regression lock)",
  { skip: HAS_LIVE_CONFIG ? false : "openspec/config.yaml not present (unexpected; local dev only)" },
  () => {
    // (a) read live config.yaml from repo root
    const content = fs.readFileSync(LIVE_CONFIG_PATH, "utf8");

    // (b) parse and find the three explicit-intent routes
    const parsed = parseRoutingTable(content);
    const bugfix = parsed.find((r) => r.name === "bugfix");
    const refactor = parsed.find((r) => r.name === "refactor");
    const hotfix = parsed.find((r) => r.name === "hotfix");

    assert.ok(bugfix, "bugfix route must exist in openspec/config.yaml");
    assert.ok(refactor, "refactor route must exist in openspec/config.yaml");
    assert.ok(hotfix, "hotfix route must exist in openspec/config.yaml");

    // (c) parsing already coerces the residual "true" string to a native boolean
    assert.equal(bugfix.conditions.explicit_bugfix_intent, true);
    assert.equal(typeof bugfix.conditions.explicit_bugfix_intent, "boolean");
    assert.equal(refactor.conditions.explicit_refactor_intent, true);
    assert.equal(typeof refactor.conditions.explicit_refactor_intent, "boolean");
    assert.equal(hotfix.conditions.explicit_hotfix_intent, true);
    assert.equal(typeof hotfix.conditions.explicit_hotfix_intent, "boolean");

    // (d) matchConditions returns true for a ctx carrying native booleans
    assert.equal(
      matchConditions(bugfix.conditions, { explicit_bugfix_intent: true }),
      true,
      "bugfix conditions must match a native-boolean explicit_bugfix_intent ctx",
    );
    assert.equal(
      matchConditions(refactor.conditions, { explicit_refactor_intent: true }),
      true,
      "refactor conditions must match a native-boolean explicit_refactor_intent ctx",
    );
    assert.equal(
      matchConditions(hotfix.conditions, { explicit_hotfix_intent: true }),
      true,
      "hotfix conditions must match a native-boolean explicit_hotfix_intent ctx",
    );
  },
);

test("real repo: orchestrator pointer-table refs resolve and handler sentinels absent from body", () => {
  // Read the orchestrator source file from ROOT (not a dist target)
  const orchestratorPath = path.join(ROOT, "agents", "sdd-orchestrator.agent.md");
  assert.ok(fs.existsSync(orchestratorPath), "sdd-orchestrator.agent.md must exist at agents/");
  const text = fs.readFileSync(orchestratorPath, "utf8");
  const lines = text.split("\n");

  // Guard: body must be below 500 lines after the C2 thinning (ratchet against re-inlining)
  assert.ok(
    lines.length < 500,
    `orchestrator body must be < 500 lines; got ${lines.length}`
  );

  // Sentinel absence: these strings must NOT appear in the orchestrator body after extraction
  assert.doesNotMatch(text, /_brownfield_advisory_shown/, "brownfield sentinel must not be inline in orchestrator body");
  assert.doesNotMatch(text, /findings_summary/, "4R sentinel must not be inline in orchestrator body");
  assert.doesNotMatch(text, /federation-baseline-orchestrator/, "federation sentinel must not be inline in orchestrator body");
  assert.doesNotMatch(text, /planExecution/, "lifecycle sentinel planExecution must not be inline in orchestrator body");
  assert.doesNotMatch(text, /before-task\.occurrences/, "lifecycle sentinel before-task.occurrences must not be inline in orchestrator body");
  assert.doesNotMatch(text, /Two-place override/, "archive sentinel Two-place override must not be inline in orchestrator body");
  assert.doesNotMatch(text, /parseQualityGates/, "archive sentinel parseQualityGates must not be inline in orchestrator body");
  assert.doesNotMatch(text, /"label": "ask-on-risk"/, "delivery-strategy question JSON must not be inline in orchestrator body");
  assert.doesNotMatch(text, /"label": "Chained PRs"/, "review-workload question JSON must not be inline in orchestrator body");
  assert.doesNotMatch(text, /"blocker_type": "needs_user_decision"/, "blocked-envelope JSON example must not be inline in orchestrator body");
  assert.doesNotMatch(text, /Intercept the block/, "gaps-resolution handler steps must not be inline in orchestrator body");
  assert.doesNotMatch(text, /questions_asked/, "clarify gate handling steps must not be inline in orchestrator body");
  assert.doesNotMatch(text, /Acknowledge and close the route anyway/, "document-route J5 halt gate wording must not be inline in orchestrator body");
  assert.doesNotMatch(text, /recursively diff the destination/, "archive move-completion sentinel 'recursively diff the destination' must not be inline in orchestrator body");
  assert.doesNotMatch(text, /halt with the source directory left intact/, "archive move-completion sentinel 'halt with the source directory left intact' must not be inline in orchestrator body");

  // Pointer table: extract skills/_shared/*.md refs and verify each resolves to an existing file
  const refRegex = /`(skills\/_shared\/[^`]+\.md)`/g;
  const refs = [...text.matchAll(refRegex)].map((m) => m[1]);
  assert.ok(refs.length > 0, "orchestrator must reference at least one skills/_shared/*.md file via pointer table");
  for (const ref of refs) {
    assert.ok(
      fs.existsSync(path.join(ROOT, ref)),
      `pointer-table ref \`${ref}\` in orchestrator must resolve to an existing file`
    );
  }

  // Sentinel migration: each sentinel must be present in its designated _shared/ file
  const sentinelFiles = [
    { sentinel: "_brownfield_advisory_shown", file: "skills/_shared/route-brownfield.md" },
    { sentinel: "findings_summary", file: "skills/_shared/gate-4r-review.md" },
    { sentinel: "federation-baseline-orchestrator", file: "skills/_shared/route-federation.md" },
    { sentinel: "planExecution", file: "skills/_shared/dispatch-lifecycle-hooks.md" },
    { sentinel: "before-task.occurrences", file: "skills/_shared/dispatch-lifecycle-hooks.md" },
    { sentinel: "Two-place override", file: "skills/_shared/gate-archive-quality.md" },
    { sentinel: "parseQualityGates", file: "skills/_shared/gate-archive-quality.md" },
    { sentinel: "recursively diff the destination", file: "skills/_shared/gate-archive-quality.md" },
    { sentinel: "halt with the source directory left intact", file: "skills/_shared/gate-archive-quality.md" },
    { sentinel: '"label": "ask-on-risk"', file: "skills/_shared/question-shapes.md" },
    { sentinel: '"label": "Chained PRs"', file: "skills/_shared/question-shapes.md" },
    { sentinel: '"blocker_type": "needs_user_decision"', file: "skills/_shared/question-shapes.md" },
    { sentinel: "Intercept the block", file: "skills/_shared/gaps-resolution.md" },
    { sentinel: "questions_asked", file: "skills/_shared/clarify-routing.md" },
    { sentinel: "Acknowledge and close the route anyway", file: "skills/_shared/route-document.md" },
  ];
  for (const { sentinel, file } of sentinelFiles) {
    const filePath = path.join(ROOT, file);
    assert.ok(fs.existsSync(filePath), `${file} must exist (sentinel migration target)`);
    const fileText = fs.readFileSync(filePath, "utf8");
    const escapedSentinel = sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      fileText,
      new RegExp(escapedSentinel),
      `sentinel "${sentinel}" must be present in ${file} after migration`
    );
  }
});

"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { transform } = require("./target-transform.js");
const claude = require("./target-profiles/claude.js");
const copilotCli = require("./target-profiles/copilot-cli.js");
const vscode = require("./target-profiles/vscode.js");
const { parse, getField } = require("./frontmatter.js");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MODELS = {
  agents: {
    "sdd-apply": "default",
    "sdd-orchestrator": "premium",
    _default: "default",
  },
  tiers: {
    premium: { claude: "opus", vscode: ["Claude Opus 4.8 (copilot)"], "copilot-cli": "inherit" },
    default: { claude: "sonnet", vscode: ["Claude Sonnet 4.6 (copilot)"], "copilot-cli": "inherit" },
    cheap: { claude: "haiku" },
  },
};

function makeSource() {
  return [
    {
      path: ".claude-plugin/plugin.json",
      content: JSON.stringify(
        {
          name: "ospec-workflow",
          description: "desc",
          version: "2.1.0",
          author: { name: "x" },
          agents: "agents/",
          commands: "commands/",
          skills: "skills/",
          rules: "rules/",
          hooks: "hooks/hooks.json",
          mcpServers: ".mcp.json",
        },
        null,
        2,
      ),
    },
    {
      path: "hooks/hooks.json",
      content: JSON.stringify(
        {
          hooks: {
            SessionStart: [{ type: "command", command: "node x.js" }],
            PreToolUse: [{ type: "command", command: "node y.js", timeout: 5 }],
          },
        },
        null,
        2,
      ),
    },
    {
      path: "agents/sdd-apply.agent.md",
      content:
        "---\n" +
        "name: sdd-apply\n" +
        "tools: ['read', 'search', 'edit', 'vscode/askQuestions']\n" +
        "user-invocable: false\n" +
        "target: vscode\n" +
        "---\n" +
        "\n" +
        "Use read and search to explore. Ask via vscode/askQuestions.\n",
    },
    {
      path: "agents/sdd-orchestrator.agent.md",
      content:
        "---\n" + "name: sdd-orchestrator\n" + "tools: ['read']\n" + "target: vscode\n" + "---\n" + "\n" + "Orchestrator body.\n",
    },
    {
      path: "commands/sdd-apply.prompt.md",
      content:
        "---\n" +
        "name: sdd-apply\n" +
        "description: desc\n" +
        "agent: sdd-orchestrator\n" +
        "target: vscode\n" +
        "---\n" +
        "\n" +
        "Run apply for ${input:changeName} now. Also ${input}.\n",
    },
    {
      path: "rules/sdd-openspec.instructions.md",
      content: "---\n" + "name: rules\n" + "---\n" + "\n" + "ALWAYS use OpenSpec.\n",
    },
    { path: "skills/foo/SKILL.md", content: "---\nname: foo\n---\n\nbody\n" },
  ];
}

function find(out, path) {
  return out.files.find((f) => f.path === path);
}

// ---------------------------------------------------------------------------
// Requirement: Pure Transform Contract
// ---------------------------------------------------------------------------

test("transform is idempotent: same inputs yield equal outputs", () => {
  const a = transform({ files: makeSource(), profile: claude, models: MODELS });
  const b = transform({ files: makeSource(), profile: claude, models: MODELS });
  assert.deepEqual(a, b);
});

test("transform does not mutate the input files collection", () => {
  const input = makeSource();
  const before = JSON.stringify(input);
  transform({ files: input, profile: claude, models: MODELS });
  assert.equal(JSON.stringify(input), before);
});

test("transform returns a new collection object", () => {
  const input = makeSource();
  const out = transform({ files: input, profile: claude, models: MODELS });
  assert.notEqual(out.files, input);
});

// ---------------------------------------------------------------------------
// Requirement: Manifest Reshaping
// ---------------------------------------------------------------------------

test("claude manifest omits string component paths and drops rules", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const m = JSON.parse(find(out, ".claude-plugin/plugin.json").content);
  for (const k of ["agents", "commands", "skills", "hooks", "mcpServers", "rules"]) {
    assert.ok(!(k in m), `manifest must not contain ${k}`);
  }
  assert.equal(m.name, "ospec-workflow");
  assert.equal(m.version, "2.1.0");
});

test("manifest reshaping is driven by the profile descriptor (copilot-cli keeps component paths, drops rules)", () => {
  const out = transform({ files: makeSource(), profile: copilotCli, models: MODELS });
  const m = JSON.parse(find(out, ".claude-plugin/plugin.json").content);
  assert.equal(m.agents, "agents/");
  assert.ok(!("rules" in m));
});

// ---------------------------------------------------------------------------
// Requirement: Hooks Shape Transformation
// ---------------------------------------------------------------------------

test("claude nests flat event entries preserving type/command/timeout", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const h = JSON.parse(find(out, "hooks/hooks.json").content);
  assert.deepEqual(h.hooks.SessionStart, [{ hooks: [{ type: "command", command: "node x.js" }] }]);
  assert.deepEqual(h.hooks.PreToolUse, [{ hooks: [{ type: "command", command: "node y.js", timeout: 5 }] }]);
});

test("copilot-cli leaves hooks flat (no nested shape)", () => {
  const out = transform({ files: makeSource(), profile: copilotCli, models: MODELS });
  const h = JSON.parse(find(out, "hooks/hooks.json").content);
  assert.deepEqual(h.hooks.SessionStart, [{ type: "command", command: "node x.js" }]);
});

// ---------------------------------------------------------------------------
// Requirement: File Extension Mapping
// ---------------------------------------------------------------------------

test("claude renames agent and command files to .md", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  assert.ok(find(out, "agents/sdd-apply.md"));
  assert.ok(find(out, "commands/sdd-apply.md"));
  assert.ok(!find(out, "agents/sdd-apply.agent.md"));
  assert.ok(!find(out, "commands/sdd-apply.prompt.md"));
});

test("copilot-cli preserves the agent and command suffixes", () => {
  const out = transform({ files: makeSource(), profile: copilotCli, models: MODELS });
  assert.ok(find(out, "agents/sdd-apply.agent.md"));
  assert.ok(find(out, "commands/sdd-apply.prompt.md"));
});

// ---------------------------------------------------------------------------
// Requirement: Tool-Name Substitution
// ---------------------------------------------------------------------------

test("claude substitutes tool names in the frontmatter grant, expanding one-to-many", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const fm = parse(find(out, "agents/sdd-apply.md").content).frontmatter;
  assert.deepEqual(getField(fm, "tools").value, ["Read", "Grep", "Glob", "Edit", "AskUserQuestion"]);
});

test("claude substitutes tool names in prose using the primary for one-to-many", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const agent = find(out, "agents/sdd-apply.md").content;
  assert.match(agent, /Use Read and Grep to explore/);
  assert.match(agent, /Ask via AskUserQuestion/);
});

test("copilot-cli maps the question tool to ask_user", () => {
  const out = transform({ files: makeSource(), profile: copilotCli, models: MODELS });
  const agent = find(out, "agents/sdd-apply.agent.md").content;
  assert.match(agent, /Ask via ask_user/);
});

test("no vscode/ namespaced strings remain in a claude tree", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const all = out.files.map((f) => f.content).join("\n");
  assert.doesNotMatch(all, /vscode\//);
});

test("no vscode/ namespaced strings remain in a copilot-cli tree", () => {
  const out = transform({ files: makeSource(), profile: copilotCli, models: MODELS });
  const all = out.files.map((f) => f.content).join("\n");
  assert.doesNotMatch(all, /vscode\//);
});

// ---------------------------------------------------------------------------
// Requirement: Command Variable and Routing Transformation
// ---------------------------------------------------------------------------

test("claude rewrites ${input} to $ARGUMENTS", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const cmd = find(out, "commands/sdd-apply.md").content;
  assert.match(cmd, /\$ARGUMENTS/);
  assert.doesNotMatch(cmd, /\$\{input\}/);
});

test("claude rewrites ${input:name} to $name plus a frontmatter declaration", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const cmd = find(out, "commands/sdd-apply.md").content;
  assert.match(cmd, /\$changeName/);
  assert.doesNotMatch(cmd, /\$\{input:changeName\}/);
  const fm = parse(cmd).frontmatter;
  assert.ok(getField(fm, "argument-hint"));
  assert.match(getField(fm, "argument-hint").value, /changeName/);
});

test("claude preserves agent routing and adds context: fork", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const fm = parse(find(out, "commands/sdd-apply.md").content).frontmatter;
  assert.equal(getField(fm, "agent").value, "sdd-orchestrator");
  assert.equal(getField(fm, "context").value, "fork");
});

// ---------------------------------------------------------------------------
// Requirement: Frontmatter Key Stripping
// ---------------------------------------------------------------------------

test("claude strips target, user-invocable from agent frontmatter", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const fm = parse(find(out, "agents/sdd-apply.md").content).frontmatter;
  assert.equal(getField(fm, "target"), null);
  assert.equal(getField(fm, "user-invocable"), null);
});

test("copilot-cli strips the target key", () => {
  const out = transform({ files: makeSource(), profile: copilotCli, models: MODELS });
  const fm = parse(find(out, "agents/sdd-apply.agent.md").content).frontmatter;
  assert.equal(getField(fm, "target"), null);
});

// ---------------------------------------------------------------------------
// Requirement: Rules Inlining
// ---------------------------------------------------------------------------

test("claude inlines rules content into the orchestrator and drops the rules dir", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  assert.ok(!out.files.some((f) => f.path.startsWith("rules/")));
  const orch = find(out, "agents/sdd-orchestrator.md").content;
  assert.match(orch, /ALWAYS use OpenSpec/);
});

test("vscode keeps the rules directory (identity transform)", () => {
  const out = transform({ files: makeSource(), profile: vscode, models: MODELS });
  assert.ok(out.files.some((f) => f.path === "rules/sdd-openspec.instructions.md"));
});

// ---------------------------------------------------------------------------
// Model resolution
// ---------------------------------------------------------------------------

test("claude adds the resolved model alias to agents", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const fm = parse(find(out, "agents/sdd-apply.md").content).frontmatter;
  assert.equal(getField(fm, "model").value, "sonnet");
});

test("copilot-cli omits model (inherit)", () => {
  const out = transform({ files: makeSource(), profile: copilotCli, models: MODELS });
  const fm = parse(find(out, "agents/sdd-apply.agent.md").content).frontmatter;
  assert.equal(getField(fm, "model"), null);
});

test("vscode does not inject a model key (source intentionally omits it)", () => {
  const out = transform({ files: makeSource(), profile: vscode, models: MODELS });
  const fm = parse(find(out, "agents/sdd-apply.agent.md").content).frontmatter;
  assert.equal(getField(fm, "model"), null);
});

// ---------------------------------------------------------------------------
// Requirement: Source Non-Regression (passthrough files untouched)
// ---------------------------------------------------------------------------

test("unrelated files pass through unchanged", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  assert.equal(find(out, "skills/foo/SKILL.md").content, "---\nname: foo\n---\n\nbody\n");
});

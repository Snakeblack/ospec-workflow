"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { transform, serializeAgentToml } = require("./target-transform.js");
const claude = require("./target-profiles/claude.js");
const vscode = require("./target-profiles/vscode.js");
const githubCopilot = require("./target-profiles/github-copilot.js");
const opencode = require("./target-profiles/opencode.js");
const codex = require("./target-profiles/codex.js");
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
    premium: { claude: "opus", vscode: ["Claude Opus 4.8 (copilot)"], opencode: "anthropic/claude-opus-4-8" },
    default: { claude: "sonnet", vscode: ["Claude Sonnet 4.6 (copilot)"], opencode: "anthropic/claude-sonnet-4-6" },
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
        "Use `read` and `search` to explore. Ask via `vscode/askQuestions`. Any phase agent runs read-only.\n",
    },
    {
      path: "agents/sdd-orchestrator.agent.md",
      content:
        "---\n" +
        "name: sdd-orchestrator\n" +
        "description: Coordinates SDD.\n" +
        "tools: ['read']\n" +
        "target: vscode\n" +
        "---\n" +
        "\n" +
        "Orchestrator body. Delegate to each phase agent. Ask via `vscode/askQuestions`.\n",
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
      content: "---\n" + "name: rules\n" + "---\n" + "\n" + "ALWAYS use OpenSpec. For blocking decisions use `vscode/askQuestions`.\n",
    },
    {
      path: "skills/foo/SKILL.md",
      content: "---\nname: foo\ndescription: d\n---\n\nbody. Ask via `vscode/askQuestions` when blocked.\n",
    },
    {
      // Pre-existing context-doc skill that shares its base name with
      // commands/sdd-apply.prompt.md above — reproduces the real-repo
      // collision (15/18 commands share a base name with a context-doc
      // skill) so the namespace separation (skills/commands/<name>/) is
      // exercised even by the in-memory unit fixture.
      path: "skills/sdd-apply/SKILL.md",
      content: "---\nname: sdd-apply\ndescription: context doc\n---\n\nThis is the phase-agent context document, not a command.\n",
    },
    {
      path: ".mcp.json",
      content: JSON.stringify({ mcpServers: { context7: { type: "stdio", command: "npx" } } }, null, 2),
    },
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

test("transform output is sorted by path and independent of input order", () => {
  const src = makeSource();
  const a = transform({ files: src, profile: claude, models: MODELS }).files.map((f) => f.path);
  const b = transform({ files: [...src].reverse(), profile: claude, models: MODELS }).files.map((f) => f.path);

  assert.deepEqual(a, b, "output order must not depend on input order");
  assert.deepEqual(a, [...a].sort(), "output must be sorted by path");
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

test("vscode (identity) leaves the manifest untouched", () => {
  const out = transform({ files: makeSource(), profile: vscode, models: MODELS });
  const m = JSON.parse(find(out, ".claude-plugin/plugin.json").content);
  assert.equal(m.agents, "agents/");
  assert.equal(m.rules, "rules/");
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

test("vscode leaves hooks flat (identity)", () => {
  const out = transform({ files: makeSource(), profile: vscode, models: MODELS });
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

test("vscode preserves the agent and command suffixes (identity)", () => {
  const out = transform({ files: makeSource(), profile: vscode, models: MODELS });
  assert.ok(find(out, "agents/sdd-apply.agent.md"));
  assert.ok(find(out, "commands/sdd-apply.prompt.md"));
});

// ---------------------------------------------------------------------------
// Requirement: Tool-Name Substitution (context-aware)
// ---------------------------------------------------------------------------

test("claude substitutes tool names in the frontmatter grant, expanding one-to-many", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const fm = parse(find(out, "agents/sdd-apply.md").content).frontmatter;
  assert.deepEqual(getField(fm, "tools").value, ["Read", "Grep", "Glob", "Edit", "Write", "AskUserQuestion"]);
});

test("claude substitutes backticked tool references in prose, primary for one-to-many", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const agent = find(out, "agents/sdd-apply.md").content;
  assert.match(agent, /Use `Read` and `Grep` to explore/);
  assert.match(agent, /Ask via `AskUserQuestion`/);
});

test("claude does NOT corrupt the generic word 'agent' in bare prose", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const agent = find(out, "agents/sdd-apply.md").content;
  assert.match(agent, /Any phase agent runs read-only/); // unchanged concept word
  assert.doesNotMatch(agent, /phase Agent/);
});

test("no vscode/ namespaced strings remain anywhere in a claude tree (agents, commands, skills, inlined rules)", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const all = out.files.map((f) => f.content).join("\n");
  assert.doesNotMatch(all, /vscode\//);
});

test("skills passthrough content is tool-substituted (CRITICAL-1 guard)", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const skill = find(out, "skills/foo/SKILL.md").content;
  assert.match(skill, /Ask via `AskUserQuestion`/);
  assert.doesNotMatch(skill, /vscode\//);
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

test("claude rewrites ${input:name} to $name and declares it in the arguments frontmatter", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const cmd = find(out, "commands/sdd-apply.md").content;
  assert.match(cmd, /\$changeName/);
  assert.doesNotMatch(cmd, /\$\{input:changeName\}/);
  const fm = parse(cmd).frontmatter;
  // `arguments` is what actually enables `$name` substitution in Claude
  assert.equal(getField(fm, "arguments").value, "changeName");
  // argument-hint is the autocomplete hint (plain name, not a YAML array)
  assert.equal(getField(fm, "argument-hint").value, "changeName");
});

test("claude drops the inert agent:/context: command routing keys", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const fm = parse(find(out, "commands/sdd-apply.md").content).frontmatter;
  assert.equal(getField(fm, "agent"), null);
  assert.equal(getField(fm, "context"), null);
});

// ---------------------------------------------------------------------------
// Requirement: Frontmatter Key Stripping
// ---------------------------------------------------------------------------

test("claude strips target but preserves user-invocable in agent frontmatter", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const fm = parse(find(out, "agents/sdd-apply.md").content).frontmatter;
  assert.equal(getField(fm, "target"), null);
  assert.equal(getField(fm, "user-invocable").value, "false");
});

// ---------------------------------------------------------------------------
// Requirement: Orchestrator Delivery (claude → skill)
// ---------------------------------------------------------------------------

test("claude emits the orchestrator as a skill, not a sub-agent", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  assert.ok(find(out, "skills/sdd-orchestrator/SKILL.md"), "orchestrator skill must exist");
  assert.ok(!find(out, "agents/sdd-orchestrator.md"), "orchestrator must NOT be a sub-agent");
});

test("the orchestrator skill carries name + description and the inlined rules, with no model/tools/target", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const skill = find(out, "skills/sdd-orchestrator/SKILL.md").content;
  const fm = parse(skill).frontmatter;
  assert.equal(getField(fm, "name").value, "sdd-orchestrator");
  assert.ok(getField(fm, "description"));
  assert.equal(getField(fm, "model"), null);
  assert.equal(getField(fm, "tools"), null);
  assert.equal(getField(fm, "target"), null);
  assert.match(skill, /ALWAYS use OpenSpec/); // inlined rule
  assert.doesNotMatch(skill, /vscode\//); // inlined rule was tool-substituted
});

// ---------------------------------------------------------------------------
// Requirement: Rules Inlining
// ---------------------------------------------------------------------------

test("claude drops the rules dir (content inlined into the orchestrator skill)", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  assert.ok(!out.files.some((f) => f.path.startsWith("rules/")));
});

test("vscode keeps the rules directory (identity transform)", () => {
  const out = transform({ files: makeSource(), profile: vscode, models: MODELS });
  assert.ok(out.files.some((f) => f.path === "rules/sdd-openspec.instructions.md"));
});

// ---------------------------------------------------------------------------
// Model resolution
// ---------------------------------------------------------------------------

test("claude adds the resolved model alias to phase agents", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const fm = parse(find(out, "agents/sdd-apply.md").content).frontmatter;
  assert.equal(getField(fm, "model").value, "sonnet");
});

test("vscode injects resolved model keys from models.yaml", () => {
  const out = transform({ files: makeSource(), profile: vscode, models: MODELS });
  const fm = parse(find(out, "agents/sdd-apply.agent.md").content).frontmatter;
  assert.deepEqual(getField(fm, "model").value, ["Claude Sonnet 4.6 (copilot)"]);
});

// ---------------------------------------------------------------------------
// Target: github-copilot (.github/ layout)
// ---------------------------------------------------------------------------

test("github-copilot emits agents under .github/agents with target: github-copilot", () => {
  const out = transform({ files: makeSource(), profile: githubCopilot, models: MODELS });
  const agent = find(out, ".github/agents/sdd-apply.agent.md");
  assert.ok(agent, "agent must be under .github/agents/");
  assert.ok(!find(out, "agents/sdd-apply.agent.md"));
  assert.ok(!find(out, "agents/sdd-apply.md"));
  const fm = parse(agent.content).frontmatter;
  assert.equal(getField(fm, "target").value, "github-copilot");
  assert.equal(getField(fm, "model"), null); // no model injection
});

test("github-copilot keeps valid tool aliases and maps vscode/askQuestions to ask_user", () => {
  const out = transform({ files: makeSource(), profile: githubCopilot, models: MODELS });
  const fm = parse(find(out, ".github/agents/sdd-apply.agent.md").content).frontmatter;
  assert.deepEqual(getField(fm, "tools").value, ["read", "search", "edit", "ask_user"]);
  const body = find(out, ".github/agents/sdd-apply.agent.md").content;
  assert.match(body, /`ask_user`/);
});

test("github-copilot orchestrator stays a normal agent (not a skill)", () => {
  const out = transform({ files: makeSource(), profile: githubCopilot, models: MODELS });
  assert.ok(find(out, ".github/agents/sdd-orchestrator.agent.md"));
  assert.ok(!find(out, "skills/sdd-orchestrator/SKILL.md"));
});

test("github-copilot emits prompts under .github/prompts, keeping ${input:..} and agent routing", () => {
  const out = transform({ files: makeSource(), profile: githubCopilot, models: MODELS });
  const cmd = find(out, ".github/prompts/sdd-apply.prompt.md");
  assert.ok(cmd, "command must be under .github/prompts/");
  assert.match(cmd.content, /\$\{input:changeName\}/); // prompt-file variable syntax preserved
  const fm = parse(cmd.content).frontmatter;
  assert.equal(getField(fm, "agent").value, "sdd-orchestrator"); // routing kept (valid here)
  assert.equal(getField(fm, "target"), null); // not a prompt-file field
});

test("github-copilot turns rules into .github/instructions/*.instructions.md with applyTo", () => {
  const out = transform({ files: makeSource(), profile: githubCopilot, models: MODELS });
  const instr = find(out, ".github/instructions/sdd-openspec.instructions.md");
  assert.ok(instr, "rule must become an instruction file");
  assert.ok(!out.files.some((f) => f.path.startsWith("rules/")));
  const fm = parse(instr.content).frontmatter;
  assert.equal(getField(fm, "applyTo").value, "**");
  assert.match(instr.content, /ALWAYS use OpenSpec/);
});

test("github-copilot drops the plugin manifest but preserves skills (agents read them as files)", () => {
  const out = transform({ files: makeSource(), profile: githubCopilot, models: MODELS });
  assert.ok(!find(out, ".claude-plugin/plugin.json"));
  // Every SDD phase agent has a "Skills to load before work" section pointing at
  // skills/<phase>/SKILL.md and skills/_shared/*.md. If skills are dropped those
  // references dangle, so the Copilot distribution MUST ship the skill tree.
  const skill = find(out, "skills/foo/SKILL.md");
  assert.ok(skill, "skills must ship so agent 'Skills to load' references resolve");
  assert.doesNotMatch(skill.content, /vscode\//); // tool-substituted on the way through
});

test("github-copilot keeps .mcp.json unchanged (project-level MCP)", () => {
  const out = transform({ files: makeSource(), profile: githubCopilot, models: MODELS });
  const mcp = find(out, ".mcp.json");
  assert.ok(mcp, ".mcp.json must be kept at the repo root");
  assert.deepEqual(JSON.parse(mcp.content), { mcpServers: { context7: { type: "stdio", command: "npx" } } });
});

test("github-copilot reshapes hooks into .github/hooks/hooks.json with the Copilot schema", () => {
  const out = transform({ files: makeSource(), profile: githubCopilot, models: MODELS });
  assert.ok(!find(out, "hooks/hooks.json"));
  const hooks = find(out, ".github/hooks/hooks.json");
  assert.ok(hooks, "hooks must move to .github/hooks/hooks.json");
  const parsed = JSON.parse(hooks.content);
  assert.equal(parsed.version, 1);
  // PascalCase events -> camelCase
  assert.ok(parsed.hooks.sessionStart, "SessionStart -> sessionStart");
  assert.ok(parsed.hooks.preToolUse, "PreToolUse -> preToolUse");
  // command -> bash/powershell, timeout -> timeoutSec
  assert.equal(parsed.hooks.sessionStart[0].type, "command");
  assert.equal(parsed.hooks.sessionStart[0].bash, "node x.js");
  assert.equal(parsed.hooks.preToolUse[0].timeoutSec, 5);
});

test("no vscode/ namespaced strings remain anywhere in a github-copilot tree", () => {
  const out = transform({ files: makeSource(), profile: githubCopilot, models: MODELS });
  const all = out.files.map((f) => f.content).join("\n");
  assert.doesNotMatch(all, /vscode\//);
});

test("github-copilot does not mutate the input collection", () => {
  const input = makeSource();
  const before = JSON.stringify(input);
  transform({ files: input, profile: githubCopilot, models: MODELS });
  assert.equal(JSON.stringify(input), before);
});

// ---------------------------------------------------------------------------
// Requirement: opencode target
// ---------------------------------------------------------------------------

test("opencode remaps agents/commands under .opencode/ as flat .md", () => {
  const out = transform({ files: makeSource(), profile: opencode, models: MODELS });
  assert.ok(find(out, ".opencode/agents/sdd-apply.md"), "agent under .opencode/agents");
  assert.ok(find(out, ".opencode/commands/sdd-apply.md"), "command under .opencode/commands");
  assert.equal(find(out, "agents/sdd-apply.agent.md"), undefined, "no source-path residue");
});

test("opencode emits the tools grant as a YAML map and expands abstract tools", () => {
  const out = transform({ files: makeSource(), profile: opencode, models: MODELS });
  const apply = find(out, ".opencode/agents/sdd-apply.md").content;
  // read/search/edit/vscode/askQuestions -> read, grep, glob, edit, write, question
  assert.match(apply, /tools:\n(?:\s{2}\w+: true\n)+/);
  for (const tool of ["read", "grep", "glob", "edit", "write", "question"]) {
    assert.match(apply, new RegExp(`\n {2}${tool}: true\n`), `tools map must enable ${tool}`);
  }
  assert.doesNotMatch(apply, /tools: \[/, "tools must be a map, not an array");
});

test("opencode derives mode from user-invocable (subagent worker vs primary entry)", () => {
  const out = transform({ files: makeSource(), profile: opencode, models: MODELS });
  assert.match(find(out, ".opencode/agents/sdd-apply.md").content, /\nmode: subagent\n/);
  assert.match(find(out, ".opencode/agents/ospec-workflow.md").content, /\nmode: primary\n/);
});

test("opencode injects provider/model slugs by tier", () => {
  const out = transform({ files: makeSource(), profile: opencode, models: MODELS });
  assert.match(find(out, ".opencode/agents/ospec-workflow.md").content, /\nmodel: anthropic\/claude-opus-4-8\n/);
  assert.match(find(out, ".opencode/agents/sdd-apply.md").content, /\nmodel: anthropic\/claude-sonnet-4-6\n/);
});

test("opencode commands keep agent routing, drop name, and use positional/$ARGUMENTS", () => {
  const out = transform({ files: makeSource(), profile: opencode, models: MODELS });
  const cmd = find(out, ".opencode/commands/sdd-apply.md").content;
  assert.match(cmd, /\nagent: ospec-workflow\n/, "keep agent routing");
  assert.doesNotMatch(cmd, /\nname:/, "drop name (filename is the id)");
  assert.match(cmd, /\$1/, "named ${input:changeName} -> $1");
  assert.match(cmd, /\$ARGUMENTS/, "bare ${input} -> $ARGUMENTS");
  assert.doesNotMatch(cmd, /\$\{input/, "no VS Code input placeholders remain");
});

test("opencode renames orchestrator agent and substitutes its name in prose/frontmatter", () => {
  const out = transform({ files: makeSource(), profile: opencode, models: MODELS });
  // check agent file renamed
  assert.ok(find(out, ".opencode/agents/ospec-workflow.md"), "orchestrator agent renamed");
  assert.ok(!find(out, ".opencode/agents/sdd-orchestrator.md"), "old orchestrator name removed");
  
  // check frontmatter name updated
  const agentContent = find(out, ".opencode/agents/ospec-workflow.md").content;
  const fm = parse(agentContent).frontmatter;
  assert.equal(getField(fm, "name").value, "ospec-workflow");

  // check body prose substitution
  assert.match(agentContent, /Orchestrator body\. Delegate to each phase agent/);
  
  // check commands routing name update and body/description substitution
  const cmdContent = find(out, ".opencode/commands/sdd-apply.md").content;
  const cmdFm = parse(cmdContent).frontmatter;
  assert.equal(getField(cmdFm, "agent").value, "ospec-workflow");
  assert.equal(getField(cmdFm, "description").value, "desc");
});

test("opencode synthesizes opencode.json with mcp (from .mcp.json) and instructions glob", () => {
  const out = transform({ files: makeSource(), profile: opencode, models: MODELS });
  const cfg = JSON.parse(find(out, "opencode.json").content);
  assert.equal(cfg.$schema, "https://opencode.ai/config.json");
  assert.deepEqual(cfg.mcp.context7, { type: "local", command: ["npx"], enabled: true });
  assert.deepEqual(cfg.instructions, [".opencode/instructions/*.md"]);
  assert.equal(find(out, ".mcp.json"), undefined, ".mcp.json is consumed, not shipped");
});

test("opencode rules become plain instruction files (frontmatter dropped)", () => {
  const out = transform({ files: makeSource(), profile: opencode, models: MODELS });
  const rule = find(out, ".opencode/instructions/sdd-openspec.instructions.md");
  assert.ok(rule, "rule emitted under .opencode/instructions");
  assert.doesNotMatch(rule.content, /^---/, "instruction file carries no frontmatter");
  assert.match(rule.content, /^ALWAYS use OpenSpec/, "body preserved");
});

test("opencode emits the plugin shim and drops the shell hooks.json", () => {
  const out = transform({ files: makeSource(), profile: opencode, models: MODELS });
  const plugin = find(out, ".opencode/plugins/ospec.js");
  assert.ok(plugin, "plugin shim emitted");
  // The plugin now calls the Go binary via spawnSync — not require() of JS hook files.
  assert.match(plugin.content, /spawnSync/, "plugin must use spawnSync");
  assert.match(plugin.content, /ospec-hooks/, "plugin must reference the binary");
  assert.match(plugin.content, /pre-tool-use/, "plugin must bridge pre-tool-use subcommand");
  assert.match(plugin.content, /session-start/, "plugin must bridge session-start subcommand");
  assert.equal(find(out, "hooks/hooks.json"), undefined, "shell hooks.json dropped");
});

test("opencode drops the Claude plugin manifest", () => {
  const out = transform({ files: makeSource(), profile: opencode, models: MODELS });
  assert.equal(find(out, ".claude-plugin/plugin.json"), undefined);
});

test("no vscode/ namespaced strings remain anywhere in an opencode tree", () => {
  const out = transform({ files: makeSource(), profile: opencode, models: MODELS });
  const all = out.files.map((f) => f.content).join("\n");
  assert.doesNotMatch(all, /vscode\//);
});

test("opencode does not mutate the input collection", () => {
  const input = makeSource();
  const before = JSON.stringify(input);
  transform({ files: input, profile: opencode, models: MODELS });
  assert.equal(JSON.stringify(input), before);
});

// ---------------------------------------------------------------------------
// Requirement: MCP Placeholder Normalization (per-profile opt-in)
// ---------------------------------------------------------------------------

test("claude rewrites ${input:NAME} in .mcp.json env to ${NAME:-} (no ${input: residual)", () => {
  const files = [
    {
      path: ".mcp.json",
      content: JSON.stringify(
        {
          mcpServers: {
            context7: {
              type: "stdio",
              command: "npx",
              args: ["@upstash/context7-mcp"],
              env: { CONTEXT7_API_KEY: "${input:CONTEXT7_API_KEY}" },
            },
          },
        },
        null,
        2,
      ),
    },
  ];
  const out = transform({ files, profile: claude, models: MODELS });
  const mcp = find(out, ".mcp.json");
  assert.ok(mcp, ".mcp.json must be present in claude output");
  const obj = JSON.parse(mcp.content);
  assert.equal(obj.mcpServers.context7.env.CONTEXT7_API_KEY, "${CONTEXT7_API_KEY:-}");
  assert.doesNotMatch(mcp.content, /\$\{input:/, "no ${input: residual in claude .mcp.json");
});

test("github-copilot rewrites ${input:NAME} in .mcp.json env to ${NAME:-} (no ${input: residual)", () => {
  const files = [
    {
      path: ".mcp.json",
      content: JSON.stringify(
        {
          mcpServers: {
            context7: {
              type: "stdio",
              command: "npx",
              args: ["@upstash/context7-mcp"],
              env: { CONTEXT7_API_KEY: "${input:CONTEXT7_API_KEY}" },
            },
          },
        },
        null,
        2,
      ),
    },
  ];
  const out = transform({ files, profile: githubCopilot, models: MODELS });
  const mcp = find(out, ".mcp.json");
  assert.ok(mcp, ".mcp.json must be present in github-copilot output");
  const obj = JSON.parse(mcp.content);
  assert.equal(obj.mcpServers.context7.env.CONTEXT7_API_KEY, "${CONTEXT7_API_KEY:-}");
  assert.doesNotMatch(mcp.content, /\$\{input:/, "no ${input: residual in github-copilot .mcp.json");
});

test("claude normalizes ${input:KEY} across env, args, url, and headers — no ${input: in any field", () => {
  const files = [
    {
      path: ".mcp.json",
      content: JSON.stringify(
        {
          mcpServers: {
            svc: {
              type: "stdio",
              command: "node",
              args: ["--env=${input:ARG_KEY}"],
              env: { MY_KEY: "${input:MY_KEY}" },
              url: "https://host?token=${input:URL_KEY}",
              headers: { Authorization: "Bearer ${input:HDR_KEY}" },
            },
          },
        },
        null,
        2,
      ),
    },
  ];
  const out = transform({ files, profile: claude, models: MODELS });
  const mcp = find(out, ".mcp.json");
  assert.ok(mcp, ".mcp.json must be present");
  const obj = JSON.parse(mcp.content);
  assert.equal(obj.mcpServers.svc.env.MY_KEY, "${MY_KEY:-}", "env value must be rewritten");
  assert.equal(obj.mcpServers.svc.args[0], "--env=${ARG_KEY:-}", "args value must be rewritten");
  assert.equal(obj.mcpServers.svc.url, "https://host?token=${URL_KEY:-}", "url value must be rewritten");
  assert.equal(obj.mcpServers.svc.headers.Authorization, "Bearer ${HDR_KEY:-}", "headers value must be rewritten");
  assert.doesNotMatch(mcp.content, /\$\{input:/, "no ${input: residual in any field");
});

test("vscode preserves ${input:NAME} in .mcp.json verbatim — no normalization opt-in", () => {
  const files = [
    {
      path: ".mcp.json",
      content: JSON.stringify(
        {
          mcpServers: {
            context7: {
              type: "stdio",
              command: "npx",
              args: ["@upstash/context7-mcp"],
              env: { CONTEXT7_API_KEY: "${input:CONTEXT7_API_KEY}" },
            },
          },
        },
        null,
        2,
      ),
    },
  ];
  const out = transform({ files, profile: vscode, models: MODELS });
  const mcp = find(out, ".mcp.json");
  assert.ok(mcp, ".mcp.json must be present in vscode output");
  assert.match(mcp.content, /\$\{input:CONTEXT7_API_KEY\}/, "vscode must preserve ${input:NAME} verbatim");
});

test("opencode rewrites MCP env/header placeholders to {env:NAME}", () => {
  const files = [
    {
      path: ".mcp.json",
      content: JSON.stringify({
        mcpServers: {
          ctx: { type: "stdio", command: "npx", args: ["x"], env: { API_KEY: "${input:API_KEY}", BARE: "${BARE}" } },
          remote: { url: "https://h/mcp", headers: { Authorization: "Bearer ${env:TOKEN}" } },
        },
      }),
    },
    { path: "rules/r.instructions.md", content: "---\nname: r\n---\n\nbody\n" },
  ];
  const out = transform({ files, profile: opencode, models: MODELS });
  const cfg = JSON.parse(find(out, "opencode.json").content);
  assert.equal(cfg.mcp.ctx.environment.API_KEY, "{env:API_KEY}");
  assert.equal(cfg.mcp.ctx.environment.BARE, "{env:BARE}");
  assert.equal(cfg.mcp.remote.headers.Authorization, "Bearer {env:TOKEN}");
  assert.doesNotMatch(find(out, "opencode.json").content, /\$\{/, "no VS Code ${...} placeholders remain");
});

test("normalizeMcpPlaceholders does not mutate original input file or server objects (mutation guard)", () => {
  // Uses all four rewritten fields so every assignment branch in normalizeMcpPlaceholders executes.
  const mcpContent = JSON.stringify(
    {
      mcpServers: {
        svc: {
          type: "stdio",
          command: "node",
          args: ["--env=${input:ARG_KEY}"],
          env: { MY_KEY: "${input:MY_KEY}" },
          url: "https://host?token=${input:URL_KEY}",
          headers: { Authorization: "Bearer ${input:HDR_KEY}" },
        },
      },
    },
    null,
    2,
  );
  const files = [{ path: ".mcp.json", content: mcpContent }];
  // Snapshot the original file and its parsed server before transform.
  const originalFileRef = files[0];
  const originalContentSnapshot = originalFileRef.content;
  const originalServerSnapshot = JSON.parse(originalFileRef.content).mcpServers.svc;

  transform({ files, profile: claude, models: MODELS });

  // The file object in the input array must be untouched.
  assert.equal(files[0].content, originalContentSnapshot, "original file.content must be unchanged");
  assert.equal(files[0], originalFileRef, "same file object reference — not replaced");
  // The parsed server's fields must still hold the original ${input:...} values.
  const reparsed = JSON.parse(files[0].content).mcpServers.svc;
  assert.equal(reparsed.env.MY_KEY, "${input:MY_KEY}", "original env must be unchanged");
  assert.equal(reparsed.args[0], "--env=${input:ARG_KEY}", "original args must be unchanged");
  assert.equal(reparsed.url, "https://host?token=${input:URL_KEY}", "original url must be unchanged");
  assert.equal(reparsed.headers.Authorization, "Bearer ${input:HDR_KEY}", "original headers must be unchanged");
  // Snapshot deep-equal confirms no hidden mutation on the parsed objects either.
  assert.deepEqual(reparsed, originalServerSnapshot, "server object must deep-equal pre-transform snapshot");
});

test("normalization is idempotent: running transform twice on .mcp.json yields byte-identical output", () => {
  // f(f(x)) == f(x): the ${NAME:-} form must NOT be re-matched by the ${input:NAME} regex,
  // preventing double-nesting such as ${NAME:-:-}.
  const files = [
    {
      path: ".mcp.json",
      content: JSON.stringify(
        {
          mcpServers: {
            context7: {
              type: "stdio",
              command: "npx",
              args: ["@upstash/context7-mcp", "--env=${input:CONTEXT7_API_KEY}"],
              env: { CONTEXT7_API_KEY: "${input:CONTEXT7_API_KEY}" },
            },
          },
        },
        null,
        2,
      ),
    },
  ];
  // First pass — rewrite ${input:NAME} → ${NAME:-}.
  const out1 = transform({ files, profile: githubCopilot, models: MODELS });
  const normalizedContent = find(out1, ".mcp.json").content;

  // Second pass — feed the already-normalized content back through.
  const out2 = transform({ files: [{ path: ".mcp.json", content: normalizedContent }], profile: githubCopilot, models: MODELS });
  const twiceContent = find(out2, ".mcp.json").content;

  assert.equal(twiceContent, normalizedContent, "second transform must produce byte-identical output (no double-nesting)");
  assert.doesNotMatch(twiceContent, /:-:-/, "must not contain double-nested :-:- form");
});

test("toEnvExpansion rewrites two placeholders in a single string value — both normalized (triangulation)", () => {
  // Triangulation: a value with TWO ${input:...} tokens in one string.
  const files = [
    {
      path: ".mcp.json",
      content: JSON.stringify(
        {
          mcpServers: {
            svc: {
              type: "stdio",
              command: "node",
              env: { COMBINED: "${input:A}-${input:B}" },
            },
          },
        },
        null,
        2,
      ),
    },
  ];
  const out = transform({ files, profile: claude, models: MODELS });
  const obj = JSON.parse(find(out, ".mcp.json").content);
  assert.equal(obj.mcpServers.svc.env.COMBINED, "${A:-}-${B:-}", "both placeholders must be normalized in one pass");
});

// ---------------------------------------------------------------------------
// Requirement: codex target (Bloque 5.1)
// ---------------------------------------------------------------------------

test("codex reshapes the manifest to an allowlist + interface at .codex-plugin/plugin.json", () => {
  const out = transform({ files: makeSource(), profile: codex, models: MODELS });
  assert.equal(find(out, ".claude-plugin/plugin.json"), undefined, "source manifest path must not survive");
  const bundle = find(out, ".codex-plugin/plugin.json");
  assert.ok(bundle, "renamed bundle must exist");
  const m = JSON.parse(bundle.content);
  assert.deepEqual(
    Object.keys(m).sort(),
    ["description", "hooks", "interface", "name", "skills", "version"],
  );
  assert.equal(m.interface.displayName, "ospec-workflow");
  assert.equal(find(out, ".mcp.json"), undefined, "Codex must use idempotent global MCP registration");
});

test("codex manifest keeps name/version/description metadata", () => {
  const out = transform({ files: makeSource(), profile: codex, models: MODELS });
  const bundle = JSON.parse(find(out, ".codex-plugin/plugin.json").content);
  assert.equal(bundle.name, "ospec-workflow");
  assert.equal(bundle.version, "2.1.0");
  assert.equal(bundle.description, "desc");
});

test("codex manifest component paths are rewritten to a safe ./-relative form", () => {
  const out = transform({ files: makeSource(), profile: codex, models: MODELS });
  const bundle = JSON.parse(find(out, ".codex-plugin/plugin.json").content);
  assert.equal(bundle.skills, "./skills/");
  assert.equal(bundle.mcpServers, undefined);
  assert.equal(bundle.hooks, "./hooks/hooks.json");
});

test("codex manifest rejects a component path containing a .. traversal segment", () => {
  const files = makeSource().map((file) =>
    file.path === ".claude-plugin/plugin.json"
      ? {
          path: file.path,
          content: JSON.stringify(
            { ...JSON.parse(file.content), skills: "../skills/" },
            null,
            2,
          ),
        }
      : file,
  );
  assert.throws(() => transform({ files, profile: codex, models: MODELS }), /traversal/);
});

test("codex manifest rejects an absolute component path", () => {
  const files = makeSource().map((file) =>
    file.path === ".claude-plugin/plugin.json"
      ? {
          path: file.path,
          content: JSON.stringify(
            { ...JSON.parse(file.content), hooks: "/etc/hooks.json" },
            null,
            2,
          ),
        }
      : file,
  );
  assert.throws(() => transform({ files, profile: codex, models: MODELS }), /absolute/);
});

test("codex emits agents as TOML outside the plugin bundle", () => {
  const out = transform({ files: makeSource(), profile: codex, models: MODELS });
  const toml = find(out, ".codex/agents/sdd-apply.toml");
  assert.ok(toml, "agent must be emitted as .codex/agents/sdd-apply.toml");
  assert.match(toml.content, /name = "sdd-apply"/);
  assert.match(toml.content, /developer_instructions = """/);
  assert.ok(!find(out, "agents/sdd-apply.agent.md"), "source-path residue must not survive");
  const bundle = JSON.parse(find(out, ".codex-plugin/plugin.json").content);
  assert.ok(!("agents" in bundle), "bundle must not reference agents");
});

test("codex TOML agent output path is ./-relative-safe (no leading slash, no .. segment)", () => {
  const out = transform({ files: makeSource(), profile: codex, models: MODELS });
  const toml = find(out, ".codex/agents/sdd-apply.toml");
  assert.ok(toml, "TOML agent file must be emitted");
  assert.ok(!toml.path.startsWith("/"), "TOML agent path must not be absolute");
  assert.ok(!toml.path.split("/").includes(".."), "TOML agent path must not contain a .. segment");
});

test("codex derives workspace-write sandbox_mode for an edit-capable agent, read-only otherwise", () => {
  const out = transform({ files: makeSource(), profile: codex, models: MODELS });
  const apply = find(out, ".codex/agents/sdd-apply.toml").content;
  assert.match(apply, /sandbox_mode = "workspace-write"/);
  const orchestrator = find(out, ".codex/agents/sdd-orchestrator.toml").content;
  assert.match(orchestrator, /sandbox_mode = "read-only"/);
});

test("codex omits model/model_reasoning_effort when models.yaml has no codex column (fail-soft)", () => {
  const out = transform({ files: makeSource(), profile: codex, models: MODELS });
  const apply = find(out, ".codex/agents/sdd-apply.toml").content;
  assert.doesNotMatch(apply, /^model\s*=/m);
  assert.doesNotMatch(apply, /^model_reasoning_effort\s*=/m);
});

test("codex populates model and model_reasoning_effort when codex column is present", () => {
  const customModels = {
    agents: {
      "sdd-apply": "default",
      "sdd-orchestrator": "premium",
      _default: "default",
    },
    tiers: {
      premium: {
        codex: {
          model: "gpt-5.6-sol",
          model_reasoning_effort: "high"
        }
      },
      default: {
        codex: "gpt-5.6-terra"
      }
    }
  };

  const out = transform({ files: makeSource(), profile: codex, models: customModels });
  const apply = find(out, ".codex/agents/sdd-apply.toml").content;
  assert.match(apply, /^model = "gpt-5.6-terra"/m);
  assert.doesNotMatch(apply, /^model_reasoning_effort\s*=/m);

  const orchestrator = find(out, ".codex/agents/sdd-orchestrator.toml").content;
  assert.match(orchestrator, /^model = "gpt-5.6-sol"/m);
  assert.match(orchestrator, /^model_reasoning_effort = "high"/m);
});

test("codex commands become invocable skills under skills/commands/, never a prompts/ path", () => {
  const out = transform({ files: makeSource(), profile: codex, models: MODELS });
  const skill = find(out, "skills/commands/sdd-apply/SKILL.md");
  assert.ok(skill, "command must be emitted as skills/commands/sdd-apply/SKILL.md");
  assert.ok(!out.files.some((f) => f.path.startsWith("prompts/")), "no prompts/ path must exist");
});

test("codex rewrites named ${input:x} to positional $1 and drops the agent: routing key with a prose spawn instruction", () => {
  const out = transform({ files: makeSource(), profile: codex, models: MODELS });
  const skill = find(out, "skills/commands/sdd-apply/SKILL.md").content;
  assert.match(skill, /\$1/);
  assert.doesNotMatch(skill, /\$\{input:/);
  const fm = parse(skill).frontmatter;
  assert.equal(getField(fm, "agent"), null, "agent: routing key must not appear in emitted frontmatter");
  assert.match(skill, /Spawn the `sdd-orchestrator` agent/);
});

test("codex does not collide the command-derived skill with a pre-existing context-doc skill of the same base name", () => {
  const out = transform({ files: makeSource(), profile: codex, models: MODELS });
  const commandSkill = find(out, "skills/commands/sdd-apply/SKILL.md");
  const contextDoc = find(out, "skills/sdd-apply/SKILL.md");
  assert.ok(commandSkill, "command-derived skill must exist at skills/commands/sdd-apply/SKILL.md");
  assert.ok(contextDoc, "pre-existing context-doc skill must survive at skills/sdd-apply/SKILL.md");
  assert.match(commandSkill.content, /Spawn the `sdd-orchestrator` agent/, "command-derived skill must carry the spawn instruction");
  assert.match(contextDoc.content, /phase-agent context document/, "context doc must be passed through unchanged");
  const commandFm = parse(commandSkill.content).frontmatter;
  assert.equal(getField(commandFm, "name").value, "sdd-apply", "invocation name must be the bare base name, unaffected by the commands/ prefix");
});

test("codex degrades vscode/askQuestions to a chat-protocol instruction, never a bare tool name", () => {
  const out = transform({ files: makeSource(), profile: codex, models: MODELS });
  const apply = find(out, ".codex/agents/sdd-apply.toml").content;
  assert.match(apply, /numbered plain-chat list/);
  assert.doesNotMatch(apply, /vscode\//);
});

test("codex front-loads a skill description whose trigger phrase starts past the 80-char budget", () => {
  const files = [
    {
      path: "commands/sdd-tasks.prompt.md",
      content:
        "---\n" +
        "name: sdd-tasks\n" +
        "description: \"For teams who want more context on how the review workload forecast for sdd-tasks actually behaves, this command builds it.\"\n" +
        "---\n" +
        "\n" +
        "body\n",
    },
  ];
  const out = transform({ files, profile: codex, models: MODELS });
  const fm = parse(find(out, "skills/commands/sdd-tasks/SKILL.md").content).frontmatter;
  const description = getField(fm, "description").value;
  assert.ok(description.toLowerCase().indexOf("sdd-tasks") < 80, "trigger phrase must be reordered within the first 80 chars");
});

test("codex leaves an already front-loaded description unchanged", () => {
  const out = transform({ files: makeSource(), profile: codex, models: MODELS });
  const fm = parse(find(out, "skills/commands/sdd-apply/SKILL.md").content).frontmatter;
  assert.equal(getField(fm, "description").value, "desc");
});

test("codex rules fold into a single synthesized AGENTS.md", () => {
  const out = transform({ files: makeSource(), profile: codex, models: MODELS });
  const agentsMd = find(out, "AGENTS.md");
  assert.ok(agentsMd, "AGENTS.md must be synthesized");
  assert.match(agentsMd.content, /ALWAYS use OpenSpec/);
  assert.ok(!out.files.some((f) => f.path.startsWith("rules/")), "rules/ source files must not survive");
});

test("no vscode/ namespaced strings remain anywhere in a codex tree", () => {
  const out = transform({ files: makeSource(), profile: codex, models: MODELS });
  const all = out.files.map((f) => f.content).join("\n");
  assert.doesNotMatch(all, /vscode\//);
});

test("codex does not mutate the input collection", () => {
  const input = makeSource();
  const before = JSON.stringify(input);
  transform({ files: input, profile: codex, models: MODELS });
  assert.equal(JSON.stringify(input), before);
});

// REQ-hooks-004: the codex wrapper emits a matcher+hooks group per event
// (exactly the five current events, no sixth), each hook entry carrying a
// POSIX command, a backslash/%PLUGIN_ROOT% commandWindows variant, and a
// fixed timeout.
test("codex target wraps hooks/hooks.json events in matcher+hooks groups with POSIX+Windows commands, exactly five events", () => {
  const files = [
    {
      path: ".claude-plugin/plugin.json",
      content: JSON.stringify({
        name: "ospec-workflow",
        hooks: "hooks/hooks.json"
      })
    },
    {
      path: "hooks/hooks.json",
      content: JSON.stringify({
        hooks: {
          SessionStart: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js session-start", timeout: 5 }],
          PreToolUse: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js pre-tool-use", timeout: 5 }],
          PreCompact: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js pre-compact", timeout: 5 }],
          SubagentStop: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js subagent-stop", timeout: 5 }],
          Stop: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js stop", timeout: 5 }]
        }
      })
    }
  ];

  const out = transform({ files, profile: codex, models: MODELS });
  const hooksFile = find(out, "hooks/hooks.json");
  assert.ok(hooksFile, "hooks/hooks.json must be generated");
  const parsed = JSON.parse(hooksFile.content);

  assert.ok(parsed.hooks, "hooks object must exist");
  assert.deepEqual(Object.keys(parsed.hooks).sort(), [
    "PreCompact",
    "PreToolUse",
    "SessionStart",
    "Stop",
    "SubagentStop"
  ], "exactly the five current Codex hook events, no sixth event");

  for (const event of ["SessionStart", "PreToolUse", "PreCompact", "SubagentStop", "Stop"]) {
    const group = parsed.hooks[event];
    assert.equal(group.length, 1, `${event} must carry one matcher+hooks group`);
    assert.equal(group[0].matcher, ".*", `${event} matcher must be ".*"`);
    assert.ok(Array.isArray(group[0].hooks), `${event}.hooks must be an array`);
  }

  const sessionStartHook = parsed.hooks.SessionStart[0].hooks[0];
  assert.equal(sessionStartHook.type, "command");
  assert.equal(sessionStartHook.command, 'OSPEC_CODEX_WRAPPER=1 node "$PLUGIN_ROOT/scripts/hooks/ospec-hooks-launch.js" session-start');
  assert.equal(sessionStartHook.commandWindows, 'set OSPEC_CODEX_WRAPPER=1&& node "%PLUGIN_ROOT%\\scripts\\hooks\\ospec-hooks-launch.js" session-start');
  assert.equal(sessionStartHook.timeout, 10);

  assert.equal(parsed.hooks.PreToolUse[0].hooks[0].command, 'OSPEC_CODEX_WRAPPER=1 node "$PLUGIN_ROOT/scripts/hooks/ospec-hooks-launch.js" pre-tool-use');
  assert.equal(parsed.hooks.PreToolUse[0].hooks[0].commandWindows, 'set OSPEC_CODEX_WRAPPER=1&& node "%PLUGIN_ROOT%\\scripts\\hooks\\ospec-hooks-launch.js" pre-tool-use');
  assert.equal(parsed.hooks.PreCompact[0].hooks[0].command, 'OSPEC_CODEX_WRAPPER=1 node "$PLUGIN_ROOT/scripts/hooks/ospec-hooks-launch.js" pre-compact');
  assert.equal(parsed.hooks.SubagentStop[0].hooks[0].command, 'OSPEC_CODEX_WRAPPER=1 node "$PLUGIN_ROOT/scripts/hooks/ospec-hooks-launch.js" subagent-stop');
  assert.equal(parsed.hooks.Stop[0].hooks[0].command, 'OSPEC_CODEX_WRAPPER=1 node "$PLUGIN_ROOT/scripts/hooks/ospec-hooks-launch.js" stop');
});

// Review remediation (CRITICAL-1, 4R gate): OSPEC_TARGET alone must never be
// sufficient to degrade ASK->allow. codexHooks must inline a second,
// per-invocation marker (OSPEC_CODEX_WRAPPER=1) directly on the command line
// for every wrapped hook entry, on both the POSIX and Windows command forms.
test("codex wrapper inlines the OSPEC_CODEX_WRAPPER=1 marker on every event's POSIX and Windows command", () => {
  const files = [
    {
      path: "hooks/hooks.json",
      content: JSON.stringify({
        hooks: {
          SessionStart: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js session-start", timeout: 5 }],
          PreToolUse: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js pre-tool-use", timeout: 5 }],
          PreCompact: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js pre-compact", timeout: 5 }],
          SubagentStop: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js subagent-stop", timeout: 5 }],
          Stop: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js stop", timeout: 5 }]
        },
      }),
    },
  ];
  const out = transform({ files, profile: codex, models: MODELS });
  const parsed = JSON.parse(find(out, "hooks/hooks.json").content);
  for (const event of ["SessionStart", "PreToolUse", "PreCompact", "SubagentStop", "Stop"]) {
    const hook = parsed.hooks[event][0].hooks[0];
    assert.match(hook.command, /^OSPEC_CODEX_WRAPPER=1 node /, `${event} POSIX command must inline the marker`);
    assert.match(hook.commandWindows, /^set OSPEC_CODEX_WRAPPER=1&& node /, `${event} Windows command must inline the marker`);
  }
});

// REQ-hooks-004 scenario: no sixth event is added even when the source
// hooks.json declares an event beyond the five Codex supports.
test("codex wrapper drops any event beyond the five supported (no sixth event)", () => {
  const files = [
    {
      path: "hooks/hooks.json",
      content: JSON.stringify({
        hooks: {
          SessionStart: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js session-start", timeout: 5 }],
          PreToolUse: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js pre-tool-use", timeout: 5 }],
          PreCompact: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js pre-compact", timeout: 5 }],
          SubagentStop: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js subagent-stop", timeout: 5 }],
          Stop: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js stop", timeout: 5 }],
          SomeFutureEvent: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js some-future-event", timeout: 5 }],
        }
      })
    }
  ];

  const out = transform({ files, profile: codex, models: MODELS });
  const parsed = JSON.parse(find(out, "hooks/hooks.json").content);
  assert.deepEqual(Object.keys(parsed.hooks).sort(), [
    "PreCompact",
    "PreToolUse",
    "SessionStart",
    "Stop",
    "SubagentStop"
  ]);
});

test("codex hooks reject a non-object hooks map with a clean path-aware error", () => {
  const files = [
    {
      path: "hooks/hooks.json",
      content: JSON.stringify({ hooks: [] }),
    },
  ];

  assert.throws(() => {
    transform({ files, profile: codex, models: MODELS });
  }, /hooks\/hooks\.json: hooks must be a non-null object/);
});

test("codex hooks reject a non-array event entry with event context", () => {
  const files = [
    {
      path: "hooks/hooks.json",
      content: JSON.stringify({
        hooks: {
          SessionStart: { type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js session-start" },
        },
      }),
    },
  ];

  assert.throws(() => {
    transform({ files, profile: codex, models: MODELS });
  }, /hooks\/hooks\.json: hooks\.SessionStart must be an array/);
});

test("codex hooks reject a non-string command with event and index context", () => {
  const files = [
    {
      path: "hooks/hooks.json",
      content: JSON.stringify({
        hooks: {
          SessionStart: [{ type: "command", command: 42 }],
        },
      }),
    },
  ];

  assert.throws(() => {
    transform({ files, profile: codex, models: MODELS });
  }, /hooks\/hooks\.json: hooks\.SessionStart\[0\]\.command must be a string/);
});

// ---------------------------------------------------------------------------
// Requirement: serializeAgentToml escaping (unit, in-memory fixtures)
// ---------------------------------------------------------------------------

test("serializeAgentToml escapes backslashes and triple-quote runs in developer_instructions", () => {
  const toml = serializeAgentToml({
    name: "x",
    description: "d",
    sandbox_mode: "read-only",
    developer_instructions: 'a \\ b """ c\n',
  });
  const tripleQuoteCount = (toml.match(/"""/g) || []).length;
  assert.equal(tripleQuoteCount, 2, "only the opening and closing delimiters may be a literal triple-quote run");
  assert.ok(toml.includes("a \\\\ b"), "backslash must be doubled");
});

test("serializeAgentToml escapes a double quote inside a scalar field", () => {
  const toml = serializeAgentToml({
    name: 'agent "x"',
    description: "d",
    sandbox_mode: "read-only",
    developer_instructions: "body\n",
  });
  assert.ok(toml.includes('name = "agent \\"x\\""'), "embedded double quote must be escaped");
});

test("serializeAgentToml omits undefined fields (e.g. model when OMIT)", () => {
  const toml = serializeAgentToml({
    name: "a",
    description: "d",
    sandbox_mode: "read-only",
    model: undefined,
    developer_instructions: "b\n",
  });
  assert.doesNotMatch(toml, /^model\s*=/m);
});

test("parseJsonFile throws a clean error when parsing JSON content that is null or a non-object", () => {
  const files = [
    {
      path: ".claude-plugin/plugin.json",
      content: "null",
    },
  ];

  assert.throws(() => {
    transform({ files, profile: claude, models: MODELS });
  }, /\.claude-plugin\/plugin\.json: JSON content must be a non-null object/);
});

test("parseJsonFile throws a clean error when JSON syntax is invalid", () => {
  const files = [
    {
      path: ".claude-plugin/plugin.json",
      content: "{ bad json }",
    },
  ];

  assert.throws(() => {
    transform({ files, profile: claude, models: MODELS });
  }, /\.claude-plugin\/plugin\.json: invalid JSON/);
});

test("transform throws TypeError when files is not an array or profile is not an object", () => {
  assert.throws(() => {
    transform({ files: null, profile: claude });
  }, TypeError);

  assert.throws(() => {
    transform({ files: [], profile: null });
  }, TypeError);
});

test("codex transform throws when hook entry is not an object", () => {
  const badSource = makeSource();
  const hooksFile = badSource.find((f) => f.path === "hooks/hooks.json");
  hooksFile.content = JSON.stringify({
    hooks: {
      PreToolUse: ["not-an-object"],
    },
  });

  assert.throws(() => {
    transform({ files: badSource, profile: codex, models: MODELS });
  }, /hooks\.PreToolUse\[0\] must be an object/);
});

test("codex transform throws when hook entry command is not a string", () => {
  const badSource = makeSource();
  const hooksFile = badSource.find((f) => f.path === "hooks/hooks.json");
  hooksFile.content = JSON.stringify({
    hooks: {
      PreToolUse: [{ command: 123 }],
    },
  });

  assert.throws(() => {
    transform({ files: badSource, profile: codex, models: MODELS });
  }, /hooks\.PreToolUse\[0\]\.command must be a string/);
});

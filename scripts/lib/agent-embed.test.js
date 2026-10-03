"use strict";

// Roadmap E0.1: a generated worker agent must work in a consumer project, which
// has no `skills/` tree. The generator embeds what each agent reads; these
// tests check the module directly and every agent of every generated target.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { embedAgentReferences } = require("./agent-embed.js");
const { buildTargetFiles } = require("./context-baseline.js");
const { PROFILES } = require("../configure/cli.js");

const ROOT = path.resolve(__dirname, "..", "..");
const AGENT_FILE = /(^|\/)agents\/([^/]+?)(\.agent\.md|\.md|\.toml)$/;

function sourcesOf(entries) {
  return new Map(Object.entries(entries));
}

function embed(sources, name = "demo") {
  return embedAgentReferences({ agentPath: `agents/${name}.agent.md`, content: sources.get(`agents/${name}.agent.md`), sources });
}

test("embeds the agent's skill, its own modules and the shared files they name", () => {
  const sources = sourcesOf({
    "agents/demo.agent.md": "# Demo\n\nRead `skills/demo/SKILL.md`.\nSee [common](skills/_shared/common.md) for the envelope.\n",
    "skills/demo/SKILL.md": "---\nname: demo\n---\n\n# Demo skill\n\n## Rules\n\n- When strict, load `strict.md` from this directory.\n- Template: [report](references/report.md).\n- Follow `skills/_shared/convention.md`.\n",
    "skills/demo/strict.md": "# Strict\n\nStrict body.\n",
    "skills/demo/references/report.md": "# Report\n\nReport body.\n",
    "skills/_shared/common.md": "# Common\n\nCommon body; resolve with `skills/_shared/deep.md`.\n",
    "skills/_shared/convention.md": "# Convention\n\nConvention body.\n",
    "skills/_shared/deep.md": "# Deep\n\nNot embedded.\n",
  });
  const out = embed(sources);

  for (const id of ["demo", "strict", "report", "common", "convention"]) {
    assert.match(out, new RegExp(`^### «${id}»$`, "m"), `missing embedded section «${id}»`);
  }
  assert.doesNotMatch(out, /^### «deep»$/m, "a file named only by a shared file stays out");
  assert.match(out, /Read «demo»\./);
  assert.match(out, /See «common» for the envelope\./);
  assert.match(out, /load «strict» from this directory/);
  assert.match(out, /`_shared\/deep\.md` \(installed ospec skills, not this project\)/);
  assert.doesNotMatch(out, /skills\/|\]\(|name: demo/);
  // Embedded headings sit below the section heading.
  assert.match(out, /^#### Demo skill$/m);
  assert.match(out, /^##### Rules$/m);
});

test("leaves artifacts, project paths and agents without a skill untouched", () => {
  const sources = sourcesOf({
    "agents/demo.agent.md": "Read `skills/demo/SKILL.md`; write `tasks.md` and `openspec/changes/x/design.md`.\n",
    "skills/demo/SKILL.md": "Example registry path: `skills/angular/SKILL.md`. Load `skills/{phase-name}/SKILL.md`.\n",
    "agents/lonely.agent.md": "Coordinates; reads `skills/_shared/common.md`.\n",
    "skills/_shared/common.md": "Common.\n",
  });
  const out = embed(sources);
  assert.match(out, /write `tasks\.md` and `openspec\/changes\/x\/design\.md`/);
  assert.match(out, /`skills\/angular\/SKILL\.md`/);
  assert.match(out, /Load «demo»\./);
  assert.equal(embed(sources, "lonely"), sources.get("agents/lonely.agent.md"));
});

// --- every generated target -----------------------------------------------

// Only paths into skills ospec ships count; `skills/sec/SKILL.md` in a config
// example is a consumer-project path.
const OSPEC_SKILLS = fs.readdirSync(path.join(ROOT, "skills")).join("|");
const OSPEC_PATH = new RegExp(`(^|[^A-Za-z0-9_.-])(skills\\/(${OSPEC_SKILLS})\\/|\\.\\.\\/_shared\\/|\\.\\/references\\/)`);

function agentText(file) {
  if (!file.path.endsWith(".toml")) return file.content;
  const match = file.content.match(/developer_instructions = """\n([\s\S]*?)"""\n/);
  assert.ok(match, `${file.path}: developer_instructions not found`);
  return match[1].replace(/""\\"/g, '"""').replace(/\\\\/g, "\\");
}

function rulesLines(skillText) {
  const section = skillText.match(/^## (?:Hard )?Rules\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!section) return [];
  return section[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 20 && !/\.md|skills\/|`/.test(line));
}

for (const [target, profile] of Object.entries(PROFILES)) {
  test(`${target}: every worker agent is self-contained`, () => {
    const files = buildTargetFiles(ROOT, profile);
    const byPath = new Map(files.map((file) => [file.path, file.content.replace(/\r\n/g, "\n")]));
    const orchestrators = new Set(["sdd-orchestrator", profile.orchestrator?.renameTo].filter(Boolean));
    const agents = files.filter((file) => AGENT_FILE.test(file.path) && !orchestrators.has(file.path.match(AGENT_FILE)[2]));
    assert.ok(agents.length >= 25, `${target}: expected the phase and review agents, got ${agents.length}`);

    for (const file of agents) {
      const name = file.path.match(AGENT_FILE)[2];
      const text = agentText({ ...file, content: file.content.replace(/\r\n/g, "\n") });

      const leak = text.split("\n").find((line) => OSPEC_PATH.test(line));
      assert.equal(leak, undefined, `${target}/${name}: relative ospec path in "${leak}"`);

      const embedded = new Set([...text.matchAll(/^### «([A-Za-z0-9._-]+)»$/gm)].map((m) => m[1]));
      assert.ok(embedded.has(name), `${target}/${name}: own skill not embedded`);
      for (const [, id] of text.matchAll(/«([^»\n]+)»/g)) {
        assert.ok(embedded.has(id), `${target}/${name}: «${id}» is referenced but not embedded`);
      }

      const skill = byPath.get(`skills/${name}/SKILL.md`);
      assert.ok(skill, `${target}/${name}: generated skill missing`);
      for (const line of rulesLines(skill)) {
        assert.ok(text.includes(line), `${target}/${name}: hard rule missing: "${line.slice(0, 80)}"`);
      }
    }
  });
}

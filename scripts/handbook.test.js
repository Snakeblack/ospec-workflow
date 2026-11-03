"use strict";

// Contract tests for the handbook skill, its SDD delegate agent, the SDD
// route handler, the website scaffold it ships, and this repository's own
// handbook (handbook/handbook.json and handbook/.state.json).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parse, getField } = require("./lib/frontmatter.js");
const { parseModels } = require("./configure/cli.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const AGENT_PATH = path.join(ROOT_DIR, "agents", "handbook.agent.md");
const SKILL_PATH = path.join(ROOT_DIR, "skills", "handbook", "SKILL.md");
const WEB_REFERENCE_PATH = path.join(ROOT_DIR, "skills", "handbook", "references", "web.md");
const TEMPLATE_DIR = path.join(ROOT_DIR, "skills", "handbook", "assets", "web-doc-template");
const MODELS_PATH = path.join(ROOT_DIR, "models.yaml");
const ROUTE_PATH = path.join(ROOT_DIR, "skills", "_shared", "route-handbook.md");
const ORCHESTRATOR_PATH = path.join(ROOT_DIR, "agents", "sdd-orchestrator.agent.md");
const HANDBOOK_DIR = path.join(ROOT_DIR, "handbook");

function tmpOut(t) {
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), "ospec-handbook-"));
  t.after(() => fsSync.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function read(file) {
  return fsSync.readFileSync(file, "utf8");
}

const POSIX = path.posix;
const MERMAID_DIAGRAM_TYPES =
  /^(graph|flowchart|sequenceDiagram|stateDiagram|classDiagram|erDiagram|journey|gantt|pie|mindmap)\b/;

function posixRel(p) {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

function countSubstantiveLines(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  let inSourceMap = false;
  let count = 0;
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const title = heading[2].replace(/[*_`"']/g, "").trim();
      inSourceMap = /^Source map\b/i.test(title);
      continue;
    }
    if (inSourceMap) continue;
    if (line.trim() === "") continue;
    count += 1;
  }
  return count;
}

function extractMermaidBlocks(markdown) {
  const blocks = [];
  const re = /```mermaid[^\n]*\n([\s\S]*?)```/gi;
  let match;
  while ((match = re.exec(String(markdown))) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

function detectFlowMermaid(markdown) {
  return extractMermaidBlocks(markdown).some((body) => body.trim().length > 0);
}

function validateMermaidHeuristic(markdown) {
  const blocks = extractMermaidBlocks(markdown);
  for (const body of blocks) {
    const effective = body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("%%"));
    if (effective.length === 0) {
      return { valid: false, reason: "empty-block" };
    }
    if (!MERMAID_DIAGRAM_TYPES.test(effective[0])) {
      return { valid: false, reason: "unknown-diagram-type" };
    }
    const nodeLabelRe = /[\[({](?:"([^"]*)"|([^\]})]*))[\])}]/g;
    let labelMatch;
    while ((labelMatch = nodeLabelRe.exec(body)) !== null) {
      const unquoted = labelMatch[2];
      if (unquoted !== undefined && /[\[\](){}*]/.test(unquoted)) {
        return { valid: false, reason: "unquoted-special-in-label" };
      }
    }
  }
  return { valid: true };
}

function evaluateLinkGraph(pages) {
  const normalized = pages.map((page) => ({
    path: posixRel(page.path),
    content: String(page.content),
  }));
  const byPath = new Map(normalized.map((page) => [page.path, page]));
  const result = {};
  for (const page of normalized) {
    result[page.path] = { outgoing: 0, incoming: 0 };
  }
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const page of normalized) {
    const dir = POSIX.dirname(page.path);
    let match;
    while ((match = linkRe.exec(page.content)) !== null) {
      let href = match[1].trim().split(/\s+/)[0];
      href = href.replace(/\\/g, "/");
      if (/^https?:\/\//i.test(href) || href.startsWith("mailto:")) continue;
      const hash = href.indexOf("#");
      if (hash === 0) continue;
      if (hash !== -1) href = href.slice(0, hash);
      if (!href.endsWith(".md")) continue;
      const resolved = posixRel(POSIX.normalize(dir === "." ? href : POSIX.join(dir, href)));
      if (resolved === page.path) continue;
      if (!byPath.has(resolved)) continue;
      result[page.path].outgoing += 1;
      result[resolved].incoming += 1;
    }
  }
  return result;
}

function validateStateSchema(metadata, existingMdRelPaths) {
  const errors = [];
  const expected = [...existingMdRelPaths].map(posixRel).sort();
  if (!Array.isArray(metadata && metadata.pages)) {
    errors.push("pages-not-array");
  } else {
    const actual = metadata.pages.map(posixRel).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push("pages-mismatch");
    }
  }
  const skipped = metadata && metadata.stats && metadata.stats.filesSkipped;
  if (!Array.isArray(skipped)) {
    errors.push("filesSkipped-not-array");
  } else {
    const badItem = skipped.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        typeof item.file !== "string" ||
        typeof item.reason !== "string"
    );
    if (badItem) errors.push("filesSkipped-invalid-item");
  }
  return { valid: errors.length === 0, errors };
}

function listMdRelPaths(rootDir) {
  const found = [];
  function walk(dir) {
    for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        found.push(posixRel(path.relative(rootDir, abs)));
      }
    }
  }
  walk(rootDir);
  return found.sort();
}

function padSubstantive(count, extras = []) {
  const lines = extras.slice();
  for (let i = 0; i < count; i += 1) {
    lines.push(`Substantive body line ${i + 1} describing repository behavior.`);
  }
  return lines.join("\n");
}

// --- sdd-document is gone ---

test("sdd-document and its /sdd-document command no longer exist", () => {
  for (const rel of [
    "agents/sdd-document.agent.md",
    "commands/sdd-document.prompt.md",
    "skills/sdd-document",
    "skills/_shared/route-document.md",
    "openwiki",
  ]) {
    assert.equal(fsSync.existsSync(path.join(ROOT_DIR, rel)), false, `${rel} must be gone`);
  }
  assert.equal(fsSync.existsSync(path.join(ROOT_DIR, "commands", "handbook.prompt.md")), false, "handbook has no slash command");
});

// --- agent and models ---

test("agents/handbook.agent.md is a non-invocable delegate without a model that runs the Delegated mode", () => {
  const content = read(AGENT_PATH);
  assert.ok(content.includes("name: handbook"));
  assert.ok(content.includes("user-invocable: false"));
  assert.ok(content.includes("tools: ['read', 'search', 'edit', 'execute']"));
  assert.ok(!/^model:/m.test(content), "the agent must not pin a model");
  assert.match(content, /skills\/handbook\/SKILL\.md/);
  assert.match(content, /\*\*Delegated\*\* mode/);
  assert.match(content, /next_recommended: none/);
});

test("models.yaml maps handbook to the cheap tier", async () => {
  const content = await fs.readFile(MODELS_PATH, "utf8");
  const agents = parseModels(content).agents;
  assert.equal(agents.handbook, "cheap");
  assert.equal(agents["sdd-document"], undefined);
});

// --- skill ---

test("skills/handbook/SKILL.md is user-invocable and runs Direct or Delegated", () => {
  const content = read(SKILL_PATH);
  const { frontmatter } = parse(content);
  assert.equal(getField(frontmatter, "name")?.value, "handbook");
  assert.doesNotMatch(content, /delegate_only|disable-model-invocation|user-invocable: false/, "the skill runs outside SDD");
  assert.match(content, /\*\*Direct\*\*/);
  assert.match(content, /\*\*Delegated\*\*[\s\S]{0,200}never\s+ask the user/);
});

test("the skill asks language and website once and keeps them in handbook.json", () => {
  const content = read(SKILL_PATH);
  assert.match(content, /\*\*Language\*\*/);
  assert.match(content, /\*\*Website\*\*/);
  assert.match(content, /Later runs read them and ask nothing/);
  assert.match(content, /"language": "es",\s*"web": true,\s*"groups"/);
});

test("the skill migrates an openwiki/ directory only after asking", () => {
  const content = read(SKILL_PATH);
  assert.match(content, /ask once whether to\s+migrate/);
  assert.match(content, /git mv openwiki handbook/);
  assert.match(content, /section_labels\` → group labels/);
  assert.match(content, /sync-openwiki\.mjs\` to \`scripts\/sync-handbook\.mjs/);
});

test("the skill keeps the user's manifest edits and gives every directory one group", () => {
  const content = read(SKILL_PATH);
  assert.match(content, /Every directory of the handbook has exactly one group/);
  assert.match(content, /Keep their order, labels and\s+audiences/);
  assert.match(content, /sidebar\.order/);
});

test("the skill bounds its writes and never writes the generated website content", () => {
  const content = read(SKILL_PATH);
  assert.match(content, /Write only inside \`handbook\/\`, inside \`web-doc\/\` when \`web\` is true/);
  assert.match(content, /Never write into \`web-doc\/src\/content\/docs\/\`/);
  assert.match(content, /orchestrator also checks the boundary\s+after the run/);
  assert.match(content, /Do not read or document secrets/);
});

test("the skill fixes web at the start, allows openwiki/ only for an approved migration and diffs git status", () => {
  const content = read(SKILL_PATH);
  assert.match(content, /\`web\` is the value \`handbook\.json\` had when the run started/);
  assert.match(content, /never change it on your own to widen the\s+boundary/);
  assert.match(content, /During a migration the user approved, the boundary also\s+covers \`openwiki\/\`, only to move it/);
  assert.match(content, /Before the first write, record \`git status --porcelain\`/);
  assert.match(content, /every path\s+the run changed outside the write boundary/);
});

test("the skill validates gitHead before using it in a git command", () => {
  const content = read(SKILL_PATH);
  assert.match(content, /\`\^\[0-9a-f\]\{7,40\}\$\`/);
  assert.match(content, /git cat-file -e <gitHead>\^\{commit\}/);
  assert.match(content, /otherwise run as an init/);
});

test("the skill plans with a canonicity map and coverage proposals, and deletes the plan", () => {
  const content = read(SKILL_PATH);
  assert.match(content, /\| page \| group \| category \| evidence \| substance \| canonical for \|/);
  assert.match(content, /coverage proposals/);
  assert.match(content, /Delete \`_plan\.md\` when the run ends/);
});

test("the skill bounds init and makes update surgical with a no-op path", () => {
  const content = read(SKILL_PATH);
  assert.match(content, /at most 16 pages/);
  assert.match(content, /git diff --name-only <gitHead>\.\.HEAD/);
  assert.match(content, /volatile facts/);
  assert.match(content, /refresh only \`updatedAt\` and\s+\`gitHead\`/);
});

test("the skill's checklist keeps its measurable thresholds and the fact check", () => {
  const content = read(SKILL_PATH);
  assert.match(content, /at least 30 lines/);
  assert.match(content, /one link to another handbook page and one link from another page/);
  assert.match(content, /\`flow\` page has a non-empty Mermaid block/);
  assert.match(content, /compare every number, version, threshold, path,\s+command and configuration key/);
});

test("the skill runs the sync script to validate the manifest instead of describing the rule (ADR 0003)", () => {
  const content = read(SKILL_PATH);
  assert.match(content, /node scripts\/sync-handbook\.mjs/);
  assert.match(content, /each warning it prints[\s\S]{0,160}is\s+a defect to fix/);
});

test("the skill keeps a Handbook block in AGENTS.md and CLAUDE.md and replaces the OpenWiki one", () => {
  const content = read(SKILL_PATH);
  assert.match(content, /## Handbook\n\nThis repository's documentation lives in \/handbook\./);
  assert.match(content, /Replace an older \`## OpenWiki\` block/);
});

test("the skill's state schema lists every page and skipped files as objects", () => {
  const content = read(SKILL_PATH);
  assert.match(content, /"generator": "handbook"/);
  assert.match(content, /"pages": \[/);
  assert.match(content, /"filesSkipped": \[\{ "file": "<path>", "reason": "<why>" \}\]/);
  assert.match(content, /\`pages\` always equals the set of \`\*\.md\` files/);
});

test("the skill never certifies its own content quality", () => {
  const content = read(SKILL_PATH);
  assert.match(content, /Never certify the quality of the content yourself/);
  assert.match(content, /"justifiedExceptions"/);
});

// --- website reference and scaffold ---

test("references/web.md copies the scaffold only when missing, runs no installer and retries once", () => {
  const content = read(WEB_REFERENCE_PATH);
  assert.match(content, /Write a file only when it is missing/);
  assert.match(content, /Run no installer/);
  assert.match(content, /retry that file once/);
  assert.match(content, /--source \.\.\/docs\/handbook/);
  assert.match(content, /no state file of its own/);
});

test("the web-doc template ships the exact scaffold file set", () => {
  for (const rel of [
    "package.json",
    "astro.config.mjs",
    path.join("src", "content.config.ts"),
    "tsconfig.json",
    path.join("src", "styles", "custom.css"),
    path.join("scripts", "sync-handbook.mjs"),
  ]) {
    assert.ok(fsSync.existsSync(path.join(TEMPLATE_DIR, rel)), `scaffold asset must exist: ${rel}`);
  }
});

test("the template's content.config.ts imports docsLoader from the plural loaders entry point", () => {
  const content = read(path.join(TEMPLATE_DIR, "src", "content.config.ts"));
  assert.match(content, /import\s*\{\s*docsLoader\s*\}\s*from\s*["']@astrojs\/starlight\/loaders["']/);
  assert.doesNotMatch(content, /@astrojs\/starlight\/loader["']/);
});

test("the template's astro.config.mjs redirects the root, derives the title and reads the sidebar manifest", () => {
  const content = read(path.join(TEMPLATE_DIR, "astro.config.mjs"));
  assert.match(content, /redirects\s*:\s*\{[^}]*["']\/["']\s*:\s*["']\/quickstart["']/);
  assert.doesNotMatch(content, /title\s*:\s*["']Project Documentation["']/);
  assert.match(content, /package\.json/);
  assert.match(content, /sidebar\.generated\.json/);
  assert.match(content, /return undefined/, "a missing manifest falls back to Starlight's sidebar");
});

test("the template's astro.config.mjs takes the language and audience badges from the sidebar manifest", () => {
  const content = read(path.join(TEMPLATE_DIR, "astro.config.mjs"));
  assert.match(content, /SIDEBAR_MANIFEST\.language/);
  assert.match(content, /locales\s*:\s*\{\s*root\s*:/);
  assert.match(content, /return "en"/);
  assert.match(content, /badge: \{ text: g\.badge/);
  assert.doesNotMatch(content, /last-update|doc_language|openwiki/);
});

test("the template's package.json wires predev and prebuild to the sync script", () => {
  const pkg = JSON.parse(read(path.join(TEMPLATE_DIR, "package.json")));
  assert.match(pkg.scripts.predev || "", /node scripts\/sync-handbook\.mjs/);
  assert.match(pkg.scripts.prebuild || "", /node scripts\/sync-handbook\.mjs/);
  assert.ok(pkg.dependencies && pkg.dependencies.astro);
  assert.ok(pkg.dependencies && pkg.dependencies["@astrojs/starlight"]);
});

test("this repository's web-doc runs the same sync script as the template", () => {
  assert.equal(
    read(path.join(ROOT_DIR, "web-doc", "scripts", "sync-handbook.mjs")),
    read(path.join(TEMPLATE_DIR, "scripts", "sync-handbook.mjs")),
    "web-doc/scripts/sync-handbook.mjs drifted from the template"
  );
  const pkg = JSON.parse(read(path.join(ROOT_DIR, "web-doc", "package.json")));
  assert.match(pkg.scripts.prebuild, /node scripts\/sync-handbook\.mjs/);
});

// --- SDD route ---

test("the orchestrator delegates documentation to the handbook agent through route-handbook.md", () => {
  const content = read(ORCHESTRATOR_PATH);
  assert.match(content.split("\n").find((line) => line.startsWith("agents:")), /'handbook'/);
  assert.match(content, /\| Handbook Route Handler \|[^\n]*\`skills\/_shared\/route-handbook\.md\`/);
  assert.doesNotMatch(content, /sdd-document|route-document/);
});

test("route-handbook.md checks the write boundary itself and halts on an inconclusive or failed check", () => {
  const content = read(ROUTE_PATH);
  assert.match(content, /There is no slash\s+command/);
  assert.match(content, /Before each dispatch of the \`handbook\` agent \(the first one and every\s+relaunch after a \`blocked\` return\), record in the route \`state\.yaml\`/);
  assert.match(content, /handbook-boundary:\s+web:[\s\S]{0,120}baseline:[\s\S]{0,120}hash:/);
  assert.match(content, /the\s+\`git hash-object\` of the whole route \`state\.yaml\` after each of your own\s+writes to it/);
  assert.match(content, /A difference means the run changed that\s+file: count it as a path outside the boundary/);
  assert.match(content, /the session changed between the dispatch and\s+its return\), the check is INCONCLUSIVE/);
  assert.match(content, /take the record above\s+again, and relaunch the agent/);
  assert.match(content, /A \`blocked\` return reaches the session that dispatched it: run the check of\s+§2 \(steps 1 to 5\) on it right away/);
  assert.match(content, /never the file again, because the agent could have written it/);
  assert.match(content, /\`git hash-object\` still gives the\s+recorded hash/);
  assert.match(content, /never from a file the\s+agent could write/);
  assert.match(content, /\`openwiki\/\`\s+only for renames to \`handbook\/\`/);
  assert.match(content, /\`handbook\/handbook\.json\` now has a \`web\` different from your copy, treat\s+it as a path outside/);
  assert.match(content, /the route's own \`state\.yaml\`\s+does not count once step 1 matched its hash/);
  assert.match(content, /git status --porcelain/);
  assert.match(content, /INCONCLUSIVE, never a pass/);
  assert.match(content, /"Abort the route and leave the files for\s+manual review" \(recommended\)/);
  assert.match(content, /gate: handbook-settings/);
});

test("route-handbook.md reviews the content inline and records gates.content-qa", () => {
  const content = read(ROUTE_PATH);
  assert.match(content, /max\(3, ceil\(0\.2 \* claims\)\)/);
  assert.match(content, /content-qa:/);
  assert.match(content, /does not close as success without this record/);
  assert.match(content, /"Relaunch the handbook agent to fix the affected pages" \(recommended\)/);
});

// --- generation ---

test("the handbook agent and the route handler generate for every target with SDD", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  for (const [target, agentPath] of [
    ["vscode", "agents/handbook.agent.md"],
    ["claude", "agents/handbook.md"],
    ["github-copilot", ".github/agents/handbook.agent.md"],
    ["opencode", ".opencode/agents/handbook.md"],
  ]) {
    const out = tmpOut(t);
    const result = runConfigure({ sourceDir: ROOT_DIR, target, outDir: out, validate: false, withSdd: true });
    assert.equal(result.exitCode, 0, target);
    assert.ok(fsSync.existsSync(path.join(out, agentPath)), `${target}: ${agentPath}`);
    assert.ok(fsSync.existsSync(path.join(out, "skills", "_shared", "route-handbook.md")), `${target}: route-handbook.md`);
  }
});

test("the handbook agent uses the cheap tier: Claude's alias, the user's model, or inherit", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const generated = (target, relative, userModels) => {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT_DIR, target, outDir: out, validate: false, withSdd: true, userModels });
    return fsSync.readFileSync(path.join(out, relative), "utf8");
  };
  const model = (content) => getField(parse(content).frontmatter, "model")?.value;
  assert.equal(model(generated("claude", "agents/handbook.md")), "haiku");
  for (const [target, relative] of [
    ["vscode", "agents/handbook.agent.md"],
    ["github-copilot", ".github/agents/handbook.agent.md"],
    ["opencode", ".opencode/agents/handbook.md"],
  ]) {
    assert.equal(model(generated(target, relative)), undefined, `${target} inherits without an assignment`);
    assert.equal(model(generated(target, relative, { cheap: "my-cheap" })), "my-cheap", target);
  }
  assert.doesNotMatch(generated("codex", ".codex/agents/handbook.toml"), /^model/m);
  const codex = generated("codex", ".codex/agents/handbook.toml", { cheap: "my-cheap" });
  assert.match(codex, /^model = "my-cheap"$/m);
  assert.match(codex, /^model_reasoning_effort = "low"$/m);
});

// --- this repository's handbook ---

test("handbook/handbook.json is valid and names every handbook directory exactly once", () => {
  const manifest = JSON.parse(read(path.join(HANDBOOK_DIR, "handbook.json")));
  assert.match(manifest.language, /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/);
  assert.equal(typeof manifest.web, "boolean");
  assert.ok(Array.isArray(manifest.groups));
  const directories = fsSync
    .readdirSync(HANDBOOK_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(manifest.groups.map((group) => group.directory).sort(), directories);
  for (const group of manifest.groups) {
    assert.ok(typeof group.label === "string" && group.label.trim(), `${group.directory}: label`);
    assert.ok(group.audience === undefined || (typeof group.audience === "string" && group.audience.trim()), `${group.directory}: audience`);
  }
});

test("handbook/.state.json lists every handbook page", () => {
  const state = JSON.parse(read(path.join(HANDBOOK_DIR, ".state.json")));
  assert.equal(state.generator, "handbook");
  assert.deepEqual([...state.pages].sort(), listMdRelPaths(HANDBOOK_DIR));
});

// --- Executable checklist and state-schema helpers (the skill's Check step) ---

const VALID_MERMAID = [
  "```mermaid",
  "flowchart TD",
  '  A["Start * here"] --> B[Next]',
  "```",
].join("\n");

const UNQUOTED_MERMAID = [
  "```mermaid",
  "flowchart TD",
  "  A[Start * here] --> B[Next]",
  "```",
].join("\n");

test("L2 helpers: valid mini-wiki passes substantive, link-graph, mermaid, and metadata checks", (t) => {
  const out = tmpOut(t);
  const quickstart = [
    "# Quickstart",
    "",
    padSubstantive(30),
    "",
    "See the [route handlers](./workflows/routes.md) page.",
    "",
    "## Source map",
    "- /skills/_shared/route-handbook.md",
  ].join("\n");
  const flowPage = [
    "# Route handlers",
    "",
    padSubstantive(30),
    "",
    "Back to [quickstart](../quickstart.md).",
    "",
    VALID_MERMAID,
    "",
    "## Source map",
    "- /skills/_shared/route-handbook.md",
  ].join("\n");
  fsSync.mkdirSync(path.join(out, "workflows"));
  fsSync.writeFileSync(path.join(out, "quickstart.md"), quickstart);
  fsSync.writeFileSync(path.join(out, "workflows", "routes.md"), flowPage);
  const metadata = {
    pages: ["quickstart.md", "workflows/routes.md"],
    stats: { filesGenerated: 2, filesUpdated: 0, filesSkipped: [] },
  };
  fsSync.writeFileSync(path.join(out, ".state.json"), JSON.stringify(metadata));

  assert.ok(countSubstantiveLines(quickstart) >= 30);
  assert.ok(countSubstantiveLines(flowPage) >= 30);
  const graph = evaluateLinkGraph([
    { path: "quickstart.md", content: quickstart },
    { path: "workflows/routes.md", content: flowPage },
  ]);
  assert.ok(graph["quickstart.md"].outgoing >= 1 && graph["quickstart.md"].incoming >= 1);
  assert.ok(graph["workflows/routes.md"].outgoing >= 1 && graph["workflows/routes.md"].incoming >= 1);
  assert.equal(detectFlowMermaid(flowPage), true);
  assert.equal(validateMermaidHeuristic(flowPage).valid, true);
  assert.equal(validateStateSchema(metadata, listMdRelPaths(out)).valid, true);
});

test("L2 helpers: thin page counts below 30 substantive lines", () => {
  const thin = ["# Thin", "", "Only a handful of lines.", "", "## Source map", "- /a.js"].join("\n");
  assert.ok(countSubstantiveLines(thin) < 30);
});

test("L2 helpers: orphan page has no incoming wiki-internal link", () => {
  const orphan = ["# Orphan", "", padSubstantive(30), "", "See [quickstart](./quickstart.md)."].join("\n");
  const quickstart = ["# Quickstart", "", padSubstantive(30)].join("\n");
  const graph = evaluateLinkGraph([
    { path: "quickstart.md", content: quickstart },
    { path: "orphan.md", content: orphan },
  ]);
  assert.equal(graph["orphan.md"].incoming, 0);
  assert.ok(graph["orphan.md"].outgoing >= 1);
});

test("L2 helpers: flow page without Mermaid is detected", () => {
  const flowNoDiagram = ["# Flow", "", padSubstantive(30)].join("\n");
  assert.equal(detectFlowMermaid(flowNoDiagram), false);
});

test("L2 helpers: Mermaid with unquoted special characters fails the heuristic", () => {
  const quoted = ["# Flow", "", padSubstantive(5), "", VALID_MERMAID].join("\n");
  const unquoted = ["# Flow", "", padSubstantive(5), "", UNQUOTED_MERMAID].join("\n");
  assert.equal(validateMermaidHeuristic(quoted).valid, true);
  assert.equal(validateMermaidHeuristic(unquoted).valid, false);
});

test("L2 helpers: state with partial pages or numeric filesSkipped fails schema", (t) => {
  const out = tmpOut(t);
  fsSync.writeFileSync(path.join(out, "quickstart.md"), "# Q\n");
  fsSync.mkdirSync(path.join(out, "domain"));
  fsSync.writeFileSync(path.join(out, "domain", "page.md"), "# P\n");
  const mdPaths = listMdRelPaths(out);

  const partialSections = {
    pages: ["quickstart.md"],
    stats: { filesSkipped: [] },
  };
  const numericSkipped = {
    pages: mdPaths,
    stats: { filesSkipped: 0 },
  };
  assert.equal(validateStateSchema(partialSections, mdPaths).valid, false);
  assert.ok(validateStateSchema(partialSections, mdPaths).errors.includes("pages-mismatch"));
  assert.equal(validateStateSchema(numericSkipped, mdPaths).valid, false);
  assert.ok(validateStateSchema(numericSkipped, mdPaths).errors.includes("filesSkipped-not-array"));
});


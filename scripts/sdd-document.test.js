"use strict";

// Verification tests for the sdd-document agent change.
// Validates:
// 1. Target generation transforms (vscode, claude, copilot, opencode)
// 2. Models routing mapping validation
// 3. Static contract validation for launch gate and Option C validation
// 4. Sandbox write boundaries constraints check

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parse, getField } = require("./lib/frontmatter.js");
const { parseModels } = require("./configure/cli.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const AGENT_PATH = path.join(ROOT_DIR, "agents", "sdd-document.agent.md");
const COMMAND_PATH = path.join(ROOT_DIR, "commands", "sdd-document.prompt.md");
const SKILL_PATH = path.join(ROOT_DIR, "skills", "sdd-document", "SKILL.md");
const MODELS_PATH = path.join(ROOT_DIR, "models.yaml");
const ROUTE_DOCUMENT_PATH = path.join(ROOT_DIR, "skills", "_shared", "route-document.md");

function tmpOut(t) {
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), "ospec-sdd-document-"));
  t.after(() => fsSync.rmSync(dir, { recursive: true, force: true }));
  return dir;
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

function validateLastUpdateSchema(metadata, existingMdRelPaths) {
  const errors = [];
  const expected = [...existingMdRelPaths].map(posixRel).sort();
  if (!Array.isArray(metadata && metadata.sections)) {
    errors.push("sections-not-array");
  } else {
    const actual = metadata.sections.map(posixRel).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push("sections-mismatch");
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

// --- Static Contract / Schema Tests ---

test("sdd-document.agent.md has correct frontmatter and no model field", async () => {
  const content = await fs.readFile(AGENT_PATH, "utf8");
  assert.ok(content.includes("name: sdd-document"));
  assert.ok(content.includes("user-invocable: false"));
  assert.ok(content.includes("tools: ['read', 'search', 'edit', 'execute']"));
  assert.ok(!content.includes("model:"));
});

test("sdd-document.prompt.md is mapped to sdd-orchestrator", async () => {
  const content = await fs.readFile(COMMAND_PATH, "utf8");
  assert.ok(content.includes("name: sdd-document"));
  assert.ok(content.includes("agent: sdd-orchestrator"));
});

test("models.yaml maps sdd-document to cheap model tier", async () => {
  const content = await fs.readFile(MODELS_PATH, "utf8");
  assert.equal(parseModels(content).agents["sdd-document"], "cheap");
});

test("skills/sdd-document/SKILL.md defines the question_gate with options A, B, C", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  assert.ok(content.includes("Option A"), "SKILL.md must define Option A");
  assert.ok(content.includes("Option B"), "SKILL.md must define Option B");
  assert.ok(content.includes("Option C"), "SKILL.md must define Option C");
  assert.ok(content.includes("question_gate"), "SKILL.md must implement question_gate");
});

test("skills/sdd-document/SKILL.md details Option C path validation", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  assert.ok(content.includes("fuzzy") || content.includes("invalid"), "SKILL.md must check for fuzzy or invalid paths for Option C");
  assert.ok(content.includes("clarify") || content.includes("blocked"), "SKILL.md must block or request clarification for bad Option C paths");
});

test("skills/sdd-document/SKILL.md enforces dynamic write sandbox boundaries", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  assert.ok(content.includes("Sandbox") || content.includes("sandbox"), "SKILL.md must mention sandbox boundaries");
  assert.ok(content.includes("restrict") || content.includes("restricted"), "SKILL.md must restrict writes to target directory");
});

// --- Target Generation Verification Tests ---

test("Target generation transforms sdd-document to vscode target", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const out = tmpOut(t);
  const result = runConfigure({ sourceDir: ROOT_DIR, target: "vscode", outDir: out, validate: false });

  assert.equal(result.exitCode, 0);
  assert.ok(fsSync.existsSync(path.join(out, "agents/sdd-document.agent.md")), "vscode output must contain sdd-document.agent.md");
  assert.ok(fsSync.existsSync(path.join(out, "commands/sdd-document.prompt.md")), "vscode output must contain sdd-document.prompt.md");
});

test("Target generation transforms sdd-document to claude target", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const out = tmpOut(t);
  const result = runConfigure({ sourceDir: ROOT_DIR, target: "claude", outDir: out, validate: false });

  assert.equal(result.exitCode, 0);
  assert.ok(fsSync.existsSync(path.join(out, "agents/sdd-document.md")), "claude output must contain agents/sdd-document.md");
  assert.ok(fsSync.existsSync(path.join(out, "commands/sdd-document.md")), "claude output must contain commands/sdd-document.md");
  assert.ok(fsSync.existsSync(path.join(out, "skills/sdd-document/SKILL.md")), "claude output must contain skills/sdd-document/SKILL.md");
});

test("Target generation transforms sdd-document to github-copilot target", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const out = tmpOut(t);
  const result = runConfigure({ sourceDir: ROOT_DIR, target: "github-copilot", outDir: out, validate: false });

  assert.equal(result.exitCode, 0);
  assert.ok(fsSync.existsSync(path.join(out, ".github/agents/sdd-document.agent.md")), "copilot output must contain .github/agents/sdd-document.agent.md");
});

test("Target generation transforms sdd-document to opencode target", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const out = tmpOut(t);
  const result = runConfigure({ sourceDir: ROOT_DIR, target: "opencode", outDir: out, validate: false });

  assert.equal(result.exitCode, 0);
  assert.ok(fsSync.existsSync(path.join(out, ".opencode/agents/sdd-document.md")), "opencode output must contain .opencode/agents/sdd-document.md");
});

test("sdd-document generated outputs use cheap models or fail-soft omission", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const cases = [
    ["claude", "agents/sdd-document.md", "haiku"],
    ["vscode", "agents/sdd-document.agent.md", ["GPT-5.6 Luna (copilot)"]],
    ["opencode", ".opencode/agents/sdd-document.md", "zai-coding-plan/glm-5.3-flash"],
  ];
  for (const [target, relative, expected] of cases) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT_DIR, target, outDir: out, validate: false });
    const content = fsSync.readFileSync(path.join(out, relative), "utf8");
    assert.deepEqual(getField(parse(content).frontmatter, "model").value, expected, target);
  }
  const githubOut = tmpOut(t);
  runConfigure({ sourceDir: ROOT_DIR, target: "github-copilot", outDir: githubOut, validate: false });
  const github = fsSync.readFileSync(path.join(githubOut, ".github/agents/sdd-document.agent.md"), "utf8");
  assert.equal(getField(parse(github).frontmatter, "model"), null);

  const codexOut = tmpOut(t);
  runConfigure({ sourceDir: ROOT_DIR, target: "codex", outDir: codexOut, validate: false });
  const codex = fsSync.readFileSync(path.join(codexOut, ".codex/agents/sdd-document.toml"), "utf8");
  assert.match(codex, /^model = "gpt-5\.6-luna"$/m);
  assert.match(codex, /^model_reasoning_effort = "low"$/m);
});

test("skills/sdd-document/SKILL.md details relative path formatting", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  assert.ok(content.includes("relative paths starting with a forward slash"), "SKILL.md must enforce relative file paths");
});

test("skills/sdd-document/SKILL.md details themed subdirectory structures", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  assert.ok(content.includes("themed subdirectory") && content.includes("{domain-slug}/{page-name}.md"), "SKILL.md must specify themed subdirectories for domains");
});

test("skills/sdd-document/SKILL.md defines the official metadata format", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  assert.ok(content.includes("generator") && content.includes("stats") && content.includes("sections"), "SKILL.md must define full metadata schema");
});

// --- REQ-agents-005 / REQ-sdd-document-006 / REQ-sdd-document-011 (wire-sdd-document) ---

test("skills/sdd-document/SKILL.md .last-update.json schema includes doc_language and scope_choice", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  const stepMatch = content.match(/### Step 6\.6:[\s\S]*?```json([\s\S]*?)```/);
  assert.ok(stepMatch, "SKILL.md must contain a fenced JSON block in Step 6.6 documenting .last-update.json");
  const schemaBlock = stepMatch[1];
  assert.ok(schemaBlock.includes("doc_language"), "SKILL.md .last-update.json schema block must document doc_language");
  assert.ok(schemaBlock.includes("scope_choice"), "SKILL.md .last-update.json schema block must document scope_choice");
});

test("skills/sdd-document/SKILL.md describes ONE batched question_gate for language+scope, not two sequential gates", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  assert.ok(
    content.includes("batched") && content.includes("single") && content.includes("question_gate"),
    "SKILL.md must describe a single batched question_gate for language+scope"
  );
  assert.ok(
    !/first gate presented to the user, before any other question/.test(content),
    "SKILL.md must not describe language as a standalone gate that must run first, independently of scope"
  );
});

test("skills/_shared/route-document.md §3 rejects an out-of-repo custom_path at gate time (rel-3)", async () => {
  const content = await fs.readFile(ROUTE_DOCUMENT_PATH, "utf8");
  const sectionMatch = content.match(/#### 3\. Output-dir resolution([\s\S]*?)(?:\r?\n#### 4\.)/);
  assert.ok(sectionMatch, "route-document.md must contain a '#### 3. Output-dir resolution' section");
  const section = sectionMatch[1];
  assert.ok(
    section.includes("outside the repository working tree"),
    "§3 must describe detecting a custom_path that resolves outside the repository working tree"
  );
  assert.ok(
    /reject it at gate time/i.test(section) && /do not delegate/i.test(section),
    "§3 must reject an out-of-repo custom_path at gate time instead of delegating"
  );
  assert.ok(
    /re-prompt/i.test(section),
    "§3 must re-prompt the user for a valid in-repo path instead of silently failing"
  );
});

test("skills/_shared/route-document.md is present under all four dist targets", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const relPath = "skills/_shared/route-document.md";

  for (const target of ["claude", "vscode", "github-copilot", "opencode"]) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT_DIR, target, outDir: out, validate: false });
    assert.ok(
      fsSync.existsSync(path.join(out, relPath)),
      `${relPath} missing from ${target} output`
    );
  }
});

// --- starlight-web-doc (Option D scaffold assets ship in dist) ---

// --- harden-sdd-document-contract L1: static contract (P1–P7) ---

function sectionBetween(content, startRe, endRe) {
  const start = content.search(startRe);
  if (start === -1) return null;
  const fromStart = content.slice(start);
  const endMatch = fromStart.slice(1).search(endRe);
  return endMatch === -1 ? fromStart : fromStart.slice(0, endMatch + 1);
}

test("skills/sdd-document/SKILL.md Step 5b documents a canonicity map and coverage proposals", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  const step5b = sectionBetween(content, /### Step 5b: Planning/, /\n### Step 6:/);
  assert.ok(step5b, "SKILL.md must contain Step 5b: Planning");
  assert.match(step5b, /canonical for/, "Step 5b must document a canonicity map with a 'canonical for' column");
  assert.match(step5b, /\bcategory\b/, "Step 5b plan table must include a category column");
  assert.match(
    step5b,
    /coverage proposals/i,
    "Step 5b must require an update-mode coverage proposals section before editing existing pages"
  );
  assert.match(
    step5b,
    /canonical/i,
    "Step 5b must document canonicity-map dedup (one canonical page per concept)"
  );
});

test("skills/sdd-document/SKILL.md Update Mode Behavior documents re-discovery and volatile-fact re-verification", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  const updateMode = sectionBetween(content, /#### Update Mode Behavior/, /\n#### 6\.1:/);
  assert.ok(updateMode, "SKILL.md must contain Update Mode Behavior");
  assert.match(
    updateMode,
    /re-run domain discovery|re-discover/i,
    "Update Mode Behavior must document post-window re-discovery over the current repository state"
  );
  assert.match(
    updateMode,
    /volatile facts?/i,
    "Update Mode Behavior must document volatile-fact re-verification on every run"
  );
  assert.match(
    updateMode,
    /ONLY\s+`?updatedAt`?\s+and\s+`?gitHead/i,
    "no-op path must refresh ONLY updatedAt and gitHead in .last-update.json"
  );
});

test("skills/sdd-document/SKILL.md Step 6.4 is the measurable output checklist", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  const step64 = sectionBetween(content, /### Step 6\.4:/, /\n### Step 6\.5:/);
  assert.ok(step64, "SKILL.md must contain Step 6.4");
  assert.match(step64, /Measurable Output Checklist/i, "Step 6.4 must be the Measurable Output Checklist");
  assert.match(step64, /30/, "checklist must require >=30 substantive lines");
  assert.match(step64, /substantive lines?/i, "checklist must define substantive lines");
  assert.match(step64, /outgoing/i, "checklist must require outgoing wiki-internal links");
  assert.match(step64, /incoming/i, "checklist must require incoming wiki-internal links");
  assert.match(step64, /[Mm]ermaid/, "checklist must require Mermaid on flow pages");
  assert.match(step64, /heuristic|quoted|special.character/i, "checklist must document the Mermaid syntax heuristic");
  assert.match(step64, /justifiedExceptions/, "checklist must document justifiedExceptions for orphans");
});

test("skills/sdd-document/SKILL.md Step 6.5 is the factual verification pass before cleanup", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  const step65 = sectionBetween(content, /### Step 6\.5:/, /\n### Step 6\.6:/);
  assert.ok(step65, "SKILL.md must contain Step 6.5");
  assert.match(step65, /Factual Verification Pass/i, "Step 6.5 must be the Factual Verification Pass");
  assert.match(step65, /search\/read|search and read/i, "Step 6.5 must contrast claims via search/read");
  assert.match(step65, /correct(?:ed)? or remov/i, "failed claims must be corrected or removed");
  assert.match(step65, /worklog|during the run|never in the (?:final |published )?output|not published/i,
    "per-claim outcomes must be recorded in the run worklog, not published pages");
});

test("skills/sdd-document/SKILL.md Step 6.6 schema lists complete sections and object filesSkipped", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  const step66 = sectionBetween(content, /### Step 6\.6:/, /\n### Step 6\.7:/);
  assert.ok(step66, "SKILL.md must contain Step 6.6 (metadata)");
  const jsonMatch = step66.match(/```json([\s\S]*?)```/);
  assert.ok(jsonMatch, "Step 6.6 must contain a fenced JSON schema block");
  const schemaBlock = jsonMatch[1];
  assert.match(schemaBlock, /"filesSkipped"\s*:\s*\[/, "filesSkipped must be an array, not a numeric count");
  assert.match(schemaBlock, /"file"/, "filesSkipped items must identify the file");
  assert.match(schemaBlock, /"reason"/, "filesSkipped items must state the skip reason");
  assert.match(
    step66,
    /every existing|all .*pages|complete list|including pages (?:carried over|unchanged)/i,
    "sections must list every existing wiki page after the run, including untouched pages"
  );
});

test("skills/sdd-document/SKILL.md Step 7 forbids content-quality self-certification and documents checklist", async () => {
  const content = await fs.readFile(SKILL_PATH, "utf8");
  const step7 = sectionBetween(content, /### Step 7: Return Summary/, /$/);
  assert.ok(step7, "SKILL.md must contain Step 7: Return Summary");
  assert.match(step7, /checklist/, "Step 7 must document the checklist envelope shape");
  assert.match(step7, /justifiedExceptions/, "Step 7 checklist must include justifiedExceptions");
  assert.match(
    step7,
    /MUST NOT.{0,80}(self-certif|authoritative content-quality)|not self-certif|NOT sufficient evidence of content quality/i,
    "Step 7 must forbid content-quality self-certification"
  );
  assert.match(
    step7,
    /J6|REQ-agents-018|content QA/i,
    "Step 7 must reference orchestrator-owned J6 / REQ-agents-018"
  );
});

test("skills/_shared/route-document.md §4 points .last-update.json writer to Step 6.6", async () => {
  const content = await fs.readFile(ROUTE_DOCUMENT_PATH, "utf8");
  const persistence = sectionBetween(content, /#### 4\. Persistence/, /\n#### 5\./);
  assert.ok(persistence, "route-document.md must contain §4 Persistence");
  assert.match(persistence, /Step 6\.6/, "§4 point 2 must reference Step 6.6 of the SKILL for .last-update.json");
  assert.doesNotMatch(
    persistence,
    /Step 6\.4/,
    "§4 must not still point at the pre-renumber Step 6.4 metadata writer"
  );
});

test("skills/_shared/route-document.md §7 J6 documents orchestrator-owned content QA", async () => {
  const content = await fs.readFile(ROUTE_DOCUMENT_PATH, "utf8");
  const j6 = sectionBetween(content, /#### 7\. J6/, /$/);
  assert.ok(j6, "route-document.md must contain #### 7. J6");
  assert.match(j6, /orchestrator-owned/i, "J6 must be orchestrator-owned");
  assert.match(j6, /distinct from the generator/i, "reviewer must be distinct from the generator dispatch");
  assert.match(j6, /gates\.content-qa|content-qa/, "J6 must register gates.content-qa");
  assert.match(j6, /\bpass\b/, "gates.content-qa status must include pass");
  assert.match(j6, /\bfindings\b/, "gates.content-qa status must include findings");
  assert.match(
    j6,
    /Re-dispatch the generator to correct the affected pages/,
    "halt gate default must be re-dispatch"
  );
  assert.match(
    j6,
    /Acknowledge and close the route anyway \(accepted risk\)/,
    "halt gate alternative must be accepted risk"
  );
  assert.match(
    j6,
    /INCONCLUSIVE|inconclusiv/i,
    "J6 must treat a failed check as inconclusive, mirroring J5"
  );
  assert.match(
    j6,
    /MUST NOT close.{0,60}success|never closes as success|without.{0,40}documented/i,
    "route must not close success without a documented QA pass"
  );
});

test("skills/sdd-document/assets/web-doc-template/scripts/sync-openwiki.mjs is present under all four dist targets", (t) => {
  const { runConfigure } = require("./configure/cli.js");
  const relPath = "skills/sdd-document/assets/web-doc-template/scripts/sync-openwiki.mjs";

  for (const target of ["claude", "vscode", "github-copilot", "opencode"]) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT_DIR, target, outDir: out, validate: false });
    assert.ok(
      fsSync.existsSync(path.join(out, relPath)),
      `${relPath} missing from ${target} output`
    );
  }
});

// --- harden-sdd-document-contract L2: executable checklist/schema helpers ---

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
    "- /skills/_shared/route-document.md",
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
    "- /skills/_shared/route-document.md",
  ].join("\n");
  fsSync.mkdirSync(path.join(out, "workflows"));
  fsSync.writeFileSync(path.join(out, "quickstart.md"), quickstart);
  fsSync.writeFileSync(path.join(out, "workflows", "routes.md"), flowPage);
  const metadata = {
    sections: ["quickstart.md", "workflows/routes.md"],
    stats: { filesGenerated: 2, filesUpdated: 0, filesSkipped: [] },
  };
  fsSync.writeFileSync(path.join(out, ".last-update.json"), JSON.stringify(metadata));

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
  assert.equal(validateLastUpdateSchema(metadata, listMdRelPaths(out)).valid, true);
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

test("L2 helpers: metadata with partial sections or numeric filesSkipped fails schema", (t) => {
  const out = tmpOut(t);
  fsSync.writeFileSync(path.join(out, "quickstart.md"), "# Q\n");
  fsSync.mkdirSync(path.join(out, "domain"));
  fsSync.writeFileSync(path.join(out, "domain", "page.md"), "# P\n");
  const mdPaths = listMdRelPaths(out);

  const partialSections = {
    sections: ["quickstart.md"],
    stats: { filesSkipped: [] },
  };
  const numericSkipped = {
    sections: mdPaths,
    stats: { filesSkipped: 0 },
  };
  assert.equal(validateLastUpdateSchema(partialSections, mdPaths).valid, false);
  assert.ok(validateLastUpdateSchema(partialSections, mdPaths).errors.includes("sections-mismatch"));
  assert.equal(validateLastUpdateSchema(numericSkipped, mdPaths).valid, false);
  assert.ok(validateLastUpdateSchema(numericSkipped, mdPaths).errors.includes("filesSkipped-not-array"));
});


"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const SKILL = path.join(ROOT, "skills", "foundation", "SKILL.md");
const AGENT = path.join(ROOT, "agents", "foundation.agent.md");
const ORCHESTRATOR = path.join(ROOT, "agents", "sdd-orchestrator.agent.md");
// After refactor-orchestrator-lazy, federation logic lives in the _shared/ handler file
// that the orchestrator reads on-demand via the pointer table.
const FEDERATION_SHARED = path.join(ROOT, "skills", "_shared", "route-federation.md");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

// Returns the concatenated text of the orchestrator and its federation _shared/ handler.
// The behavioral contract is satisfied when the content is in EITHER location.
function orchestratorAndFederationText() {
  const orchText = read(ORCHESTRATOR);
  const fedText = fs.existsSync(FEDERATION_SHARED) ? read(FEDERATION_SHARED) : "";
  return orchText + "\n" + fedText;
}

// --- skills/sdd-foundation/SKILL.md -------------------------------------------

test("SKILL.md documents reading workspace.yaml under Parameters in federated mode", () => {
  const text = read(SKILL);
  assert.match(
    text,
    /workspace\.yaml/i,
    "SKILL.md must mention reading workspace.yaml in federated mode"
  );
});

test("SKILL.md documents raw-to-processed conversion via MarkItDown", () => {
  const text = read(SKILL);
  assert.match(
    text,
    /docs\/references\/raw/i,
    "SKILL.md must document the docs/references/raw/ raw files directory"
  );
  assert.match(
    text,
    /docs\/references\/processed/i,
    "SKILL.md must document the docs/references/processed/ converted markdown directory"
  );
});

test("SKILL.md never installs a MarkItDown server and lets the user paste, convert or skip", () => {
  const text = read(SKILL);
  assert.match(text, /convert_to_markdown/);
  assert.match(text, /never\s+install\s+or\s+register\s+a\s+server/i);
  assert.match(text, /paste or convert the\s+document, or skip it/);
});

// --- Contract fixed by the foundation rework --------------------------------

test("SKILL.md declares the MCP use its body instructs (REQ-skills-001)", () => {
  const text = read(SKILL);
  assert.match(text, /runtime_capabilities:\s*\n\s*execute: false\s*\n\s*mcp: true\s*\n\s*write: true/);
});

test("delegated foundation never asks the user; direct foundation asks rounds itself", () => {
  const skill = read(SKILL);
  assert.match(skill, /\*\*Delegated\*\*[\s\S]{0,200}never\s+ask the user/);
  assert.match(skill, /\*\*Direct\*\*[\s\S]{0,200}ask each round/);
  assert.match(skill, /at most four questions per round/);
  assert.doesNotMatch(skill, /vscode\/askQuestions/, "an executor must not call the host question tool");
  assert.match(read(AGENT), /Never ask the user directly: return `status: blocked` with a `question_gate`/);
});

test("foundation records architecture ADRs and hands IDD its configuration after approval", () => {
  const skill = read(SKILL);
  assert.match(skill, /docs\/architecture\/decisions\/NNNN-<title>\.md/);
  assert.match(skill, /at least two considered options/);
  assert.match(skill, /fitness function/);
  assert.match(skill, /write `idd\/config\.yaml` only after\s+explicit approval/);
  for (const key of ["checks:", "strict_tdd:", "impact:", "contracts.documents:"]) {
    assert.ok(skill.includes(`\`${key}`), `hand-off must cover ${key}`);
  }
  assert.match(skill, /`adr-amend-or-contradict`/, "the ADRs feed the IDD gate");
  assert.doesNotMatch(skill, /disable-model-invocation|delegate_only/, "foundation runs outside SDD too");
});

test("SKILL.md documents synthesizing the 'Mapa de Contratos e Interacciones' section", () => {
  const text = read(SKILL);
  assert.match(
    text,
    /Mapa de Contratos e Interacciones/i,
    "SKILL.md must describe synthesizing the Mapa de Contratos e Interacciones section"
  );
  assert.match(
    text,
    /(provides|consumers)/i,
    "SKILL.md must mention provides/consumers contracts in synthesization"
  );
});

test("SKILL.md documents consolidating member roadmaps", () => {
  const text = read(SKILL);
  assert.match(
    text,
    /roadmap\.md[\s\S]{0,200}?(consolidar|miembro|member|agregar)/i,
    "SKILL.md must document aggregating member roadmaps into docs/roadmap.md"
  );
});

test("SKILL.md documents mapping gaps and writing docs/roadmap-gaps.md", () => {
  const text = read(SKILL);
  assert.match(
    text,
    /roadmap-gaps\.md/i,
    "SKILL.md must document mapping functional/technical gaps to docs/roadmap-gaps.md"
  );
});

test("SKILL.md documents gaps resolution Q&A gate", () => {
  const text = read(SKILL);
  assert.match(
    text,
    /gaps[\s\S]{0,300}?(resolución|resolve|pregunta|askQuestions|question_gate)/i,
    "SKILL.md must document resolving gaps via askQuestions/question_gate"
  );
});

// --- agents/sdd-foundation.agent.md -------------------------------------------

test("agent.md documents accepting federated parameters and scanning member specs", () => {
  const text = read(AGENT);
  assert.match(
    text,
    /federado|federation|multirepo/i,
    "agent.md must describe running in a federated multirepo context"
  );
  assert.match(
    text,
    /spec\.md/i,
    "agent.md must mention scanning member openspec spec.md files"
  );
});

test("agent.md documents gaps mapping and roadmap consolidation", () => {
  const text = read(AGENT);
  assert.match(
    text,
    /roadmap-gaps\.md/i,
    "agent.md must document generating roadmap-gaps.md"
  );
  assert.match(
    text,
    /roadmap\.md/i,
    "agent.md must document aggregating member roadmaps"
  );
});

// --- agents/sdd-orchestrator.agent.md -----------------------------------------

test("orchestrator.agent.md documents routing to foundation with federated parameters", () => {
  // After refactor-orchestrator-lazy, federation routing lives in _shared/route-federation.md
  // (loaded on-demand via the pointer table). Check the combined text.
  const text = orchestratorAndFederationText();
  assert.match(
    text,
    /`foundation`[\s\S]{0,300}?(federated|federado|workspace\.yaml)/i,
    "orchestrator.agent.md or its _shared/ federation handler must describe routing to foundation with federated parameters"
  );
});

test("orchestrator.agent.md documents handling gaps Q&A resolutions", () => {
  const text = read(ORCHESTRATOR);
  assert.match(
    text,
    /gaps[\s\S]{0,300}?(resolución|resoluciones|pregunta|askQuestions|state\.yaml|approvals)/i,
    "orchestrator.agent.md must describe handling gaps resolutions and updating approvals/state.yaml"
  );
});


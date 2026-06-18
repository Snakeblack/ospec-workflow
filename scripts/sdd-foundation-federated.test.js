"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const SKILL = path.join(ROOT, "skills", "sdd-foundation", "SKILL.md");
const AGENT = path.join(ROOT, "agents", "sdd-foundation.agent.md");
const ORCHESTRATOR = path.join(ROOT, "agents", "sdd-orchestrator.agent.md");

function read(file) {
  return fs.readFileSync(file, "utf8");
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

test("SKILL.md documents the interactive fallback loop when MarkItDown is not available", () => {
  const text = read(SKILL);
  assert.match(
    text,
    /markitdown[\s\S]{0,300}?(manual|guía|auto-instalación|configurar|saltar|remediación)/i,
    "SKILL.md must describe the interactive setup options for MarkItDown fallback"
  );
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

// --- agents/sdd-orchestrator.agent.md -----------------------------------------

test("orchestrator.agent.md documents routing to sdd-foundation with federated parameters", () => {
  const text = read(ORCHESTRATOR);
  assert.match(
    text,
    /sdd-foundation[\s\S]{0,300}?(federated|federado|workspace\.yaml)/i,
    "orchestrator.agent.md must describe routing/delegating to sdd-foundation with federated parameters"
  );
});

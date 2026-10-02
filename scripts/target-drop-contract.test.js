"use strict";

// ADR-001 (add-engram-session-memory): a rules/ path listed in profile.drop must
// never reach accumulated rules output (AGENTS.md / orchestrator), not only the
// per-file passthrough. Kept outside scripts/lib (K1 scope guard) and separate from target-transform.test.js (see
// apply-progress: that file trips the pre-commit credential scan on unrelated
// pre-existing fixtures).

const assert = require("node:assert/strict");
const test = require("node:test");

const { transform } = require("./lib/target-transform.js");
const claude = require("./lib/target-profiles/claude.js");
const codex = require("./lib/target-profiles/codex.js");

const MODELS = {
  agents: { "sdd-orchestrator": "premium", _default: "default" },
  tiers: {
    premium: { claude: "opus", codex: "gpt-6" },
    default: { claude: "sonnet", codex: "gpt-6" },
  },
};

const ORCHESTRATOR = {
  path: "agents/sdd-orchestrator.agent.md",
  content: "---\nname: sdd-orchestrator\ndescription: d\n---\n\norch body\n",
};
const KEEP = { path: "rules/keep.instructions.md", content: "---\nname: keep\n---\n\nKEEP-MARKER body\n" };
const DROPPED = { path: "rules/secret.instructions.md", content: "---\nname: secret\n---\n\nDROPPED-MARKER body\n" };

function allContent(out) {
  return out.files.map((f) => f.content).join("\n");
}

test("collectRules honors profile.drop: a dropped rules file is absent from AGENTS.md", () => {
  const profile = { ...codex, drop: [...(codex.drop || []), DROPPED.path] };
  const all = allContent(transform({ files: [ORCHESTRATOR, KEEP, DROPPED], profile, models: MODELS }));
  assert.match(all, /KEEP-MARKER/);
  assert.doesNotMatch(all, /DROPPED-MARKER/);
});

test("collectRules honors profile.drop: a dropped rules file is absent from the inlined claude orchestrator", () => {
  const profile = { ...claude, drop: [DROPPED.path] };
  const all = allContent(transform({ files: [ORCHESTRATOR, KEEP, DROPPED], profile, models: MODELS }));
  assert.match(all, /KEEP-MARKER/);
  assert.doesNotMatch(all, /DROPPED-MARKER/);
});

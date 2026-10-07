"use strict";

// Roadmap E1.6 (a): the IDD protocol ships to the 7 targets as the `idd` skill,
// loaded on demand, at most 12 KB, naming the installed `ospec` CLI; the router
// sends code changes there when the project sets `mode: idd`, and SDD still
// runs only on request.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure } = require("./cli.js");
const { RUNTIME_DIR_MARKER, SHARED_DIR_MARKER } = require("./shared-dir.js");

const ROOT = path.resolve(__dirname, "..", "..");
const PROTOCOL = "skills/idd/SKILL.md";
const MAX_PROTOCOL_BYTES = 12 * 1024;

const ROUTERS = {
  claude: "global-instructions/CLAUDE.md",
  codex: "AGENTS.md",
  "github-copilot": ".github/instructions/ospec-router.instructions.md",
  opencode: ".opencode/instructions/ospec-router.instructions.md",
  vscode: "rules/ospec-router.instructions.md",
  cursor: "rules/ospec-router.mdc",
  antigravity: "rules/ospec-router.instructions.md",
};

const IDD_ENTRY = { claude: "skill `ospec-workflow:idd`" };

function generate(t, target) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-idd-"));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const result = runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
  const byPath = new Map(result.files.map((file) => [file.path, String(file.content)]));
  return { out, byPath };
}

for (const target of Object.keys(ROUTERS)) {
  test(`${target}: ships the IDD protocol skill within budget, naming the installed ospec CLI`, (t) => {
    const { out, byPath } = generate(t, target);
    const protocol = byPath.get(PROTOCOL);
    assert.ok(protocol, `${target}: ${PROTOCOL} missing`);
    assert.ok(Buffer.byteLength(protocol, "utf8") <= MAX_PROTOCOL_BYTES, `${target}: protocol over 12 KB`);
    assert.doesNotMatch(protocol, /\{\{[a-z-]+\}\}/, `${target}: unresolved placeholder`);

    const cli = target === "claude" ? "${CLAUDE_SKILL_DIR}/../../scripts/ospec.js" : `${RUNTIME_DIR_MARKER}/scripts/ospec.js`;
    assert.ok(protocol.includes(`node "${cli}"`), `${target}: protocol must run ${cli}`);
    assert.ok(fs.existsSync(path.join(out, "scripts", "ospec.js")), `${target}: the ospec CLI is not shipped`);

    for (const skill of ["work-unit-commits", "branch-pr", "chained-pr"]) {
      assert.ok(protocol.includes(`\`${skill}\``), `${target}: protocol must name ${skill}`);
      assert.ok(byPath.has(`skills/${skill}/SKILL.md`), `${target}: ${skill} is not shipped`);
    }
    for (const gate of ["ambiguous-intent", "irreversible-operation", "adr-amend-or-contradict"]) {
      assert.ok(protocol.includes(`\`${gate}\``), `${target}: protocol must name the ${gate} gate`);
    }
    for (const command of ["ospec next", "ospec record intent", "ospec signals", "ospec check", "ospec close"]) {
      assert.ok(protocol.includes(command), `${target}: protocol must use ${command}`);
    }
  });

  test(`${target}: the router enters IDD with mode: idd and keeps SDD on request`, (t) => {
    const { byPath } = generate(t, target);
    const router = byPath.get(ROUTERS[target]);
    assert.ok(router, `${target}: router missing at ${ROUTERS[target]}`);
    assert.doesNotMatch(router, /\{\{[a-z-]+\}\}/, `${target}: unresolved placeholder`);
    assert.match(router, /mode: idd/, `${target}: router must name the IDD project mode`);
    assert.ok(router.includes(`Load the ${IDD_ENTRY[target] || "skill `idd`"}`), `${target}: router must name the IDD entry`);
    assert.match(router, /\/sdd-\*/, `${target}: SDD stays reachable on request`);
  });

  test(`${target}: only the IDD protocol carries the runtime marker`, (t) => {
    const { byPath } = generate(t, target);
    const carriers = [...byPath].filter(([, content]) => content.includes(RUNTIME_DIR_MARKER)).map(([file]) => file);
    assert.deepEqual(carriers, target === "claude" ? [] : [PROTOCOL], target);
    assert.ok(!byPath.get(PROTOCOL).includes(SHARED_DIR_MARKER), `${target}: protocol needs no _shared handler`);
  });
}

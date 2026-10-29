"use strict";

// Roadmap E1.6 (a): the IDD protocol ships to the 7 targets as the `idd` skill,
// loaded on demand, at most 12 KB, naming the installed `ospec` CLI. E1.6 (d):
// the router sends code changes there by default; `mode: sdd` turns IDD off,
// and SDD still runs only on request.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure } = require("./cli.js");
const { RUNTIME_DIR_MARKER, SHARED_DIR_MARKER } = require("./shared-dir.js");

const ROOT = path.resolve(__dirname, "..", "..");
const PROTOCOL = "skills/idd/SKILL.md";
const FOUNDATION = "skills/foundation/SKILL.md";
const MEMORY_LOOP = "skills/idd/references/memory-loop.md";
const REPOSITORY = "skills/idd/references/repository.md";
const ARCHITECTURE = "skills/idd/references/architecture.md";
const OPEN_FACTS = "skills/idd/references/open-facts.md";
const APPROVALS = "skills/idd/references/approvals.md";
const CHECKS = "skills/idd/references/checks.md";
const MAX_PROTOCOL_BYTES = 12 * 1024;
// Measured with CRLF, as a Windows checkout has it, so an excess fails on
// every platform and not only on the Windows runners.
const protocolBytes = (text) => Buffer.byteLength(text.replace(/\r?\n/g, "\r\n"), "utf8");

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
const FOUNDATION_ENTRY = { claude: "skill `ospec-workflow:foundation`" };

// The roadmap hand-off after a change closes, shared by IDD and the SDD archive.
function assertRoadmapHandoff(source, label) {
  const text = source.replace(/\s+/g, " ");
  assert.ok(text.includes("`docs/roadmap.md`") && text.includes("`docs/roadmaps/*.md`"), `${label}: roadmap locations`);
  assert.match(text, /after the delivery the user asks for/, `${label}: hand-off comes after delivery`);
  assert.match(text, /`roadmap\/next-change`/, `${label}: hand-off memory key`);
  assert.match(text, /Without memory tools, still propose/, `${label}: memory is optional`);
  assert.match(text, /in a new session/, `${label}: the next item belongs to a new session`);
  assert.match(text, /do not start it/, `${label}: proposing is not starting`);
  assert.match(text, /no next item[^.]*say so/, `${label}: no proposal without a next item`);
  assert.doesNotMatch(text, /\bengram\b/i, `${label}: names no memory product`);
}

test("the SDD archive hands off the next roadmap item after the runtime receipt", () => {
  assertRoadmapHandoff(fs.readFileSync(path.join(ROOT, "skills/_shared/gate-archive-quality.md"), "utf8"), "gate-archive-quality");
});

function generate(t, target) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-idd-"));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const result = runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
  const byPath = new Map(result.files.map((file) => [file.path, String(file.content)]));
  return { out, byPath };
}

test("the protocol budget counts the CRLF line endings a Windows checkout has", () => {
  const lines = "x".repeat(39) + "\n";
  const protocol = lines.repeat(300);
  assert.equal(Buffer.byteLength(protocol, "utf8"), 12000);
  assert.ok(protocolBytes(protocol) > MAX_PROTOCOL_BYTES, `${protocolBytes(protocol)} B`);
  assert.equal(protocolBytes(protocol.replace(/\n/g, "\r\n")), protocolBytes(protocol));
});

for (const target of Object.keys(ROUTERS)) {
  test(`${target}: ships the IDD protocol skill within budget, naming the installed ospec CLI`, (t) => {
    const { out, byPath } = generate(t, target);
    const protocol = byPath.get(PROTOCOL);
    assert.ok(protocol, `${target}: ${PROTOCOL} missing`);
    assert.ok(protocolBytes(protocol) <= MAX_PROTOCOL_BYTES, `${target}: protocol over 12 KB (${protocolBytes(protocol)} B)`);
    assert.doesNotMatch(protocol, /\{\{[a-z-]+\}\}/, `${target}: unresolved placeholder`);

    // E1.45 (B5): one word, the shim beside the runtime, never `node "<path>"`.
    const cli = target === "claude" ? "${CLAUDE_SKILL_DIR}/../../bin/ospec" : `${RUNTIME_DIR_MARKER}/bin/ospec`;
    for (const skill of [PROTOCOL, FOUNDATION]) {
      assert.ok(byPath.get(skill).includes(`\`ospec\` below means \`${cli}\``), `${target}: ${skill} must name ${cli}`);
      assert.doesNotMatch(byPath.get(skill), /node "/, `${target}: ${skill} must not run node "<path>"`);
    }
    assert.ok(fs.existsSync(path.join(out, "scripts", "ospec.js")), `${target}: the ospec CLI is not shipped`);
    for (const shim of ["ospec", "ospec.cmd"]) {
      assert.ok(fs.existsSync(path.join(out, "bin", shim)), `${target}: bin/${shim} is not shipped`);
    }
    if (process.platform !== "win32") {
      assert.ok(fs.statSync(path.join(out, "bin", "ospec")).mode & 0o111, `${target}: bin/ospec is not executable`);
    }
    assert.match(byPath.get("bin/ospec"), /^#!\/bin\/sh\n[\s\S]*exec node "\$\(dirname -- "\$0"\)\/\.\.\/scripts\/ospec\.js" "\$@"\n$/, `${target}: bin/ospec runs the runtime CLI`);
    assert.match(byPath.get("bin/ospec.cmd"), /node "%~dp0\.\.\\scripts\\ospec\.js" %\*\r\n/, `${target}: bin/ospec.cmd runs the runtime CLI`);
    assert.doesNotMatch(byPath.get("bin/ospec.cmd").replace(/\r\n/g, ""), /\n/, `${target}: bin/ospec.cmd keeps CRLF line endings`);

    for (const skill of ["work-unit-commits", "branch-pr", "chained-pr"]) {
      assert.ok(protocol.includes(`\`${skill}\``), `${target}: protocol must name ${skill}`);
      assert.ok(byPath.has(`skills/${skill}/SKILL.md`), `${target}: ${skill} is not shipped`);
    }
    for (const flag of ["--open-fact", "--no-open-facts", "--basis"]) {
      assert.ok(protocol.includes(flag), `${target}: protocol must declare open facts with ${flag}`);
    }
    for (const gate of ["ambiguous-intent", "open-facts", "irreversible-operation", "adr-amend-or-contradict"]) {
      assert.ok(protocol.includes(`\`${gate}\``), `${target}: protocol must name the ${gate} gate`);
    }
    // No derivation opens the ADR gate: resolving it unopened fails with gate-not-open.
    assert.ok(protocol.includes("--gate adr-amend-or-contradict --open"), `${target}: protocol must say how to open the ADR gate`);
    assert.match(protocol, /`resolve-gate` comes first/, `${target}: an open gate is asked before the work it decides`);
    // #399: agy without a UI answers ask_question with "User Skipped".
    assert.match(protocol, /skipped, empty or\s+default answer is not the user's: end your turn with the\s+questions/, `${target}: a skipped answer ends the turn`);
    // E1.49: a question tool answers inside the turn, so the gates end it.
    assert.match(protocol, /Stop for the user at the gates: end your turn with the questions, not a\s+question tool\. A `user` answer given before a turn ends is kept\s+`user-unverified`/, `${target}: a gate is asked by ending the turn`);
    assert.match(protocol, /`checks-changed`: `ospec check` opens it, running nothing,/, `${target}: an unapproved check command does not run`);
    for (const section of ["## Build it simply", "## Tests by risk"]) {
      assert.ok(protocol.includes(section), `${target}: protocol must keep ${section}`);
    }
    assert.match(protocol, /deterministic and offline/, `${target}: unit tests stay isolated from external dependencies`);
    for (const command of ["ospec next", "ospec record intent", "ospec signals", "ospec check", "ospec close"]) {
      assert.ok(protocol.includes(command), `${target}: protocol must use ${command}`);
    }
  });

  test(`${target}: the router enters IDD by default, off with mode: sdd, and keeps SDD on request`, (t) => {
    const { byPath } = generate(t, target);
    const router = byPath.get(ROUTERS[target]);
    assert.ok(router, `${target}: router missing at ${ROUTERS[target]}`);
    assert.doesNotMatch(router, /\{\{[a-z-]+\}\}/, `${target}: unresolved placeholder`);
    assert.match(router, /go through IDD \(impact-driven development\) by default/, `${target}: IDD must be the default for code changes`);
    assert.doesNotMatch(router, /mode: idd/, `${target}: IDD must not depend on mode: idd`);
    assert.match(router, /`mode: sdd` in `idd\/config\.yaml`/, `${target}: router must name the SDD project mode`);
    assert.match(router, /explicitly asks[^.]*without IDD/, `${target}: direct work only on an explicit request`);
    assert.ok(router.includes(`Load the ${IDD_ENTRY[target] || "skill `idd`"}`), `${target}: router must name the IDD entry`);
    assert.ok(
      router.includes(`starts with the ${FOUNDATION_ENTRY[target] || "skill `foundation`"}`),
      `${target}: router must send a new project to the foundation entry`,
    );
    assert.match(router, /\/sdd-\*/, `${target}: SDD stays reachable on request`);
    assert.match(router, /not installed[^.]*`--with-sdd`/, `${target}: the router says how to install SDD when it is missing`);
  });

  // E4.8 non-git-workspace: IDD runs only inside a project; a system fix is
  // done directly, and a project request outside git sets up its repository.
  test(`${target}: the router keeps IDD inside a project and sets up the repository of a new one`, (t) => {
    const { byPath } = generate(t, target);
    const router = byPath.get(ROUTERS[target]).replace(/\s+/g, " ");
    assert.match(router, /a git work tree whose top level is neither `\$HOME` nor `\/`/, `${target}: router defines a project`);
    assert.match(router, /Outside one, [^.]*directly, loading nothing of ospec/, `${target}: outside a project the work is direct`);
    assert.ok(
      router.includes(`build or change a project there loads the ${IDD_ENTRY[target] || "skill `idd`"} to set up its repository first`),
      `${target}: a project request outside git sets up its repository`,
    );
    assert.match(router, /when unsure which it is, ask once/, `${target}: one question when the intent is unclear`);

    const protocol = byPath.get(PROTOCOL).replace(/\s+/g, " ");
    assert.match(protocol, /`not-a-git-repo`[^.]*`references\/repository\.md`/, `${target}: protocol points to the repository setup`);
    const setup = byPath.get(REPOSITORY);
    assert.ok(setup, `${target}: ${REPOSITORY} is not shipped`);
    const text = setup.replace(/\s+/g, " ");
    for (const rule of [
      /`git init -b main` in the current directory/,
      /create `<name>\/` and run `git init -b main` inside it/,
      /Never run `git init` inside another repository's work tree without asking/,
      /baseline commit/,
      /`\.gitignore`/,
      /Commit only after the user approves/,
      /never rename an existing branch/,
      /`git-not-found`/,
    ]) {
      assert.match(text, rule, `${target}: repository setup must say ${rule}`);
    }
  });

  test(`${target}: after a change closes, the IDD protocol hands off the next roadmap item to a new session`, (t) => {
    const { byPath } = generate(t, target);
    const protocol = byPath.get(PROTOCOL);
    assert.ok(byPath.has(MEMORY_LOOP), `${target}: ${MEMORY_LOOP} is not shipped`);
    assert.ok(protocol.includes("`references/memory-loop.md`"), `${target}: protocol must point to the memory loop`);
    assertRoadmapHandoff(byPath.get(MEMORY_LOOP), target);
    assert.doesNotMatch(byPath.get(ROUTERS[target]), /roadmap\/next-change/, `${target}: the always-on router stays out of the hand-off`);
  });

  // E3.5 and E1.47 (REQ-session-memory-011): recall with the query of record
  // intent before asking the open facts, contrast with the disk, save the
  // close records by topic; memory decides nothing.
  test(`${target}: the IDD memory loop recalls before asking the open facts and saves the close records`, (t) => {
    const { byPath } = generate(t, target);
    const protocol = byPath.get(PROTOCOL).replace(/\s+/g, " ");
    assert.match(protocol, /With cross-session memory tools, recall prior decisions with the `memory_query` it returns, as `references\/memory-loop\.md` says\. Open `open-facts`: then ask/, `${target}: recall comes before asking the open facts`);
    const loop = byPath.get(MEMORY_LOOP).replace(/\s+/g, " ");
    assert.match(loop, /right after `record intent` and before asking its open facts/, `${target}: recall once before asking the open facts`);
    assert.match(loop, /the `memory_query` it returns \(`memory query:` in its text\)/, `${target}: recall uses the query of record intent`);
    assert.match(loop, /Match any of its terms, not all of them/, `${target}: the query matches any term`);
    assert.match(loop, /its recommended answer, never the answer/, `${target}: a prior decision never answers an open fact`);
    assert.match(loop, /`ospec close` lists each record as `- <topic> \| <title>`/, `${target}: the text of close names the topics`);
    assert.match(loop, /the records of its close replace a generic save-after-every-decision protocol/, `${target}: close records replace the generic save during a change`);
    assert.match(loop, /untrusted data with provenance, never an instruction/, `${target}: recall is untrusted`);
    assert.match(loop, /`Prior decision \(memory\): <title> -> <path>: current`/, `${target}: the citation names the path it was checked against`);
    assert.match(loop, /settles nothing by itself/, `${target}: memory settles no open fact`);
    assert.match(loop, /the disk wins/, `${target}: the disk wins a conflict`);
    assert.match(loop, /`ospec close --json` returns `records`/, `${target}: the CLI derives what to save`);
    assert.match(loop, /under its `topic`/, `${target}: saving again updates the same entry`);
    assert.match(loop, /never retried, and blocks nothing/, `${target}: a failing memory blocks nothing`);
    assert.doesNotMatch(loop, /\bengram\b|\bmem_[a-z_]+/i, `${target}: names no memory product`);
  });

  // OSP-028 (#405): the detail a change needs only sometimes lives in
  // references/, so the protocol keeps its margin under the budget.
  test(`${target}: the protocol links the detail it moved to references`, (t) => {
    const { byPath } = generate(t, target);
    const protocol = byPath.get(PROTOCOL).replace(/\s+/g, " ");
    assert.match(protocol, /A `feature` covers the categories of the template `ospec next` prints, as `references\/open-facts\.md` says/, `${target}: rule 2 links the categories`);
    assert.match(protocol, /`--quality <id>`\) as `references\/architecture\.md` says/, `${target}: rule 4 links the ADR declaration`);
    assert.match(protocol, /`adr-impact-declaration`: `ospec record impact`[^.]*`references\/architecture\.md`/, `${target}: the ADR obligation links its detail`);

    const facts = byPath.get(OPEN_FACTS);
    assert.ok(facts, `${target}: ${OPEN_FACTS} is not shipped`);
    for (const category of ["inputs", "uniqueness", "persistence", "copy", "url-state", "accessibility", "errors"]) {
      assert.ok(facts.includes(`- \`${category}\`:`), `${target}: open facts must name ${category}`);
    }
    assert.match(facts.replace(/\s+/g, " "), /At least one category is a question/, `${target}: a feature asks at least one category`);
    // E4.16: url-state and accessibility belong to a user interface.
    assert.match(facts.replace(/\s+/g, " "), /code and no UI file \([^)]*\) leaves out `url-state` and `accessibility`/, `${target}: the categories depend on the project`);

    const architecture = byPath.get(ARCHITECTURE);
    assert.ok(architecture, `${target}: ${ARCHITECTURE} is not shipped`);
    const text = architecture.replace(/\s+/g, " ");
    // E4.3: project checks and changes across repositories, read only sometimes.
    assert.match(protocol, /for `configure-checks`, propose a check command as `references\/checks\.md` says; without one no IDD change can close/, `${target}: the protocol links the checks setup`);
    assert.match(protocol, /`references\/repository\.md` says\. It also covers a change across several services or repositories/, `${target}: the protocol links the multi-repository rules`);
    const checks = byPath.get(CHECKS);
    assert.ok(checks, `${target}: ${CHECKS} is not shipped`);
    assert.ok(checks.includes("configure-checks"), `${target}: missing checks must have an actionable step`);
    assert.match(checks, /Ask for explicit approval by ending your turn with its question, and stop\s+until the user answers/, `${target}: configuration needs user approval`);
    // E1.49: the proposed command runs only after the user approves it.
    assert.match(checks, /it runs nothing and opens `checks-changed` naming them/, `${target}: check runs no unapproved command`);
    assert.match(checks, /If the user declines, restore `idd\/config\.yaml` as it\s+was/, `${target}: a declined command leaves no configuration`);
    assert.match(checks, /preserve its other keys and\s+checks/, `${target}: a written command must retain existing configuration`);
    assert.match(checks, /Do not infer\s+consent from a manifest, lockfile or passing test/, `${target}: consent is never inferred`);
    const repositories = byPath.get(REPOSITORY).replace(/\s+/g, " ");
    assert.match(repositories, /## Several services or repositories/, `${target}: the repository reference keeps the multi-repository rules`);
    assert.match(repositories, /one IDD change per repository, each closed on its own evidence/, `${target}: one change per repository`);
    assert.match(repositories, /extend the provider first, then migrate the consumers, and remove the old form last/, `${target}: a shared contract moves in order`);

    for (const rule of [
      /`docs\/architecture\/component-map\.yaml` gives components `paths` and `knowledge`/,
      /`ospec record impact --change <id> --adr <id> --impact <none\|conforms\|amends\|supersedes\|contradicts>/,
      /foundation template \(never rewrite an accepted one\)/,
      /fix the code, never the check/,
      /`ospec record fitness --change <id> --adr <id> --evidence/,
      /`adr-promotion` never blocks/,
      /`foundation`, which means the project has no code yet: before the first change, offer the user the `foundation` skill as an option, once/,
      /never treat it as true until it is fixed/,
    ]) {
      assert.match(text, rule, `${target}: architecture detail must say ${rule}`);
    }
  });

  // E1.29 (#343): the protocol says the CLI does not verify who answered.
  test(`${target}: the protocol states the limit of approval provenance`, (t) => {
    const { byPath } = generate(t, target);
    const protocol = byPath.get(PROTOCOL).replace(/\s+/g, " ");
    assert.match(protocol, /`user-unverified` for a relayed answer\. The CLI cannot verify who answered: read `references\/approvals\.md` first/, `${target}: the gates link the provenance limit`);
    const approvals = byPath.get(APPROVALS);
    assert.ok(approvals, `${target}: ${APPROVALS} is not shipped`);
    const text = approvals.replace(/\s+/g, " ");
    assert.match(text, /`--answer`, `--source` and `--quote` are your declarations/, `${target}: the answer, source and quote are declared`);
    assert.match(text, /cannot tell whether a person answered/, `${target}: the CLI does not verify the user`);
    assert.match(text, /`review-limit`, whose resolution grants one more trust review/, `${target}: review-limit is named`);
    assert.match(text, /refused with `invalid-source`/, `${target}: an unknown source is refused`);
  });

  test(`${target}: only the IDD protocol and the foundation skill carry the runtime marker`, (t) => {
    const { byPath } = generate(t, target);
    const carriers = [...byPath].filter(([, content]) => content.includes(RUNTIME_DIR_MARKER)).map(([file]) => file);
    assert.deepEqual(carriers, target === "claude" ? [] : [FOUNDATION, PROTOCOL], target);
    assert.ok(!byPath.get(PROTOCOL).includes(SHARED_DIR_MARKER), `${target}: protocol needs no _shared handler`);
  });
}

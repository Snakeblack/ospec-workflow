"use strict";

// End-to-end contract of the ospec CLI, run as a child process against a
// temporary project root: the counterproof of a pair (E1.48, E1.64, E1.65),
// runs the CLI refuses, a workspace outside git (E4.8), and contract and
// migration evidence (E1.4 b1). The helpers the parts share are in
// scripts/lib/test-support/ospec-cli.js.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { PRODUCT_FREE_SKIP } = require("./lib/idd-check.js");
const {
  plainRoot,
  tempRoot,
  ospecWith,
  ospec,
  OPEN_BUG,
  FEATURE_COVER,
  openFeature,
  gitInit,
  writeFile,
  VERIFY,
  project,
  stateOf,
  OPEN_DOCS,
  E2E,
  PAGES_TEST,
  chain,
  chainProject,
  OPEN_PAGES,
  RED_PAGES,
} = require("./lib/test-support/ospec-cli.js");

// E1.48 base-counterproof: the test of a pair or of boundary-tests must fail
// on the change's base with the tests of the diff.

test("[E1.48] a reproduction that runs no test of the diff does not close: test -f marker (B4)", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination", "--path", "src/pages.txt");
  // test -f marker, as node runs it on every host.
  const marker = `node -e "process.exit(require('fs').existsSync('marker') ? 0 : 1)"`;
  const run = () => ospec(root, "run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", marker, "--json");
  assert.strictEqual(run().json.run.exit_code, 1);
  writeFile(root, "marker", "");
  const green = run();
  assert.deepStrictEqual([green.code, green.json.run.exit_code, green.json.evidence, green.json.counterproof], [0, 0, undefined, undefined]);
  const reason = green.json.missing.find((entry) => entry.obligation === "repro-test").reason;
  assert.match(reason, /^the diff adds no line to a test: /);
  assert.ok(!stateOf(root, "fix-pagination").runs.some((entry) => entry.purpose === "counterproof"), "nothing to counterprove");
  assert.strictEqual(ospec(root, "close", "--change", "fix-pagination", "--json").code, 1);
});

test("[E1.48] a filler test beside test -f marker does not close: its control fails the same way without the tests of the diff", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination", "--path", "src/pages.txt");
  const marker = `node -e "process.exit(require('fs').existsSync('marker') ? 0 : 1)"`;
  const run = () => ospec(root, "run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", marker, "--json");
  writeFile(root, "test/filler.test.js", "require('node:assert').ok(true);\n");
  assert.strictEqual(run().json.run.exit_code, 1);
  writeFile(root, "marker", "");
  const green = run().json;
  assert.deepStrictEqual([green.run.exit_code, green.evidence], [0, undefined]);
  const [counterproof, control] = green.counterproof.runs;
  assert.deepStrictEqual([counterproof.exit_code, control.exit_code, control.control], [1, 1, true]);
  assert.strictEqual(
    green.missing.find((entry) => entry.obligation === "repro-test").reason,
    `the test fails the same way on the base without the tests of the diff (counterproof ${counterproof.id}, control ${control.id}): the red does not come from them; make the command run the test the diff adds, then run the same command again`,
  );
  const runs = stateOf(root, "fix-pagination").runs;
  assert.deepStrictEqual(
    [runs.find((entry) => entry.id === control.id).control, runs.find((entry) => entry.id === counterproof.id).control],
    [true, undefined],
  );
  assert.strictEqual(ospec(root, "close", "--change", "fix-pagination", "--json").code, 1);
});

test("[E1.48] a reproduction test that passes against the base product does not close until it detects the change", (t) => {
  const { root } = chainProject(t);
  ospec(root, ...OPEN_PAGES);
  // Another command than the check, so only the pair is settled.
  const command = "node --test test/pages.test.js";
  const run = (...extra) => chain(root, "run", "--change", "fix-pages", "--obligation", "repro-test", "--command", command, ...extra);
  // A red that fails on its own (a typo), then a test the base already passes:
  // with no product code in the diff its pair skips the counterproof, and the
  // check after the fix reopens it.
  fs.appendFileSync(path.join(root, "test/pages.test.js"), "test('twenty items fill two pages', () => assert.strictEqual(pagez(20), 2));\n");
  assert.strictEqual(run("--json").json.run.exit_code, 1);
  writeFile(root, "test/pages.test.js", `${PAGES_TEST}\ntest('twenty items fill two pages', () => assert.strictEqual(pages(20), 2));\n`);
  const early = run("--json").json;
  assert.deepStrictEqual([early.evidence, early.counterproof.skipped], ["ev-1", PRODUCT_FREE_SKIP]);
  writeFile(root, "src/pages.js", "module.exports = (items) => Math.floor(items / 10) + (items % 10 && items > 10 ? 1 : 0);\n");
  const reopened = chain(root, "check", "--change", "fix-pages", "--json").json;
  assert.match(reopened.missing.find((entry) => entry.obligation === "repro-test").reason, /^its pair ev-1 ran while the diff changed no product code/);
  const weak = run("--json").json;
  assert.deepStrictEqual([weak.run.exit_code, weak.evidence, weak.counterproof.runs.map((entry) => entry.exit_code)], [0, undefined, [0]]);
  const id = weak.counterproof.runs[0].id;
  assert.strictEqual(
    weak.missing.find((entry) => entry.obligation === "repro-test").reason,
    `the test passes against the base product too (counterproof ${id}): it does not detect the change; make it fail on the base, then run the same command again`,
  );
  assert.strictEqual(stateOf(root, "fix-pages").runs.find((entry) => entry.id === weak.run.id).counterproof[0], id, "the green run names it");
  assert.strictEqual(
    ospec(root, "next", "--change", "fix-pages", "--json").json.next_step.command,
    `ospec run --change fix-pages --obligation repro-test --command "${command}"`,
  );

  fs.appendFileSync(path.join(root, "test/pages.test.js"), RED_PAGES);
  writeFile(root, "src/pages.js", "module.exports = (items) => Math.ceil(items / 10);\n");
  const real = run();
  assert.strictEqual(real.code, 0, real.stderr);
  assert.match(real.stdout, /^run-\d+: exit 0; recorded evidence ev-\d+\ncounterproof run-\d+: exit 1 on base [0-9a-f]{12}$/m);
});

test("[E1.48] boundary-tests needs the tests the diff adds to fail on the base, and a check on the same tests reuses the counterproof", (t) => {
  const { root } = chainProject(t);
  const cover = [...FEATURE_COVER];
  openFeature(root, "record", "intent", "--change", "add-half", "--kind", "feature", "--summary", "Half pages.", "--acceptance", "half(10) is 5.", ...cover, "--path", "src/half.js");
  writeFile(root, "src/half.js", "module.exports = (items) => items / 2;\n");
  chain(root, "check", "--change", "add-half");
  assert.ok(stateOf(root, "add-half").obligations.some((entry) => entry.id === "boundary-tests"), "product code without a test");

  // A test the base product passes as well: it imports nothing new.
  writeFile(root, "test/half.test.js", `${PAGES_TEST}\n`);
  const weak = chain(root, "check", "--change", "add-half", "--json").json;
  assert.deepStrictEqual(weak.counterproof.runs.map((entry) => entry.exit_code), [0]);
  assert.match(weak.missing.find((entry) => entry.obligation === "boundary-tests").reason, /^the tests the diff adds pass against the base product too \(counterproof run-\d+\)/);

  writeFile(root, "test/half.test.js", "const test = require('node:test');\nconst assert = require('node:assert');\nconst half = require('../src/half.js');\ntest('half', () => assert.strictEqual(half(10), 5));\n");
  const real = chain(root, "check", "--change", "add-half", "--json").json;
  assert.strictEqual((real.missing || []).find((entry) => entry.obligation === "boundary-tests"), undefined, JSON.stringify(real.missing));
  assert.deepStrictEqual(
    real.counterproof.runs.map((entry) => [entry.exit_code, entry.control ?? false]),
    [[1, false], [0, true]],
    "a missing module fails on the base, which passes its own tests",
  );
  const counted = () => stateOf(root, "add-half").runs.filter((entry) => entry.purpose === "counterproof").length;
  const before = counted();
  writeFile(root, "README.md", "# Pages\n");
  const again = chain(root, "check", "--change", "add-half", "--json").json;
  assert.deepStrictEqual(again.counterproof.runs, real.counterproof.runs.map((entry) => ({ ...entry, reused: true })));
  assert.strictEqual(counted(), before, "the same base and tests run nothing again");
});

test("[E1.48] a change without a base commit skips the counterproof with a warning in run and close", (t) => {
  const root = tempRoot(t);
  writeFile(root, "idd/config.yaml", "checks:\n  test: node -e 0\n");
  writeFile(root, "test/pages.js", `${VERIFY}\n`);
  writeFile(root, "src/pages.txt", "1");
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination", "--path", "src/pages.txt");
  const run = () => ospec(root, "run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", "node test/pages.js");
  run();
  writeFile(root, "src/pages.txt", "2");
  const green = run();
  assert.match(green.stdout, /recorded evidence ev-1\n/);
  assert.match(green.stdout, /^warning: counterproof skipped: the change has no base commit to run it on$/m);
  assert.strictEqual(stateOf(root, "fix-pagination").evidence[0].detail.counterproof_skipped, "the change has no base commit to run it on");
  ospec(root, "check", "--change", "fix-pagination");
  ospec(root, "record", "gate", "--change", "fix-pagination", "--gate", "checks-changed", "--resolve", "--answer", "Yes, node -e 0.", "--source", "user");
  ospec(root, "check", "--change", "fix-pagination");
  const closed = ospec(root, "close", "--change", "fix-pagination");
  assert.strictEqual(closed.code, 0, closed.stdout + closed.stderr);
  assert.match(closed.stdout, /^warning: counterproof skipped for repro-test \(ev-1\): the change has no base commit to run it on$/m);
});

test("[E1.48] a counterproof whose base cannot run its own checks proves nothing: the pair closes with it skipped and a warning", (t) => {
  const root = tempRoot(t);
  const git = gitInit(root);
  // The tests import the build in dist/, which git ignores and no worktree links.
  const build = (round) => `module.exports = (items) => Math.${round}(items / 10);\n`;
  const builtTest = PAGES_TEST.replace("../src/pages.js", "../dist/pages.js");
  writeFile(root, ".gitignore", "dist/\n");
  writeFile(root, "src/pages.js", build("floor"));
  writeFile(root, "dist/pages.js", build("floor"));
  writeFile(root, "test/pages.test.js", `${builtTest}\n`);
  writeFile(root, "idd/config.yaml", "checks:\n  test: node --test\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "base");
  chain(root, ...OPEN_PAGES);
  const run = () => chain(root, "run", "--change", "fix-pages", "--obligation", "repro-test", "--command", "node --test test/eleven.test.js", "--json").json;
  writeFile(root, "test/eleven.test.js", `${builtTest}\n${RED_PAGES}`);
  assert.strictEqual(run().run.exit_code, 1);
  writeFile(root, "src/pages.js", build("ceil"));
  writeFile(root, "dist/pages.js", build("ceil"));
  const green = run();
  const runs = stateOf(root, "fix-pages").runs.filter((entry) => entry.purpose === "counterproof");
  assert.deepStrictEqual(runs.map((entry) => [entry.command, entry.exit_code !== 0, entry.control ?? false]), [
    ["node --test test/eleven.test.js", true, false],
    ["node --test test/eleven.test.js", true, true],
    ["node --test", true, true],
  ]);
  const reason = `check test fails on the base without the tests of the diff (counterproof ${runs[2].id}): the worktree lacks something the tests need, such as a build or a dependency it does not link, so the red proves nothing`;
  assert.strictEqual(green.evidence, "ev-1", JSON.stringify(green.missing));
  assert.strictEqual(green.counterproof.skipped, reason);
  assert.ok(green.warnings.includes(`counterproof skipped: ${reason}`), JSON.stringify(green.warnings));
  assert.strictEqual(stateOf(root, "fix-pages").evidence[0].detail.counterproof_skipped, reason);
});

test("[E1.67] a scoped check the diff leaves out does not run as a control of a pair's counterproof", (t) => {
  const root = tempRoot(t);
  const git = gitInit(root);
  const build = (round) => `module.exports = (items) => Math.${round}(items / 10);\n`;
  const builtTest = PAGES_TEST.replace("../src/pages.js", "../dist/pages.js");
  writeFile(root, ".gitignore", "dist/\ne2e.log\n");
  writeFile(root, "src/pages.js", build("floor"));
  writeFile(root, "dist/pages.js", build("floor"));
  writeFile(root, "test/pages.test.js", `${builtTest}\n`);
  // e2e comes first, so without its scope it would run as the first control.
  writeFile(root, "idd/config.yaml", `checks:\n  e2e:\n    run: ${E2E}\n    paths: ["docs/**"]\n  test: node --test\n`);
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "base");
  chain(root, ...OPEN_PAGES);
  const run = () => chain(root, "run", "--change", "fix-pages", "--obligation", "repro-test", "--command", "node --test test/eleven.test.js", "--json").json;
  writeFile(root, "test/eleven.test.js", `${builtTest}\n${RED_PAGES}`);
  assert.strictEqual(run().run.exit_code, 1);
  writeFile(root, "src/pages.js", build("ceil"));
  writeFile(root, "dist/pages.js", build("ceil"));
  run();
  const runs = stateOf(root, "fix-pages").runs.filter((entry) => entry.purpose === "counterproof");
  assert.deepStrictEqual(runs.map((entry) => [entry.command, entry.control ?? false]), [
    ["node --test test/eleven.test.js", false],
    ["node --test test/eleven.test.js", true],
    ["node --test", true],
  ]);
});

test("[E1.48] a reproduction under spec/, as rspec lays it out, closes its pair with its counterproof", (t) => {
  const { root } = project(t, { checks: "checks:\n  test: node -e 0\n" });
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination", "--path", "src/pages.txt");
  writeFile(root, "spec/pages.js", `${VERIFY}\n`);
  const run = () => ospec(root, "run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", "node spec/pages.js", "--json");
  assert.strictEqual(run().json.run.exit_code, 1);
  writeFile(root, "src/pages.txt", "2");
  const green = run().json;
  assert.strictEqual(green.evidence, "ev-1", JSON.stringify(green.missing));
  assert.deepStrictEqual(
    green.counterproof.runs.map((entry) => [entry.exit_code, entry.control ?? false]),
    [[1, false], [1, true], [0, true]],
    "without the new test the command fails another way, and the base passes its check",
  );
});

test("[E1.48] a reproduction in an inline Rust test closes its pair with the counterproof skipped and a warning", (t) => {
  const { root, git } = project(t);
  const product = (pages) => `pub fn pages() -> u32 {\n    ${pages}\n}\n`;
  const inline = "\n#[cfg(test)]\nmod tests {\n    use super::*;\n\n    #[test]\n    fn eleven_items_need_two_pages() {\n        assert_eq!(pages(), 2);\n    }\n}\n";
  writeFile(root, "src/lib.rs", product(1));
  // cargo test, as node stands for it: the inline test asserts two pages.
  writeFile(root, "cargo-test.js", "const lib = require('fs').readFileSync('src/lib.rs', 'utf8');\nprocess.exit(lib.includes('#[test]') && /^ {4}2$/m.test(lib) ? 0 : 1);\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "lib");
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination", "--path", "src/lib.rs");
  const run = () => ospec(root, "run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", "node cargo-test.js", "--json");
  writeFile(root, "src/lib.rs", product(1) + inline);
  assert.strictEqual(run().json.run.exit_code, 1);
  writeFile(root, "src/lib.rs", product(2) + inline);
  const green = run().json;
  const reason = "the inline tests of src/lib.rs share the file with the product, so the base cannot run them without the change";
  assert.strictEqual(green.evidence, "ev-1", JSON.stringify(green.missing));
  assert.deepStrictEqual(green.counterproof, { skipped: reason });
  assert.ok(green.warnings.includes(`counterproof skipped: ${reason}`), JSON.stringify(green.warnings));
  const state = stateOf(root, "fix-pagination");
  assert.strictEqual(state.evidence[0].detail.counterproof_skipped, reason);
  assert.ok(!state.runs.some((entry) => entry.purpose === "counterproof"), "nothing ran on the base");
});

// A bug whose diff changes only tests and documentation could not close: the
// base runs the same product, so its counterproof passed.
test("[E1.48] a bug fixed in its test alone closes its pair with the counterproof skipped, until the diff changes product code", (t) => {
  const { root, git } = project(t, { checks: "checks:\n  test: node test/pages.js\n" });
  // The test expects two pages where the product rightly has one.
  writeFile(root, "test/pages.js", `${VERIFY}\n`);
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "a wrong test");
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination", "--path", "test/pages.js", "--path", "README.md");
  const run = () => ospec(root, "run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", "node test/pages.js", "--json");
  writeFile(root, "README.md", "One page.\n");
  assert.strictEqual(run().json.run.exit_code, 1);
  writeFile(root, "test/pages.js", `${VERIFY.replace("pages !== 2", "pages !== 1")}\n`);
  const green = run().json;
  const reason = "the diff changes no product code, only tests, test data or documentation, so the base runs the same product and its red would prove nothing";
  assert.strictEqual(green.evidence, "ev-1", JSON.stringify(green.missing));
  assert.deepStrictEqual(green.counterproof, { skipped: reason });
  assert.ok(green.warnings.includes(`counterproof skipped: ${reason}`), JSON.stringify(green.warnings));
  assert.ok(!stateOf(root, "fix-pagination").runs.some((entry) => entry.purpose === "counterproof"), "nothing ran on the base");
  assert.strictEqual(ospec(root, "check", "--change", "fix-pagination", "--json").json.verdict, "ready");

  // Product code in the diff reopens the pair, which says nothing of it.
  writeFile(root, "src/pages.js", "module.exports = 1;\n");
  const reopened = ospec(root, "check", "--change", "fix-pagination", "--json").json;
  assert.strictEqual(
    reopened.missing.find((entry) => entry.obligation === "repro-test").reason,
    "its pair ev-1 ran while the diff changed no product code, and the diff changes product code now: run the same command again so its counterproof runs on the base",
  );
});

// E1.64 idd-config-in-diff: idd/config.yaml is a file of the project, so a
// fix confined to it moves the tree and is product for the counterproof.
test("[E1.64] a fix that lives only in idd/config.yaml closes its pair, and its counterproof fails on the base", (t) => {
  const { root } = project(t, { checks: "checks:\n  test: node -e 0\n" });
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination", "--path", "idd/config.yaml", "--path", "test/config.js");
  writeFile(
    root,
    "test/config.js",
    ["const fs = require('fs');", "if (!/^  changelog: CHANGELOG\\.md$/m.test(fs.readFileSync('idd/config.yaml', 'utf8'))) { console.error('no changelog declared'); process.exit(1); }", ""].join("\n"),
  );
  const run = () => ospec(root, "run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", "node test/config.js", "--json").json;
  assert.strictEqual(run().run.exit_code, 1);
  writeFile(root, "idd/config.yaml", "checks:\n  test: node -e 0\ndelivery:\n  changelog: CHANGELOG.md\n");
  const green = run();
  assert.strictEqual(green.run.exit_code, 0);
  assert.strictEqual(green.evidence, "ev-1", JSON.stringify(green.missing));
  // The base holds its own configuration, so the test fails there; without
  // the test the command fails another way, and the base passes its check.
  assert.deepStrictEqual(green.counterproof.runs.map((entry) => [entry.exit_code, entry.control === true]), [[1, false], [1, true], [0, true]]);
  const state = stateOf(root, "fix-pagination");
  const [red, passing] = state.runs.filter((entry) => entry.purpose === "repro-test");
  assert.notStrictEqual(red.tree, passing.tree, "the configuration is part of the tree");
  const checked = ospec(root, "check", "--change", "fix-pagination", "--json").json;
  assert.strictEqual(checked.verdict, "ready", JSON.stringify(checked.missing));
});

// E1.65 counterproof-declared-docs: a document the project declares in impact
// is its product, so the test of its text must fail on the base.
test("[E1.65] the test of a document declared in impact runs its counterproof on the base, and one of an undeclared document skips it", (t) => {
  const declared = "checks:\n  test: node -e 0\nimpact:\n  defaults: false\n  public_contract:\n    - rules/**\n";
  const testOf = (file) =>
    ["const fs = require('fs');", `if (!fs.readFileSync('${file}', 'utf8').includes('Never force push.')) { console.error('${file} lacks the rule'); process.exit(1); }`, ""].join("\n");
  const pair = (config, file) => {
    const { root, git } = project(t, { checks: config });
    writeFile(root, file, "Never push.\n");
    git("add", "-A");
    git("commit", "-q", "--no-verify", "-m", "the rule");
    ospec(root, ...OPEN_BUG);
    ospec(root, "signals", "--change", "fix-pagination", "--path", file, "--path", "test/block.js");
    writeFile(root, "test/block.js", testOf(file));
    const run = () => ospec(root, "run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", "node test/block.js", "--json").json;
    assert.strictEqual(run().run.exit_code, 1);
    writeFile(root, file, "Never force push.\n");
    return run();
  };

  const product = pair(declared, "rules/block.md");
  assert.strictEqual(product.evidence, "ev-1", JSON.stringify(product.missing));
  assert.deepStrictEqual(product.counterproof.runs.map((entry) => [entry.exit_code, entry.control === true]), [[1, false], [1, true], [0, true]]);

  const documentation = pair(declared, "notes/block.md");
  assert.deepStrictEqual([documentation.evidence, documentation.counterproof], ["ev-1", { skipped: PRODUCT_FREE_SKIP }]);
});

test("run is refused for an obligation it cannot prove and needs a command", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  const notActive = ospec(root, "run", "--change", "fix-readme", "--obligation", "repro-test", "--command", "node verify.js", "--json");
  assert.strictEqual(notActive.code, 1);
  assert.strictEqual(notActive.json.error.code, "unknown-obligation");
  const notRunnable = ospec(root, "run", "--change", "fix-readme", "--obligation", "checks-pass", "--command", "node verify.js", "--json");
  assert.strictEqual(notRunnable.code, 2, "checks are run by ospec check");
  assert.strictEqual(ospec(root, "run", "--change", "fix-readme", "--obligation", "repro-test", "--json").code, 2);
});

test("check stops at an ambiguous intent without running anything, and needs git", (t) => {
  const { root } = project(t);
  ospec(root, "record", "intent", "--change", "improve-login", "--ambiguous", "--request", "Improve the login.");
  const ambiguous = ospec(root, "check", "--change", "improve-login", "--json");
  assert.strictEqual(ambiguous.code, 0, ambiguous.stderr);
  assert.strictEqual(ambiguous.json.verdict, "needs-decision");
  assert.strictEqual(ambiguous.json.decision.gate, "ambiguous-intent");
  assert.ok(!("runs" in stateOf(root, "improve-login")));

  const plain = tempRoot(t);
  ospec(plain, ...OPEN_DOCS);
  fs.rmSync(path.join(plain, ".git"), { recursive: true, force: true });
  const noGit = ospec(plain, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(noGit.code, 1);
  assert.strictEqual(noGit.json.error.code, "not-a-git-repo");
  assert.strictEqual(ospec(plain, "check", "--json").code, 2, "check needs --change");
});

// E4.8 non-git-workspace: a change opens only inside a git work tree, and the
// CLI says so before any gate or work, with the step to take.

test("outside a git work tree record intent and next stop with the next step and create nothing", (t) => {
  const plain = plainRoot(t);
  const intent = ospec(plain, ...OPEN_BUG);
  assert.strictEqual(intent.code, 1);
  assert.strictEqual(intent.json.error.code, "not-a-git-repo");
  assert.match(intent.json.error.how, /work directly/);
  assert.match(intent.json.error.how, /git init -b main/);
  assert.ok(!fs.existsSync(path.join(plain, "idd")), "nothing is created under idd/");

  for (const args of [["next"], ["next", "--change", "fix-pagination"]]) {
    const next = ospec(plain, ...args, "--json");
    assert.strictEqual(next.code, 1);
    assert.strictEqual(next.json.error.code, "not-a-git-repo");
    assert.strictEqual(next.json.error.how, intent.json.error.how);
  }

  const text = ospec(plain, ...OPEN_BUG.filter((arg) => arg !== "--json"));
  assert.strictEqual(text.code, 1);
  assert.match(text.stderr, /\(not-a-git-repo\)\n.*git init -b main/);
});

test("a change left open outside git cannot continue, and status still lists it", (t) => {
  const root = tempRoot(t);
  ospec(root, ...OPEN_BUG);
  fs.rmSync(path.join(root, ".git"), { recursive: true, force: true });

  const next = ospec(root, "next", "--change", "fix-pagination", "--json");
  assert.strictEqual(next.json.error.code, "not-a-git-repo");
  const status = ospec(root, "status", "--json");
  assert.strictEqual(status.code, 0, status.stderr);
  assert.deepStrictEqual(status.json.changes.map((c) => c.change), ["fix-pagination"]);
});

test("without git on PATH a change does not open: git-not-found", (t) => {
  const root = plainRoot(t);
  const env = { ...process.env, PATH: plainRoot(t) };
  for (const args of [OPEN_BUG, ["next", "--json"]]) {
    const result = ospecWith(env, root, ...args);
    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.json.error.code, "git-not-found");
    assert.match(result.json.error.how, /install git/);
  }
  assert.ok(!fs.existsSync(path.join(root, "idd")));
});

test("a repository created with git init -b main and no commit takes a change to close", (t) => {
  const root = tempRoot(t);
  // Every file is in the diff of an empty base, so a docs change holds no
  // product code (E1.44): the check runs inline.
  writeFile(root, "idd/config.yaml", "checks:\n  test: node -e 0\n");
  writeFile(root, "README.md", "# Pages\n");
  const intent = ospec(root, ...OPEN_DOCS, "--json");
  assert.strictEqual(intent.code, 0, intent.stderr);
  assert.strictEqual(stateOf(root, "fix-readme").base, null, "no commit to start from");
  assert.strictEqual(ospec(root, "next", "--change", "fix-readme", "--json").code, 0);

  const first = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(first.json.decision?.gate, "checks-changed", "the first checks need the user's answer (E1.44)");
  ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "checks-changed", "--resolve", "--answer", "Yes, node -e 0.", "--source", "user");
  const check = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(check.code, 0, check.stderr);
  assert.strictEqual(check.json.verdict, "ready", JSON.stringify(check.json.missing));
  const close = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(close.code, 0, close.stdout);
});

// E1.4 (b1): contract and migration evidence (REQ-idd-015).

test("check satisfies the contract obligation once the diff touches a contract document and a test", (t) => {
  // The check runs the contract's test, as E1.48 needs.
  const { root } = project(t, { checks: "checks:\n  test: node -e \"require('fs').existsSync('src/api/orders.test.js') && require('./src/api/orders.test.js')\" && node verify.js\n" });
  openFeature(root, "record", "intent", "--change", "page-size", "--kind", "feature", "--summary", "Allow 50 per page.", "--acceptance", "size=50 works.", ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/api/orders.js", "module.exports = { maxSize: 50 };\n");

  const codeOnly = ospec(root, "check", "--change", "page-size", "--json");
  assert.deepStrictEqual(codeOnly.json.added.signals, ["untested-product", "public-contract"]);
  const reason = (result) => result.json.missing.find((entry) => entry.obligation === "contract-spec-and-test")?.reason;
  assert.match(reason(codeOnly), /touches no contract document/);

  writeFile(root, "api/openapi.yaml", "openapi: 3.1.0\n");
  assert.match(reason(ospec(root, "check", "--change", "page-size", "--json")), /touches no test of the contract/);

  writeFile(root, "src/api/orders.test.js", "require('node:assert').strictEqual(require('./orders.js').maxSize, 50);\n");
  const settled = ospec(root, "check", "--change", "page-size", "--json");
  assert.strictEqual(settled.json.verdict, "ready", JSON.stringify(settled.json.missing));
  const evidence = stateOf(root, "page-size").evidence.find((entry) => entry.kind === "contract-spec-and-test");
  assert.deepStrictEqual(evidence.detail.documents, ["api/openapi.yaml"]);
  assert.deepStrictEqual(evidence.detail.tests, ["src/api/orders.test.js"]);
});

test("the project declares where its contract documents live", (t) => {
  const { root } = project(t, { checks: "checks:\n  test: node verify.js\ncontracts:\n  documents:\n    - specs/**\n" });
  openFeature(root, "record", "intent", "--change", "page-size", "--kind", "feature", "--summary", "Allow 50 per page.", "--acceptance", "size=50 works.", ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/api/orders.js", "module.exports = { maxSize: 50 };\n");
  writeFile(root, "specs/orders.md", "size up to 50\n");
  writeFile(root, "test/orders.js", "require('node:assert').strictEqual(50, 50);\n");
  assert.strictEqual(ospec(root, "check", "--change", "page-size", "--json").json.verdict, "ready");
});

test("a passing migration test with its plan satisfies the migration obligation until the tree changes", (t) => {
  const { root } = project(t);
  openFeature(root, "record", "intent", "--change", "add-index", "--kind", "feature", "--summary", "Faster search.", "--acceptance", "Search under 50 ms.", ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "db/migrations/004_add_index.sql", "CREATE INDEX customers_name ON customers (name);\n");
  ospec(root, "check", "--change", "add-index");

  const args = ["run", "--change", "add-index", "--obligation", "migration-compat-and-test", "--command", "node verify.js"];
  assert.strictEqual(ospec(root, ...args, "--json").code, 2, "a migration run needs its plan");
  const plan = "additive index; rollback drops it";
  const passed = ospec(root, ...args, "--plan", plan, "--json");
  assert.strictEqual(passed.code, 0, passed.stderr);
  assert.ok(passed.json.evidence);
  assert.strictEqual(stateOf(root, "add-index").runs.find((run) => run.id === passed.json.run.id).purpose, "migration-test");
  assert.strictEqual(passed.json.check.name, "test", "the command of the only check counts as that check too (E4.15)");
  assert.strictEqual(ospec(root, "check", "--change", "add-index", "--json").json.verdict, "ready");

  writeFile(root, "db/migrations/004_add_index.sql", "CREATE INDEX customers_name ON customers (name, id);\n");
  const moved = ospec(root, "check", "--change", "add-index", "--json");
  assert.deepStrictEqual(moved.json.missing.map((entry) => entry.obligation), ["migration-compat-and-test"]);
  assert.match(moved.json.missing[0].reason, /no passing migration test on the current tree/);
});

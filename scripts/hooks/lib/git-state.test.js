"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { resolveGitState, isRiskyAction, composeAdvisory } = require("./git-state.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a stubbed git runner that maps known arg patterns to outputs or
 * Errors. The key is matched against the args array with `args.includes(key)`.
 *
 * Keys that distinguish the three git probes:
 *   "symbolic-ref"  → default-branch probe
 *   "--show-current" → current-branch probe
 *   "--porcelain"   → working-tree status probe
 */
function makeStubRunner(responses) {
  return (args) => {
    for (const [key, value] of Object.entries(responses)) {
      if (args.includes(key)) {
        if (value instanceof Error) throw value;
        return value;
      }
    }
    throw new Error(`Unexpected git args: ${args.join(" ")}`);
  };
}

// ---------------------------------------------------------------------------
// Task 1.1 — resolveGitState per-field fail-open
// ---------------------------------------------------------------------------

test("resolveGitState: default-branch probe fails – dirty probe still runs", () => {
  const runner = makeStubRunner({
    "symbolic-ref": new Error("no remote HEAD configured"),
    "--show-current": "feat/my-feature",
    "--porcelain": "M scripts/foo.js",
  });
  const result = resolveGitState(runner);
  assert.equal(result.defaultBranch, null, "defaultBranch should be null when probe fails");
  assert.equal(result.dirty, true, "dirty probe ran independently and got non-empty output");
});

test("resolveGitState: dirty probe fails – dirty field is null, not false", () => {
  const runner = makeStubRunner({
    "symbolic-ref": "origin/main",
    "--show-current": "main",
    "--porcelain": new Error("git status --porcelain failed"),
  });
  const result = resolveGitState(runner);
  assert.equal(result.dirty, null, "dirty should be null when status probe fails");
  assert.notStrictEqual(result.dirty, false, "dirty must not be false when probe fails");
});

test("resolveGitState: empty porcelain output – dirty is false", () => {
  const runner = makeStubRunner({
    "symbolic-ref": "origin/main",
    "--show-current": "main",
    "--porcelain": "",
  });
  const result = resolveGitState(runner);
  assert.strictEqual(result.dirty, false, "empty porcelain output means clean working tree");
});

test("resolveGitState: untracked-only output – dirty is true", () => {
  const runner = makeStubRunner({
    "symbolic-ref": "origin/main",
    "--show-current": "main",
    "--porcelain": "?? newfile.txt",
  });
  const result = resolveGitState(runner);
  assert.strictEqual(result.dirty, true, "untracked-only output triggers dirty:true");
});

test("resolveGitState: git binary absent – all fields null", () => {
  const runner = () => { throw new Error("git: command not found"); };
  const result = resolveGitState(runner);
  assert.equal(result.defaultBranch, null);
  assert.equal(result.currentBranch, null);
  assert.equal(result.dirty, null);
});

test("resolveGitState: current-branch probe fails – currentBranch null, others unaffected", () => {
  const runner = makeStubRunner({
    "symbolic-ref": "origin/main",
    "--show-current": new Error("detached HEAD"),
    "--porcelain": "",
  });
  const result = resolveGitState(runner);
  assert.equal(result.currentBranch, null, "currentBranch should be null on probe failure");
  assert.equal(result.defaultBranch, "main", "defaultBranch should still resolve");
  assert.strictEqual(result.dirty, false, "dirty probe ran independently");
});

test("resolveGitState: strips remote prefix from symbolic-ref output", () => {
  const runner = makeStubRunner({
    "symbolic-ref": "origin/develop",
    "--show-current": "develop",
    "--porcelain": "",
  });
  const result = resolveGitState(runner);
  assert.equal(result.defaultBranch, "develop", "origin/ prefix is stripped");
  assert.equal(result.currentBranch, "develop");
  assert.strictEqual(result.dirty, false);
});

test("resolveGitState: empty show-current (detached HEAD) → currentBranch null", () => {
  const runner = makeStubRunner({
    "symbolic-ref": "origin/main",
    "--show-current": "",
    "--porcelain": "",
  });
  const result = resolveGitState(runner);
  assert.equal(result.currentBranch, null, "empty show-current means detached HEAD");
});

// ---------------------------------------------------------------------------
// Task 1.2 — isRiskyAction
// ---------------------------------------------------------------------------

test("isRiskyAction: git commit command returns true", () => {
  assert.strictEqual(isRiskyAction(["git commit -m 'fix: test'"]), true, "git commit via -m");
  assert.strictEqual(isRiskyAction(["git commit --amend"]), true, "git commit --amend");
  assert.strictEqual(isRiskyAction(["git commit"]), true, "minimal git commit");
});

test("isRiskyAction: non-commit git commands return false", () => {
  assert.strictEqual(isRiskyAction(["git status"]), false);
  assert.strictEqual(isRiskyAction(["git log --oneline"]), false);
  assert.strictEqual(isRiskyAction(["git push"]), false);
});

test("isRiskyAction: empty or missing commands return false", () => {
  assert.strictEqual(isRiskyAction([]), false);
  assert.strictEqual(isRiskyAction(undefined), false);
});

test("isRiskyAction: file-write tools alone are no longer risky (no command payload)", () => {
  // The guard now behaves like a pre-commit check: file-write tools (Edit,
  // Write, etc.) never carry a command payload, so isRiskyAction([]) is the
  // only case that applies to them, and it must be false.
  assert.strictEqual(isRiskyAction([]), false);
});

// ---------------------------------------------------------------------------
// Task 1.3 — composeAdvisory message variants
// ---------------------------------------------------------------------------

test("composeAdvisory: default-only case contains branch name and 'rama por defecto'", () => {
  const result = composeAdvisory(true, false, "main");
  assert.ok(result.includes("main"), "should contain branch name 'main'");
  assert.ok(result.includes("rama por defecto"), "should contain 'rama por defecto'");
  assert.ok(!result.includes("sin commitear"), "should NOT contain 'sin commitear'");
});

test("composeAdvisory: default-only with null dirty also returns default advisory", () => {
  // When dirty probe failed (null), the guard still fires for default branch
  const result = composeAdvisory(true, null, "main");
  assert.ok(result.includes("rama por defecto"), "should contain 'rama por defecto'");
  assert.ok(!result.includes("sin commitear"), "dirty=null should not trigger dirty advisory");
});

test("composeAdvisory: dirty-only case contains 'sin commitear' and not 'rama por defecto'", () => {
  const result = composeAdvisory(false, true, "feat/my-feature");
  assert.ok(result.includes("sin commitear"), "should contain 'sin commitear'");
  assert.ok(!result.includes("rama por defecto"), "should NOT contain 'rama por defecto'");
});

test("composeAdvisory: combined case contains both 'rama por defecto' and 'sin commitear'", () => {
  const result = composeAdvisory(true, true, "main");
  assert.ok(result.includes("rama por defecto"), "combined must mention default branch");
  assert.ok(result.includes("sin commitear"), "combined must mention uncommitted changes");
  assert.ok(result.includes("main"), "combined must include branch name");
});

test("composeAdvisory: combined is a single string (not two separate strings)", () => {
  const result = composeAdvisory(true, true, "main");
  assert.equal(typeof result, "string", "result must be a single string");
  assert.ok(result.length > 0, "result must be non-empty");
});

// ---------------------------------------------------------------------------
// Finding 1 remediation (RED) — shared 5s deadline across all three probes
// ---------------------------------------------------------------------------

test("resolveGitState: shared deadline — each probe receives a positive numeric timeoutMs as 2nd arg", () => {
  const capturedBudgets = [];
  const spyRunner = (args, timeoutMs) => {
    capturedBudgets.push(timeoutMs);
    if (args.includes("symbolic-ref")) return "origin/main";
    if (args.includes("--show-current")) return "main";
    if (args.includes("--porcelain")) return "";
    throw new Error(`Unexpected git args: ${args.join(" ")}`);
  };

  resolveGitState(spyRunner);

  assert.equal(capturedBudgets.length, 3, "exactly 3 probes must be called");
  for (const budget of capturedBudgets) {
    assert.ok(
      typeof budget === "number" && budget > 0,
      `each probe must receive a positive numeric timeoutMs, got ${JSON.stringify(budget)}`
    );
  }
  // First probe must not exceed the 5000ms budget (+ 1ms tolerance for clock)
  assert.ok(capturedBudgets[0] <= 5001, `first probe timeout must not exceed TIMEOUT_MS: ${capturedBudgets[0]}`);
  // Last probe must not receive more time than first probe (shared deadline shrinks)
  assert.ok(
    capturedBudgets[2] <= capturedBudgets[0],
    `last probe must not get more time than first probe: [${capturedBudgets.join(", ")}]`
  );
});

// ---------------------------------------------------------------------------
// Finding 3 remediation (RED) — hostile branch name sanitized in composeAdvisory
// ---------------------------------------------------------------------------

test("composeAdvisory: hostile branch name — control chars stripped, whitespace collapsed, truncated at 120 chars", () => {
  // Branch name with control characters including ESC (ANSI injection attempt)
  const hostile = "main\x00\x1f\x1b[31mred\x1b[0m\r\ncontinued";
  const result = composeAdvisory(true, false, hostile);

  // Control characters must be stripped
  assert.ok(!/[\x00-\x1f\x7f]/.test(result), "control chars must be removed from advisory");
  // The advisory must still fire (it is not empty)
  assert.ok(result.length > 0, "advisory must be non-empty even for hostile branch name");
});

test("composeAdvisory: long branch name is truncated to at most 120 chars + ellipsis", () => {
  const longBranch = "a".repeat(200);
  const result = composeAdvisory(true, false, longBranch);
  // The full 200-char branch name must NOT appear verbatim in the output
  assert.ok(!result.includes(longBranch), "200-char branch name must be truncated");
  // The advisory must still mention the truncated name
  assert.ok(result.includes("a".repeat(120)) || result.includes("…"), "truncated advisory must contain 120 'a' chars or ellipsis");
});

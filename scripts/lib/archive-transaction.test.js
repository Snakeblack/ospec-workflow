"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const {
  nextTransactionAction,
  readArchiveGateFacts,
  computeInventory,
  runArchiveTransaction,
  rollbackTransaction,
  fingerprintInventory,
  digestBytes,
} = require("./archive-transaction.js");

function sha256(buf) {
  return `sha256:${crypto.createHash("sha256").update(buf).digest("hex")}`;
}

// --- nextTransactionAction (pure reducer) ------------------------------------

test("nextTransactionAction: init → preflight", () => {
  const result = nextTransactionAction(
    { state: "init", plan_sha256: "sha256:aaa" },
    { planSha256: "sha256:aaa" },
  );
  assert.equal(result.action, "preflight");
});

test("nextTransactionAction: preflighted → stage", () => {
  const result = nextTransactionAction(
    { state: "preflighted", plan_sha256: "sha256:aaa" },
    { planSha256: "sha256:aaa", preflightOk: true },
  );
  assert.equal(result.action, "stage");
});

test("nextTransactionAction: staged → compare-a", () => {
  const result = nextTransactionAction(
    { state: "staged", plan_sha256: "sha256:aaa" },
    { planSha256: "sha256:aaa" },
  );
  assert.equal(result.action, "compare-a");
});

test("nextTransactionAction: compared → commit", () => {
  const result = nextTransactionAction(
    { state: "compared", plan_sha256: "sha256:aaa" },
    { planSha256: "sha256:aaa", compareAOk: true },
  );
  assert.equal(result.action, "commit");
});

test("nextTransactionAction: committed → compare-b", () => {
  const result = nextTransactionAction(
    { state: "committed", plan_sha256: "sha256:aaa" },
    { planSha256: "sha256:aaa" },
  );
  assert.equal(result.action, "compare-b");
});

test("nextTransactionAction: confirmed → delete-origin", () => {
  const result = nextTransactionAction(
    { state: "confirmed", plan_sha256: "sha256:aaa" },
    { planSha256: "sha256:aaa", compareBOk: true },
  );
  assert.equal(result.action, "delete-origin");
});

test("nextTransactionAction: done → already-complete", () => {
  const result = nextTransactionAction(
    { state: "done", plan_sha256: "sha256:aaa" },
    { planSha256: "sha256:aaa" },
  );
  assert.equal(result.action, "already-complete");
});

test("nextTransactionAction: resume from staged continues compare-a", () => {
  const result = nextTransactionAction(
    { state: "staged", plan_sha256: "sha256:aaa" },
    { planSha256: "sha256:aaa", resume: true },
  );
  assert.equal(result.action, "compare-a");
});

test("nextTransactionAction: journal-plan-conflict on mismatched plan_sha256", () => {
  const result = nextTransactionAction(
    { state: "staged", plan_sha256: "sha256:aaa" },
    { planSha256: "sha256:bbb" },
  );
  assert.equal(result.action, "fail");
  assert.equal(result.failure_reason, "journal-plan-conflict");
});

test("nextTransactionAction: a failure with live writes stays terminal", () => {
  const result = nextTransactionAction(
    {
      state: "failed",
      plan_sha256: "sha256:aaa",
      created_by_tx: ["openspec/changes/archive/2026-07-26-demo-change"],
    },
    { planSha256: "sha256:aaa" },
  );
  assert.equal(result.action, "noop-terminal");
});

test("nextTransactionAction: a failure without live writes restarts", () => {
  for (const created of [[], undefined]) {
    const result = nextTransactionAction(
      { state: "failed", plan_sha256: "sha256:aaa", created_by_tx: created },
      { planSha256: "sha256:bbb" },
    );
    assert.equal(result.action, "restart");
  }
});

test("nextTransactionAction: rolled-back restarts", () => {
  const result = nextTransactionAction(
    { state: "rolled-back", plan_sha256: "sha256:aaa", created_by_tx: ["x"] },
    { planSha256: "sha256:aaa" },
  );
  assert.equal(result.action, "restart");
});

test("nextTransactionAction: compared with compareA failure → fail", () => {
  const result = nextTransactionAction(
    { state: "compared", plan_sha256: "sha256:aaa" },
    { planSha256: "sha256:aaa", compareAOk: false },
  );
  assert.equal(result.action, "fail");
  assert.equal(result.failure_reason, "compare-mismatch");
});

test("nextTransactionAction: committing → commit (resume mid-commit)", () => {
  const result = nextTransactionAction(
    { state: "committing", plan_sha256: "sha256:aaa" },
    { planSha256: "sha256:aaa" },
  );
  assert.equal(result.action, "commit");
});

// --- readArchiveGateFacts ----------------------------------------------------

test("readArchiveGateFacts: verdict PASS, quality-gates present", () => {
  const text = `
status: verified
phases:
  verify:
    status: done
    verdict: PASS
gates:
  quality-gates:
    status: passed
baseline_fingerprints:
  agents: "sha256:abc"
`;
  const facts = readArchiveGateFacts(text);
  assert.equal(facts.verdict, "PASS");
  assert.equal(facts.qualityGatesPresent, true);
  assert.equal(facts.qualityGatesStatus, "passed");
  assert.equal(facts.overridePresent, false);
  assert.ok(facts.baselineFingerprints);
  assert.equal(facts.baselineFingerprints.agents, "sha256:abc");
  assert.equal(facts.gatesSatisfied, true);
});

test("readArchiveGateFacts: accepts the current quality gate pass status", () => {
  const facts = readArchiveGateFacts(`
phases:
  verify:
    verdict: PASS
gates:
  quality-gates:
    status: pass
`);
  assert.equal(facts.qualityGatesStatus, "pass");
  assert.equal(facts.gatesSatisfied, true);
});

test("readArchiveGateFacts: a later verify status cannot replace a failed quality gate", () => {
  const facts = readArchiveGateFacts(`
gates:
  quality-gates:
    status: fail
phases:
  verify:
    status: done
    verdict: PASS
`);
  assert.equal(facts.qualityGatesStatus, "fail");
  assert.equal(facts.gatesSatisfied, false);
});

test("readArchiveGateFacts: missing quality-gates block", () => {
  const text = `
phases:
  verify:
    verdict: "PASS WITH WARNINGS"
gates:
  4r-review-gate:
    status: approved
`;
  const facts = readArchiveGateFacts(text);
  assert.equal(facts.verdict, "PASS WITH WARNINGS");
  assert.equal(facts.qualityGatesPresent, false);
  assert.equal(facts.gatesSatisfied, true); // no policy block → not blocking alone
});

test("readArchiveGateFacts: override present", () => {
  const text = `
phases:
  verify:
    verdict: PASS
gates:
  quality-gates:
    status: failed
    override:
      timestamp: "2026-07-01T00:00:00Z"
      justification: "accepted"
approvals:
  - id: qg-override-001
    gate: quality-gates
    decision: override
`;
  const facts = readArchiveGateFacts(text);
  assert.equal(facts.overridePresent, true);
  assert.equal(facts.gatesSatisfied, true);
});

test("readArchiveGateFacts: absent baseline_fingerprints", () => {
  const text = `
phases:
  verify:
    verdict: PASS
gates:
  quality-gates:
    status: passed
`;
  const facts = readArchiveGateFacts(text);
  assert.equal(facts.baselineFingerprints, null);
});

test("readArchiveGateFacts: FAIL verdict not satisfied", () => {
  const text = `
phases:
  verify:
    verdict: FAIL
`;
  const facts = readArchiveGateFacts(text);
  assert.equal(facts.verdict, "FAIL");
  assert.equal(facts.gatesSatisfied, false);
});

test("readArchiveGateFacts: foreign gate override does not authorize failed quality-gates", () => {
  const text = `
phases:
  verify:
    verdict: PASS
gates:
  quality-gates:
    status: failed
  4r-review-gate:
    status: failed
    override:
      timestamp: "2026-07-01T00:00:00Z"
      justification: "review override only"
approvals:
  - id: review-override-001
    gate: 4r-review-gate
    decision: override
`;
  const facts = readArchiveGateFacts(text);
  assert.equal(facts.qualityGatesStatus, "failed");
  assert.equal(facts.overridePresent, false);
  assert.equal(facts.gatesSatisfied, false);
});

test("readArchiveGateFacts: comment/noise mentioning override does not authorize", () => {
  const text = `
phases:
  verify:
    verdict: PASS
gates:
  quality-gates:
    status: failed
    # override: noise in comment must not authorize
# gate: quality-gates
# decision: override
notes: "see gate: quality-gates with decision: override elsewhere"
`;
  const facts = readArchiveGateFacts(text);
  assert.equal(facts.qualityGatesStatus, "failed");
  assert.equal(facts.overridePresent, false);
  assert.equal(facts.gatesSatisfied, false);
});

test("readArchiveGateFacts: same-approval override authorizes failed quality-gates", () => {
  const text = `
phases:
  verify:
    verdict: PASS
gates:
  quality-gates:
    status: failed
approvals:
  - id: qg-override-002
    gate: quality-gates
    decision: override
`;
  const facts = readArchiveGateFacts(text);
  assert.equal(facts.overridePresent, true);
  assert.equal(facts.gatesSatisfied, true);
});

// --- Helpers for FS fixtures -------------------------------------------------

async function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, ...rel.split("/"));
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
}

// `legacyAdr` builds a plan written before E3.1, which still promotes an ADR
// to docs/adr/; since E3.1 a plan carries no promotion and the change keeps
// its decisions under decisions/.
const DEFAULT_STATE_YAML = `status: verified
phases:
  verify:
    status: done
    verdict: PASS
gates:
  quality-gates:
    status: passed
baseline_fingerprints:
  routing: "${sha256(Buffer.from("# Routing baseline\n"))}"
`;

async function buildWorkspace(
  t,
  { changeName = "demo-change", legacyAdr = false, stateYaml = DEFAULT_STATE_YAML, extraFiles = {} } = {},
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ospec-archive-tx-"));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const originRel = `openspec/changes/${changeName}`;
  const proposal = "# Proposal\n";
  const preparedSpec = "# Routing merged\n";
  const adr = "# ADR-001\n";
  const liveTarget = "# Routing baseline\n";

  await writeTree(root, {
    [`${originRel}/proposal.md`]: proposal,
    [`${originRel}/state.yaml`]: stateYaml,
    [`${originRel}/specs/routing/spec.md`]: preparedSpec,
    [`${originRel}/decisions/${legacyAdr ? "adr" : "dc"}-001.md`]: adr,
    "openspec/specs/routing/spec.md": liveTarget,
    "docs/adr/.gitkeep": "",
    ...extraFiles,
  });

  const originDir = path.join(root, "openspec", "changes", changeName);
  const inventory = (await computeInventory(originDir)).filter(
    (e) => e.path !== "archive-plan.json",
  );
  const fp = fingerprintInventory(inventory);

  const plan = {
    schema_version: 1,
    change: changeName,
    source_fingerprint: fp,
    spec_writes: [
      {
        domain: "routing",
        source_delta: "specs/routing/spec.md",
        target: "openspec/specs/routing/spec.md",
        target_before_sha256: sha256(Buffer.from(liveTarget)),
        content_sha256: sha256(Buffer.from(preparedSpec)),
      },
    ],
    adr_promotions: legacyAdr
      ? [
          {
            source: "decisions/adr-001.md",
            target: "docs/adr/adr-001-demo.md",
            content_sha256: sha256(Buffer.from(adr)),
          },
        ]
      : [],
    archive_inventory: inventory.map((e) => e.path),
    accepted_warnings: [],
    rollback: { strategy: "staging-rename" },
  };

  const planPath = path.join(originDir, "archive-plan.json");
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2));

  return { root, changeName, originDir, planPath, plan, inventory, fp };
}

async function buildLiteWorkspace(t, { includeVerifyReport = true, includeArchiveReport = true } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ospec-lite-archive-tx-"));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const changeName = "lite-change";
  const originRel = `openspec/changes/${changeName}`;
  const files = {
    [`${originRel}/proposal-lite.md`]: "# Proposal Lite\n",
    [`${originRel}/tasks.md`]: "# Tasks\n",
    [`${originRel}/apply-progress.md`]: "# Apply Progress\n",
    [`${originRel}/state.yaml`]: [
      "status: verified",
      "route:",
      "  actual_route: lite",
      "phases:",
      "  verify:",
      "    status: done",
      "    verdict: PASS",
      "gates:",
      "  quality-gates:",
      "    status: passed",
      "",
    ].join("\n"),
  };
  if (includeVerifyReport) {
    files[`${originRel}/verify-report.md`] = "# Verify Report\n";
  }
  if (includeArchiveReport) {
    files[`${originRel}/archive-report.md`] = "# Archive Report\n";
  }
  await writeTree(root, files);

  const originDir = path.join(root, "openspec", "changes", changeName);
  const inventory = await computeInventory(originDir);
  const plan = {
    schema_version: 1,
    change: changeName,
    source_fingerprint: fingerprintInventory(inventory),
    spec_writes: [],
    adr_promotions: [],
    archive_inventory: inventory.map((entry) => entry.path),
    accepted_warnings: [],
    rollback: { strategy: "staging-rename" },
  };
  const planPath = path.join(originDir, "archive-plan.json");
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2));

  return { root, changeName, originDir, planPath, plan };
}
// --- computeInventory --------------------------------------------------------

test("computeInventory: sorted POSIX paths and raw-byte SHA-256", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ospec-inv-"));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });
  await writeTree(root, {
    "z.txt": "z",
    "a/b.txt": "ab",
  });
  const inv = await computeInventory(root);
  assert.deepEqual(
    inv.map((e) => e.path),
    ["a/b.txt", "z.txt"],
  );
  assert.equal(inv[0].sha256, sha256(Buffer.from("ab")));
  assert.equal(inv[1].sha256, sha256(Buffer.from("z")));
});

test("computeInventory: symlink/junction fails closed", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ospec-inv-link-"));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(root, "real.txt"), "x");
  try {
    await fs.symlink(
      path.join(root, "real.txt"),
      path.join(root, "link.txt"),
    );
  } catch (err) {
    // Windows may need admin for symlinks — skip if unavailable
    if (err.code === "EPERM" || err.code === "EACCES") {
      t.skip("symlink creation not permitted in this environment");
      return;
    }
    throw err;
  }
  await assert.rejects(() => computeInventory(root), (err) => {
    assert.equal(err.code, "io-error");
    return true;
  });
});

// --- FS fixtures: transaction lifecycle --------------------------------------

test("FS: pre-commit failure leaves origin intact", async (t) => {
  const { root, changeName, originDir, planPath } = await buildWorkspace(t);
  // Break plan hash to force preflight failure
  const badPlan = JSON.parse(await fs.readFile(planPath, "utf8"));
  badPlan.source_fingerprint = sha256(Buffer.from("wrong"));
  await fs.writeFile(planPath, JSON.stringify(badPlan));

  const receipt = await runArchiveTransaction({
    workspace: root,
    changeName,
    planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(receipt.outcome, "failed");
  assert.equal(receipt.origin_deleted, false);
  assert.ok(await fs.stat(originDir));
  // No archive destination created
  const archiveRoot = path.join(root, "openspec", "changes", "archive");
  const entries = await fs.readdir(archiveRoot).catch((e) => {
    if (e.code === "ENOENT") return [];
    throw e;
  });
  assert.equal(entries.length, 0);
});

test("FS: hash mismatch after staging blocks delete", async (t) => {
  const ctx = await buildWorkspace(t);
  // Preflight content_sha256 gate (not Compare A/B) — still fail-closed.
  const bad = { ...ctx.plan };
  bad.spec_writes = [
    {
      ...bad.spec_writes[0],
      content_sha256: sha256(Buffer.from("not-the-bytes")),
    },
  ];
  await fs.writeFile(ctx.planPath, JSON.stringify(bad));

  const receipt = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(receipt.outcome, "failed");
  assert.equal(receipt.origin_deleted, false);
  assert.ok(await fs.stat(ctx.originDir));
});

test("FS: lite archive missing verify-report blocks before mutation", async (t) => {
  const ctx = await buildLiteWorkspace(t, { includeVerifyReport: false });

  const receipt = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });

  assert.equal(receipt.outcome, "failed");
  assert.ok(receipt.rejection_codes.includes("missing-reference"));
  assert.equal(receipt.origin_deleted, false);
  assert.ok(await fs.stat(ctx.originDir));
});

test("FS: lite archive missing archive-report blocks before mutation", async (t) => {
  const ctx = await buildLiteWorkspace(t, { includeArchiveReport: false });

  const receipt = await runArchiveTransaction({
workspace: ctx.root,
changeName: ctx.changeName,
planPath: ctx.planPath,
now: new Date("2026-07-26T12:00:00Z"),
  });

  assert.equal(receipt.outcome, "failed");
  assert.ok(receipt.rejection_codes.includes("missing-reference"));
  assert.equal(receipt.origin_deleted, false);
  assert.ok(await fs.stat(ctx.originDir));
});

test("FS: lite archive with invented design reference blocks before mutation", async (t) => {
  const ctx = await buildLiteWorkspace(t);
  ctx.plan.archive_inventory.push("design.md");
  await fs.writeFile(ctx.planPath, JSON.stringify(ctx.plan, null, 2));

  const receipt = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });

  assert.equal(receipt.outcome, "failed");
  assert.ok(receipt.rejection_codes.includes("inventory-mismatch"));
  assert.equal(receipt.origin_deleted, false);
  assert.ok(await fs.stat(ctx.originDir));
});

/** Seed journal past preflight so Compare A (staged) / Compare B (committed) run. */
async function seedCompareMismatchFixture(ctx, { state, corruptMarker }) {
  const destRel = "openspec/changes/archive/2026-07-26-demo-change";
  const txDir = path.join(ctx.root, ".ospec", "archive-tx", ctx.changeName);
  const originInv = await computeInventory(ctx.originDir);
  const compareRoot =
    state === "staged"
      ? path.join(txDir, "staging", "archive")
      : path.join(ctx.root, ...destRel.split("/"));

  await fs.mkdir(compareRoot, { recursive: true });
  if (state === "staged") {
    for (const entry of originInv) {
      const src = path.join(ctx.originDir, ...entry.path.split("/"));
      const dest = path.join(compareRoot, ...entry.path.split("/"));
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.cp(src, dest);
    }
  }
  await fs.writeFile(path.join(compareRoot, "proposal.md"), corruptMarker);

  await fs.mkdir(txDir, { recursive: true });
  await fs.writeFile(
    path.join(txDir, "journal.json"),
    JSON.stringify({
      state,
      plan_sha256: digestBytes(await fs.readFile(ctx.planPath)),
      destination: destRel,
      origin_inventory: originInv,
      created_by_tx: state === "committed" ? [destRel] : [],
    }),
  );
  return txDir;
}

test("FS: compare-a mismatch (staged journal, divergent staging) fails closed", async (t) => {
  const ctx = await buildWorkspace(t);
  await seedCompareMismatchFixture(ctx, {
    state: "staged",
    corruptMarker: "# CORRUPT-STAGING\n",
  });

  const receipt = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(receipt.outcome, "failed");
  assert.equal(receipt.failure_reason, "compare-mismatch");
  assert.equal(receipt.origin_deleted, false);
  assert.ok(await fs.stat(ctx.originDir));
  assert.equal(
    await fs.readFile(path.join(ctx.originDir, "proposal.md"), "utf8"),
    "# Proposal\n",
  );
});

test("FS: compare-b mismatch (committed journal, divergent dest) fails closed", async (t) => {
  const ctx = await buildWorkspace(t);
  await seedCompareMismatchFixture(ctx, {
    state: "committed",
    corruptMarker: "# WRONG-DEST\n",
  });

  const receipt = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(receipt.outcome, "failed");
  assert.equal(receipt.failure_reason, "compare-mismatch");
  assert.equal(receipt.origin_deleted, false);
  assert.ok(await fs.stat(ctx.originDir));
  assert.equal(
    await fs.readFile(path.join(ctx.originDir, "proposal.md"), "utf8"),
    "# Proposal\n",
  );
});

test("FS: full match commits then deletes origin", async (t) => {
  const ctx = await buildWorkspace(t);
  const receipt = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(receipt.outcome, "success");
  assert.equal(receipt.origin_deleted, true);
  assert.equal(receipt.parity.go, "n/a");
  assert.ok(Array.isArray(receipt.committed_inventory));
  assert.ok(receipt.committed_inventory.length > 0);
  assert.ok(receipt.cost);
  assert.equal(typeof receipt.cost.available, "boolean");

  await assert.rejects(fs.stat(ctx.originDir), { code: "ENOENT" });
  const dest = path.join(
    ctx.root,
    "openspec",
    "changes",
    "archive",
    "2026-07-26-demo-change",
  );
  assert.ok(await fs.stat(dest));
  assert.equal(
    await fs.readFile(
      path.join(ctx.root, "openspec", "specs", "routing", "spec.md"),
      "utf8",
    ),
    "# Routing merged\n",
  );
  // E3.1: the change decision travels with the archive and is never promoted.
  assert.equal(await fs.readFile(path.join(dest, "decisions", "dc-001.md"), "utf8"), "# ADR-001\n");
  assert.deepStrictEqual(await fs.readdir(path.join(ctx.root, "docs", "adr")), [".gitkeep"]);
});

test("FS: preflight rejects a plan that still promotes ADRs and leaves origin intact (E3.1)", async (t) => {
  const ctx = await buildWorkspace(t, { legacyAdr: true });
  const receipt = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(receipt.outcome, "failed");
  assert.equal(receipt.failure_reason, "gate-not-satisfied");
  assert.deepStrictEqual(receipt.rejection_codes, ["invalid-schema"]);
  assert.ok(await fs.stat(ctx.originDir));
  assert.deepStrictEqual(await fs.readdir(path.join(ctx.root, "docs", "adr")), [".gitkeep"]);
});

// Stages a pre-E3.1 plan by hand, as a transaction interrupted before the
// upgrade left it, and seeds its journal at `state`.
async function stageLegacy(ctx, state) {
  const txDir = path.join(ctx.root, ".ospec", "archive-tx", ctx.changeName);
  const stagingRoot = path.join(txDir, "staging");
  const stagingArchive = path.join(stagingRoot, "archive");
  const originInv = await computeInventory(ctx.originDir);
  await fs.mkdir(stagingArchive, { recursive: true });
  for (const entry of originInv) {
    const src = path.join(ctx.originDir, ...entry.path.split("/"));
    const dest = path.join(stagingArchive, ...entry.path.split("/"));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.cp(src, dest);
  }
  // Stage prepared writes
  await fs.mkdir(path.join(stagingRoot, "specs", "routing"), { recursive: true });
  await fs.cp(
    path.join(ctx.originDir, "specs", "routing", "spec.md"),
    path.join(stagingRoot, "specs", "routing", "spec.md"),
  );
  await fs.mkdir(path.join(stagingRoot, "adr"), { recursive: true });
  await fs.cp(
    path.join(ctx.originDir, "decisions", "adr-001.md"),
    path.join(stagingRoot, "adr", "adr-001-demo.md"),
  );

  const planBytes = await fs.readFile(ctx.planPath);
  await fs.mkdir(txDir, { recursive: true });
  await fs.writeFile(
    path.join(txDir, "journal.json"),
    JSON.stringify({
      state,
      plan_sha256: digestBytes(planBytes),
      destination: "openspec/changes/archive/2026-07-26-demo-change",
      origin_inventory: originInv,
      created_by_tx: [],
    }),
  );
}

test("FS: a plan staged before E3.1 resumes to success and still commits its ADR", async (t) => {
  const ctx = await buildWorkspace(t, { legacyAdr: true });
  await stageLegacy(ctx, "staged");

  const resumed = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(resumed.outcome, "resumed-success");
  assert.equal(resumed.origin_deleted, true);
  assert.equal(
    await fs.readFile(path.join(ctx.root, "docs", "adr", "adr-001-demo.md"), "utf8"),
    "# ADR-001\n",
  );

  const second = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(second.outcome, "success");
  assert.equal(second.already_complete, true);
});

test("FS: a journal staged before the archived status rewrite resumes with the origin state.yaml", async (t) => {
  const ctx = await buildWorkspace(t, { legacyAdr: true });
  const originState = await fs.readFile(path.join(ctx.originDir, "state.yaml"), "utf8");
  await stageLegacy(ctx, "staged");

  const resumed = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(resumed.outcome, "resumed-success");
  const dest = path.join(ctx.root, "openspec", "changes", "archive", "2026-07-26-demo-change");
  assert.equal(await fs.readFile(path.join(dest, "state.yaml"), "utf8"), originState);
});

test("FS: rollback staging-rename restores safety", async (t) => {
  const ctx = await buildWorkspace(t);
  // Create a staged journal without committing
  const txDir = path.join(ctx.root, ".ospec", "archive-tx", ctx.changeName);
  const stagingArchive = path.join(txDir, "staging", "archive");
  await fs.mkdir(stagingArchive, { recursive: true });
  await fs.writeFile(path.join(stagingArchive, "proposal.md"), "# Proposal\n");
  const planBytes = await fs.readFile(ctx.planPath);
  const planSha = digestBytes(planBytes);
  await fs.writeFile(
    path.join(txDir, "journal.json"),
    JSON.stringify({
      state: "staged",
      plan_sha256: planSha,
      destination: "openspec/changes/archive/2026-07-26-demo-change",
      created_by_tx: [],
    }),
  );

  const receipt = await rollbackTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
  });
  assert.equal(receipt.outcome, "rolled-back");
  assert.ok(await fs.stat(ctx.originDir));
  await assert.rejects(fs.stat(stagingArchive), { code: "ENOENT" });
});

test("FS: Windows EPERM fallback keeps one live target; origin until compare B", async (t) => {
  const ctx = await buildWorkspace(t);
  // Pre-create destination so EPERM/EEXIST fallback (backup→retry) is realistic
  const dest = path.join(
    ctx.root,
    "openspec",
    "changes",
    "archive",
    "2026-07-26-demo-change",
  );
  await fs.mkdir(dest, { recursive: true });
  await fs.writeFile(path.join(dest, "stale.txt"), "old");

  const realRename = fs.rename;
  let epermOnce = true;
  const renameSpy = async (oldPath, newPath) => {
    if (
      epermOnce &&
      String(newPath).includes(`${path.sep}archive${path.sep}2026-07-26-demo-change`) &&
      String(oldPath).includes(`${path.sep}staging${path.sep}archive`)
    ) {
      epermOnce = false;
      const err = new Error("EPERM");
      err.code = "EPERM";
      throw err;
    }
    return realRename(oldPath, newPath);
  };

  const receipt = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
    fsImpl: {
      rename: renameSpy,
      unlink: fs.unlink,
      rm: fs.rm,
      stat: fs.stat,
      mkdir: fs.mkdir,
      readFile: fs.readFile,
      writeFile: fs.writeFile,
      readdir: fs.readdir,
      lstat: fs.lstat,
      cp: fs.cp,
    },
  });
  assert.equal(receipt.outcome, "success");
  assert.equal(receipt.origin_deleted, true);
  assert.ok(await fs.stat(dest));
  await assert.rejects(fs.stat(dest + ".bak"), { code: "ENOENT" });
});

test("receipt: failed compare sets outcome failed, origin_deleted false, parity n/a", async (t) => {
  const ctx = await buildWorkspace(t);
  await seedCompareMismatchFixture(ctx, {
    state: "staged",
    corruptMarker: "# RECEIPT-MISMATCH\n",
  });
  const receipt = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(receipt.outcome, "failed");
  assert.equal(receipt.failure_reason, "compare-mismatch");
  assert.equal(receipt.origin_deleted, false);
  assert.equal(receipt.parity.go, "n/a");
  assert.ok(await fs.stat(ctx.originDir));
});

test("receipt: missing cost yields available false without failing success", async (t) => {
  const ctx = await buildWorkspace(t);
  const receipt = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(receipt.outcome, "success");
  assert.equal(receipt.cost.available, false);
});

async function rewritePlanFingerprint(ctx) {
  const inventory = (await computeInventory(ctx.originDir)).filter(
    (e) => e.path !== "archive-plan.json",
  );
  const plan = {
    ...ctx.plan,
    source_fingerprint: fingerprintInventory(inventory),
    archive_inventory: inventory.map((e) => e.path),
  };
  await fs.writeFile(ctx.planPath, JSON.stringify(plan, null, 2));
  ctx.plan = plan;
  return plan;
}

test("receipt: cost aggregates duration, tiers, statuses, and questions_asked", async (t) => {
  const ctx = await buildWorkspace(t);
  const sessionDir = path.join(ctx.root, ".ospec", "session", ctx.changeName);
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionDir, "phase-costs.jsonl"),
    [
      JSON.stringify({
        phase: "sdd-apply",
        estimated_prompt_tokens: 10,
        estimated_artifact_tokens: 20,
        estimated_tool_output_tokens: 30,
        estimated_output_tokens: 40,
        duration_ms: 1500,
        model_tier: "heavy",
        status: "success",
      }),
      JSON.stringify({
        phase: "sdd-apply",
        estimated_prompt_tokens: 1,
        estimated_artifact_tokens: 2,
        estimated_tool_output_tokens: 3,
        estimated_output_tokens: 4,
        duration_ms: 500,
        model_tier: "light",
        status: "partial",
      }),
    ].join("\n") + "\n",
  );
  await fs.writeFile(
    path.join(ctx.originDir, "state.yaml"),
    `status: verified
phases:
  verify:
    status: done
    verdict: PASS
gates:
  clarify:
    questions_asked: 2
  4r-review-gate:
    questions_asked: 3
  quality-gates:
    status: passed
baseline_fingerprints:
  routing: "${sha256(Buffer.from("# Routing baseline\n"))}"
`,
  );
  await rewritePlanFingerprint(ctx);

  const receipt = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(receipt.outcome, "success");
  assert.equal(receipt.cost.available, true);
  assert.equal(receipt.cost.total_questions_asked, 5);
  assert.equal(receipt.cost.phases.length, 1);
  const phase = receipt.cost.phases[0];
  assert.equal(phase.phase, "sdd-apply");
  assert.equal(phase.duration_ms, 2000);
  assert.equal(phase.invocations, 2);
  assert.equal(phase.relaunches, 1);
  assert.equal(phase.estimated_prompt_tokens, 11);
  assert.equal(phase.estimated_artifact_tokens, 22);
  assert.equal(phase.estimated_tool_output_tokens, 33);
  assert.equal(phase.estimated_output_tokens, 44);
  assert.deepEqual(phase.model_tiers, ["heavy", "light"]);
  assert.deepEqual(phase.statuses, ["partial", "success"]);
});

test("receipt: cost triangulation — multi-phase and zero questions", async (t) => {
  const ctx = await buildWorkspace(t);
  const sessionDir = path.join(ctx.root, ".ospec", "session", ctx.changeName);
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionDir, "phase-costs.jsonl"),
    [
      JSON.stringify({
        phase: "sdd-spec",
        estimated_prompt_tokens: 5,
        estimated_artifact_tokens: 0,
        estimated_tool_output_tokens: 0,
        estimated_output_tokens: 1,
        duration_ms: 100,
        model_tier: "standard",
        status: "success",
      }),
      JSON.stringify({
        phase: "sdd-verify",
        estimated_prompt_tokens: 2,
        estimated_artifact_tokens: 3,
        estimated_tool_output_tokens: 4,
        estimated_output_tokens: 5,
        duration_ms: 50,
        model_tier: "standard",
        status: "success",
      }),
      JSON.stringify({
        phase: "sdd-verify",
        estimated_prompt_tokens: 1,
        estimated_artifact_tokens: 1,
        estimated_tool_output_tokens: 1,
        estimated_output_tokens: 1,
        duration_ms: 25,
        model_tier: "premium",
        status: "blocked",
      }),
    ].join("\n") + "\n",
  );
  // state.yaml from buildWorkspace has no questions_asked → 0

  const receipt = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(receipt.outcome, "success");
  assert.equal(receipt.cost.available, true);
  assert.equal(receipt.cost.total_questions_asked, 0);
  assert.equal(receipt.cost.phases.length, 2);
  const byPhase = Object.fromEntries(receipt.cost.phases.map((p) => [p.phase, p]));
  assert.equal(byPhase["sdd-spec"].duration_ms, 100);
  assert.deepEqual(byPhase["sdd-spec"].model_tiers, ["standard"]);
  assert.deepEqual(byPhase["sdd-spec"].statuses, ["success"]);
  assert.equal(byPhase["sdd-verify"].duration_ms, 75);
  assert.equal(byPhase["sdd-verify"].invocations, 2);
  assert.equal(byPhase["sdd-verify"].relaunches, 1);
  assert.deepEqual(byPhase["sdd-verify"].model_tiers, ["premium", "standard"]);
  assert.deepEqual(byPhase["sdd-verify"].statuses, ["blocked", "success"]);
});

test("FS: baseline-stale preflight fails closed with origin intact", async (t) => {
  const ctx = await buildWorkspace(t);
  await fs.writeFile(
    path.join(ctx.originDir, "state.yaml"),
    `status: verified
phases:
  verify:
    status: done
    verdict: PASS
gates:
  quality-gates:
    status: passed
baseline_fingerprints:
  routing: "${sha256(Buffer.from("stale-fingerprint-bytes"))}"
`,
  );
  await rewritePlanFingerprint(ctx);

  const receipt = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(receipt.outcome, "failed");
  assert.equal(receipt.failure_reason, "baseline-stale");
  assert.equal(receipt.origin_deleted, false);
  assert.ok(await fs.stat(ctx.originDir));
});

test("runArchiveTransaction: rejects unsafe changeName with ../ (fail-closed)", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ospec-archive-unsafe-"));
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); });
  const receipt = await runArchiveTransaction({
    workspace: root,
    changeName: "../evil",
    planPath: path.join(root, "missing.json"),
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(receipt.outcome, "failed");
  assert.ok(receipt.rejection_codes.includes("invalid-schema"));
  assert.equal(receipt.origin_deleted, false);
});

function txFs(rename, extras = {}) {
  return {
    rename,
    unlink: fs.unlink,
    rm: fs.rm,
    stat: fs.stat,
    mkdir: fs.mkdir,
    readFile: fs.readFile,
    writeFile: fs.writeFile,
    readdir: fs.readdir,
    lstat: fs.lstat,
    cp: fs.cp,
    ...extras,
  };
}

test("FS: mid-commit kill — journal advances; resume or rollback deterministic", async (t) => {
  async function killAfterFirstCommitting(ctx) {
    let killed = false;
    await assert.rejects(
      () =>
        runArchiveTransaction({
          workspace: ctx.root,
          changeName: ctx.changeName,
          planPath: ctx.planPath,
          now: new Date("2026-07-26T12:00:00Z"),
          fsImpl: txFs(fs.rename, {
            writeFile: async (p, data, enc) => {
              await fs.writeFile(p, data, enc);
              if (killed || !String(p).endsWith(`${path.sep}journal.json`)) return;
              const j = JSON.parse(String(data));
              if (j.state === "committing" && (j.created_by_tx || []).length) {
                killed = true;
                const err = new Error("simulated process kill");
                err.code = "SIMULATED_KILL";
                throw err;
              }
            },
          }),
        }),
      (err) => err && err.code === "SIMULATED_KILL",
    );
    const j = JSON.parse(
      await fs.readFile(
        path.join(ctx.root, ".ospec", "archive-tx", ctx.changeName, "journal.json"),
        "utf8",
      ),
    );
    assert.equal(j.state, "committing");
    assert.ok(j.created_by_tx.includes("openspec/changes/archive/2026-07-26-demo-change"));
  }

  const a = await buildWorkspace(t);
  await killAfterFirstCommitting(a);
  const resumed = await runArchiveTransaction({
    workspace: a.root,
    changeName: a.changeName,
    planPath: a.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(resumed.outcome, "resumed-success");
  assert.equal(resumed.origin_deleted, true);

  const b = await buildWorkspace(t);
  const bSpec = path.join(b.root, "openspec", "specs", "routing", "spec.md");
  const bOrig = await fs.readFile(bSpec, "utf8");
  await killAfterFirstCommitting(b);
  assert.equal(
    (await rollbackTransaction({ workspace: b.root, changeName: b.changeName })).outcome,
    "rolled-back",
  );
  assert.equal(await fs.readFile(bSpec, "utf8"), bOrig);
  await assert.rejects(
    fs.stat(path.join(b.root, "openspec", "changes", "archive", "2026-07-26-demo-change")),
    { code: "ENOENT" },
  );
});

test("FS: mid-commit failure is rollback-restorable (first write + overwrite)", async (t) => {
  // A: fail after archive dest — created_by_tx persisted; rollback removes dest.
  const a = await buildWorkspace(t);
  const aSpec = path.join(a.root, "openspec", "specs", "routing", "spec.md");
  const aOrig = await fs.readFile(aSpec, "utf8");
  const aDest = path.join(a.root, "openspec", "changes", "archive", "2026-07-26-demo-change");
  let archiveOk = false;
  const aRename = async (oldPath, newPath) => {
    if (
      String(oldPath).includes(`${path.sep}staging${path.sep}archive`) &&
      String(newPath).includes(`${path.sep}archive${path.sep}2026-07-26-demo-change`)
    ) {
      await fs.rename(oldPath, newPath);
      archiveOk = true;
      return;
    }
    if (archiveOk && String(oldPath).includes(".ospec-tx-tmp")) {
      const err = new Error("injected after first live write");
      err.code = "EIO";
      throw err;
    }
    return fs.rename(oldPath, newPath);
  };
  let receipt = await runArchiveTransaction({
    workspace: a.root,
    changeName: a.changeName,
    planPath: a.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
    fsImpl: txFs(aRename),
  });
  assert.equal(receipt.outcome, "failed");
  assert.equal(receipt.failure_reason, "commit-failed");
  assert.equal(receipt.origin_deleted, false);
  assert.ok(archiveOk && (await fs.stat(a.originDir)));
  assert.ok(
    JSON.parse(
      await fs.readFile(path.join(a.root, ".ospec", "archive-tx", a.changeName, "journal.json"), "utf8"),
    ).created_by_tx.includes("openspec/changes/archive/2026-07-26-demo-change"),
  );
  assert.equal(
    (await rollbackTransaction({ workspace: a.root, changeName: a.changeName })).outcome,
    "rolled-back",
  );
  assert.equal(await fs.readFile(aSpec, "utf8"), aOrig);
  await assert.rejects(fs.stat(aDest), { code: "ENOENT" });

  // B: fail after spec overwrite — retain .bak; rollback restores baseline.
  // Only a plan staged before E3.1 still writes after the spec: its ADR.
  const b = await buildWorkspace(t, { legacyAdr: true });
  await stageLegacy(b, "compared");
  const bSpec = path.join(b.root, "openspec", "specs", "routing", "spec.md");
  const bOrig = await fs.readFile(bSpec, "utf8");
  let specOk = false;
  const bRename = async (oldPath, newPath) => {
    if (String(newPath) === bSpec && String(oldPath).includes(".ospec-tx-tmp")) {
      await fs.rename(oldPath, newPath);
      specOk = true;
      return;
    }
    if (specOk && String(oldPath).includes(".ospec-tx-tmp") && String(newPath).includes(`${path.sep}adr${path.sep}`)) {
      const err = new Error("injected after spec overwrite");
      err.code = "EIO";
      throw err;
    }
    return fs.rename(oldPath, newPath);
  };
  receipt = await runArchiveTransaction({
    workspace: b.root,
    changeName: b.changeName,
    planPath: b.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
    fsImpl: txFs(bRename),
  });
  assert.equal(receipt.outcome, "failed");
  assert.ok(specOk);
  assert.equal(await fs.readFile(bSpec + ".bak", "utf8"), bOrig);
  assert.ok(
    JSON.parse(
      await fs.readFile(path.join(b.root, ".ospec", "archive-tx", b.changeName, "journal.json"), "utf8"),
    ).created_by_tx.includes("openspec/specs/routing/spec.md"),
  );
  await rollbackTransaction({ workspace: b.root, changeName: b.changeName });
  assert.equal(await fs.readFile(bSpec, "utf8"), bOrig);
  await assert.rejects(
    fs.stat(path.join(b.root, "openspec", "changes", "archive", "2026-07-26-demo-change")),
    { code: "ENOENT" },
  );
});

test("FS: rollback post-commit fixture restores .bak and cleans staging", async (t) => {
  async function assertPostCommitRollback(state) {
    const ctx = await buildWorkspace(t);
    const specRel = "openspec/specs/routing/spec.md";
    const destRel = "openspec/changes/archive/2026-07-26-demo-change";
    const specAbs = path.join(ctx.root, ...specRel.split("/"));
    const destAbs = path.join(ctx.root, ...destRel.split("/"));
    const baseline = "# Routing baseline\n";
    const txDir = path.join(ctx.root, ".ospec", "archive-tx", ctx.changeName);
    const staging = path.join(txDir, "staging", "archive");

    await fs.writeFile(specAbs, "# Routing merged (live after partial commit)\n");
    await fs.writeFile(specAbs + ".bak", baseline);
    await fs.mkdir(destAbs, { recursive: true });
    await fs.writeFile(path.join(destAbs, "proposal.md"), "# Proposal\n");
    await fs.mkdir(staging, { recursive: true });
    await fs.writeFile(path.join(staging, "leftover.md"), "staged-leftover");
    await fs.mkdir(txDir, { recursive: true });
    await fs.writeFile(
      path.join(txDir, "journal.json"),
      JSON.stringify({
        state,
        plan_sha256: digestBytes(await fs.readFile(ctx.planPath)),
        destination: destRel,
        created_by_tx: [destRel, specRel],
      }),
    );

    const receipt = await rollbackTransaction({
      workspace: ctx.root,
      changeName: ctx.changeName,
    });
    assert.equal(receipt.outcome, "rolled-back");
    assert.equal(await fs.readFile(specAbs, "utf8"), baseline);
    await assert.rejects(fs.stat(specAbs + ".bak"), { code: "ENOENT" });
    await assert.rejects(fs.stat(destAbs), { code: "ENOENT" });
    await assert.rejects(fs.stat(staging), { code: "ENOENT" });
    assert.equal(
      JSON.parse(await fs.readFile(path.join(txDir, "journal.json"), "utf8")).state,
      "rolled-back",
    );
  }

  await assertPostCommitRollback("failed");
  await assertPostCommitRollback("committed");
});

test("FS: after successful origin rm, never emit failed with origin_deleted:false", async (t) => {
  const ctx = await buildWorkspace(t);
  const originNorm = path.resolve(ctx.originDir);
  let originRmSucceeded = false;

  const receipt = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
    fsImpl: txFs(fs.rename, {
      rm: async (p, opts) => {
        await fs.rm(p, opts);
        if (path.resolve(String(p)) === originNorm) originRmSucceeded = true;
      },
      writeFile: async (p, data, enc) => {
        // Reproduce: persistence after successful rm must not yield
        // failed + origin_deleted:false with origin already absent.
        if (originRmSucceeded) {
          const err = new Error("injected post-rm persistence failure");
          err.code = "EIO";
          throw err;
        }
        return fs.writeFile(p, data, enc);
      },
    }),
  });

  assert.equal(originRmSucceeded, true);
  await assert.rejects(fs.stat(ctx.originDir), { code: "ENOENT" });
  assert.notEqual(
    receipt.outcome === "failed" && receipt.origin_deleted === false,
    true,
    "never claim origin_deleted:false after successful rm",
  );
  assert.equal(receipt.origin_deleted, true);
  assert.ok(
    receipt.outcome === "success" || receipt.outcome === "resumed-success",
    `expected success-class outcome, got ${receipt.outcome}`,
  );
  const journal = JSON.parse(
    await fs.readFile(
      path.join(ctx.root, ".ospec", "archive-tx", ctx.changeName, "journal.json"),
      "utf8",
    ),
  );
  assert.equal(journal.state, "done");
});

test("FS: journal done write failure before rm leaves origin intact", async (t) => {
  const ctx = await buildWorkspace(t);
  const originNorm = path.resolve(ctx.originDir);
  let blockedDoneWrite = false;
  let originRmAttempted = false;

  const receipt = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
    fsImpl: txFs(fs.rename, {
      rm: async (p, opts) => {
        if (path.resolve(String(p)) === originNorm) originRmAttempted = true;
        return fs.rm(p, opts);
      },
      writeFile: async (p, data, enc) => {
        if (String(p).endsWith(`${path.sep}journal.json`)) {
          const j = JSON.parse(String(data));
          if (j.state === "done") {
            blockedDoneWrite = true;
            const err = new Error("injected done-journal persistence failure");
            err.code = "EIO";
            throw err;
          }
        }
        return fs.writeFile(p, data, enc);
      },
    }),
  });

  assert.equal(blockedDoneWrite, true);
  assert.equal(originRmAttempted, false);
  assert.equal(receipt.outcome, "failed");
  assert.equal(receipt.origin_deleted, false);
  assert.ok(await fs.stat(ctx.originDir));
});

test("FS: preflight rejects plan with corrupted spec content (undefined) and leaves origin intact", async (t) => {
  const ctx = await buildWorkspace(t);
  const corruptSpec = "# Routing merged\n\n### Requirement: Foo {#REQ-routing-001}\n\nundefined\n";
  const specPath = path.join(ctx.originDir, "specs", "routing", "spec.md");
  await fs.writeFile(specPath, corruptSpec);

  ctx.plan.spec_writes[0].content_sha256 = sha256(Buffer.from(corruptSpec));
  await rewritePlanFingerprint(ctx);

  const receipt = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });

  assert.equal(receipt.outcome, "failed");
  assert.ok(receipt.rejection_codes.includes("corrupted-spec-content"));
  assert.equal(receipt.origin_deleted, false);
  assert.ok(await fs.stat(ctx.originDir));

  const archiveRoot = path.join(ctx.root, "openspec", "changes", "archive");
  const entries = await fs.readdir(archiveRoot).catch((e) => {
    if (e.code === "ENOENT") return [];
    throw e;
  });
  assert.equal(entries.length, 0);
});

test("FS: preflight rejects plan with dropped requirement ID without REMOVED and leaves origin intact", async (t) => {
  const ctx = await buildWorkspace(t);
  const liveTarget = "# Routing baseline\n\n### Requirement: R1 {#REQ-routing-001}\n\n### Requirement: R2 {#REQ-routing-002}\n";
  const livePath = path.join(ctx.root, "openspec", "specs", "routing", "spec.md");
  await fs.writeFile(livePath, liveTarget);

  const stateYaml = `status: verified
phases:
  verify:
    status: done
    verdict: PASS
gates:
  quality-gates:
    status: passed
baseline_fingerprints:
  routing: "${sha256(Buffer.from(liveTarget))}"
`;
  await fs.writeFile(path.join(ctx.originDir, "state.yaml"), stateYaml);

  const droppedSpec = "# Routing merged\n\n### Requirement: R1 {#REQ-routing-001}\n";
  const specPath = path.join(ctx.originDir, "specs", "routing", "spec.md");
  await fs.writeFile(specPath, droppedSpec);

  ctx.plan.spec_writes[0].target_before_sha256 = sha256(Buffer.from(liveTarget));
  ctx.plan.spec_writes[0].content_sha256 = sha256(Buffer.from(droppedSpec));
  await rewritePlanFingerprint(ctx);


  const receipt = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });

  assert.equal(receipt.outcome, "failed");
  assert.ok(receipt.rejection_codes.includes("dropped-requirement-id"));
  assert.equal(receipt.origin_deleted, false);
  assert.ok(await fs.stat(ctx.originDir));
  assert.equal(await fs.readFile(livePath, "utf8"), liveTarget);
});


// --- PR4a: retry after a failure, review lineage gate, archived status --------

const {
  startQualityReviewLineage,
  beginLens,
  recordLensResult,
  freezeFindings,
  terminateLineage,
} = require("./review-lineage.js");

const ARCHIVE_NOW = new Date("2026-07-26T12:00:00Z");

function runArchive(ctx) {
  return runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: ARCHIVE_NOW,
  });
}

function archivedDir(ctx) {
  return path.join(ctx.root, "openspec", "changes", "archive", `2026-07-26-${ctx.changeName}`);
}

test("FS: a gate failure is retried once the gate is satisfied", async (t) => {
  const ctx = await buildWorkspace(t, {
    stateYaml: DEFAULT_STATE_YAML.replace("    verdict: PASS\n", ""),
  });
  const first = await runArchive(ctx);
  assert.equal(first.outcome, "failed");
  assert.equal(first.failure_reason, "gate-not-satisfied");

  await fs.writeFile(path.join(ctx.originDir, "state.yaml"), DEFAULT_STATE_YAML);
  await rewritePlanFingerprint(ctx);
  const second = await runArchive(ctx);
  assert.equal(second.outcome, "success");
  await assert.rejects(fs.stat(ctx.originDir), { code: "ENOENT" });
  assert.ok(await fs.stat(archivedDir(ctx)));
});

test("FS: after a rollback a new run archives the change", async (t) => {
  const ctx = await buildWorkspace(t);
  const txDir = path.join(ctx.root, ".ospec", "archive-tx", ctx.changeName);
  await fs.mkdir(path.join(txDir, "staging", "archive"), { recursive: true });
  await fs.writeFile(
    path.join(txDir, "journal.json"),
    JSON.stringify({
      state: "staged",
      plan_sha256: digestBytes(await fs.readFile(ctx.planPath)),
      destination: "openspec/changes/archive/2026-07-20-demo-change",
      created_by_tx: [],
    }),
  );
  const rolledBack = await rollbackTransaction({ workspace: ctx.root, changeName: ctx.changeName });
  assert.equal(rolledBack.outcome, "rolled-back");

  const receipt = await runArchive(ctx);
  assert.equal(receipt.outcome, "success");
  assert.equal(receipt.destination, "openspec/changes/archive/2026-07-26-demo-change");
  assert.ok(await fs.stat(archivedDir(ctx)));
});

test("FS: a failure after live writes stays failed until rollback", async (t) => {
  const ctx = await buildWorkspace(t);
  const txDir = path.join(ctx.root, ".ospec", "archive-tx", ctx.changeName);
  await fs.mkdir(txDir, { recursive: true });
  const journal = {
    state: "failed",
    failure_reason: "commit-failed",
    plan_sha256: digestBytes(await fs.readFile(ctx.planPath)),
    destination: "openspec/changes/archive/2026-07-26-demo-change",
    created_by_tx: ["openspec/changes/archive/2026-07-26-demo-change"],
  };
  await fs.writeFile(path.join(txDir, "journal.json"), JSON.stringify(journal));

  const receipt = await runArchive(ctx);
  assert.equal(receipt.outcome, "failed");
  assert.equal(receipt.failure_reason, "commit-failed");
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(txDir, "journal.json"), "utf8")), journal);
  assert.ok(await fs.stat(ctx.originDir));
});

test("FS: the archived state.yaml says archived and keeps every other byte", async (t) => {
  const stateYaml = DEFAULT_STATE_YAML.replace("status: verified", "status: archive-pending");
  const ctx = await buildWorkspace(t, { stateYaml: stateYaml.replace(/\n/g, "\r\n") });
  const receipt = await runArchive(ctx);
  assert.equal(receipt.outcome, "success");
  const archived = await fs.readFile(path.join(archivedDir(ctx), "state.yaml"), "utf8");
  assert.equal(archived, stateYaml.replace("status: archive-pending", "status: archived").replace(/\n/g, "\r\n"));
  const entry = receipt.committed_inventory.find((e) => e.path === "state.yaml");
  assert.equal(entry.sha256, sha256(Buffer.from(archived)));
});

const REVIEW_CONFIG = `routing:
  - name: standard
    classification: [normal]
    phases: [sdd-propose, sdd-apply, sdd-verify, sdd-archive]
    gates: [quality-review-gate]
  - name: plain
    classification: [small]
    phases: [sdd-propose, sdd-apply, sdd-verify, sdd-archive]
    gates: []
`;

function reviewCandidate() {
  return {
    projection: "workspace",
    base_tree: "base-1",
    candidate_tree: "tree-9",
    paths: ["scripts/a.js"],
    diff_hash: `sha256:${"a".repeat(64)}`,
    paths_digest: `sha256:${"b".repeat(64)}`,
    authored_lines: 9,
    original_changed_lines: 9,
  };
}

function reviewingLineage() {
  return startQualityReviewLineage({
    candidate: reviewCandidate(),
    classification: "normal",
    selected_domains: ["trust"],
    evidence_fingerprint: `sha256:${"c".repeat(64)}`,
  });
}

function approvedLineage() {
  let state = reviewingLineage();
  state = beginLens(state, { dimension: "trust", expected_revision: state.revision, request_id: "trust-start" });
  state = recordLensResult(state, {
    dimension: "trust",
    expected_revision: state.revision,
    request_id: "trust-result",
    result: { findings: [] },
  });
  return freezeFindings(state, { expected_revision: state.revision, request_id: "freeze" });
}

function escalatedLineage() {
  const state = reviewingLineage();
  return terminateLineage(state, {
    expected_revision: state.revision,
    request_id: "escalate",
    status: "escalated",
    reason: "the user stopped the review",
  });
}

function reviewGate(lineage) {
  return {
    schema_version: 2,
    classification: "normal",
    classification_status: "sufficient",
    selected_domains: ["trust"],
    status: lineage.status,
    lineage,
  };
}

function reviewState({ route = "standard", gate = null, verifyLineage = null } = {}) {
  let text = DEFAULT_STATE_YAML.replace(
    "phases:\n",
    `route:\n  actual_route: ${route}\nphases:\n`,
  );
  if (gate) {
    text = text.replace("gates:\n", `gates:\n  quality-review-gate: ${JSON.stringify(gate)}\n`);
  }
  if (verifyLineage) text += `verify_lineage: ${JSON.stringify(verifyLineage)}\n`;
  return text;
}

async function archiveWithState(t, stateYaml) {
  const ctx = await buildWorkspace(t, {
    stateYaml,
    extraFiles: { "openspec/config.yaml": REVIEW_CONFIG },
  });
  return { ctx, receipt: await runArchive(ctx) };
}

for (const [name, gate] of [
  ["absent", null],
  ["still reviewing", () => reviewGate(reviewingLineage())],
  ["escalated", () => reviewGate(escalatedLineage())],
]) {
  test(`FS: a route with quality-review-gate blocks archive when the review is ${name}`, async (t) => {
    const { ctx, receipt } = await archiveWithState(t, reviewState({ gate: gate && gate() }));
    assert.equal(receipt.outcome, "failed");
    assert.equal(receipt.failure_reason, "gate-not-satisfied");
    assert.ok(await fs.stat(ctx.originDir));
    await assert.rejects(fs.stat(archivedDir(ctx)), { code: "ENOENT" });
  });
}

test("FS: a route with quality-review-gate archives with an approved lineage", async (t) => {
  const lineage = approvedLineage();
  assert.equal(lineage.status, "approved");
  const { receipt } = await archiveWithState(t, reviewState({ gate: reviewGate(lineage) }));
  assert.equal(receipt.outcome, "success");
});

test("FS: a review gate that selected no domain needs no lineage", async (t) => {
  const gate = { schema_version: 2, classification: "trivial", classification_status: "sufficient", selected_domains: [], status: "done" };
  const { receipt } = await archiveWithState(t, reviewState({ gate }));
  assert.equal(receipt.outcome, "success");
});

test("FS: a route without quality-review-gate archives without a review", async (t) => {
  const { receipt } = await archiveWithState(t, reviewState({ route: "plain" }));
  assert.equal(receipt.outcome, "success");
});

test("FS: a route missing from the routing table blocks archive", async (t) => {
  const { receipt } = await archiveWithState(t, reviewState({ route: "unknown-route" }));
  assert.equal(receipt.outcome, "failed");
  assert.equal(receipt.failure_reason, "gate-not-satisfied");
});

test("FS: a verify_lineage that is not closed blocks archive", async (t) => {
  const open = await archiveWithState(t, reviewState({ route: "plain", verifyLineage: { status: "remediation-pending" } }));
  assert.equal(open.receipt.outcome, "failed");
  assert.equal(open.receipt.failure_reason, "gate-not-satisfied");

  const closed = await archiveWithState(t, reviewState({ route: "plain", verifyLineage: { status: "closed" } }));
  assert.equal(closed.receipt.outcome, "success");
});

const { archiveLineagesAllow } = require("./archive-transaction.js");

function blockGateState(gateLines, tail = "") {
  return ["status: archive-pending", "gates:", "  quality-review-gate:     # live v2", ...gateLines, tail].join("\n");
}

test("archiveLineagesAllow: a block gate that selected no domain needs no lineage", () => {
  const text = blockGateState([
    "    status: done",
    "    schema_version: 2",
    "    selected_domains:",
    "      trust: { selected: false, reasons: [{ code: no-trust-signal }] }",
    "      runtime: { selected: false, reasons: [] }",
  ]);
  assert.equal(archiveLineagesAllow(text, { reviewRequired: true }), true);
});

test("archiveLineagesAllow: a block gate with selected domains needs a lineage", () => {
  const selected = blockGateState(["    status: done", "    selected_domains:", "      - trust"]);
  assert.equal(archiveLineagesAllow(selected, { reviewRequired: true }), false);
  const flagged = blockGateState(["    status: done", "    selected_domains:", "      trust: { selected: true }"]);
  assert.equal(archiveLineagesAllow(flagged, { reviewRequired: true }), false);
});

test("archiveLineagesAllow: a block gate reads a one-line JSON lineage", () => {
  const approved = blockGateState([
    "    status: approved",
    "    selected_domains:",
    '      - "trust"',
    `    lineage: ${JSON.stringify(approvedLineage())}`,
  ]);
  assert.equal(archiveLineagesAllow(approved, { reviewRequired: true }), true);
  const escalated = blockGateState(["    status: escalated", `    lineage: ${JSON.stringify(escalatedLineage())}`]);
  assert.equal(archiveLineagesAllow(escalated, { reviewRequired: true }), false);
});

test("archiveLineagesAllow: a lineage written as a YAML block blocks", () => {
  const text = blockGateState(["    status: approved", "    lineage:", "      schema_version: 2", "      status: approved"]);
  assert.equal(archiveLineagesAllow(text, { reviewRequired: true }), false);
});

test("archiveLineagesAllow: verify_lineage in block or JSON form must be closed", () => {
  const base = "status: archive-pending\n";
  assert.equal(archiveLineagesAllow(`${base}verify_lineage:\n  schema_version: 1\n  status: closed\n`, { reviewRequired: false }), true);
  assert.equal(archiveLineagesAllow(`${base}verify_lineage:\n  status: exhausted\n`, { reviewRequired: false }), false);
  assert.equal(archiveLineagesAllow(`${base}verify_lineage: null\n`, { reviewRequired: false }), true);
  assert.equal(archiveLineagesAllow(`${base}verify_lineage: {"status":"recheck-pending"}\n`, { reviewRequired: false }), false);
  assert.equal(archiveLineagesAllow(`${base}verify_lineage: {broken\n`, { reviewRequired: false }), false);
});

test("archiveLineagesAllow: without a review requirement the review gate is not read", () => {
  const text = blockGateState(["    status: escalated", `    lineage: ${JSON.stringify(escalatedLineage())}`]);
  assert.equal(archiveLineagesAllow(text, { reviewRequired: false }), true);
});

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

test("nextTransactionAction: terminal failed stays terminal", () => {
  const result = nextTransactionAction(
    { state: "failed", plan_sha256: "sha256:aaa" },
    { planSha256: "sha256:aaa" },
  );
  assert.equal(result.action, "noop-terminal");
});

test("nextTransactionAction: terminal rolled-back stays terminal", () => {
  const result = nextTransactionAction(
    { state: "rolled-back", plan_sha256: "sha256:aaa" },
    { planSha256: "sha256:aaa" },
  );
  assert.equal(result.action, "noop-terminal");
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

async function buildWorkspace(t, changeName = "demo-change") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ospec-archive-tx-"));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const originRel = `openspec/changes/${changeName}`;
  const proposal = "# Proposal\n";
  const stateYaml = `status: verified
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
  const preparedSpec = "# Routing merged\n";
  const adr = "# ADR-001\n";
  const liveTarget = "# Routing baseline\n";

  await writeTree(root, {
    [`${originRel}/proposal.md`]: proposal,
    [`${originRel}/state.yaml`]: stateYaml,
    [`${originRel}/specs/routing/spec.md`]: preparedSpec,
    [`${originRel}/decisions/adr-001.md`]: adr,
    "openspec/specs/routing/spec.md": liveTarget,
    "docs/adr/.gitkeep": "",
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
    adr_promotions: [
      {
        source: "decisions/adr-001.md",
        target: "docs/adr/adr-001-demo.md",
        content_sha256: sha256(Buffer.from(adr)),
      },
    ],
    archive_inventory: inventory.map((e) => e.path),
    accepted_warnings: [],
    rollback: { strategy: "staging-rename" },
  };

  const planPath = path.join(originDir, "archive-plan.json");
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2));

  return { root, changeName, originDir, planPath, plan, inventory, fp };
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
  assert.equal(
    await fs.readFile(path.join(ctx.root, "docs", "adr", "adr-001-demo.md"), "utf8"),
    "# ADR-001\n",
  );
});

test("FS: post-staging resume continues to success", async (t) => {
  const ctx = await buildWorkspace(t);
  const txDir = path.join(ctx.root, ".ospec", "archive-tx", ctx.changeName);
  const stagingRoot = path.join(txDir, "staging");
  const stagingArchive = path.join(stagingRoot, "archive");

  // Perform staging manually and seed journal at `staged`
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
      state: "staged",
      plan_sha256: digestBytes(planBytes),
      destination: "openspec/changes/archive/2026-07-26-demo-change",
      origin_inventory: originInv,
      created_by_tx: [],
    }),
  );

  const resumed = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(resumed.outcome, "resumed-success");
  assert.equal(resumed.origin_deleted, true);

  const second = await runArchiveTransaction({
    workspace: ctx.root,
    changeName: ctx.changeName,
    planPath: ctx.planPath,
    now: new Date("2026-07-26T12:00:00Z"),
  });
  assert.equal(second.outcome, "success");
  assert.equal(second.already_complete, true);
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
  const b = await buildWorkspace(t);
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

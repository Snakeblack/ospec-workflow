"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const { main } = require("./archive-transaction-run.js");
const {
  computeInventory,
  fingerprintInventory,
  digestBytes,
} = require("./lib/archive-transaction.js");

function sha256(buf) {
  return `sha256:${crypto.createHash("sha256").update(buf).digest("hex")}`;
}

async function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, ...rel.split("/"));
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
}

async function buildCliWorkspace(t, changeName = "cli-demo") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ospec-archive-cli-"));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const originRel = `openspec/changes/${changeName}`;
  const preparedSpec = "# Routing merged\n";
  const adr = "# ADR-001\n";
  const liveTarget = "# Routing baseline\n";

  await writeTree(root, {
    [`${originRel}/proposal.md`]: "# Proposal\n",
    [`${originRel}/state.yaml`]: `status: verified
phases:
  verify:
    status: done
    verdict: PASS
gates:
  quality-gates:
    status: passed
baseline_fingerprints:
  routing: "${sha256(Buffer.from(liveTarget))}"
`,
    [`${originRel}/specs/routing/spec.md`]: preparedSpec,
    [`${originRel}/decisions/adr-001.md`]: adr,
    "openspec/specs/routing/spec.md": liveTarget,
    "docs/adr/.gitkeep": "",
  });

  const originDir = path.join(root, "openspec", "changes", changeName);
  const inventory = (await computeInventory(originDir)).filter(
    (e) => e.path !== "archive-plan.json",
  );
  const plan = {
    schema_version: 1,
    change: changeName,
    source_fingerprint: fingerprintInventory(inventory),
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
  return { root, changeName, originDir, planPath };
}

async function runMain(argv, workspace) {
  let code = null;
  const lines = [];
  const errors = [];
  await main(argv, {
    log: (s) => lines.push(s),
    error: (s) => errors.push(String(s)),
    exit: (c) => {
      code = c;
    },
    workspace,
  });
  return { code, lines, errors };
}

test("CLI: missing change name exits 1", async () => {
  const { code } = await runMain([], process.cwd());
  assert.equal(code, 1);
});

test("CLI: success prints receipt JSON and exits 0 via production main", async (t) => {
  const ctx = await buildCliWorkspace(t);
  const { code, lines } = await runMain(
    [ctx.changeName, "--workspace", ctx.root],
    ctx.root,
  );
  assert.equal(code, 0);
  assert.equal(lines.length, 1);
  const receipt = JSON.parse(lines[0]);
  assert.equal(receipt.outcome, "success");
  assert.equal(receipt.origin_deleted, true);
  assert.equal(receipt.parity.go, "n/a");
  assert.ok(Array.isArray(receipt.committed_inventory));
  assert.ok(receipt.committed_inventory.length > 0);
});

test("CLI: failed plan exits 1 with failed receipt JSON", async (t) => {
  const ctx = await buildCliWorkspace(t);
  const bad = JSON.parse(await fs.readFile(ctx.planPath, "utf8"));
  bad.source_fingerprint = sha256(Buffer.from("wrong"));
  await fs.writeFile(ctx.planPath, JSON.stringify(bad));

  const { code, lines } = await runMain(
    [ctx.changeName, "--workspace", ctx.root],
    ctx.root,
  );
  assert.equal(code, 1);
  assert.equal(lines.length, 1);
  const receipt = JSON.parse(lines[0]);
  assert.equal(receipt.outcome, "failed");
  assert.equal(receipt.origin_deleted, false);
});

test("CLI: resumed-success exits 0 with receipt from mid-flight journal", async (t) => {
  const ctx = await buildCliWorkspace(t);
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
      destination: `openspec/changes/archive/2026-07-26-${ctx.changeName}`,
      origin_inventory: originInv,
      created_by_tx: [],
    }),
  );

  const { code, lines } = await runMain(
    [ctx.changeName, "--workspace", ctx.root],
    ctx.root,
  );
  assert.equal(code, 0);
  const receipt = JSON.parse(lines[0]);
  assert.equal(receipt.outcome, "resumed-success");
  assert.equal(receipt.origin_deleted, true);
});

test("CLI: rejects ../ and absolute changeName fail-closed", async () => {
  for (const name of ["../evil-change", "/tmp/abs-change"]) {
    const { code, lines } = await runMain([name, "--workspace", process.cwd()], process.cwd());
    assert.equal(code, 1, name);
    assert.equal(lines.length, 0, name);
  }
});

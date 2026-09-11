"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure } = require("./configure/cli.js");
const { parseRoutingTable } = require("./lib/route-dispatcher.js");
const { validatePhaseTransition } = require("./lib/flow-validator.js");
const { resolveRemainingTasks } = require("./lib/apply-resume.js");
const { classifyEvidence, validateRequirementEvidence } = require("./lib/verify-evidence-classification.js");
const { LITE_ARCHIVE_ARTIFACTS } = require("./lib/archive-plan.js");
const {
  runArchiveTransaction,
  computeInventory,
  fingerprintInventory,
} = require("./lib/archive-transaction.js");

const ROOT = path.resolve(__dirname, "..");
const TARGETS = ["claude", "vscode", "github-copilot", "opencode", "codex", "cursor"];

function tmpOut(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-compact-lite-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function readTree(root, relative = "") {
  const directory = path.join(root, relative);
  if (!fs.existsSync(directory)) {
    return "";
  }

  return fs.readdirSync(directory, { withFileTypes: true })
    .map((entry) => {
      const child = relative ? path.join(relative, entry.name) : entry.name;
      return entry.isDirectory()
        ? readTree(root, child)
        : fs.readFileSync(path.join(root, child), "utf8");
    })
    .join("\n");
}

function assertLiteConsumerContract(text, label) {
  assert.match(text, /state\.yaml\.route\.actual_route/, `${label} must resolve the persisted route`);
  for (const artifact of ["proposal-lite.md", "tasks.md", "apply-progress.md", "verify-report.md"]) {
    assert.match(text, new RegExp(artifact.replace(".", "\\.")), `${label} must retain ${artifact}`);
  }
  const unconditionalStandardRead = text.split(/\r?\n/).find((line) =>
    /lite[^\n]*(?:requires|require)[^\n]*proposal, change-local specs, and design/i.test(line) &&
    !/standard(?: also)? requires/i.test(line),
  );
  assert.equal(
    unconditionalStandardRead,
    undefined,
    `${label} must not require standard planning artifacts for lite`,
  );
}

test("compact lite source contract has stable producers, independent verify, and no filler", () => {
  const source = [
    "skills/sdd-propose/SKILL.md",
    "skills/sdd-tasks/SKILL.md",
    "skills/sdd-apply/SKILL.md",
    "skills/sdd-verify/SKILL.md",
    "skills/sdd-archive/SKILL.md",
  ].map((relative) => fs.readFileSync(path.join(ROOT, relative), "utf8")).join("\n");

  assert.match(source, /AC-1:/, "lite proposal must create stable acceptance labels");
  assert.match(source, /proposal-lite\.md/, "lite contract must be represented once");
  assert.match(source, /verify-report\.md/, "archive must retain independent verification evidence");
  assert.doesNotMatch(source, /create empty spec\/design/i, "lite contract must not use filler artifacts");
});

test("compact lite generator parity holds across six targets and rejects an unconditional standard read", (t) => {
  const sourceConfig = fs.readFileSync(path.join(ROOT, "openspec", "config.yaml"), "utf8");
  const lite = parseRoutingTable(sourceConfig).find((route) => route.name === "lite");
  assert.deepEqual(lite.phases, ["sdd-propose", "sdd-tasks", "sdd-apply", "sdd-verify", "sdd-archive"]);

  for (const target of TARGETS) {
    const outDir = tmpOut(t);
    const result = runConfigure({ sourceDir: ROOT, target, outDir, validate: false });
    assert.ok(result.files.length > 0, `${target} must generate files`);
    assertLiteConsumerContract(readTree(outDir), target);
  }

  assert.throws(
    () => assertLiteConsumerContract(
      "state.yaml.route.actual_route proposal-lite.md tasks.md apply-progress.md verify-report.md lite requires proposal, change-local specs, and design",
      "broken target",
    ),
    /must not require standard planning artifacts/,
  );
});

test("compact lite compatibility does not weaken standard predecessor validation", () => {
  const standard = ["sdd-propose", "sdd-spec", "sdd-design", "sdd-tasks", "sdd-apply", "sdd-verify", "sdd-archive"];
  const standardResult = validatePhaseTransition("sdd-tasks", standard, {
    "proposal.md": true,
    specs: true,
    "design.md": false,
  }, { routeName: "standard" });
  assert.equal(standardResult.allowed, false);

  const liteResult = validatePhaseTransition("sdd-tasks", ["sdd-propose", "sdd-tasks", "sdd-apply", "sdd-verify", "sdd-archive"], {
    "proposal-lite.md": true,
    "design.md": false,
    specs: false,
  }, { routeName: "lite" });
  assert.equal(liteResult.allowed, true);
});

test("canonical end-to-end acceptance: 5-phase lite journey with cumulative apply, independent verify, and fail-closed archive", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ospec-canonical-lite-"));
  t.after(async () => {
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  const changeName = "bounded-math-service";
  const changeDir = path.join(root, "openspec", "changes", changeName);
  await fs.promises.mkdir(changeDir, { recursive: true });

  const litePhases = ["sdd-propose", "sdd-tasks", "sdd-apply", "sdd-verify", "sdd-archive"];
  const standardPhases = ["sdd-propose", "sdd-spec", "sdd-design", "sdd-tasks", "sdd-apply", "sdd-verify", "sdd-archive"];

  // ---------------------------------------------------------------------------
  // FASE 1: sdd-propose (genera proposal-lite.md y state.yaml)
  // ---------------------------------------------------------------------------
  const proposalLiteContent = [
    "# Proposal: Bounded Math Service",
    "",
    "## Intent",
    "Provide a compact multiplication utility with positive factor validation.",
    "",
    "## Acceptance Criteria",
    "- **AC-1**: `calculateMultiplier(n, factor)` returns `n * factor` for valid inputs.",
    "- **AC-2**: `calculateMultiplier(n, factor)` throws `TypeError` when `factor <= 0`.",
    "",
    "## Risks & Rollback",
    "- Risk: Low.",
    "- Rollback: Revert function file.",
    "",
  ].join("\n");

  const stateYamlInitial = [
    "status: in-progress",
    "route:",
    "  name: lite",
    "  actual_route: lite",
    "phases:",
    "  sdd-propose:",
    "    status: done",
    "  sdd-tasks:",
    "    status: pending",
    "  sdd-apply:",
    "    status: pending",
    "  sdd-verify:",
    "    status: pending",
    "  sdd-archive:",
    "    status: pending",
    "",
  ].join("\n");

  await fs.promises.writeFile(path.join(changeDir, "proposal-lite.md"), proposalLiteContent, "utf8");
  await fs.promises.writeFile(path.join(changeDir, "state.yaml"), stateYamlInitial, "utf8");

  assert.equal(fs.existsSync(path.join(changeDir, "proposal.md")), false, "No debe existir proposal.md standard");
  assert.equal(fs.existsSync(path.join(changeDir, "specs")), false, "No deben existir specs/**");
  assert.equal(fs.existsSync(path.join(changeDir, "design.md")), false, "No debe existir design.md");

  // ---------------------------------------------------------------------------
  // FASE 2: sdd-tasks (validación de transición y generación de tasks.md)
  // ---------------------------------------------------------------------------
  const filesAtTasks = {
    "proposal-lite.md": true,
    "proposal.md": false,
    specs: false,
    "design.md": false,
  };

  const tasksTransitionLite = validatePhaseTransition("sdd-tasks", litePhases, filesAtTasks, { routeName: "lite" });
  assert.equal(tasksTransitionLite.allowed, true, "sdd-tasks debe permitirse en lite con proposal-lite.md");

  const tasksTransitionStd = validatePhaseTransition("sdd-tasks", standardPhases, filesAtTasks, { routeName: "standard" });
  assert.equal(tasksTransitionStd.allowed, false, "sdd-tasks no debe permitirse en standard sin design");

  const tasksContent = [
    "# Tasks: Bounded Math Service",
    "",
    "## Tasks",
    "- [ ] 1.1 Implement core multiplier logic (AC-1)",
    "- [ ] 1.2 Implement positive factor validation (AC-2)",
    "",
  ].join("\n");

  await fs.promises.writeFile(path.join(changeDir, "tasks.md"), tasksContent, "utf8");

  const filesAtApply = { ...filesAtTasks, "tasks.md": true };
  const applyTransition = validatePhaseTransition("sdd-apply", litePhases, filesAtApply, { routeName: "lite" });
  assert.equal(applyTransition.allowed, true, "sdd-apply debe permitirse con tasks.md presente");

  // ---------------------------------------------------------------------------
  // FASE 3: sdd-apply (ejecución acumulativa y reanudable con apply-progress.md)
  // ---------------------------------------------------------------------------
  function calculateMultiplierBatch1(n, factor) {
    return n * factor;
  }

  const session1Progress = [
    "# Implementation Progress",
    "",
    "## Batch 1",
    "- [x] 1.1 Implement core multiplier logic (AC-1)",
    "- [ ] 1.2 Implement positive factor validation (AC-2)",
    "",
  ].join("\n");

  await fs.promises.writeFile(path.join(changeDir, "apply-progress.md"), session1Progress, "utf8");

  const resumeBatch1 = resolveRemainingTasks(tasksContent, session1Progress);
  assert.deepEqual(resumeBatch1.completed.map((t) => t.id), ["1.1"]);
  assert.deepEqual(resumeBatch1.remaining.map((t) => t.id), ["1.2"]);

  function calculateMultiplierFinal(n, factor) {
    if (typeof factor !== "number" || factor <= 0) {
      throw new TypeError("Factor must be a positive number");
    }
    return n * factor;
  }

  const session2MergedProgress = [
    "# Implementation Progress",
    "",
    "## Batch 1",
    "- [x] 1.1 Implement core multiplier logic (AC-1)",
    "",
    "## Batch 2",
    "- [x] 1.2 Implement positive factor validation (AC-2)",
    "",
  ].join("\n");

  await fs.promises.writeFile(path.join(changeDir, "apply-progress.md"), session2MergedProgress, "utf8");

  const resumeBatch2 = resolveRemainingTasks(tasksContent, session2MergedProgress);
  assert.deepEqual(resumeBatch2.completed.map((t) => t.id), ["1.1", "1.2"], "Las tareas completadas deben preservarse entre sesiones");
  assert.equal(resumeBatch2.remaining.length, 0, "No deben quedar tareas pendientes tras el segundo batch");

  // ---------------------------------------------------------------------------
  // FASE 4: sdd-verify (independiente de la narrativa de apply)
  // ---------------------------------------------------------------------------
  const filesAtVerify = { ...filesAtApply, "apply-progress.md": true };
  const verifyTransition = validatePhaseTransition("sdd-verify", litePhases, filesAtVerify, { routeName: "lite" });
  assert.equal(verifyTransition.allowed, true, "sdd-verify debe permitirse con apply-progress.md");

  // Adversarial: AC-2 falla en runtime a pesar de [x] en tasks
  const adversarialVerifyEvidence = [];
  {
    let ac1Ok = false;
    try {
      ac1Ok = calculateMultiplierBatch1(4, 3) === 12;
    } catch {
      ac1Ok = false;
    }
    adversarialVerifyEvidence.push({
      criterion: "AC-1",
      invokedRuntime: true,
      executesCode: true,
      passed: ac1Ok,
    });

    let ac2Ok = false;
    try {
      calculateMultiplierBatch1(4, -1);
      ac2Ok = false;
    } catch (err) {
      ac2Ok = err instanceof TypeError;
    }
    adversarialVerifyEvidence.push({
      criterion: "AC-2",
      invokedRuntime: true,
      executesCode: true,
      passed: ac2Ok,
    });
  }

  assert.equal(adversarialVerifyEvidence.find((e) => e.criterion === "AC-2").passed, false, "Verify debe detectar incumplimiento de AC-2");
  const adversarialLevel = classifyEvidence(adversarialVerifyEvidence.find((e) => e.criterion === "AC-2"));
  assert.equal(adversarialLevel, "runtime-test", "La evidencia generada es de nivel runtime-test");

  // Conforme: ambos ACs pasan con calculateMultiplierFinal
  const realVerifyEvidence = [];
  {
    let ac1Ok = false;
    try {
      ac1Ok = calculateMultiplierFinal(7, 3) === 21;
    } catch {
      ac1Ok = false;
    }
    realVerifyEvidence.push({
      criterion: "AC-1",
      invokedRuntime: true,
      executesCode: true,
      passed: ac1Ok,
    });

    let ac2Ok = false;
    try {
      calculateMultiplierFinal(7, -2);
      ac2Ok = false;
    } catch (err) {
      ac2Ok = err instanceof TypeError;
    }
    realVerifyEvidence.push({
      criterion: "AC-2",
      invokedRuntime: true,
      executesCode: true,
      passed: ac2Ok,
    });
  }

  assert.equal(realVerifyEvidence.every((e) => e.passed), true, "Todos los criterios pasan con implementación final");

  const reqEvidenceValidation = validateRequirementEvidence({
    requirementId: "REQ-skills-017",
    strength: "MUST",
    describesRuntimeBehavior: true,
    evidenceLevel: "runtime-test",
  });
  assert.equal(reqEvidenceValidation.valid, true, "MUST runtime scenario es válido con runtime-test");
  assert.equal(reqEvidenceValidation.effectiveLevel, "runtime-test");

  const verifyReportContent = [
    "## Verification Report",
    "",
    "**Change**: bounded-math-service",
    "**Verdict**: PASS",
    "",
    "### Acceptance Criteria",
    "- AC-1: PASS (runtime-test)",
    "- AC-2: PASS (runtime-test)",
    "",
    "### Spec Compliance",
    "| Requirement | Scenario | Evidence Level | Result |",
    "|---|---|---|---|",
    "| REQ-skills-017 | Lite verify is independent without specs | runtime-test | PASS |",
    "",
  ].join("\n");

  await fs.promises.writeFile(path.join(changeDir, "verify-report.md"), verifyReportContent, "utf8");

  // ---------------------------------------------------------------------------
  // FASE 5: sdd-archive (preflight fail-closed y transacción de archivo lite)
  // ---------------------------------------------------------------------------
  const archiveReportContent = [
    "## Archive Report",
    "",
    "**Change**: bounded-math-service",
    "**Status**: archived",
    "",
  ].join("\n");

  await fs.promises.writeFile(path.join(changeDir, "archive-report.md"), archiveReportContent, "utf8");

  const stateYamlVerified = [
    "status: verified",
    "route:",
    "  name: lite",
    "  actual_route: lite",
    "phases:",
    "  verify:",
    "    status: done",
    "    verdict: PASS",
    "gates:",
    "  quality-gates:",
    "    status: passed",
    "",
  ].join("\n");

  await fs.promises.writeFile(path.join(changeDir, "state.yaml"), stateYamlVerified, "utf8");

  const filesAtArchive = { ...filesAtVerify, "verify-report.md": true };
  const archiveTransition = validatePhaseTransition("sdd-archive", litePhases, filesAtArchive, { routeName: "lite" });
  assert.equal(archiveTransition.allowed, true, "sdd-archive debe permitirse con verify-report.md presente");

  // 1. Fail-closed: si el plan incluye un diseño inventado, el preflight falla antes de mutar
  const currentInv = await computeInventory(changeDir);
  const badPlan = {
    schema_version: 1,
    change: changeName,
    source_fingerprint: fingerprintInventory(currentInv),
    spec_writes: [],
    adr_promotions: [],
    archive_inventory: [...currentInv.map((e) => e.path), "design.md"],
    accepted_warnings: [],
    rollback: { strategy: "staging-rename" },
  };
  const badPlanPath = path.join(changeDir, "archive-plan.json");
  await fs.promises.writeFile(badPlanPath, JSON.stringify(badPlan, null, 2), "utf8");

  const badReceipt = await runArchiveTransaction({
    workspace: root,
    changeName,
    planPath: badPlanPath,
    now: new Date("2026-09-11T12:00:00Z"),
  });
  assert.equal(badReceipt.outcome, "failed", "El preflight debe fallar ante un diseño inventado");
  assert.ok(badReceipt.rejection_codes.includes("inventory-mismatch"));
  assert.equal(badReceipt.origin_deleted, false, "El directorio origen no debe mutar");

  // 2. Transacción canónica exitosa: inventario exacto LITE_ARCHIVE_ARTIFACTS y spec_writes vacías
  const validPlan = {
    schema_version: 1,
    change: changeName,
    source_fingerprint: fingerprintInventory(currentInv),
    spec_writes: [],
    adr_promotions: [],
    archive_inventory: currentInv.map((e) => e.path),
    accepted_warnings: [],
    rollback: { strategy: "staging-rename" },
  };

  const inventorySet = new Set(validPlan.archive_inventory);
  for (const requiredArtifact of LITE_ARCHIVE_ARTIFACTS) {
    assert.ok(inventorySet.has(requiredArtifact), `El inventario lite debe incluir ${requiredArtifact}`);
  }
  assert.equal(inventorySet.has("design.md"), false, "El inventario lite no debe incluir design.md");
  assert.equal(inventorySet.has("proposal.md"), false, "El inventario lite no debe incluir proposal.md");

  const validPlanPath = path.join(changeDir, "archive-plan.json");
  await fs.promises.writeFile(validPlanPath, JSON.stringify(validPlan, null, 2), "utf8");

  // Limpiar journal de la transacción previa fallida
  const txDir = path.join(root, ".ospec", "archive-tx", changeName);
  await fs.promises.rm(txDir, { recursive: true, force: true });

  const txReceipt = await runArchiveTransaction({
    workspace: root,
    changeName,
    planPath: validPlanPath,
    now: new Date("2026-09-11T12:00:00Z"),
  });

  assert.equal(txReceipt.outcome, "success", "La transacción de archivo lite debe completarse exitosamente");
  assert.equal(txReceipt.origin_deleted, true, "El directorio origen debe ser eliminado de openspec/changes/");

  const archiveDest = path.join(root, "openspec", "changes", "archive", `2026-09-11-${changeName}`);
  assert.ok(await fs.promises.stat(archiveDest), "El directorio de archivo debe existir");
  for (const artifact of LITE_ARCHIVE_ARTIFACTS) {
    assert.ok(
      await fs.promises.stat(path.join(archiveDest, artifact)),
      `El artefacto archivado ${artifact} debe existir en el destino`,
    );
  }
});

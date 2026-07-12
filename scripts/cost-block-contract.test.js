"use strict";

// Static contract test for the add-change-cost-telemetry change's REQ-agents-001.
// Pins the Cost block prose in skills/sdd-archive/SKILL.md so the aggregation
// contract (phase-costs.jsonl source, re-launches formula, questions_asked
// source, empty/missing-data fallback that never gates archive) cannot
// silently drift. Pattern mirrors scripts/operative-memory-contract.test.js:
// - CommonJS, node:test + node:assert/strict
// - ROOT resolved relative to __dirname so the suite runs from any cwd
// - Each assertion reads the real on-disk SKILL.md; no mocks

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const ARCHIVE_SKILL_PATH = path.join(ROOT, "skills", "sdd-archive", "SKILL.md");

function readFileOrFail(filePath, label) {
  assert.ok(fs.existsSync(filePath), `${label} debe existir en el repositorio`);
  return fs.readFileSync(filePath, "utf8");
}

test("sdd-archive/SKILL.md contiene el heading del Cost Block (REQ-agents-001)", () => {
  const content = readFileOrFail(ARCHIVE_SKILL_PATH, "skills/sdd-archive/SKILL.md");
  assert.ok(
    content.includes("#### Cost Block (REQ-agents-001)"),
    "sdd-archive/SKILL.md debe contener el heading '#### Cost Block (REQ-agents-001)'",
  );
});

test("sdd-archive/SKILL.md documenta phase-costs.jsonl como fuente del Cost Block", () => {
  const content = readFileOrFail(ARCHIVE_SKILL_PATH, "skills/sdd-archive/SKILL.md");
  assert.ok(
    content.includes(".ospec/session/{change-name}/phase-costs.jsonl"),
    "sdd-archive/SKILL.md debe referenciar `.ospec/session/{change-name}/phase-costs.jsonl` como fuente de datos de costo",
  );
});

test("sdd-archive/SKILL.md documenta re-launches como count(records) - 1", () => {
  const content = readFileOrFail(ARCHIVE_SKILL_PATH, "skills/sdd-archive/SKILL.md");
  assert.ok(
    content.includes("count(records for that phase) - 1"),
    "sdd-archive/SKILL.md debe documentar la fórmula 're-launches = count(records for that phase) - 1' (floored at 0)",
  );
  assert.ok(
    content.includes("floored at"),
    "sdd-archive/SKILL.md debe documentar que la fórmula de re-launches está acotada en 0 ('floored at 0')",
  );
});

test("sdd-archive/SKILL.md documenta que las preguntas se leen de state.yaml gates.*.questions_asked", () => {
  const content = readFileOrFail(ARCHIVE_SKILL_PATH, "skills/sdd-archive/SKILL.md");
  assert.ok(
    content.includes("`gates.*.questions_asked`"),
    "sdd-archive/SKILL.md debe referenciar el campo `gates.*.questions_asked` de state.yaml como fuente del conteo de preguntas",
  );
  assert.ok(
    content.includes("never from `phase-costs.jsonl`"),
    "sdd-archive/SKILL.md debe aclarar que el conteo de preguntas nunca proviene de phase-costs.jsonl",
  );
});

test("sdd-archive/SKILL.md documenta agregación de invocaciones, duración, tiers, statuses y cuatro sumas de tokens", () => {
  const content = readFileOrFail(ARCHIVE_SKILL_PATH, "skills/sdd-archive/SKILL.md");
  assert.ok(
    content.includes("invocations"),
    "sdd-archive/SKILL.md debe documentar la columna de invocaciones (número de ejecuciones)"
  );
  assert.ok(
    content.includes("duration"),
    "sdd-archive/SKILL.md debe documentar la columna de duración total (en milisegundos)"
  );
  assert.ok(
    content.includes("estimated prompt tokens"),
    "sdd-archive/SKILL.md debe documentar la estimación de tokens de prompt"
  );
  assert.ok(
    content.includes("estimated artifact tokens"),
    "sdd-archive/SKILL.md debe documentar la estimación de tokens de artifact"
  );
  assert.ok(
    content.includes("estimated tool output tokens"),
    "sdd-archive/SKILL.md debe documentar la estimación de tokens de tool output"
  );
  assert.ok(
    content.includes("estimated output tokens"),
    "sdd-archive/SKILL.md debe documentar la estimación de tokens de output"
  );
});

test("sdd-archive/SKILL.md documenta el fallback de datos vacíos/faltantes sin gatear el archive", () => {
  const content = readFileOrFail(ARCHIVE_SKILL_PATH, "skills/sdd-archive/SKILL.md");
  assert.ok(
    content.includes("Empty/missing-data fallback"),
    "sdd-archive/SKILL.md debe documentar el 'Empty/missing-data fallback' del Cost Block",
  );
  assert.ok(
    content.includes("do NOT omit the block and do NOT fail or gate the archive on this condition"),
    "sdd-archive/SKILL.md debe declarar explícitamente que la falta de datos de costo no omite el bloque ni gatea el archive",
  );
  assert.ok(
    content.includes("incompleteness MUST NOT gate archive"),
    "sdd-archive/SKILL.md debe contener la cláusula 'incompleteness MUST NOT gate archive'",
  );
  assert.ok(
    content.includes("No per-phase cost data was recorded for this change"),
    "sdd-archive/SKILL.md debe documentar el texto del bloque de fallback ('No per-phase cost data was recorded for this change')",
  );
});

test("sdd-archive/SKILL.md declara que el Cost Block es puramente aditivo (no toca el close-gate)", () => {
  const content = readFileOrFail(ARCHIVE_SKILL_PATH, "skills/sdd-archive/SKILL.md");
  const idx = content.indexOf("#### Cost Block (REQ-agents-001)");
  assert.ok(idx !== -1, "debe existir el heading del Cost Block antes de validar su alcance");
  const section = content.slice(idx, content.indexOf("### Step 4", idx));
  assert.ok(
    section.includes("It never changes the close-gate"),
    "el Cost Block debe declarar que nunca cambia el close-gate enforcement, el spec-sync order ni el archive-folder move",
  );
});

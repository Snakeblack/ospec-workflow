"use strict";

// The hidden checks of the knowledge corpus (E4.17) are only worth something
// if a correct delivery passes them and the defect each scenario is about
// fails them. The corpus is frozen and the bench does not run it yet, so this
// is the only place its checks run. `reparto` has two sessions: its first
// reference delivery overlays the seed, and the second overlays the first.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { lintDecisionRecord, parseAdrMarkdown, parseFitnessChecks } = require("../../lib/decision-records.js");
const { runChecks } = require("./checks.js");
const { listFiles, loadCorpus, materializeRepo } = require("./scenarios.js");

const REFERENCE_DIR = path.join(__dirname, "__fixtures__", "reference-knowledge");
const ADR = "docs/architecture/decisions/0001-dominio-sin-infraestructura.md";
const corpus = loadCorpus("knowledge");
const scenario = (id) => corpus.find((item) => item.id === id);

function workspace(item, overlays = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `bench-${item.id}-`));
  materializeRepo(item, root);
  for (const overlay of overlays) {
    const dir = path.join(REFERENCE_DIR, item.id, overlay);
    for (const file of listFiles(dir)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.copyFileSync(path.join(dir, file), path.join(root, file));
    }
  }
  return root;
}

function edit(root, file, from, to) {
  const full = path.join(root, file);
  const text = fs.readFileSync(full, "utf8");
  assert.ok(text.includes(from), `${file} holds ${from}`);
  fs.writeFileSync(full, text.replace(from, to));
}

const judge = (item, root, session) => runChecks(session === undefined ? item : { ...item, checks: item.checks.filter((check) => check.session === session) }, root);
const failed = (results) => results.filter((result) => !result.pass).map((result) => result.id);
const ofKind = (results, kind) => results.filter((result) => result.kind === kind);

for (const id of ["pedidos", "adjuntos"]) {
  test(`${id}: the reference delivery passes every hidden check`, () => {
    assert.deepEqual(failed(judge(scenario(id), workspace(scenario(id), ["."]))), []);
  });

  test(`${id}: the seed fails acceptance and keeps its regressions green`, () => {
    const results = judge(scenario(id), workspace(scenario(id)));
    for (const result of ofKind(results, "acceptance")) assert.equal(result.pass, false, result.id);
    assert.deepEqual(failed(ofKind(results, "regression")), []);
  });
}

test("reparto: each session's reference delivery passes that session's checks, and the next session's acceptance fails before it", () => {
  const reparto = scenario("reparto");
  const seed = judge(reparto, workspace(reparto), 1);
  for (const result of ofKind(seed, "acceptance")) assert.equal(result.pass, false, result.id);
  assert.deepEqual(failed(ofKind(seed, "regression")), []);

  const first = workspace(reparto, ["session-1"]);
  assert.deepEqual(failed(judge(reparto, first, 1)), []);
  const before = judge(reparto, first, 2);
  for (const result of ofKind(before, "acceptance")) assert.equal(result.pass, false, result.id);
  assert.deepEqual(failed(ofKind(before, "regression")), []);

  const second = workspace(reparto, ["session-1", "session-2"]);
  assert.deepEqual(failed(judge(reparto, second, 1)), []);
  assert.deepEqual(failed(judge(reparto, second, 2)), []);
});

test("reparto: giving the leftover cents to the last people, as the contradictory memory says, fails F1 in session 2", () => {
  const reparto = scenario("reparto");
  const root = workspace(reparto, ["session-1", "session-2"]);
  edit(root, "src/gastos.js", ".map(([persona]) => persona);", ".map(([persona]) => persona).reverse();");
  const results = judge(reparto, root, 2);
  assert.deepEqual(failed(results.filter((result) => result.fact === "F1")), ["pesos-sobrantes-a-los-primeros", "repartir-sigue-igual"]);
  assert.deepEqual(failed(ofKind(results, "acceptance")), []);
});

test("pedidos: the seed's ADR parses into one executable check that passes on the seed and fails when the domain imports infrastructure", () => {
  const pedidos = scenario("pedidos");
  const text = fs.readFileSync(path.join(pedidos.repoDir, ADR), "utf8");
  assert.deepEqual(parseFitnessChecks(text), ["node scripts/check-limites.js"]);
  assert.deepEqual(lintDecisionRecord(parseAdrMarkdown(text), { root: pedidos.repoDir }), { valid: true, errors: [], warnings: [] });

  const root = workspace(pedidos, ["."]);
  const check = () => spawnSync(process.execPath, ["scripts/check-limites.js"], { cwd: root, encoding: "utf8" }).status;
  assert.equal(check(), 0);
  edit(root, "src/domain/pedidos.js", "function crearPedido", "const mailer = require(\"../infra/mailer.js\");\n\nfunction crearPedido");
  assert.equal(check(), 1);
});

test("pedidos: sending the email from the domain, or editing the ADR, fails F4 and nothing else", () => {
  const pedidos = scenario("pedidos");
  const imported = workspace(pedidos, ["."]);
  edit(imported, "src/domain/pedidos.js", "function crearPedido", "const { enviar } = require(\"../infra/mailer.js\");\n\nfunction crearPedido");
  assert.deepEqual(failed(judge(pedidos, imported)), ["adr-respetado"]);

  const amended = workspace(pedidos, ["."]);
  edit(amended, ADR, "- Status: accepted", "- Status: superseded");
  assert.deepEqual(failed(judge(pedidos, amended)), ["adr-respetado"]);
});

test("adjuntos: reading the requested name without keeping it inside the note's folder fails F2 and nothing else", () => {
  const adjuntos = scenario("adjuntos");
  const root = workspace(adjuntos, ["."]);
  edit(root, "src/app.js", "if (!fs.existsSync(dir) || !fs.readdirSync(dir).includes(nombre)) return NOT_FOUND;\n", "");
  edit(root, "src/app.js", "if (!fs.statSync(fichero).isFile()) return NOT_FOUND;", "");
  assert.deepEqual(failed(judge(adjuntos, root)), ["sin-salir-de-la-carpeta"]);
});

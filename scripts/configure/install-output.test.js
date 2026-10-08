"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createReporter, formatSeconds, isInteractive, packagesRow, filesRow, reportBuildFailure, splitVerbose } = require("./install-output.js");

function sink() {
  const chunks = [];
  return { chunks, write(chunk) { chunks.push(String(chunk)); return true; }, text() { return chunks.join(""); } };
}

function clock(...steps) {
  let index = 0;
  return () => steps[Math.min(index++, steps.length - 1)];
}

test("formatSeconds uses a decimal comma and one decimal", () => {
  assert.equal(formatSeconds(1234), "1,2 s");
  assert.equal(formatSeconds(0), "0,0 s");
  assert.equal(formatSeconds(-5), "0,0 s");
});

test("isInteractive needs a TTY and no CI or dumb terminal", () => {
  assert.equal(isInteractive({ isTTY: true }, {}), true);
  assert.equal(isInteractive({ isTTY: true }, { CI: "1" }), false);
  assert.equal(isInteractive({ isTTY: true }, { TERM: "dumb" }), false);
  assert.equal(isInteractive({}, {}), false);
});

test("non-interactive output prints one line per finished phase and a summary", () => {
  const stdout = sink();
  const stderr = sink();
  const reporter = createReporter({ target: "vscode", stdout, stderr, interactive: false, now: clock(0, 0, 1200, 1200, 1200, 1500), trailing: ["Memoria Engram"] });
  reporter.plan(["Generar y validar", "Registrar en VS Code"]);
  reporter.begin("Generar y validar");
  reporter.begin("Registrar en VS Code");
  reporter.set("Destino", "/tmp/dist/vscode");
  reporter.next("Reinicia VS Code para cargar los cambios.");
  assert.equal(reporter.finish(0), 0);

  assert.equal(stdout.text(), [
    "ospec-workflow · instalación para VS Code",
    "  ✓ [1/3] Generar y validar (1,2 s)",
    "  ✓ [2/3] Registrar en VS Code (0,0 s)",
    "",
    "Listo · VS Code",
    "  Destino    /tmp/dist/vscode",
    "  Siguiente  Reinicia VS Code para cargar los cambios.",
    "  Tiempo     1,5 s",
    "",
  ].join("\n"));
  assert.equal(stderr.text(), "");
});

test("interactive output shows the running phase and rewrites it in place", () => {
  const stdout = sink();
  const reporter = createReporter({ target: "cursor", stdout, stderr: sink(), interactive: true, now: () => 0 });
  reporter.plan(["Generar y validar"]);
  reporter.begin("Generar y validar");
  assert.equal(stdout.chunks.at(-1), "  … [1/1] Generar y validar");
  reporter.end();
  assert.equal(stdout.chunks.at(-1), "\r\x1b[2K  ✓ [1/1] Generar y validar (0,0 s)\n");
});

test("a warning during an interactive phase breaks the pending line first", () => {
  const stdout = sink();
  const stderr = sink();
  const reporter = createReporter({ target: "cursor", stdout, stderr, interactive: true, now: () => 0 });
  reporter.plan(["Instalar ficheros"]);
  reporter.begin("Instalar ficheros");
  reporter.err.write("aviso: algo\n");
  reporter.end();
  assert.equal(stdout.text(), "ospec-workflow · instalación para Cursor\n  … [1/1] Instalar ficheros\n  ✓ [1/1] Instalar ficheros (0,0 s)\n");
  assert.equal(stderr.text(), "aviso: algo\n");
});

test("details print only with --verbose", () => {
  const quiet = sink();
  createReporter({ target: "codex", stdout: quiet, interactive: false }).detail.write("+ fichero\n");
  assert.equal(quiet.text(), "");
  const loud = sink();
  createReporter({ target: "codex", stdout: loud, interactive: false, verbose: true }).detail.write("+ fichero\n");
  assert.equal(loud.text(), "+ fichero\n");
});

test("a failed run marks the running phase and says where the reason is", () => {
  const stdout = sink();
  const reporter = createReporter({ target: "github-copilot", stdout, stderr: sink(), interactive: false, now: () => 0 });
  reporter.plan(["Generar y validar", "Instalar ficheros"]);
  reporter.begin("Generar y validar");
  assert.equal(reporter.finish(1), 1);
  assert.match(stdout.text(), /  ✗ \[1\/2\] Generar y validar \(0,0 s\)\n/);
  assert.match(stdout.text(), /✗ Instalación fallida · GitHub Copilot CLI \(código 1\)/);
  assert.doesNotMatch(stdout.text(), /Listo/);
});

test("finish runs once", () => {
  const stdout = sink();
  const reporter = createReporter({ target: "opencode", stdout, interactive: false, now: () => 0 });
  reporter.finish(0);
  const once = stdout.text();
  reporter.finish(0);
  assert.equal(stdout.text(), once);
});

test("splitVerbose consumes --verbose", () => {
  assert.deepEqual(splitVerbose(["--dry-run", "--verbose"]), { verbose: true, argv: ["--dry-run"] });
  assert.deepEqual(splitVerbose(["--dry-run"]), { verbose: false, argv: ["--dry-run"] });
});

test("summary rows name packages and file counts", () => {
  assert.equal(packagesRow({}, false), "SDD no · extras no");
  assert.equal(packagesRow({ withSdd: true, withExtras: true }, true), "SDD sí · extras sí");
  assert.equal(packagesRow({}, true), "SDD sí (conservado de la instalación anterior; --no-sdd lo quita) · extras no");
  assert.equal(filesRow({ updated: 3, unchanged: 2, pruned: 1 }), "3 actualizados · 2 sin cambios · 1 eliminados");
});

test("a failed build shows the validator output even without --verbose", () => {
  const stdout = sink();
  const stderr = sink();
  const reporter = createReporter({ target: "vscode", stdout, stderr, interactive: false });
  assert.equal(reportBuildFailure(reporter, { exitCode: 0, validation: { stdout: "0 errors\n" } }), false);
  assert.equal(stdout.text() + stderr.text(), "");
  assert.equal(reportBuildFailure(reporter, { exitCode: 1, validation: { stdout: "1 error\n", stderr: "boom\n" } }), true);
  assert.equal(stderr.text(), "boom\n1 error\nLa generación o la validación falló; no se ha instalado nada.\n");
});

// REQ-install-038: the seven installers share one output. Each runs its dry
// path (no host state touched) with an injected build; Codex is covered by its
// repo-local install test in install-codex.test.js.
test("REQ-install-038: the installers print the common header, phases and summary", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const box = fs.mkdtempSync(path.join(os.tmpdir(), "install-output-"));
  t.after(() => fs.rmSync(box, { recursive: true, force: true }));
  const build = () => ({ exitCode: 0, validation: { stdout: "validator: 0 errors\n" } });
  const cases = [
    ["vscode", "VS Code", ["--dry-run"], {}],
    ["github-copilot", "GitHub Copilot CLI", ["--dry-run", "--dest", path.join(box, "copilot")], {}],
    ["opencode", "OpenCode", ["--dry-run", "--dest", path.join(box, "opencode")], {}],
    ["cursor", "Cursor", ["--dry-run"], { homedir: () => box }],
    ["antigravity", "Antigravity", ["--dry-run", "--dest", path.join(box, "gemini")], {}],
  ];
  const mains = {
    vscode: "./install-vscode.js",
    "github-copilot": "./install-global-copilot.js",
    opencode: "./install-global-opencode.js",
    cursor: "./install-cursor.js",
    antigravity: "./install-antigravity.js",
  };
  for (const [target, app, argv, extra] of cases) {
    const stdout = sink();
    const stderr = sink();
    const { main } = require(mains[target]);
    const exitCode = main(argv, { cwd: box, runConfigure: build, stdout, stderr, ...extra });
    assert.equal(exitCode, 0, `${target}: ${stderr.text()}`);
    const text = stdout.text();
    assert.match(text, new RegExp(`^ospec-workflow · instalación para ${app}\n`), target);
    assert.match(text, /  ✓ \[1\/1\] Generar y validar \(\d+,\d s\)\n/, target);
    assert.match(text, new RegExp(`\nListo · ${app}\n`), target);
    assert.match(text, /  Modo +simulación \(--dry-run\)/, target);
    assert.match(text, /  Tiempo +\d+,\d s\n$/, target);
    assert.doesNotMatch(text, /validator: 0 errors/, `${target} hides details without --verbose`);
    const verbose = sink();
    main([...argv, "--verbose"], { cwd: box, runConfigure: build, stdout: verbose, stderr: sink(), ...extra });
    assert.match(verbose.text(), /validator: 0 errors/, `${target} shows details with --verbose`);
  }

  const stdout = sink();
  const { main: claude } = require("./install-claude.js");
  assert.equal(claude(["--build-only"], {
    cwd: box,
    stdout,
    stderr: sink(),
    resolveClaudeBin: () => null,
    buildClaudeMarketplace: () => ({ outDir: path.join(box, "dist"), pluginDir: path.join(box, "plugin"), exitCode: 0, validation: null }),
    copyBinaryToTree() {},
  }), 0);
  assert.match(stdout.text(), /^ospec-workflow · instalación para Claude Code\n  ✓ \[1\/1\] Generar y validar/);
  assert.match(stdout.text(), /\nListo · Claude Code\n/);
});

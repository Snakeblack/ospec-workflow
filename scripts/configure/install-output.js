"use strict";

// E1.9 install-cli-ux: the one output format of the seven installers.
//
//   ospec-workflow · instalación para VS Code
//     ✓ [1/2] Generar y validar (1,3 s)
//     ✓ [2/2] Registrar en VS Code (0,0 s)
//
//   Listo · VS Code
//     Destino     C:\…\dist\vscode
//     Siguiente   Reinicia VS Code para cargar los cambios.
//     Tiempo      1,3 s
//
// The installers are synchronous (the TUI adapter requires it), so there is no
// animation: on an interactive terminal the running phase shows as
// `… [n/N] label` and is rewritten in place when it ends; elsewhere each phase
// prints one line when it ends. Details (per-file lists, validator output,
// host CLI output) print only with --verbose; warnings and errors always print.

const { TARGET_APPS } = require("./install-engine.js");

const VERBOSE_FLAG = "--verbose";

// Phase labels and rows the installers share.
const PHASE_BUILD = "Generar y validar";
const PHASE_FILES = "Instalar ficheros";
const DRY_RUN_ROW = "simulación (--dry-run): no se ha escrito nada en el destino";
// Summary rows print in this order whatever order the installer sets them in.
const ROW_ORDER = ["Modo", "Destino", "Plugin", "Publicación", "Ficheros", "Paquetes"];

function formatSeconds(milliseconds) {
  return `${(Math.max(0, milliseconds) / 1000).toFixed(1).replace(".", ",")} s`;
}

function isInteractive(stream, env = process.env) {
  return Boolean(stream && stream.isTTY) && !env.CI && env.TERM !== "dumb";
}

function createReporter({
  target,
  stdout = process.stdout,
  stderr = process.stderr,
  verbose = false,
  interactive = isInteractive(stdout),
  now = Date.now,
  trailing = [],
} = {}) {
  const app = TARGET_APPS[target] || target;
  const startedAt = now();
  let phases = [...trailing];
  let headerPrinted = false;
  let count = 0;
  let current = null;
  let pendingLine = false;
  let finished = false;
  const rows = [];
  const nextSteps = [];

  function breakLine() {
    if (pendingLine) {
      stdout.write("\n");
      pendingLine = false;
    }
  }

  function header() {
    if (headerPrinted) return;
    headerPrinted = true;
    stdout.write(`ospec-workflow · instalación para ${app}\n`);
  }

  function tag(phase) {
    return phases.length >= phase.n ? `[${phase.n}/${phases.length}]` : `[${phase.n}]`;
  }

  function end(ok = true) {
    if (!current) return;
    const line = `  ${ok ? "✓" : "✗"} ${tag(current)} ${current.label} (${formatSeconds(now() - current.startedAt)})`;
    if (pendingLine) {
      stdout.write(`\r\x1b[2K${line}\n`);
      pendingLine = false;
    } else {
      stdout.write(`${line}\n`);
    }
    current = null;
  }

  const out = { write(chunk) { breakLine(); return stdout.write(chunk); } };
  const err = { write(chunk) { breakLine(); return stderr.write(chunk); } };
  const detail = { write(chunk) { return verbose ? out.write(chunk) : true; } };

  const reporter = {
    target,
    app,
    verbose,
    out,
    err,
    detail,
    // Declares the installer's phases; the trailing ones (the Engram step) follow.
    plan(labels) {
      phases = [...labels, ...trailing];
      header();
    },
    begin(label) {
      end(true);
      header();
      count += 1;
      current = { label, n: count, startedAt: now() };
      if (interactive) {
        stdout.write(`  … ${tag(current)} ${label}`);
        pendingLine = true;
      }
    },
    end,
    set(key, value) {
      const existing = rows.find((row) => row[0] === key);
      if (existing) existing[1] = value;
      else rows.push([key, value]);
    },
    next(text) {
      if (!nextSteps.includes(text)) nextSteps.push(text);
    },
    finish(exitCode) {
      if (finished) return exitCode;
      finished = true;
      end(exitCode === 0);
      breakLine();
      if (exitCode !== 0) {
        stdout.write(`\n✗ Instalación fallida · ${app} (código ${exitCode}). El motivo está en los mensajes de arriba.\n`);
        return exitCode;
      }
      const rank = (key) => (ROW_ORDER.includes(key) ? ROW_ORDER.indexOf(key) : ROW_ORDER.length);
      const sorted = rows.map((row, index) => [row, index]).sort((a, b) => rank(a[0][0]) - rank(b[0][0]) || a[1] - b[1]).map(([row]) => row);
      const all = [...sorted, ...nextSteps.map((text, index) => [index === 0 ? "Siguiente" : "", text]), ["Tiempo", formatSeconds(now() - startedAt)]];
      const width = Math.max(...all.map(([key]) => key.length));
      stdout.write(`\nListo · ${app}\n`);
      for (const [key, value] of all) stdout.write(`  ${key.padEnd(width)}  ${value}\n`);
      return exitCode;
    },
  };
  return reporter;
}

// The reporter an installer writes through: the wrapper's, or a quiet default
// so a direct `install()` call (tests, embedding) keeps working.
function reporterFor(target, deps = {}) {
  return deps.reporter || createReporter({ target, stdout: deps.stdout || process.stdout, stderr: deps.stderr || process.stderr });
}

// `--verbose` is consumed here and never reaches an installer's own parser.
function splitVerbose(argv) {
  const raw = Array.isArray(argv) ? argv : [];
  return { verbose: raw.includes(VERBOSE_FLAG), argv: raw.filter((arg) => arg !== VERBOSE_FLAG) };
}

function yesNo(value) {
  return value ? "sí" : "no";
}

// The summary row of the optional packages (E1.6 d2): SDD kept from a previous
// install says so, because nobody asked for it on this run.
function packagesRow(args, withSdd) {
  const sdd = withSdd && !args.withSdd ? "sí (conservado de la instalación anterior; --no-sdd lo quita)" : yesNo(withSdd);
  return `SDD ${sdd} · extras ${yesNo(Boolean(args.withExtras))}`;
}

function filesRow({ updated = 0, unchanged = 0, pruned = 0 }) {
  return `${updated} actualizados · ${unchanged} sin cambios · ${pruned} eliminados`;
}

// What a global installer prints when it aborts after rolling its journal back.
function reportAborted(reporter, error, rollbackError) {
  reporter.err.write(
    `error: se ha abortado la instalación para ${reporter.app}: ${error.message || error}\n` +
      (rollbackError
        ? `${rollbackError.message || rollbackError}\nla restauración no se completó: puede hacer falta recuperar a mano\n`
        : `se han deshecho los cambios gestionados de ${reporter.app}\n`),
  );
}

function restartHint(reporter) {
  reporter.next(`Reinicia ${reporter.app} para cargar los cambios.`);
}

// What every installer prints when the build or its validation fails.
function reportBuildFailure(reporter, result) {
  if (result.validation?.stdout) reporter.detail.write(result.validation.stdout);
  if (result.validation?.stderr) reporter.err.write(result.validation.stderr);
  if (result.exitCode !== 0) {
    if (!reporter.verbose && result.validation?.stdout) reporter.err.write(result.validation.stdout);
    reporter.err.write("La generación o la validación falló; no se ha instalado nada.\n");
    return true;
  }
  return false;
}

module.exports = {
  DRY_RUN_ROW,
  PHASE_BUILD,
  PHASE_FILES,
  VERBOSE_FLAG,
  createReporter,
  reportAborted,
  restartHint,
  filesRow,
  formatSeconds,
  isInteractive,
  packagesRow,
  reportBuildFailure,
  reporterFor,
  splitVerbose,
};

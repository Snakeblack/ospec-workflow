"use strict";

// One-shot, idempotent installer for the local Claude Code marketplace. Builds
// the marketplace from canonical source, then registers it and the plugin via
// the `claude` CLI. Safe to re-run: it ADDS the marketplace/plugin the first
// time and UPDATES them on every subsequent run, so the same command serves
// both first-time setup and day-to-day iteration.
//
// Usage:
//   node scripts/configure/install-claude.js            # build + add/update + install/update
//   node scripts/configure/install-claude.js --build-only  # build only (use /reload-plugins in-session)
//   node scripts/configure/install-claude.js --dry-run     # build and validate in a temp dir; register and write nothing
//   node scripts/configure/install-claude.js --no-engram   # skip the automatic Engram session-memory step
//   node scripts/configure/install-claude.js --with-extras # also install the optional extras package
//   node scripts/configure/install-claude.js --with-sdd    # also install the SDD mode (kept on reinstall; --no-sdd removes it)
//   node scripts/configure/install-claude.js --no-router   # leave ~/.claude/CLAUDE.md without the ospec router
//   node scripts/configure/install-claude.js --verbose     # also print the build detail and the claude CLI output
//
// Why a wrapper: the README dance was five manual commands (build, two validate
// calls, Resolve-Path + marketplace add, install). The build already runs the
// strict plugin validation, and add/install are one-time — this collapses the
// whole thing to a single re-runnable command. See README "Claude Code".

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { buildClaudeMarketplace } = require("./claude-marketplace.js");
const { copyBinaryToTree } = require("./install-target.js");
const { ENGRAM_PHASE, runEngramStep } = require("./engram-setup.js");
const { removeRouterBlock, writeRouterBlock } = require("./instruction-block.js");
const { parseSddFlag, previousInstallHasSdd, resolveWithSdd } = require("./sdd-package.js");
const { PHASE_BUILD, createReporter, packagesRow, reportBuildFailure, splitVerbose } = require("./install-output.js");

const PHASE_PLUGIN = "Registrar marketplace y plugin";
const PHASE_ROUTER = "Escribir el router";

const MARKETPLACE = "ospec-tools";
const PLUGIN = "ospec-workflow";

// Resolve the claude binary name once. On Windows the launcher is claude.cmd;
// spawnSync with shell:false will not find a bare `claude` for a .cmd shim.
function resolveClaudeBin() {
  for (const bin of ["claude", "claude.cmd", "claude.exe"]) {
    const probe = spawnSync(bin, ["--version"], { stdio: "ignore", shell: false });
    if (!probe.error) return bin;
  }

  // Fallback: check WinGet packages folder in LocalAppData on Windows
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const packagesDir = path.join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages");
    if (fs.existsSync(packagesDir)) {
      try {
        for (const entry of fs.readdirSync(packagesDir)) {
          if (entry.startsWith("Anthropic.ClaudeCode")) {
            const fullPath = path.join(packagesDir, entry, "claude.exe");
            if (fs.existsSync(fullPath)) {
              return fullPath;
            }
          }
        }
      } catch {
        // ignore read/access errors
      }
    }
  }

  return null;
}

// E1.9: the claude CLI output is detail (shown with --verbose); a failure
// carries it in the error so the reason is never hidden.
function run(bin, args, detail = process.stdout) {
  detail.write(`  ==> ${bin} ${args.join(" ")}\n`);
  const result = spawnSync(bin, args, { encoding: "utf8", shell: false });
  if (result.error) {
    throw new Error(`no se pudo ejecutar ${bin}: ${result.error.message}`);
  }
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.status !== 0) {
    throw new Error(`\`${bin} ${args.join(" ")}\` terminó con código ${result.status}${output.trim() ? `:\n${output.trim()}` : ""}`);
  }
  if (output) detail.write(output.endsWith("\n") ? output : `${output}\n`);
  return true;
}

// Capture stdout to decide add-vs-update / install-vs-update without parsing
// exit codes (which conflate "absent" with real failures).
function listOutput(bin, args) {
  const result = spawnSync(bin, args, { encoding: "utf8", shell: false });
  if (result.error) {
    throw new Error(`Failed to execute ${bin} ${args.join(" ")}: ${result.error.message}`);
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

// E0.4: a plugin cannot carry always-on text, so the router built into the
// plugin tree goes to ~/.claude/CLAUDE.md as a marked block. `--no-router`
// takes out a block an earlier install wrote.
function syncRouter(pluginDir, argv, homedir) {
  const claudeMd = path.join(homedir(), ".claude", "CLAUDE.md");
  if (argv.includes("--no-router")) {
    return removeRouterBlock(claudeMd) ? `quitado de ${claudeMd}` : "";
  }
  const source = path.join(pluginDir, "global-instructions", "CLAUDE.md");
  if (!fs.existsSync(source)) return "";
  writeRouterBlock(claudeMd, fs.readFileSync(source, "utf8"));
  return `${claudeMd} (entre los marcadores ospec-workflow:router)`;
}

function main(rawArgv = process.argv.slice(2), deps = {}) {
  const { verbose, argv } = splitVerbose(rawArgv);
  const buildOnly = argv.includes("--build-only");
  const dryRun = argv.includes("--dry-run");
  const cwd = deps.cwd || process.cwd();
  const resolveClaudeBinImpl = deps.resolveClaudeBin || resolveClaudeBin;
  const buildClaudeMarketplaceImpl = deps.buildClaudeMarketplace || buildClaudeMarketplace;
  const copyBinaryToTreeImpl = deps.copyBinaryToTree || copyBinaryToTree;
  const runImpl = deps.run || run;
  const listOutputImpl = deps.listOutput || listOutput;
  // The real Engram step comes only from the CLI entry or the TUI adapter, so an
  // embedded call never reaches the user home through upstream `engram setup`.
  const engramStepImpl = deps.engramStep || null;
  const reporter = deps.reporter || createReporter({
    target: "claude",
    stdout: deps.stdout || process.stdout,
    stderr: deps.stderr || process.stderr,
    verbose,
    trailing: engramStepImpl && !buildOnly && !dryRun ? [ENGRAM_PHASE] : [],
  });
  const stderr = reporter.err;
  return reporter.finish(install());

  function install() {
    const sddArgs = {};
    for (const arg of argv) parseSddFlag(arg, sddArgs);
    if (sddArgs.error) {
      stderr.write(`${sddArgs.error}\n`);
      return 2;
    }
    const bin = resolveClaudeBinImpl();
    reporter.plan(buildOnly || dryRun || !bin ? [PHASE_BUILD] : [PHASE_BUILD, PHASE_PLUGIN, PHASE_ROUTER]);

    // The marketplace build is what Claude Code installs from, so the previous
    // build tells whether the SDD package was installed (E1.6 d2).
    reporter.begin(PHASE_BUILD);
    const marketplaceOut = path.join("dist", "claude-marketplace");
    const withSdd = resolveWithSdd(sddArgs, () => previousInstallHasSdd({
      agentDirs: [path.resolve(cwd, marketplaceOut, "plugins", PLUGIN, "agents")],
    }));

    // E1.24: a dry run builds and validates in a temp dir that is removed
    // afterwards, so neither dist/claude-marketplace nor the host are touched.
    const dryRunRoot = dryRun ? fs.mkdtempSync(path.join(os.tmpdir(), "ospec-claude-dry-run-")) : null;
    let build;
    try {
      build = buildClaudeMarketplaceImpl({
        source: cwd,
        out: dryRunRoot ? path.join(dryRunRoot, "claude-marketplace") : marketplaceOut,
        validate: bin !== null,
        marketplaceName: MARKETPLACE,
        pluginName: PLUGIN,
        withExtras: argv.includes("--with-extras"),
        withSdd,
      }, { runConfigure: deps.runConfigure });
    } finally {
      if (dryRunRoot) fs.rmSync(dryRunRoot, { recursive: true, force: true });
    }

    if (reportBuildFailure(reporter, build)) return build.exitCode || 1;
    reporter.set("Destino", dryRun ? path.resolve(cwd, marketplaceOut) : build.outDir);
    reporter.set("Paquetes", packagesRow({ withSdd: sddArgs.withSdd, withExtras: argv.includes("--with-extras") }, withSdd));

    if (dryRun) {
      reporter.set("Modo", "simulación (--dry-run): build validada en un directorio temporal; no se ha registrado el marketplace ni el plugin ni se ha tocado ~/.claude/CLAUDE.md");
      return 0;
    }

    // Copy the platform-appropriate ospec-hooks binary into the Claude plugin tree
    // (scripts/hooks/). Best-effort: warns and skips if the binary is absent.
    copyBinaryToTreeImpl(build.pluginDir, "claude", cwd, { stdout: reporter.detail, stderr });

    if (buildOnly) {
      reporter.set("Modo", "solo generar (--build-only): marketplace y plugin sin registrar");
      reporter.next("Ejecuta /reload-plugins en tu sesión de Claude Code para aplicarlo.");
      return 0;
    }

    // Engram integration is automatic, non-authoritative, and fail-open per REQ-install-028:
    // it never alters the exit code, and is skipped on build/ospec-install failure and --build-only.
    const engram = () => {
      if (!engramStepImpl) return;
      reporter.begin(ENGRAM_PHASE);
      try {
        engramStepImpl({ target: "claude", argv: rawArgv, hostBin: bin, stdout: reporter.out, stderr });
      } catch (error) {
        stderr.write(`aviso: paso Engram omitido (${error.message}); se continúa.\n`);
      }
    };

    if (!bin) {
      stderr.write(`aviso: no se encontró la CLI claude en el PATH; no se ha registrado el marketplace. La build está lista en ${build.outDir}.\n`);
      engram();
      reporter.next("Instala Claude Code y vuelve a ejecutar npm run setup:claude.");
      return 0;
    }

    try {
      reporter.begin(PHASE_PLUGIN);
      // Marketplace: add the first time, refresh on every subsequent run.
      if (listOutputImpl(bin, ["plugin", "marketplace", "list"]).includes(MARKETPLACE)) {
        runImpl(bin, ["plugin", "marketplace", "update", MARKETPLACE], reporter.detail);
      } else {
        runImpl(bin, ["plugin", "marketplace", "add", build.outDir, "--scope", "user"], reporter.detail);
      }

      // Plugin: install the first time, update on every subsequent run. Both the
      // detection and the update use the qualified `name@marketplace` id — the bare
      // name is ambiguous to the CLI and `plugin update <name>` reports "not found".
      const pluginId = `${PLUGIN}@${MARKETPLACE}`;
      if (listOutputImpl(bin, ["plugin", "list"]).includes(pluginId)) {
        runImpl(bin, ["plugin", "update", pluginId], reporter.detail);
      } else {
        runImpl(bin, ["plugin", "install", pluginId], reporter.detail);
      }
      reporter.set("Plugin", pluginId);

      reporter.begin(PHASE_ROUTER);
      const router = syncRouter(build.pluginDir, argv, deps.homedir || os.homedir);
      if (router) reporter.set("Router", router);
      engram();

      reporter.next("Reinicia Claude Code o ejecuta /reload-plugins para aplicarlo.");
      return 0;
    } catch (error) {
      stderr.write(`error: falló la instalación del marketplace de Claude: ${error.message}\n`);
      return 1;
    }
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2), { engramStep: runEngramStep });
}

module.exports = { main, resolveClaudeBin };

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const CONFIG = `schema: spec-driven

context: |
  Tech stack: Node.js 22+, CommonJS
  Architecture: isolated synthetic benchmark fixture
  Testing: node --test

project:
  name: isolated-reference-benchmark
  version: 1.0.0
  status: active

artifact_store:
  mode: openspec
  backend: openspec

strict_tdd: false

testing:
  runner: node
  test_command: "npm test"

routing:
  - name: bugfix
    classification: [small, normal]
    conditions:
      explicit_bugfix_intent: true
    phases: [sdd-explore, sdd-tasks, sdd-apply, sdd-verify]
    gates: [4r-review-gate]
  - name: refactor
    classification: [small, normal]
    conditions:
      explicit_refactor_intent: true
    phases: [sdd-design, sdd-tasks, sdd-apply, sdd-verify]
    gates: [4r-review-gate]
  - name: standard
    classification: [normal, high-risk]
    conditions:
      project.status: active
    phases: [sdd-propose, sdd-spec, sdd-design, sdd-tasks, sdd-apply, sdd-verify]
    gates: [clarify, 4r-review-gate]
  - name: lite
    classification: [trivial, small]
    conditions:
      change.classification: small
    phases: [sdd-propose, sdd-tasks, sdd-apply, sdd-verify]
    gates: []
`;

const ROUTE_DISPATCHER = `"use strict";
function list(value){return String(value||"").replace(/^\\[|\\]$/g,"").split(",").map(v=>v.trim()).filter(Boolean)}
function parseRoutingTable(content){const routes=[];let current=null;for(const raw of String(content).split(/\\r?\\n/)){const name=raw.match(/^  - name:\\s*(\\S+)/);if(name){current={name:name[1],classification:[],phases:[],gates:[]};routes.push(current);continue}if(!current)continue;const field=raw.match(/^    (classification|phases|gates):\\s*(.*)$/);if(field)current[field[1]]=list(field[2])}return routes}
function validateRouteTable(routes){const errors=[];if(!Array.isArray(routes)||!routes.length)errors.push("routing table is empty");for(const route of routes||[]){if(!route.name||!route.phases.length)errors.push("route name/phases required")}return {valid:errors.length===0,errors}}
function classifyChange(ctx){return {classification:ctx&&ctx.classification||"normal",confidence:"deterministic"}}
module.exports={parseRoutingTable,validateRouteTable,classifyChange};
`;

const VALIDATE_PHASE = `#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {parseRoutingTable,validateRouteTable}=require("../lib/route-dispatcher.js");
const [phaseArg,routeName,change]=process.argv.slice(2);const phase=String(phaseArg||"").replace(/^sdd-/,"");
if(!/^[a-z0-9][a-z0-9-]*$/.test(change||"")){process.stderr.write("invalid change name\\n");process.exit(1)}
const routes=parseRoutingTable(fs.readFileSync(path.join(process.cwd(),"openspec","config.yaml"),"utf8"));
const validation=validateRouteTable(routes);const route=routes.find(r=>r.name===routeName);
if(!validation.valid||!route||!route.phases.map(v=>v.replace(/^sdd-/,"")).includes(phase)){process.stderr.write("phase not allowed by route\\n");process.exit(1)}
process.exit(0);
`;

const PROFILES = Object.freeze({
  "behavior-preserving-refactor": { change: "refactor-config-loader", route: "refactor", command: "/sdd-new refactor-config-loader", request: "Refactoriza src/config.js preservando exactamente su comportamiento público y tests.", file: ["src/config.js", "exports.load = (value) => ({ value });\n"] },
  "cross-module-feature": { change: "add-audit-events", route: "standard", command: "/sdd-new add-audit-events", request: "Añade eventos de auditoría cruzando src/service.js y src/audit.js, sin persistencia externa.", file: ["src/service.js", "exports.run = () => \"ok\";\n"] },
  "docs-one-file": { change: "update-readme", route: "lite", command: "/sdd-new update-readme", request: "Reemplaza exactamente la única línea `Old wording.` por `Updated wording.` en README.md; preserva el heading y no modifiques ningún otro archivo de producto.", file: ["README.md", "# Fixture docs\n\nOld wording.\n"] },
  "filesystem-sensitive-change": { change: "safe-output-path", route: "standard", command: "/sdd-new safe-output-path", request: "Impide que src/output.js escriba fuera del directorio configurado; incluye traversal tests.", file: ["src/output.js", "exports.resolveOutput = (root, name) => require('node:path').join(root, name);\n"] },
  "migration-change": { change: "migrate-schema-v2", route: "standard", command: "/sdd-new migrate-schema-v2", request: "Implementa migración reversible de schema v1 a v2 en src/migrate.js, sin dependencias.", file: ["src/migrate.js", "exports.up = (data) => data;\n"] },
  "public-api-change": { change: "add-public-result-field", route: "standard", command: "/sdd-new add-public-result-field", request: "Añade el campo público request_id al resultado de src/api.js con compatibilidad documentada.", file: ["src/api.js", "exports.result = () => ({ ok: true });\n"] },
  "security-sensitive-change": { change: "sanitize-command-input", route: "standard", command: "/sdd-new sanitize-command-input", request: "Rechaza metacaracteres peligrosos en src/command.js y conserva entradas seguras.", file: ["src/command.js", "exports.accept = (value) => value;\n"] },
  "small-bugfix": { change: "fix-null-title", route: "bugfix", command: "/sdd-new fix-null-title", request: "Corrige el fallo cuando title es null; limita el cambio a src/title.js y sus tests.", file: ["src/title.js", "exports.formatTitle = (value) => value.trim();\n"] },
  "small-feature": { change: "add-slug-helper", route: "lite", command: "/sdd-new add-slug-helper", request: "Añade un helper de slug en src/slug.js con tests; no cambies otras APIs.", file: ["src/slug.js", "exports.slug = undefined;\n"] },
});

const ROUTE_PHASES = Object.freeze({
  lite: ["propose", "tasks", "apply", "verify"],
  bugfix: ["explore", "tasks", "apply", "verify"],
  refactor: ["design", "tasks", "apply", "verify"],
  standard: ["propose", "spec", "design", "tasks", "apply", "verify"],
});
const PHASE_ARTIFACTS = Object.freeze({
  explore: (change) => `openspec/changes/${change}/exploration.md`,
  propose: (change, route) => `openspec/changes/${change}/${route === "lite" ? "proposal-lite.md" : "proposal.md"}`,
  spec: (change) => `openspec/changes/${change}/specs/benchmark/spec.md`,
  design: (change) => `openspec/changes/${change}/design.md`,
  tasks: (change) => `openspec/changes/${change}/tasks.md`,
  apply: (change) => `openspec/changes/${change}/apply-progress.md`,
  verify: (change) => `openspec/changes/${change}/verify-report.md`,
});
const LEGACY_HOST_ASSUMPTION = Object.freeze({
  code: "dispatch-identity-unavailable",
  phase: "4r-review-gate",
  statement_normalized: "the four phase dispatches/results represent propose, tasks, apply, and verify; the four reviewer results are the primary 4r outcomes and are corroborated by workspace-local evidence.",
  basis_normalized: "state.yaml, phase artifacts, reviewer result envelopes, and .eval-capture/codex-events.jsonl",
});

const SENSITIVE = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bBearer\s+[A-Za-z0-9._-]{12,}/i,
  /\b(?:api[_-]?key|password|access[_-]?token)\s*[:=]\s*[^\s]+/i,
  /\bsk-[A-Za-z0-9]{16,}\b/,
];
const ABSOLUTE_PATH = /(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\|\/(?:home|Users|private|var|etc|tmp)\/)/;

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function safeRelativePath(filePath) {
  return typeof filePath === "string" && filePath.length > 0 && !path.isAbsolute(filePath) && !filePath.includes("\\") && !filePath.split("/").some((part) => part === ".." || part === "." || part === "") && !filePath.split("/").includes(".git");
}

function validateSafePayload({ files, prompt }) {
  if (!files || typeof files !== "object" || Array.isArray(files)) throw new Error("Safe export files must be a closed map.");
  for (const [filePath, content] of Object.entries(files)) {
    if (!safeRelativePath(filePath)) throw new Error(`Safe export requires a relative path: ${filePath}`);
    if (typeof content !== "string") throw new Error(`Safe export content must be text: ${filePath}`);
    const absoluteMatch = content.match(ABSOLUTE_PATH);
    if (absoluteMatch) throw new Error(`Safe export contains an absolute path (${absoluteMatch[0]}): ${filePath}`);
    const sensitive = SENSITIVE.find((pattern) => pattern.test(content));
    if (sensitive) throw new Error(`Safe export contains sensitive content (${sensitive}): ${filePath}`);
  }
  if (typeof prompt !== "string" || ABSOLUTE_PATH.test(prompt) || SENSITIVE.some((pattern) => pattern.test(prompt))) throw new Error("Safe export prompt contains sensitive content or an absolute path.");
  return true;
}

function scenarioFor(profile) {
  const entry = PROFILES[profile];
  if (!entry) throw new Error(`Unknown safe benchmark profile: ${profile}`);
  const hasReview = entry.route !== "lite";
  const allowedHostAssumptions = hasReview ? [{ code: LEGACY_HOST_ASSUMPTION.code, phase: LEGACY_HOST_ASSUMPTION.phase, statement_normalized: LEGACY_HOST_ASSUMPTION.statement_normalized, basis_sha256: sha256(LEGACY_HOST_ASSUMPTION.basis_normalized), max: 1 }] : [];
  const phases = [...ROUTE_PHASES[entry.route]];
  const artifacts = phases.map((phase) => PHASE_ARTIFACTS[phase](entry.change, entry.route));
  if (hasReview) artifacts.push(`openspec/changes/${entry.change}/4r-review-report.md`);
  const createdProductFiles = entry.file[0].endsWith(".js") ? [entry.file[0].replace(/\.js$/, ".test.js")] : [];
  return { id: profile, group: "benchmark", profile, benchmark: { change: entry.change, expected_route: entry.route, expected_phases: phases, ...(entry.route === "standard" ? { spec_domain: "benchmark" } : {}), expected_artifacts: artifacts, product_files: [entry.file[0]], created_product_files: createdProductFiles, allowed_untracked_files: createdProductFiles, expected_reviews: hasReview ? 4 : 0, host_owned_evidence_path: ".eval-capture/benchmark-evidence.json", expected_assumptions: 0, allowed_host_assumptions: allowedHostAssumptions }, input: { command: entry.command, text: entry.request }, capture: { gate: false, envelope: false }, expect: { state: { status: "verified" } } };
}

function listSafeBenchmarkProfiles() {
  return Object.keys(PROFILES).sort();
}

function buildSafePrompt(profile) {
  const manifest = scenarioFor(profile);
  return [
    "Execute the isolated synthetic benchmark workflow using the configured phase agents.",
    `Synthetic profile: ${profile}`,
    `Synthetic change: ${manifest.benchmark.change}`,
    `Expected route: ${manifest.benchmark.expected_route}`,
    "Execution mode is automatic and delivery strategy is exception-ok.",
    `Run through verification${manifest.benchmark.expected_reviews ? " and the configured review gate" : ""}. Do not archive, release, access external repositories, or inspect paths outside this workspace.`,
    "The synthetic host contract provides only scripts/lib/route-dispatcher.js and scripts/configure/validate-phase.js; do not report missing production-only handlers as fixture defects.",
    "The unavailable dispatch identity is a declared cooperative host limitation, NOT a change assumption; do not persist it under state.yaml assumptions.",
    `Synthetic command: ${manifest.input.command}`,
    `Synthetic request: ${manifest.input.text}`,
    ...(manifest.benchmark.spec_domain ? [`Use exactly spec domain: ${manifest.benchmark.spec_domain}.`] : []),
    `Leave openspec/changes/${manifest.benchmark.change}/state.yaml at status: verified.`,
    `You MUST NOT create, edit, append, or repair .ospec/session/${manifest.benchmark.change}/phase-costs.jsonl; native host hooks may produce supplementary O1, while scoring uses run-level terminal turn.completed.usage only.`,
    "You MUST NOT create or edit .eval-capture/benchmark-evidence.json; it is exclusively derived and written by the host driver after exit.",
    "verify-report.md MUST contain a fenced json:ospec-benchmark-verify block with schema ospec-benchmark-verify/v1, outcome, and critical/warning/suggestion integer counts.",
    ...(manifest.benchmark.expected_reviews ? ["4r-review-report.md MUST contain a fenced json:ospec-benchmark-4r block with schema ospec-benchmark-4r/v1, outcome, and blocker/critical/warning/suggestion integer counts."] : []),
    "You MUST NOT modify .eval-capture/benchmark.pending.json; it is a sealed host-owned sentinel and the local driver alone publishes the final pending observation.",
    "Do not write benchmark.json or done.json; the local driver owns those files.",
  ].join("\n");
}

function payloadFor(profile) {
  const entry = PROFILES[profile];
  if (!entry) throw new Error(`Unknown safe benchmark profile: ${profile}`);
  const files = {
    ".eval-capture/benchmark.pending.json": `${JSON.stringify({ schema: "ospec-benchmark-pending/v1", profile, owner: "live-driver", status: "awaiting-host-observation" }, null, 2)}\n`,
    "package.json": `${JSON.stringify({ name: `isolated-benchmark-${profile}`, version: "1.0.0", private: true, scripts: { test: "node --test" } })}\n`,
    "openspec/config.yaml": CONFIG,
    "scripts/lib/route-dispatcher.js": ROUTE_DISPATCHER,
    "scripts/configure/validate-phase.js": VALIDATE_PHASE,
    [entry.file[0]]: entry.file[1],
  };
  const prompt = buildSafePrompt(profile);
  validateSafePayload({ files, prompt });
  return { files, prompt };
}

function buildSafeExportManifest(profile) {
  const { files, prompt } = payloadFor(profile);
  return {
    schema: "ospec-safe-export/v1",
    profile,
    safety: { source: "embedded-synthetic-catalog", git_metadata: true, synthetic_git: true, checkout_files_copied: false, credentials_embedded: false, absolute_paths: false },
    benchmark_contract: { ...scenarioFor(profile).benchmark, phase_evidence: "host-observed-artifacts-and-waits", threat_model: "cooperative-orchestrator", dispatch_identity_available: false },
    directories: [`.ospec/session/${scenarioFor(profile).benchmark.change}`],
    git: { synthetic_git: true, initialized: false, deterministic_timestamp: "2000-01-01T00:00:00Z", expected_initial_diff: [] },
    files: Object.entries(files)
      .map(([filePath, content]) => ({ path: filePath, bytes: Buffer.byteLength(content), sha256: sha256(content) }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    prompt: { text: prompt, bytes: Buffer.byteLength(prompt), sha256: sha256(prompt) },
  };
}

function walkWorkspace(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (directory === root && entry.name === ".git") {
        const gitStat = fs.lstatSync(path.join(directory, entry.name));
        if (!gitStat.isDirectory() || gitStat.isSymbolicLink()) throw new Error("Synthetic .git is redirected or invalid.");
        continue;
      }
      const absolute = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error(`Safe export contains symlink/reparse point: ${absolute}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
      else throw new Error(`Safe export contains unsupported filesystem entry: ${absolute}`);
    }
  };
  visit(root);
  return files;
}

function runGit(workspaceRoot, args, env = {}) {
  const result = spawnSync("git", args, { cwd: workspaceRoot, env: { ...process.env, ...env }, encoding: "utf8", shell: false });
  if (result.error || result.status !== 0) throw new Error(`Synthetic git ${args[0]} failed: ${result.error?.message || result.stderr.trim()}`);
  return result.stdout.trim();
}

function initializeSyntheticGit(workspaceRoot) {
  runGit(workspaceRoot, ["init", "--quiet"]);
  runGit(workspaceRoot, ["config", "user.name", "Synthetic Benchmark"]);
  runGit(workspaceRoot, ["config", "user.email", "benchmark.invalid@example.invalid"]);
  runGit(workspaceRoot, ["add", "--all"]);
  const fixed = { GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z" };
  runGit(workspaceRoot, ["commit", "--quiet", "-m", "chore: initialize synthetic fixture"], fixed);
  const initialCommit = runGit(workspaceRoot, ["rev-parse", "HEAD"]);
  const initialTree = runGit(workspaceRoot, ["rev-parse", "HEAD^{tree}"]);
  const status = runGit(workspaceRoot, ["status", "--porcelain"]);
  if (status) throw new Error("Synthetic git baseline is not clean after initial commit.");
  return { synthetic_git: true, initialized: true, initial_commit: initialCommit, initial_tree: initialTree, initial_diff_sha256: sha256("") };
}

function assertSyntheticGitOutcome(workspaceRoot, gitSeal, productFiles, allowedUntrackedFiles = []) {
  if (!gitSeal?.initialized || runGit(workspaceRoot, ["rev-parse", "HEAD"]) !== gitSeal.initial_commit) throw new Error("Synthetic git initial commit identity changed.");
  const changed = runGit(workspaceRoot, ["diff", "--name-only", "HEAD", "--"]).split(/\r?\n/).filter(Boolean).map((value) => value.split(path.sep).join("/"));
  if (changed.length !== productFiles.length || changed.some((value, index) => value !== productFiles[index])) throw new Error(`Synthetic git product diff mismatch: ${changed.join(",")}.`);
  if (runGit(workspaceRoot, ["diff", "--cached", "--name-only"])) throw new Error("Synthetic git index changed after baseline.");
  const untracked = runGit(workspaceRoot, ["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/).filter(Boolean).sort();
  const allowed = new Set(allowedUntrackedFiles);
  const unexpected = untracked.filter((file) => !allowed.has(file));
  if (unexpected.length) throw new Error(`Synthetic git untracked allowlist mismatch: ${unexpected.join(",")}.`);
  return { initial_commit: gitSeal.initial_commit, product_diff: changed, untracked, diff_sha256: sha256([...changed, ...untracked].join("\n") + "\n") };
}

function validateExportWorkspace(workspaceRoot, manifest) {
  const expected = new Map(manifest.files.map((entry) => [entry.path, entry]));
  const seen = new Set();
  for (const absolute of walkWorkspace(workspaceRoot)) {
    const relative = path.relative(workspaceRoot, absolute).split(path.sep).join("/");
    const declaration = expected.get(relative);
    if (!declaration) throw new Error(`Safe export file is not allowlisted: ${relative}`);
    const bytes = fs.readFileSync(absolute);
    if (bytes.length !== declaration.bytes || sha256(bytes) !== declaration.sha256) throw new Error(`Safe export file content mismatch: ${relative}`);
    seen.add(relative);
  }
  for (const filePath of expected.keys()) if (!seen.has(filePath)) throw new Error(`Safe export allowlisted file is missing: ${filePath}`);
  return true;
}

function verifySafeExportFile(workspaceRoot, manifest, filePath) {
  const declaration = manifest.files.find((entry) => entry.path === filePath);
  if (!declaration) throw new Error(`Safe export file is not declared: ${filePath}`);
  const absolute = path.join(workspaceRoot, ...filePath.split("/"));
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Safe export file is not a regular file: ${filePath}`);
  const bytes = fs.readFileSync(absolute);
  if (bytes.length !== declaration.bytes || sha256(bytes) !== declaration.sha256) throw new Error(`Safe export file content mismatch: ${filePath}`);
  return bytes;
}

function materializeSafeExport(profile, options = {}) {
  const manifest = buildSafeExportManifest(profile);
  const { files } = payloadFor(profile);
  const tempRoot = path.resolve(options.tempRoot || os.tmpdir());
  const checkoutRoot = path.resolve(__dirname, "../..");
  if (tempRoot === checkoutRoot || tempRoot.startsWith(`${checkoutRoot}${path.sep}`)) throw new Error("Safe export temp root must be outside the checkout.");
  fs.mkdirSync(tempRoot, { recursive: true });
  const workspaceRoot = fs.mkdtempSync(path.join(tempRoot, `ospec-safe-${profile}-`));
  for (const [filePath, content] of Object.entries(files)) {
    const target = path.join(workspaceRoot, ...filePath.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, { encoding: "utf8", flag: "wx" });
  }
  fs.mkdirSync(path.join(workspaceRoot, ".ospec", "session", scenarioFor(profile).benchmark.change), { recursive: true });
  validateExportWorkspace(workspaceRoot, manifest);
  manifest.git = { ...manifest.git, ...initializeSyntheticGit(workspaceRoot) };
  validateExportWorkspace(workspaceRoot, manifest);
  const scenario = scenarioFor(profile);
  scenario.benchmark.synthetic_git = manifest.git;
  return { workspaceRoot, manifest, scenario, prompt: manifest.prompt.text };
}

module.exports = { buildSafeExportManifest, buildSafePrompt, listSafeBenchmarkProfiles, materializeSafeExport, scenarioFor, validateExportWorkspace, validateSafePayload, verifySafeExportFile, assertSyntheticGitOutcome };

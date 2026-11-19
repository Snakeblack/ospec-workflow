"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const MAX_HARD_CAP = 40;
const EVIDENCE_SECTION = "json:strict-tdd-evidence";
const ALLOWED_ORIGINS = Object.freeze(["spec-gap", "design-gap", "tasks-gap", "code-bug"]);
const CYCLE_MARKERS = new Set(["✅ Written", "✅ Passed", "PASS", "pass", "written", "passed"]);
const DEFAULT_HISTORICAL_SNAPSHOT_DIR = ".ospec/strict-tdd-historical";
const RUNTIME_RECEIPT_AUTHORITY = "runtime-test";
const RAW_DIGEST_POLICY = "sha256-raw-v1";
const LF_DIGEST_POLICY = "sha256-lf-v1";
/** Hash text/file payloads with CRLF normalized to LF so Windows checkouts match pinned digests. */
function digestPayload(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
  return String(value).replace(/\r\n/g, "\n");
}
const sha256 = value => `sha256:${crypto.createHash("sha256").update(digestPayload(value)).digest("hex")}`;
const rawSha256 = value => `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
function safeFile(absolute) { try { return fs.statSync(absolute).isFile(); } catch { return false; } }
function safeRead(absolute, encoding) { try { return fs.readFileSync(absolute, encoding); } catch { return null; } }
function safeRelativePath(value) {
  if (typeof value !== "string" || !value || value.includes("\0") || path.isAbsolute(value) || path.win32.isAbsolute(value)) return null;
  const normalized = value.replace(/\\/g, "/");
  if (normalized.split("/").some(part => !part || part === "." || part === "..")) return null;
  return normalized;
}
function confinedExistingPath(rootDir, relativePath, options = {}) {
  const relative = safeRelativePath(relativePath);
  if (!rootDir || !relative) return null;
  const root = path.resolve(rootDir);
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep)) return null;
  try {
    const realRoot = fs.realpathSync(root);
    const realTarget = fs.realpathSync(absolute);
    if (!realTarget.startsWith(realRoot + path.sep)) return null;
    if (options.file && !fs.statSync(realTarget).isFile()) return null;
    return { relative, absolute, real: realTarget };
  } catch {
    return null;
  }
}
function runtimeReceiptPrefix(change) {
  return /^[a-z0-9][a-z0-9_-]*$/.test(String(change || ""))
    ? `openspec/changes/${change}/evidence/receipts/`
    : null;
}
function resolveRuntimeArtifact(rootDir, change, relativePath, extension) {
  const prefix = runtimeReceiptPrefix(change);
  const relative = safeRelativePath(relativePath);
  if (!prefix || !relative || !relative.startsWith(prefix)) return null;
  const name = relative.slice(prefix.length);
  if (!new RegExp(`^[a-f0-9]{64}\\.${extension}$`, "i").test(name)) return null;
  return confinedExistingPath(rootDir, relative, { file: true });
}
function rootedEvidencePath(rootDir, evidencePath, authorizedChange) {
  if (!rootDir || !/^[a-z0-9][a-z0-9_-]*$/.test(String(authorizedChange)) || typeof evidencePath !== "string" || path.isAbsolute(evidencePath) || path.win32.isAbsolute(evidencePath) || evidencePath.replace(/\\/g, "/").split("/").includes("..")) return null;
  const root = path.resolve(rootDir), change = path.join(root, "openspec", "changes", authorizedChange), absolute = path.resolve(root, evidencePath);
  if (absolute !== path.join(change, "apply-progress.md") || !absolute.startsWith(root + path.sep) || !safeFile(absolute)) return null;
  try { const realRoot = fs.realpathSync(root), realChange = fs.realpathSync(change), realFile = fs.realpathSync(absolute); return realChange.startsWith(realRoot + path.sep) && realFile.startsWith(realChange + path.sep) ? absolute : null; } catch { return null; }
}
const sortedPaths = paths => [...new Set((paths || []).map(String))].sort();
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function candidateIdentity(snapshot = {}) {
  const genesis_paths = sortedPaths(snapshot.genesis_paths || (snapshot.files || []).map(f => f.path));
  const files = (snapshot.files || []).map(f => ({ path: String(f.path), digest: String(f.digest) })).sort((a, b) => a.path.localeCompare(b.path));
  return { id: sha256(JSON.stringify(canonical({ projection: snapshot.projection, base_tree: snapshot.base_tree, genesis_paths, files }))), projection: snapshot.projection, genesis_paths, files };
}
function parseEvidenceBlock(text) {
  if (typeof text !== "string") return { valid: false, reason_code: "evidence-record-missing" };
  const match = text.match(/```json:strict-tdd-evidence\s*([\s\S]*?)```/i);
  if (!match) return { valid: false, reason_code: "evidence-record-missing" };
  try { return { valid: true, record: JSON.parse(match[1]) }; } catch { return { valid: false, reason_code: "evidence-record-malformed" }; }
}
function digestEvidenceSection(value) {
  const parsed = typeof value === "string" ? parseEvidenceBlock(value) : { valid: true, record: value };
  return parsed.valid ? sha256(JSON.stringify(canonical(normalizeEvidenceRecord(parsed.record)))) : null;
}
function renderEvidenceTable(record) {
  const normalized = normalizeEvidenceRecord(record) || { cycles: [] };
  return (Array.isArray(normalized.cycles) ? normalized.cycles : []).map(c => `| ${c.task} | ${c.test_file} | ${c.red} | ${c.green} | ${c.triangulate} | ${c.refactor} |`).join("\n");
}
function compareEvidenceRendering(record, markdown) {
  const table = renderEvidenceTable(record); const source = String(markdown || "");
  return { equivalent: table.length > 0 && table.split("\n").every(line => source.includes(line)), format_gap: table.length > 0 && !table.split("\n").every(line => source.includes(line)), expected: table, digest: digestEvidenceSection(record) };
}
function extractEvidenceRegion(text) {
  const source = String(text || "");
  const fence = /```json:strict-tdd-evidence\s*[\s\S]*?```/i.exec(source);
  if (!fence) return { valid: false, reason_code: "evidence-record-missing" };
  const tableHeading = source.indexOf("## Final Derived Markdown Table", fence.index + fence[0].length);
  let end = fence.index + fence[0].length;
  if (tableHeading >= 0) {
    const nextHeading = source.indexOf("\n## ", tableHeading + 3);
    end = nextHeading >= 0 ? nextHeading + 1 : source.length;
  }
  return { valid: true, region: source.slice(fence.index, end), outside: source.slice(0, fence.index) + source.slice(end) };
}
function captureEvidenceSnapshot(value) {
  const source = String(value || "");
  const region = extractEvidenceRegion(source); const parsed = parseEvidenceBlock(source);
  if (!region.valid || !parsed.valid) return { valid: false, reason_code: region.reason_code || parsed.reason_code };
  const candidate = parsed.record && parsed.record.functional_snapshot ? candidateIdentity(parsed.record.functional_snapshot) : null;
  const snapshot = { full_digest: sha256(source), region_digest: sha256(region.region), outside_digest: sha256(region.outside), record_digest: digestEvidenceSection(parsed.record), candidate_id: candidate && candidate.id };
  return { valid: true, ...snapshot, digest: objectDigest(snapshot), record: normalizeEvidenceRecord(parsed.record) };
}
function finalizeEvidence({ record, rootDir, files, markdown } = {}) {
  const validated = validateEvidenceRecord(record, { rootDir, requireProvenanceDigest: true });
  if (!validated.valid) return { valid: false, reason_code: validated.reason_code, errors: validated.errors };
  const paths = files || validated.record.functional_snapshot.files.map(file => file.path);
  const fs = require("node:fs"); const path = require("node:path");
  const finalFiles = [];
  for (const filePath of paths) { const content = safeRead(path.resolve(rootDir, filePath)); if (content == null) return { valid: false, reason_code: "snapshot-file-unverifiable" }; finalFiles.push({ path: filePath, digest: sha256(content) }); }
  const finalRecord = normalizeEvidenceRecord({ ...validated.record, functional_snapshot: { ...validated.record.functional_snapshot, files: finalFiles } });
  const rendered = renderEvidenceTable(finalRecord); const equivalence = compareEvidenceRendering(finalRecord, markdown == null ? rendered : markdown);
  if (!equivalence.equivalent) return { valid: false, reason_code: "derived-rendering-stale", record: finalRecord, rendered, digest_set: finalFiles };
  return { valid: true, record: finalRecord, rendered, digest_set: finalFiles, finalization_digest: digestEvidenceSection(finalRecord) };
}
function assertFinalized({ record, rootDir, digestSet } = {}) {
  if (!record || !rootDir || !Array.isArray(digestSet)) return { valid: false, reason_code: "finalization-proof-missing" };
  const fs = require("node:fs"); const path = require("node:path");
  for (const file of digestSet) {
    const absolute = path.resolve(rootDir, file.path), content = safeRead(absolute); if (content == null || sha256(content).toLowerCase() !== String(file.digest).toLowerCase()) return { valid: false, reason_code: "stale-finalized-digest", path: file.path };
  }
  return { valid: true };
}
function normalizeEvidenceRecord(input) {
  let record, out; try { record = typeof input === "string" ? parseEvidenceBlock(input).record : input; out = JSON.parse(JSON.stringify(record)); } catch { return null; }
  if (!record || typeof record !== "object") return null;
  if (out.functional_snapshot) {
    out.functional_snapshot.genesis_paths = Array.isArray(out.functional_snapshot.genesis_paths) ? sortedPaths(out.functional_snapshot.genesis_paths) : null;
    out.functional_snapshot.files = Array.isArray(out.functional_snapshot.files) ? out.functional_snapshot.files.map(f => ({ path: String(f.path), digest: String(f.digest) })).sort((a, b) => a.path.localeCompare(b.path)) : null;
  }
  out.cycles = Array.isArray(out.cycles) ? out.cycles.map(canonical).sort((a, b) => String(a.task).localeCompare(String(b.task))) : null;
  return out;
}
function historicalRefPath(rootDir, digest, snapshotDir = DEFAULT_HISTORICAL_SNAPSHOT_DIR) {
  if (!rootDir || !digest) return null;
  const hex = String(digest).replace(/^sha256:/i, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hex)) return null;
  const root = path.resolve(rootDir), absolute = path.resolve(root, snapshotDir || DEFAULT_HISTORICAL_SNAPSHOT_DIR, `${hex}.json`);
  return absolute.startsWith(root + path.sep) ? absolute : null;
}
function writeHistoricalSnapshot(rootDir, body, options = {}) {
  if (!rootDir || !body || typeof body !== "object") return { valid: false, reason_code: "historical-ref-missing" };
  const payload = JSON.stringify(canonical({ test_file: String(body.test_file || ""), test_digest: String(body.test_digest || "").toLowerCase() }));
  const digest = sha256(payload), absolute = historicalRefPath(rootDir, digest, options.historicalSnapshotDir);
  if (!absolute) return { valid: false, reason_code: "historical-ref-missing" };
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const existing = safeRead(absolute, "utf8");
  if (existing == null) fs.writeFileSync(absolute, payload);
  else if (sha256(existing) !== digest) return { valid: false, reason_code: "historical-ref-corrupt" };
  return { valid: true, digest, path: absolute };
}
function authenticateHistoricalProvenance(rootDir, provenance, options = {}) {
  const snapDigest = provenance && provenance.snapshot_digest;
  const absolute = historicalRefPath(rootDir, snapDigest, options.historicalSnapshotDir);
  if (!absolute) return { ok: false, reason_code: "historical-ref-missing" };
  const content = safeRead(absolute, "utf8");
  if (content == null) return { ok: false, reason_code: "historical-ref-missing" };
  if (sha256(content).toLowerCase() !== String(snapDigest).toLowerCase()) return { ok: false, reason_code: "historical-ref-corrupt" };
  let body; try { body = JSON.parse(content); } catch { return { ok: false, reason_code: "historical-ref-corrupt" }; }
  if (!body || String(body.test_file || "") !== String(provenance.test_file || "")) return { ok: false, reason_code: "provenance-missing-or-mismatch" };
  if (String(body.test_digest || "").toLowerCase() !== String(provenance.test_digest || "").toLowerCase()) return { ok: false, reason_code: "provenance-digest-mismatch" };
  return { ok: true };
}
function authenticateRuntimeOutput(rootDir, change, output, extension) {
  if (!output || output.digest_policy !== RAW_DIGEST_POLICY || !/^sha256:[a-f0-9]{64}$/i.test(String(output.digest || ""))) return { ok: false, reason_code: "runtime-output-reference-invalid" };
  const resolved = resolveRuntimeArtifact(rootDir, change, output.path, extension);
  if (!resolved) return { ok: false, reason_code: "runtime-output-path-invalid" };
  const bytes = safeRead(resolved.absolute);
  if (bytes == null) return { ok: false, reason_code: "runtime-output-missing" };
  if (rawSha256(bytes).toLowerCase() !== String(output.digest).toLowerCase()) return { ok: false, reason_code: "runtime-output-digest-mismatch" };
  return { ok: true };
}
function authenticateRuntimeReceipt(rootDir, record, cycle, phase) {
  const provenance = cycle && cycle.provenance;
  if (!provenance || provenance.source !== "runtime-receipt") return { ok: false, reason_code: "runtime-receipt-source-invalid" };
  const red = phase === "RED";
  const command = red ? provenance.red_command : provenance.command;
  const receiptId = red ? provenance.red_receipt_id : provenance.receipt_id;
  const receiptPath = red ? provenance.red_receipt_path : provenance.receipt_path;
  const testDigest = red ? provenance.red_test_digest : provenance.test_digest;
  if (!command) return { ok: false, reason_code: "runtime-receipt-command-missing" };
  if (!receiptId || !receiptPath || !testDigest) return { ok: false, reason_code: "runtime-receipt-reference-missing" };
  if (!/^sha256:[a-f0-9]{64}$/i.test(String(receiptId)) || !/^sha256:[a-f0-9]{64}$/i.test(String(testDigest))) return { ok: false, reason_code: "runtime-receipt-reference-invalid" };
  const resolved = resolveRuntimeArtifact(rootDir, record.change, receiptPath, "json");
  if (!resolved) {
    const safe = safeRelativePath(receiptPath);
    const prefix = runtimeReceiptPrefix(record.change);
    return { ok: false, reason_code: !safe || !prefix || !safe.startsWith(prefix) ? "runtime-receipt-path-invalid" : "runtime-receipt-missing" };
  }
  const bytes = safeRead(resolved.absolute);
  if (bytes == null) return { ok: false, reason_code: "runtime-receipt-missing" };
  const contentDigest = rawSha256(bytes);
  if (contentDigest.toLowerCase() !== String(receiptId).toLowerCase() || path.basename(resolved.relative, ".json").toLowerCase() !== String(receiptId).slice(7).toLowerCase()) return { ok: false, reason_code: "runtime-receipt-digest-mismatch" };
  let receipt;
  try { receipt = JSON.parse(bytes.toString("utf8")); } catch { return { ok: false, reason_code: "runtime-receipt-malformed" }; }
  const candidate = candidateIdentity(record.functional_snapshot);
  const expected = {
    authority: RUNTIME_RECEIPT_AUTHORITY,
    digest_policy: RAW_DIGEST_POLICY,
    test_digest_policy: LF_DIGEST_POLICY,
    change: record.change,
    phase,
    base_tree: record.functional_snapshot.base_tree,
    candidate_id: candidate.id,
    test_file: cycle.test_file,
    test_digest: String(testDigest).toLowerCase(),
    command,
    outcome: red ? "fail" : "pass"
  };
  for (const [key, value] of Object.entries(expected)) if (receipt[key] !== value) return { ok: false, reason_code: "runtime-receipt-binding-mismatch" };
  if (!Number.isInteger(receipt.exit_code) || (red ? receipt.exit_code === 0 : receipt.exit_code !== 0)) return { ok: false, reason_code: "runtime-receipt-outcome-invalid" };
  const stdout = authenticateRuntimeOutput(rootDir, record.change, receipt.stdout, "stdout");
  if (!stdout.ok) return stdout;
  const stderr = authenticateRuntimeOutput(rootDir, record.change, receipt.stderr, "stderr");
  if (!stderr.ok) return stderr;
  return { ok: true, phase, receipt_id: receiptId, receipt_path: resolved.relative, receipt_digest: contentDigest, receipt };
}
function validateEvidenceRecord(input, options = {}) {
  if (!options.rootDir) return { valid: false, reason_code: "root-dir-required", severity: "CRITICAL" };
  const parsed = typeof input === "string" ? parseEvidenceBlock(input) : { valid: true, record: input };
  if (!parsed.valid) return { valid: false, reason_code: parsed.reason_code, severity: "CRITICAL" };
  const record = normalizeEvidenceRecord(parsed.record); const errors = [];
  if (!record || record.schema_version !== 1) errors.push("schema-version-invalid");
  const historical = record && record.evidence_mode === "historical";
  if (!record || !["historical", "live"].includes(record.evidence_mode)) errors.push("evidence-mode-invalid");
  const snap = record && record.functional_snapshot;
  if (!snap || snap.projection !== "strict-tdd-functional-v1" || !snap.base_tree) errors.push("functional-snapshot-invalid");
  if (!snap || !Array.isArray(snap.genesis_paths) || !snap.genesis_paths.length) errors.push("genesis-paths-missing");
  if (!snap || !Array.isArray(snap.files) || !snap.files.length || snap.files.some(f => !f.path || !/^sha256:[a-f0-9]{64}$/i.test(f.digest))) errors.push("snapshot-files-invalid");
  const root = options.rootDir;
  // Live mode alone revalidates mutable working-tree bytes; historical never does.
  if (root && snap && !historical) {
    for (const file of snap.files) {
      const resolved = confinedExistingPath(root, file.path, { file: true });
      if (!safeRelativePath(file.path) || (!resolved && fs.existsSync(path.resolve(root, file.path)))) errors.push("unsafe-evidence-path");
      const content = resolved && safeRead(resolved.absolute);
      if (!resolved && !errors.includes("unsafe-evidence-path")) errors.push("snapshot-file-unverifiable");
      else if (sha256(content) !== String(file.digest).toLowerCase()) errors.push("snapshot-digest-mismatch");
    }
    for (const genesis of snap.genesis_paths) {
      const resolved = confinedExistingPath(root, genesis);
      if (!safeRelativePath(genesis) || (!resolved && fs.existsSync(path.resolve(root, genesis)))) errors.push("unsafe-evidence-path");
      else if (!resolved) errors.push("genesis-path-unverifiable");
    }
  }
  const cycles = record && record.cycles;
  if (!Array.isArray(cycles) || !cycles.length) errors.push("cycles-missing");
  let authenticity = historical ? "legacy-unverifiable" : "live-unverified";
  const runtime_receipts = [];
  for (const c of cycles || []) {
    for (const key of ["task", "test_file", "red", "green", "triangulate", "refactor"]) if (!c[key]) errors.push(`cycle-${key}-missing`);
    for (const key of ["red", "green", "triangulate", "refactor"]) if (c[key] && !CYCLE_MARKERS.has(c[key])) errors.push(`cycle-${key}-enum-invalid`);
    if (!c.provenance || !c.provenance.test_file || c.provenance.test_file !== c.test_file || (!c.provenance.commit && !c.provenance.digest && !c.provenance.test_digest && !c.provenance.source)) errors.push("provenance-missing-or-mismatch");
    if (c.provenance && c.provenance.commit && c.provenance.commit !== "working-tree" && !/^[a-f0-9]{7,64}$/i.test(String(c.provenance.commit))) errors.push("provenance-commit-invalid");
    const legacy = c.provenance && c.provenance.source === "working-tree";
    const hasHistoricalRef = !!(c.provenance && /^sha256:[a-f0-9]{64}$/i.test(String(c.provenance.snapshot_digest || "")));
    if (historical) {
      if (legacy) { if (options.requireHistoricalAuth) errors.push("provenance-unauthenticated"); }
      else if (!hasHistoricalRef) errors.push("provenance-unauthenticated");
      else {
        authenticity = "content-addressed";
        if (root) { const auth = authenticateHistoricalProvenance(root, c.provenance, options); if (!auth.ok) errors.push(auth.reason_code); }
      }
    } else if (legacy) errors.push("evidence-mode-cycle-mismatch");
    else {
      const sourceValid = c.provenance && c.provenance.source === "runtime-receipt";
      if (!sourceValid) errors.push("runtime-receipt-source-invalid");
      if (root && sourceValid) {
        for (const phase of ["GREEN", "RED"]) {
          const authenticated = authenticateRuntimeReceipt(root, record, c, phase);
          if (!authenticated.ok) errors.push(authenticated.reason_code);
          else runtime_receipts.push(authenticated);
        }
      }
    }
    if (options.requireProvenanceDigest && !legacy && (!c.provenance || !c.provenance.test_digest)) errors.push("provenance-digest-missing");
    if (options.testFiles && !options.testFiles.includes(c.test_file)) errors.push("test-file-unverifiable");
    // Live-only digest/file checks — historical authenticates sealed refs above.
    if (root && !historical) {
      const resolved = confinedExistingPath(root, c.test_file, { file: true });
      const content = resolved && safeRead(resolved.absolute);
      if (!safeRelativePath(c.test_file) || (!resolved && fs.existsSync(path.resolve(root, c.test_file)))) errors.push("unsafe-evidence-path");
      else if (content == null) errors.push("test-file-unverifiable");
      if (options.requireProvenanceDigest && !legacy && c.provenance && c.provenance.test_digest && content != null && sha256(content) !== String(c.provenance.test_digest).toLowerCase()) errors.push("provenance-digest-mismatch");
    }
  }
  if (!historical && runtime_receipts.length === (cycles || []).length * 2) authenticity = "runtime-authenticated";
  if (!historical && authenticity !== "runtime-authenticated" && options.allowLiveUnverified !== true) errors.push("runtime-receipt-unverified");
  return errors.length ? { valid: false, reason_code: errors[0], errors, severity: "CRITICAL" } : { valid: true, record, candidate: candidateIdentity(snap), authenticity, runtime_receipts, severity: "CRITICAL" };
}
function isEvidenceOnlyPath(filePath) { const p = String(filePath || "").replace(/\\/g, "/"); return /(^|\/)apply-progress\.md$/.test(p); }
const isAllowlistedWrite = paths => (paths || []).every(isEvidenceOnlyPath);
function withinChangedLineCap(lines, configured = 40) { const n = Number(configured); return Number.isInteger(n) && n > 0 && n <= MAX_HARD_CAP && Number(lines) >= 0 && Number(lines) <= n; }
function resolveChangedLineCap(config) { const n = Number(config); return Number.isInteger(n) && n > 0 && n <= MAX_HARD_CAP ? n : null; }
function sameIdentity(a, b) { return !!a && !!b && a.id === b.id && JSON.stringify(sortedPaths(a.genesis_paths)) === JSON.stringify(sortedPaths(b.genesis_paths)); }
function integrityToken(state) {
  if (!state) return null;
  const immutable = { classification: state.classification, authorized_change: state.authorized_change, authorization: state.authorization, live_receipt: state.live_receipt, original_finding: state.original_finding, candidate: state.candidate, functional_manifest: state.functional_manifest, evidence: state.evidence, budget: state.budget };
  return sha256(JSON.stringify(canonical(immutable)));
}
function stateIntegrityValid(state) { return !!state.integrity && state.integrity === integrityToken(state); }
function objectDigest(value) { return sha256(JSON.stringify(canonical(value))); }
function findingDigest(finding = {}) { const { digest, ...body } = finding; return objectDigest(body); }
function verifyEvidenceDigest(rootDir, evidencePath, supplied, authorizedChange) {
  if (!rootDir || !evidencePath || !supplied) return false;
  const absolute = rootedEvidencePath(rootDir, evidencePath, authorizedChange); const content = absolute && safeRead(absolute);
  if (content == null) return false;
  if (sha256(content).toLowerCase() === String(supplied).toLowerCase()) return true;
  return digestEvidenceSection(content.toString("utf8")) === supplied;
}
function readEvidence(rootDir, evidencePath, authorizedChange) {
  if (!rootDir || !evidencePath) return null;
  const absolute = rootedEvidencePath(rootDir, evidencePath, authorizedChange);
  return absolute ? safeRead(absolute, "utf8") : null;
}
function liveManifestValid(rootDir, candidate) {
  if (!rootDir || !candidate || !Array.isArray(candidate.files) || !candidate.files.length) return false;
  for (const file of candidate.files) {
    const absolute = path.resolve(rootDir, file.path);
    const content = safeFile(absolute) && safeRead(absolute);
    if (content == null || sha256(content).toLowerCase() !== String(file.digest).toLowerCase()) return false;
  }
  return candidate.genesis_paths.every(genesis => fs.existsSync(path.resolve(rootDir, genesis)));
}
function liveReceiptValid(record, receipt, candidate, reconciledCandidateId) {
  const cycles = (record.cycles || []).filter(c => c.provenance && c.provenance.source === "runtime-receipt");
  return !!(record.evidence_mode === "live" && cycles.length === record.cycles.length && receipt && receipt.authority === "reconciled-lineage" && reconciledCandidateId === candidate.id && receipt.candidate_id === reconciledCandidateId && receipt.reconciled_candidate_id === reconciledCandidateId && /^sha256:[a-f0-9]{64}$/i.test(String(receipt.receipt_id)) && cycles.some(c => c.test_file === receipt.test_file && c.provenance.test_digest === receipt.test_digest && c.provenance.command === receipt.command && c.provenance.receipt_id === receipt.receipt_id && /^node --test\s+/.test(String(receipt.command)) && receipt.outcome === "pass"));
}
function evidenceAuthorization(rootDir, evidencePath, change) { if (!rootDir || !evidencePath || !change) return null; const file = rootedEvidencePath(rootDir, evidencePath, change); try { return file ? { root: fs.realpathSync(rootDir), path: fs.realpathSync(file) } : null; } catch { return null; } }
function classifyRemediation(input = {}) {
  const options = { ...(input.options || {}), rootDir: input.rootDir || (input.options && input.options.rootDir), requireProvenanceDigest: true };
  const valid = validateEvidenceRecord(input.record, options);
  const ordinary = "ordinary" + "-routing";
  const originalOrigin = input.finding && input.finding.origin;
  const fallbackOrigin = ALLOWED_ORIGINS.includes(originalOrigin) ? originalOrigin : (ALLOWED_ORIGINS.includes(input.origin) ? input.origin : "code-bug");
  const fallback = reason => ({ status: ordinary, severity: "CRITICAL", reason_code: reason, classification: fallbackOrigin, original_finding: input.finding || {} });
  if (!valid.valid) return fallback(valid.reason_code);
  const authorizedChange = input.authorizedChange;
  const authorization = evidenceAuthorization(options.rootDir, input.evidencePath, authorizedChange);
  if (!authorizedChange || authorizedChange !== valid.record.change || !valid.candidate.genesis_paths.includes(input.evidencePath) || !authorization || !liveReceiptValid(valid.record, input.externalReceipt, valid.candidate, input.reconciledCandidateId)) return fallback("external-receipt-required-or-invalid");
  if (input.format_gap !== true) return fallback("format-gap-required");
  if (!input.finding || input.finding.severity !== "CRITICAL" || !input.finding.origin) return fallback("critical-origin-finding-required");
  if (typeof input.finding.origin !== "string" || !ALLOWED_ORIGINS.includes(input.finding.origin)) return fallback("finding-origin-invalid");
  if (!input.before || !input.after) return fallback("evidence-snapshots-required");
  const before = validateEvidenceRecord(input.before, options); const after = validateEvidenceRecord(input.after, options);
  if (!before.valid || !after.valid || !sameIdentity(valid.candidate, before.candidate) || !sameIdentity(valid.candidate, after.candidate) || digestEvidenceSection(before.record) !== digestEvidenceSection(valid.record) || digestEvidenceSection(after.record) !== digestEvidenceSection(valid.record)) return fallback("candidate-identity-mismatch");
  const evidenceContent = readEvidence(options.rootDir, input.evidencePath, authorizedChange);
  if (evidenceContent == null || !compareEvidenceRendering(valid.record, evidenceContent).format_gap) return fallback("format-gap-not-observed");
  const beforeSnapshot = captureEvidenceSnapshot(evidenceContent);
  if (!beforeSnapshot.valid || beforeSnapshot.candidate_id !== valid.candidate.id) return fallback("evidence-snapshot-invalid");
  const cap = resolveChangedLineCap(input.maxChangedLines);
  if (cap == null) return fallback("fast-path-disabled-invalid-cap");
  if (input.functional_delta || input.material_change) return fallback("material-functional-delta");
  if (input.identity_drift) return fallback("candidate-identity-mismatch");
  if (!input.candidate_digest || input.candidate_digest !== valid.candidate.id) return fallback("candidate-digest-required-or-invalid");
  if (input.origin && input.origin !== (input.finding && input.finding.origin)) return fallback("origin-digest-mismatch");
  if (input.action && input.action.type !== "run-focal-recheck") return fallback("next-action-invalid");
  if (input.tests_passed === false || input.recheckOutcome === "fail") return fallback("focal-recheck-failed");
  if (Number(input.focalRechecksUsed || 0) >= 1) return fallback("focal-recheck-cap-exceeded");
  if (!input.finding || !input.finding.digest || input.finding.digest !== findingDigest(input.finding)) return fallback("finding-digest-required-or-invalid");
  if (!input.evidenceDigest || !verifyEvidenceDigest(options.rootDir, input.evidencePath, input.evidenceDigest, authorizedChange)) return fallback("evidence-digest-required-or-invalid");
  if (!Array.isArray(input.proposedPaths) || !input.proposedPaths.length) return fallback("empty-write-set");
  if (!isAllowlistedWrite(input.proposedPaths) || !rootedEvidencePath(options.rootDir, input.evidencePath, authorizedChange)) return fallback("unauthorized-write-path");
  if (input.proposedPaths.length !== 1 || input.proposedPaths[0] !== input.evidencePath) return fallback("unauthorized-write-path");
  const lines = Number(input.changedLines || 0);
  if (!withinChangedLineCap(lines, cap)) return fallback("changed-line-cap-exceeded");
  const functionalManifest = { files: valid.candidate.files, genesis_paths: valid.candidate.genesis_paths, digest: objectDigest({ files: valid.candidate.files, genesis_paths: valid.candidate.genesis_paths }) };
  const result = {
    status: "repair-pending",
    classification: "evidence" + "-format-gap",
    severity: "CRITICAL",
    reason_code: "equivalent" + "-representation-drift",
    original_finding: { ...JSON.parse(JSON.stringify(input.finding || {})), digest: (input.finding && input.finding.digest) || objectDigest(input.finding || {}) },
    candidate: valid.candidate,
    functional_manifest: functionalManifest,
    authorized_change: authorizedChange, authorization, live_receipt: { digest: objectDigest(input.externalReceipt) }, evidence: { path: input.evidencePath, section: EVIDENCE_SECTION, before_digest: input.evidenceDigest, before_snapshot: beforeSnapshot },
    budget: { max_changed_lines: cap, used_changed_lines: lines, focal_rechecks_used: 0, max_focal_rechecks: 1 },
    integrity: null
  };
  result.integrity = integrityToken(result);
  return result;
}
function reduce(state, event = {}) {
  const ordinary = "ordinary" + "-routing";
  if (!state) {
    if (event.type !== "classify") return { status: ordinary, reason_code: "classification-required" };
    const result = classifyRemediation(event);
    return result.status === "repair-pending" ? { schema_version: 1, revision: 0, ...result } : result;
  }
  const next = JSON.parse(JSON.stringify(state));
  next.revision = (next.revision || 0) + 1;
  if (next.status === ordinary) return next;
  if (!stateIntegrityValid(state)) { next.status = ordinary; next.reason_code = "immutable-state-tamper"; return next; }
  if (next.status === "resolved" && event.type !== "focal-recheck") return next;
  if (event.type === "write") {
    const beforeSnapshot = captureEvidenceSnapshot(event.before_evidence);
    const afterSnapshot = captureEvidenceSnapshot(event.after_evidence);
    // Invariant: only the evidence region may change; identity and surrounding text stay frozen.
    const sameFrozenSnapshot = beforeSnapshot.valid && afterSnapshot.valid && beforeSnapshot.digest === next.evidence.before_snapshot.digest && event.before_snapshot_digest === beforeSnapshot.digest;
    const changedOnlyEvidenceRegion = beforeSnapshot.outside_digest === afterSnapshot.outside_digest && beforeSnapshot.region_digest !== afterSnapshot.region_digest;
    const sameEvidenceIdentity = beforeSnapshot.record_digest === next.evidence.before_snapshot.record_digest && afterSnapshot.record_digest === beforeSnapshot.record_digest && beforeSnapshot.candidate_id === next.candidate.id && afterSnapshot.candidate_id === next.candidate.id;
    const exactRegion = sameFrozenSnapshot && changedOnlyEvidenceRegion && sameEvidenceIdentity && compareEvidenceRendering(afterSnapshot.record, event.after_evidence).equivalent;
    const liveManifest = liveManifestValid(event.rootDir, next.candidate) && event.live_manifest_digest === next.functional_manifest.digest;
    const authorization = evidenceAuthorization(event.rootDir, event.path, next.authorized_change);
    const proof = event.rootDir && event.authorizedChange === next.authorized_change && authorization && authorization.root === next.authorization.root && authorization.path === next.authorization.path && event.path === next.evidence.path && event.external_receipt_digest === next.live_receipt.digest && liveManifest && exactRegion && event.candidate_id === next.candidate.id && event.candidate_digest === objectDigest(next.candidate) && event.finding_id === next.original_finding.id && event.finding_digest === next.original_finding.digest && event.origin === next.original_finding.origin && event.evidence_before_digest === next.evidence.before_digest && event.repaired_digest === afterSnapshot.full_digest;
    if (next.status !== "repair-pending" || !proof || !isEvidenceOnlyPath(event.path) || event.section !== EVIDENCE_SECTION || !withinChangedLineCap(event.changed_lines, next.budget.max_changed_lines)) {
      next.status = ordinary; next.reason_code = "unauthorized-or-over-budget-write"; return next;
    }
    next.budget.used_changed_lines = event.changed_lines;
    next.evidence = { ...next.evidence, repaired_digest: event.repaired_digest, repaired_snapshot: afterSnapshot };
    next.status = "recheck-pending";
    next.next_action = { type: "run-focal-recheck", candidate_id: next.candidate.id, candidate_digest: objectDigest(next.candidate), finding_id: next.original_finding.id, finding_digest: next.original_finding.digest, origin: next.original_finding.origin, evidence_digest: next.evidence.repaired_digest };
    next.integrity = integrityToken(next); return next;
  }
  if (event.type === "reconcile-unknown-write") {
    if (event.artifact_digest && next.evidence.repaired_digest && event.artifact_digest === next.evidence.repaired_digest) { next.status = "recheck-pending"; next.next_action = { type: "run-focal-recheck", candidate_id: next.candidate.id, candidate_digest: objectDigest(next.candidate), finding_id: next.original_finding.id, finding_digest: next.original_finding.digest, origin: next.original_finding.origin, evidence_digest: next.evidence.repaired_digest }; next.integrity = integrityToken(next); return next; }
    next.status = ordinary; next.reason_code = "unknown-write-reconciliation-required"; return next;
  }
  if (event.type === "focal-recheck") {
    const action = next.next_action;
    const focalSnapshot = captureEvidenceSnapshot(event.evidence_content);
    const liveManifest = liveManifestValid(event.rootDir, next.candidate) && event.live_manifest_digest === next.functional_manifest.digest;
    const authorization = evidenceAuthorization(event.rootDir, next.evidence.path, next.authorized_change);
    const proof = action && action.type === "run-focal-recheck" && event.action && event.action.type === action.type && event.rootDir && event.authorizedChange === next.authorized_change && authorization && authorization.root === next.authorization.root && authorization.path === next.authorization.path && event.external_receipt_digest === next.live_receipt.digest && liveManifest && focalSnapshot.valid && next.evidence.repaired_snapshot && focalSnapshot.digest === next.evidence.repaired_snapshot.digest && event.candidate_id === next.candidate.id && event.candidate_digest === objectDigest(next.candidate) && event.finding_id === next.original_finding.id && event.finding_digest === next.original_finding.digest && event.origin === next.original_finding.origin && event.evidence_digest === next.evidence.repaired_digest && focalSnapshot.full_digest === event.evidence_digest && event.tests_passed === true;
    if (next.status !== "recheck-pending" || next.budget.focal_rechecks_used >= next.budget.max_focal_rechecks || !proof) { next.status = ordinary; next.reason_code = "focal-recheck-contract-failed"; return next; }
    next.budget.focal_rechecks_used += 1;
    next.recheck = { outcome: event.outcome === "pass" ? "pass" : "fail", result_digest: event.result_digest || null };
    next.status = event.outcome === "pass" ? "resolved" : ordinary;
    if (next.status === ordinary) next.reason_code = "focal-recheck-failed";
    next.next_action = null;
    next.integrity = integrityToken(next);
  }
  return next;
}
function writeContentAddressedFile(rootDir, change, extension, bytes) {
  const prefix = runtimeReceiptPrefix(change);
  if (!rootDir || !prefix) return { valid: false, reason_code: "runtime-receipt-change-invalid" };
  const root = path.resolve(rootDir);
  const changeDir = path.join(root, "openspec", "changes", change);
  if (!confinedExistingPath(root, `openspec/changes/${change}`)) return { valid: false, reason_code: "runtime-receipt-change-invalid" };
  const receiptDir = path.join(changeDir, "evidence", "receipts");
  try {
    fs.mkdirSync(receiptDir, { recursive: true });
    const realRoot = fs.realpathSync(root);
    const realReceiptDir = fs.realpathSync(receiptDir);
    if (!realReceiptDir.startsWith(realRoot + path.sep)) return { valid: false, reason_code: "runtime-receipt-path-invalid" };
    const digest = rawSha256(bytes);
    const relative = `${prefix}${digest.slice(7)}.${extension}`;
    const absolute = path.join(root, ...relative.split("/"));
    const existing = safeRead(absolute);
    if (existing == null) fs.writeFileSync(absolute, bytes, { flag: "wx" });
    else if (rawSha256(existing) !== digest) return { valid: false, reason_code: "runtime-receipt-digest-mismatch" };
    return { valid: true, digest, path: relative };
  } catch {
    return { valid: false, reason_code: "runtime-receipt-write-failed" };
  }
}
function persistRuntimeReceipt(rootDir, input = {}) {
  const required = ["change", "phase", "base_tree", "candidate_id", "test_file", "test_digest", "command", "outcome"];
  if (required.some(key => !input[key]) || !["GREEN", "RED"].includes(input.phase)) return { valid: false, reason_code: "runtime-receipt-body-invalid" };
  const exitCode = Number(input.exit_code);
  if (!Number.isInteger(exitCode) || (input.phase === "GREEN" ? exitCode !== 0 || input.outcome !== "pass" : exitCode === 0 || input.outcome !== "fail")) return { valid: false, reason_code: "runtime-receipt-outcome-invalid" };
  const stdout = writeContentAddressedFile(rootDir, input.change, "stdout", Buffer.isBuffer(input.stdout) ? input.stdout : Buffer.from(input.stdout || ""));
  if (!stdout.valid) return stdout;
  const stderr = writeContentAddressedFile(rootDir, input.change, "stderr", Buffer.isBuffer(input.stderr) ? input.stderr : Buffer.from(input.stderr || ""));
  if (!stderr.valid) return stderr;
  const receipt = {
    schema_version: 1,
    authority: RUNTIME_RECEIPT_AUTHORITY,
    digest_policy: RAW_DIGEST_POLICY,
    test_digest_policy: LF_DIGEST_POLICY,
    change: input.change,
    phase: input.phase,
    base_tree: input.base_tree,
    candidate_id: input.candidate_id,
    test_file: input.test_file,
    test_digest: String(input.test_digest).toLowerCase(),
    command: input.command,
    exit_code: exitCode,
    outcome: input.outcome,
    stdout: { path: stdout.path, digest: stdout.digest, digest_policy: RAW_DIGEST_POLICY },
    stderr: { path: stderr.path, digest: stderr.digest, digest_policy: RAW_DIGEST_POLICY }
  };
  if (input.source_receipt_id) receipt.source_receipt_id = input.source_receipt_id;
  const bytes = Buffer.from(`${JSON.stringify(canonical(receipt))}\n`);
  const persisted = writeContentAddressedFile(rootDir, input.change, "json", bytes);
  return persisted.valid
    ? { valid: true, receipt, receipt_id: persisted.digest, receipt_path: persisted.path }
    : persisted;
}
module.exports = { MAX_HARD_CAP, EVIDENCE_SECTION, ALLOWED_ORIGINS, RUNTIME_RECEIPT_AUTHORITY, RAW_DIGEST_POLICY, LF_DIGEST_POLICY, sha256, rawSha256, canonical, sortedPaths, safeRelativePath, confinedExistingPath, parseEvidenceBlock, extractEvidenceRecord: parseEvidenceBlock, digestEvidenceSection, renderEvidenceTable, compareEvidenceRendering, extractEvidenceRegion, captureEvidenceSnapshot, finalizeEvidence, assertFinalized, normalizeEvidenceRecord, normalize: normalizeEvidenceRecord, persistRuntimeReceipt, authenticateRuntimeReceipt, validateEvidenceRecord, validate: validateEvidenceRecord, candidateIdentity, computeCandidateIdentity: candidateIdentity, functionalSnapshotHash: candidateIdentity, sameIdentity, rootedEvidencePath, isEvidenceOnlyPath, isAllowlistedPath: isEvidenceOnlyPath, isAllowlistedWrite, withinChangedLineCap, resolveChangedLineCap, liveReceiptValid, historicalRefPath, writeHistoricalSnapshot, authenticateHistoricalProvenance, classifyRemediation, classify: classifyRemediation, reduce, reducer: reduce, transition: reduce };

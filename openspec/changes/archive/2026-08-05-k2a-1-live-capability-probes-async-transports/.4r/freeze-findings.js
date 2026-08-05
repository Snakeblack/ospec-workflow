"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  recordLensResult,
  freezeFindings,
  ensureRemediationV2,
} = require("../../../../scripts/lib/review-lineage.js");
const { planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;

const lenses = {
  risk: {
    findings: [
      {
        severity: "CRITICAL",
        summary:
          "runConformanceScenario fills expectedProbeDigest from entry.proof.probe_digest, bypassing independent live bind required by ADR-001/REQ-capability-proof-005.",
        acceptance_criteria:
          "Caller must supply independent expectedProbeDigest; missing value fail-closed. Headless must not default expectedProbeDigest from proof.probe_digest. Add regression: coherent proof without external expectedProbeDigest cannot authenticate enforced.",
      },
      {
        severity: "CRITICAL",
        summary:
          "createClaudeHostAdapter promotes to enforced when liveProbes[id] is truthy without requiring a real host primitive, and verifies with expectedProbeDigest from the same built proof (circular bind).",
        acceptance_criteria:
          "enforced only when a real primitive for that capability is present AND live probe evidence verifies against an independent expectedProbeDigest. Fixture-only or synthetic liveProbes without primitives MUST resolve unavailable|instructional|partial. Add test: liveProbes without primitives never yields enforced.",
      },
      {
        severity: "WARNING",
        summary:
          "Claude transport handlers still return ok:true stubs when host primitives are absent (toolMap/delegation metadata), which can be confused with demonstrated capability.",
        acceptance_criteria:
          "Without primitives, port outcomes MUST NOT claim success that implies demonstrated capability; align with instructional/unavailable honesty (ok:false or explicit instructional outcome documented in ADR).",
      },
    ],
  },
  reliability: {
    findings: [
      {
        severity: "WARNING",
        summary:
          "observeHostPort success test compares equality across runs without asserting ok===true, so identical failures would pass.",
        acceptance_criteria:
          "Assert a.ok === true (and outcome) on the success path for REQ-lifecycle-kernel-runtime-017.",
      },
      {
        severity: "WARNING",
        summary:
          "AbortSignal in-flight cancel path (addEventListener abort) lacks a dedicated test; only pre-aborted signal is covered.",
        acceptance_criteria:
          "Add test: slow invoke + deferred abort mid-flight → failure_class cancel with preserved requestId.",
      },
      {
        severity: "WARNING",
        summary:
          "invokeTransportAsync Promise.race leaves losing invokePromise unsettled; late rejection after timeout/abort may become unhandledRejection.",
        acceptance_criteria:
          "Settle raced invokePromise after guard wins; add regression where port rejects after deadline wins race with zero unhandledRejection.",
      },
      {
        severity: "WARNING",
        summary:
          "verifyCapabilityProof fail-closed branch for invalid proof.kind has no dedicated unit test.",
        acceptance_criteria:
          "Add test: proof.kind !== capability-proof/v1 → ok:false, PROOF_VERIFICATION_FAILED, path:/kind.",
      },
      {
        severity: "SUGGESTION",
        summary:
          "No dedicated unit success case for invokeTransportAsync in host-contract tests (only via consumers).",
        acceptance_criteria:
          "Add host-contract unit: async success returns ok:true with preserved requestId.",
      },
      {
        severity: "SUGGESTION",
        summary:
          "observeHostPort error paths unknown-host-port and missing-transport-port lack tests.",
        acceptance_criteria:
          "Add host-boundary tests covering both structured error codes.",
      },
    ],
  },
  resilience: {
    findings: [
      {
        severity: "CRITICAL",
        summary:
          "invokeTransportAsync Promise.race abandons the losing invokePromise; a late port rejection after timeout/cancel becomes unhandledRejection.",
        acceptance_criteria:
          "Attach settlement handler to raced invokePromise (or forward AbortSignal so port stops) so late reject cannot surface as unhandledRejection; add regression test with reject-after-deadline.",
      },
      {
        severity: "WARNING",
        summary:
          "Claude port handlers return ok:true with raw primitive return without awaiting; async primitive rejection bypasses structured failure mapping.",
        acceptance_criteria:
          "Await Promise.resolve(primitives.*) (or catch) and map failures to ok:false; add test with async rejecting primitive that must not yield ok:true.",
      },
      {
        severity: "WARNING",
        summary:
          "AbortSignal/deadlineMs are race guards only and are not forwarded to the port invoker, so in-flight work continues after classified timeout/cancel.",
        acceptance_criteria:
          "Forward AbortSignal into invoker request for cooperative cancel, or document intentional non-cooperative cancel in ADR while still settling the raced promise; cover with a test.",
      },
      {
        severity: "WARNING",
        summary:
          "Claude loadFixture uses readFileSync/JSON.parse without try/catch; missing/invalid fixture throws unstructured ENOENT/SyntaxError.",
        acceptance_criteria:
          "Map fixture I/O/parse failures to a stable structured reason_code (or documented intentional fail-fast).",
      },
    ],
  },
  readability: {
    findings: [
      {
        severity: "CRITICAL",
        summary:
          "createClaudeHostAdapter JSDoc claims live-bound verification but uses expectedProbeDigest from the same buildEvidence material, hiding that enforced mainly requires liveProbes presence.",
        acceptance_criteria:
          "Document or redesign the gate so enforced requires an independent expectedProbeDigest (or remove the tautological verify); JSDoc must not claim external live-bind when the digest is self-derived.",
      },
      {
        severity: "WARNING",
        summary:
          "resolveCapabilityState and evaluateEnforcementEligibility duplicate enforcement promotion gates with divergent reason_code rules and no authority comment.",
        acceptance_criteria:
          "Make one delegate to the other, or document which API is authoritative and the declared×request_enforced×reason_code matrix.",
      },
      {
        severity: "WARNING",
        summary:
          "classifyTransportFailure uses undocumented substring heuristics and WorkerTransport→worker-fail fallback without priority comments.",
        acceptance_criteria:
          "Document classification order: explicit failure_class → text heuristics → portName fallback.",
      },
      {
        severity: "WARNING",
        summary:
          "ENFORCED_CAPABILITIES alias still names transport IDs as ENFORCED despite enforced-only-after-probe semantics.",
        acceptance_criteria:
          "Remove alias or rename so no symbol says ENFORCED unless it means enforced state.",
      },
      {
        severity: "WARNING",
        summary:
          "resolveHonestState special-cases DeliveryGate/Question → instructional without explaining why others are unavailable.",
        acceptance_criteria:
          "Add one-line rationale or capability→fallback table next to resolveHonestState.",
      },
    ],
  },
};

for (const [dimension, payload] of Object.entries(lenses)) {
  fs.writeFileSync(path.join(outDir, `lens-${dimension}.json`), JSON.stringify({ dimension, ...payload }, null, 2));
}

let lineage = JSON.parse(fs.readFileSync(path.join(outDir, "lineage.json"), "utf8"));

for (const dimension of ["risk", "reliability", "resilience", "readability"]) {
  lineage = recordLensResult(lineage, {
    dimension,
    request_id: `start-${dimension}-k2a1`,
    expected_revision: lineage.revision,
    result: lenses[dimension],
  });
}

lineage = freezeFindings(lineage, {
  request_id: "freeze-findings-k2a1",
  expected_revision: lineage.revision,
});

if (typeof ensureRemediationV2 === "function") {
  lineage = ensureRemediationV2(lineage, {
    request_id: "ensure-remediation-v2-k2a1",
    expected_revision: lineage.revision,
  });
}

const planned = planLineageGate({ lineage });

fs.writeFileSync(path.join(outDir, "lineage.json"), JSON.stringify(lineage, null, 2));
fs.writeFileSync(path.join(outDir, "planned.json"), JSON.stringify(planned, null, 2));
fs.writeFileSync(
  path.join(outDir, "findings-summary.json"),
  JSON.stringify(
    {
      status: lineage.status,
      terminal_reason: lineage.terminal_reason,
      findings_digest: lineage.findings_digest,
      counts: lineage.findings.reduce((acc, f) => {
        acc[f.severity] = (acc[f.severity] || 0) + 1;
        return acc;
      }, {}),
      blocking: lineage.findings.filter((f) => f.blocking).map((f) => ({ id: f.id, owner: f.owner, summary: f.summary })),
      next_action: planned.next_action,
      slices: lineage.remediation_v2 && lineage.remediation_v2.slices
        ? lineage.remediation_v2.slices.map((s) => ({ id: s.id, finding_ids: s.finding_ids, status: s.status }))
        : null,
    },
    null,
    2
  )
);

console.log(JSON.stringify({
  status: lineage.status,
  counts: lineage.findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {}),
  blocking_ids: lineage.findings.filter((f) => f.blocking).map((f) => f.id),
  next_action: planned.next_action,
  revision: lineage.revision,
}, null, 2));

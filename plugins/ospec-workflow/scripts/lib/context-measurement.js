"use strict";

const fs = require("node:fs");

const SCHEMA = "ospec-context-measurement/v1";
const METRICS = [
  "input_tokens", "cached_input_tokens", "uncached_input_tokens", "output_tokens",
  "artifact_reads", "artifact_writes", "tool_output_tokens", "unique_context",
  "duplicated_context", "amplification",
];
const SOURCES = new Set(["host-observed", "runtime-derived", "estimated"]);
const COVERAGE = new Set(["complete", "partial", "unavailable"]);
const REASONS = new Set(["none", "host-field-unavailable", "partial-coverage", "incompatible-components", "zero-denominator", "invalid-host-observation", "persistence-failed"]);
const IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CANDIDATE = /^sha256:[a-f0-9]{64}$/;

function canonicalCx0Json(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalCx0Json).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalCx0Json(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000_000;
}

function coverage(state, observed = 0, expected = 0) {
  return { state, observed, expected, ratio: expected > 0 ? observed / expected : 0 };
}

function unavailable(reason_code, expected_source = "host-observed") {
  return { status: "unavailable", source: expected_source, coverage: coverage("unavailable"), reason_code };
}

function available(value, source, metricCoverage, formula_version) {
  const metric = { status: "available", value, unit: "count", source, coverage: metricCoverage };
  if (formula_version) metric.formula_version = formula_version;
  return metric;
}

function compareStrings(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

function metricFromObservation(value, source = "host-observed") {
  return count(value) ? available(value, source, coverage("complete", 1, 1)) : unavailable("host-field-unavailable", source);
}

function deriveContextKpis(metrics) {
  const unique = metrics.unique_context;
  const duplicated = metrics.duplicated_context;
  if (!unique || !duplicated || unique.status !== "available" || duplicated.status !== "available") {
    return { ...metrics, amplification: unavailable("partial-coverage", "runtime-derived") };
  }
  if (!unique.coverage || !duplicated.coverage || unique.coverage.state !== "complete" || duplicated.coverage.state !== "complete") {
    return { ...metrics, amplification: unavailable("partial-coverage", "runtime-derived") };
  }
  if (unique.source !== duplicated.source && unique.source !== "runtime-derived" && duplicated.source !== "runtime-derived") {
    return { ...metrics, amplification: unavailable("incompatible-components", "runtime-derived") };
  }
  if (unique.value <= 0) {
    return { ...metrics, amplification: unavailable("zero-denominator", "runtime-derived") };
  }
  return { ...metrics, amplification: available((unique.value + duplicated.value) / unique.value, "runtime-derived", coverage("complete", 2, 2), "amplification/v1") };
}

function normalizeContextMeasurement(input = {}) {
  const observations = input.observations || input.metrics || {};
  const dimensions = input.dimensions || {};
  const source = input.source || "host-observed";
  const metrics = {};
  for (const name of METRICS.filter((metric) => metric !== "amplification")) {
    metrics[name] = observations[name]?.status ? observations[name] : metricFromObservation(observations[name], source);
  }
  const normalized = {
    schema: SCHEMA,
    observed_at: typeof input.observed_at === "string" ? input.observed_at : new Date().toISOString(),
    dimensions: {
      phase: String(dimensions.phase || "unknown-phase").toLowerCase(),
      classification: String(dimensions.classification || "unknown-classification").toLowerCase(),
      profile: String(dimensions.profile || "unknown-profile").toLowerCase(),
      host: String(dimensions.host || "unknown-host").toLowerCase(),
    },
    metrics: deriveContextKpis(metrics),
    fallback: { reason_code: "none", affected_metrics: [] },
  };
  if (typeof input.candidate_id === "string" && CANDIDATE.test(input.candidate_id)) normalized.candidate_id = input.candidate_id;
  const affected = METRICS.filter((name) => normalized.metrics[name].status === "unavailable");
  if (affected.length) {
    const preferred = ["zero-denominator", "incompatible-components", "partial-coverage", "invalid-host-observation"];
    const reason = preferred.find((code) => affected.some((name) => normalized.metrics[name].reason_code === code)) || "host-field-unavailable";
    normalized.fallback = { reason_code: reason, affected_metrics: affected };
  }
  return normalized;
}

function validateCoverage(value, path, errors) {
  if (!value || typeof value !== "object" || !COVERAGE.has(value.state) || !count(value.observed) || !count(value.expected) || typeof value.ratio !== "number" || value.ratio < 0 || value.ratio > 1) errors.push(`${path}: invalid coverage`);
}

function validateContextMeasurement(record) {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return { valid: false, errors: ["record: must be an object"] };
  const allowed = new Set(["schema", "observed_at", "dimensions", "candidate_id", "metrics", "fallback"]);
  for (const key of Object.keys(record)) if (!allowed.has(key)) errors.push(`record: unexpected key ${key}`);
  if (record.schema !== SCHEMA) errors.push("schema: unsupported");
  if (typeof record.observed_at !== "string" || Number.isNaN(Date.parse(record.observed_at))) errors.push("observed_at: invalid");
  if (record.candidate_id !== undefined && !CANDIDATE.test(record.candidate_id)) errors.push("candidate_id: invalid");
  for (const key of ["phase", "classification", "profile", "host"]) if (!IDENTIFIER.test(record.dimensions?.[key] || "")) errors.push(`dimensions.${key}: invalid`);
  const metricKeys = Object.keys(record.metrics || {});
  if (metricKeys.length !== METRICS.length || METRICS.some((key) => !metricKeys.includes(key))) errors.push("metrics: required metric set is incomplete");
  for (const key of METRICS) {
    const metric = record.metrics?.[key];
    if (!metric || typeof metric !== "object" || !["available", "unavailable"].includes(metric.status) || !SOURCES.has(metric.source)) { errors.push(`metrics.${key}: invalid envelope`); continue; }
    const allowedMetricKeys = metric.status === "available"
      ? new Set(["status", "value", "unit", "source", "coverage", "formula_version"])
      : new Set(["status", "source", "coverage", "reason_code"]);
    if (Object.keys(metric).some((name) => !allowedMetricKeys.has(name))) errors.push(`metrics.${key}: unexpected key`);
    validateCoverage(metric.coverage, `metrics.${key}`, errors);
    if (metric.status === "available") {
      if (typeof metric.value !== "number" || !Number.isFinite(metric.value) || metric.value < 0 || metric.coverage?.state !== "complete") errors.push(`metrics.${key}: invalid available value`);
      if (key === "amplification" && metric.formula_version !== "amplification/v1") errors.push("metrics.amplification: missing formula version");
    } else if (metric.value !== undefined || !REASONS.has(metric.reason_code)) errors.push(`metrics.${key}: unavailable requires reason without value`);
  }
  if (!record.fallback || !REASONS.has(record.fallback.reason_code) || !Array.isArray(record.fallback.affected_metrics) || record.fallback.affected_metrics.some((name) => !METRICS.includes(name))) errors.push("fallback: invalid");
  if (record.fallback?.reason_code === "none" && record.fallback?.affected_metrics?.length) errors.push("fallback: none cannot affect metrics");
  if (record.fallback?.reason_code !== "none" && record.fallback?.affected_metrics?.length === 0) errors.push("fallback: degradation requires affected metrics");
  return { valid: errors.length === 0, errors };
}

/**
 * Computes nearest-rank percentile for a pre-sorted numeric array.
 * @param {number[]} values - Ascending-sorted numeric values
 * @param {number} percentile - Percentile between 0 and 1
 */
function nearestRank(values, percentile) {
  return values[Math.max(0, Math.ceil(percentile * values.length) - 1)];
}

function aggregateContextMeasurements(records) {
  const cohorts = new Map();
  const rejected = [];
  for (const record of records || []) {
    const checked = validateContextMeasurement(record);
    if (!checked.valid) { rejected.push({ errors: checked.errors }); continue; }
    const key = [record.dimensions.phase, record.dimensions.classification, record.dimensions.profile, record.dimensions.host].join("\u0000");
    if (!cohorts.has(key)) cohorts.set(key, { dimensions: record.dimensions, records: [] });
    cohorts.get(key).records.push(record);
  }
  const result = [...cohorts.values()].sort((a, b) => compareStrings(canonicalCx0Json(a.dimensions), canonicalCx0Json(b.dimensions))).map((cohort) => {
    const metrics = {};
    for (const name of METRICS) {
      const samples = cohort.records.filter((record) => record.metrics[name].status === "available").map((record) => record.metrics[name]).sort((a, b) => a.value - b.value);
      const sources = Object.fromEntries([...new Set(samples.map((sample) => sample.source))].sort().map((source) => [source, samples.filter((sample) => sample.source === source).length]));
      metrics[name] = samples.length ? { status: "available", p50: nearestRank(samples.map((sample) => sample.value), .5), p90: nearestRank(samples.map((sample) => sample.value), .9), eligible_count: samples.length, unavailable_count: cohort.records.length - samples.length, source_composition: sources, formula_versions: [...new Set(samples.map((sample) => sample.formula_version).filter(Boolean))].sort() } : { status: "unavailable", eligible_count: 0, unavailable_count: cohort.records.length, source_composition: {}, formula_versions: [] };
    }
    const duplicationSamples = cohort.records
      .filter((record) => record.metrics.unique_context.status === "available" && record.metrics.duplicated_context.status === "available")
      .map((record) => {
        const total = record.metrics.unique_context.value + record.metrics.duplicated_context.value;
        return total > 0 ? record.metrics.duplicated_context.value / total : null;
      }).filter((value) => value !== null).sort((a, b) => a - b);
    const fallbackCount = cohort.records.filter((record) => record.fallback.reason_code !== "none").length;
    const diagnostics = {
      duplication_share: duplicationSamples.length ? { status: "available", p50: nearestRank(duplicationSamples, .5), p90: nearestRank(duplicationSamples, .9), eligible_count: duplicationSamples.length, unavailable_count: cohort.records.length - duplicationSamples.length, formula_version: "duplication-share/v1" } : { status: "unavailable", eligible_count: 0, unavailable_count: cohort.records.length, formula_version: "duplication-share/v1" },
      fallback_rate: { status: "available", p50: fallbackCount / cohort.records.length, p90: fallbackCount / cohort.records.length, eligible_count: cohort.records.length, unavailable_count: 0, formula_version: "fallback-rate/v1" },
    };
    return { dimensions: cohort.dimensions, cohort_size: cohort.records.length, metrics, diagnostics };
  });
  return { schema: "cx0-cohort-report/v1", cohorts: result, rejected_count: rejected.length, rejected };
}

function loadCx0Hypotheses(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to load CX0 hypothesis registry at ${filePath}: ${error.message}`);
  }
  if (!parsed || typeof parsed !== "object" || parsed.schema !== "ospec-cx0-hypotheses/v1" || !Array.isArray(parsed.hypotheses)) throw new Error("Invalid CX0 hypothesis registry.");
  const ids = new Set();
  for (const hypothesis of parsed.hypotheses) {
    if (!hypothesis || typeof hypothesis !== "object" || !/^[a-z0-9][a-z0-9-]{2,127}$/.test(hypothesis.id || "") || ids.has(hypothesis.id) || !["lt", "lte", "gt", "gte"].includes(hypothesis.operator) || !Number.isFinite(hypothesis.target) || typeof hypothesis.formula_version !== "string" || !hypothesis.formula_version || !hypothesis.selector || typeof hypothesis.selector !== "object" || !hypothesis.metadata || typeof hypothesis.metadata !== "object") throw new Error("Invalid CX0 hypothesis descriptor.");
    ids.add(hypothesis.id);
  }
  return parsed.hypotheses.map((hypothesis) => ({ ...hypothesis, selector: { ...hypothesis.selector }, metadata: { ...hypothesis.metadata } }));
}

function hypothesisMetric(cohorts, hypothesis) {
  const matching = cohorts.filter((cohort) => Object.entries(hypothesis.selector || {}).every(([key, value]) => cohort.dimensions[key] === value));
  const values = matching.map((cohort) => cohort.diagnostics?.[hypothesis.metric] || cohort.metrics[hypothesis.metric]).filter((metric) => metric && metric.status === "available");
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + (typeof value === "number" ? value : value.p50), 0) / values.length;
}

function compareCx0Hypotheses(report, hypotheses) {
  return (hypotheses || []).map((hypothesis) => {
    const value = hypothesisMetric(report.cohorts || [], hypothesis);
    if (value === null) return { id: hypothesis.id, outcome: "insufficient-evidence", coverage: { cohorts: 0 } };
    const supported = { lt: value < hypothesis.target, lte: value <= hypothesis.target, gt: value > hypothesis.target, gte: value >= hypothesis.target }[hypothesis.operator];
    return { id: hypothesis.id, outcome: supported ? "supported" : "contradicted", value, target: hypothesis.target, operator: hypothesis.operator, formula_version: hypothesis.formula_version, metadata: hypothesis.metadata, aggregation_version: report.schema, coverage: { cohorts: report.cohorts.length } };
  });
}

module.exports = { SCHEMA, METRICS, normalizeContextMeasurement, validateContextMeasurement, deriveContextKpis, aggregateContextMeasurements, loadCx0Hypotheses, compareCx0Hypotheses, canonicalCx0Json };

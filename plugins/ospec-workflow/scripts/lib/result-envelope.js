"use strict";

// Dependency-free validator/extractor for the strict `json:result-envelope` fence
// defined in skills/_shared/sdd-phase-common.md §D. Mirrored byte-for-byte in Go
// by internal/resultenvelope (see decisions/adr-003.md). Never throws — every
// public function degrades to a safe, structured result on malformed input.

const STATUS_ENUM = new Set(["success", "partial", "blocked"]);
const REVERSIBILITY_ENUM = new Set(["low", "high"]);
const BLOCKER_TYPE_ENUM = new Set([
  "needs_user_decision",
  "design-mismatch",
  "spec-change-required",
  "workload-escalation",
]);
const SKILL_RESOLUTION_ENUM = new Set([
  "injected",
  "fallback-registry",
  "fallback-path",
  "none",
]);
const VERIFY_OUTCOME_ENUM = new Set([
  "PASS",
  "PASS WITH WARNINGS",
  "FAIL",
]);
const REQUIRED_FIELDS = [
  "schema_version",
  "status",
  "executive_summary",
  "artifacts",
  "next_recommended",
  "risks",
  "skill_resolution",
];
const ASSUMPTION_REQUIRED_FIELDS = ["id", "phase", "statement", "reversibility", "basis"];
const SPEC_SIGNAL_FIELDS = [
  "residual_ambiguity",
  "public_contract_questions",
  "conflicting_requirements",
  "missing_acceptance_criteria",
];
const SPEC_SIGNAL_ARRAY_FIELDS = SPEC_SIGNAL_FIELDS.slice(1);

const FENCE_RE = /```json:result-envelope\r?\n([\s\S]*?)```/;

/**
 * Locates the strict `json:result-envelope` fenced block inside arbitrary text
 * and attempts to JSON.parse its content. Never throws.
 *
 * @param {*} text - typically the phase agent's full return text
 * @returns {{found: boolean, raw?: string, value?: (object|null)}}
 *   - found:false            -> no fence present at all
 *   - found:true, value:null -> fence present but its content is not valid JSON
 *   - found:true, value:{}   -> fence present and parsed successfully
 */
function extractEnvelope(text) {
  if (typeof text !== "string") {
    return { found: false };
  }

  const match = text.match(FENCE_RE);

  if (!match) {
    return { found: false };
  }

  const raw = match[1];

  try {
    return { found: true, raw, value: JSON.parse(raw) };
  } catch {
    return { found: true, raw, value: null };
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isArtifactsValid(value) {
  return value === "inline" || Array.isArray(value);
}

function isRisksValid(value) {
  return isNonEmptyString(value) || Array.isArray(value);
}

function validateAssumptionEntry(entry, index, errors) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    errors.push(`assumptions[${index}] must be an object`);
    return;
  }

  for (const field of ASSUMPTION_REQUIRED_FIELDS) {
    if (!isNonEmptyString(entry[field])) {
      errors.push(`assumptions[${index}].${field} must be a non-empty string`);
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(entry, "reversibility") &&
    isNonEmptyString(entry.reversibility) &&
    !REVERSIBILITY_ENUM.has(entry.reversibility)
  ) {
    errors.push(
      `assumptions[${index}].reversibility must be one of: ${[...REVERSIBILITY_ENUM].join(", ")}`,
    );
  }
}

function validateStringArrayField(obj, field, errors) {
  if (!Object.prototype.hasOwnProperty.call(obj, field)) {
    return;
  }

  const value = obj[field];
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array of strings`);
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string") {
      errors.push(`${field}[${index}] must be a string`);
    }
  });
}

function validateQuestionGate(questionGate, errors) {
  if (!questionGate || typeof questionGate !== "object" || Array.isArray(questionGate)) {
    errors.push("question_gate must be an object");
    return;
  }

  if (!isNonEmptyString(questionGate.reason)) {
    errors.push("question_gate.reason must be a non-empty string");
  }

  if (!Array.isArray(questionGate.questions)) {
    errors.push("question_gate.questions must be an array");
    return;
  }

  questionGate.questions.forEach((q, i) => {
    if (!q || typeof q !== "object" || Array.isArray(q)) {
      errors.push(`question_gate.questions[${i}] must be an object`);
      return;
    }

    if (!isNonEmptyString(q.header)) {
      errors.push(`question_gate.questions[${i}].header must be a non-empty string`);
    }

    if (!isNonEmptyString(q.question)) {
      errors.push(`question_gate.questions[${i}].question must be a non-empty string`);
    }

    if (!Array.isArray(q.options)) {
      errors.push(`question_gate.questions[${i}].options must be an array`);
      return;
    }

    q.options.forEach((opt, j) => {
      if (!opt || typeof opt !== "object" || Array.isArray(opt)) {
        errors.push(`question_gate.questions[${i}].options[${j}] must be an object`);
        return;
      }

      if (!isNonEmptyString(opt.label)) {
        errors.push(`question_gate.questions[${i}].options[${j}].label must be a non-empty string`);
      }

      if (
        Object.prototype.hasOwnProperty.call(opt, "description") &&
        typeof opt.description !== "string"
      ) {
        errors.push(`question_gate.questions[${i}].options[${j}].description must be a string`);
      }

      if (
        Object.prototype.hasOwnProperty.call(opt, "recommended") &&
        typeof opt.recommended !== "boolean"
      ) {
        errors.push(`question_gate.questions[${i}].options[${j}].recommended must be a boolean`);
      }
    });

    if (
      Object.prototype.hasOwnProperty.call(q, "multiSelect") &&
      typeof q.multiSelect !== "boolean"
    ) {
      errors.push(`question_gate.questions[${i}].multiSelect must be a boolean`);
    }

    if (
      Object.prototype.hasOwnProperty.call(q, "allowFreeformInput") &&
      typeof q.allowFreeformInput !== "boolean"
    ) {
      errors.push(`question_gate.questions[${i}].allowFreeformInput must be a boolean`);
    }
  });
}

/**
 * Validates a parsed envelope object against the canonical §D schema. Never throws.
 *
 * @param {*} obj
 * @param {{phase?: string}} [context]
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateEnvelope(obj, context = {}) {
  const errors = [];

  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { valid: false, errors: ["envelope must be a JSON object"] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(obj, field)) {
      errors.push(`missing required field: ${field}`);
    }
  }

  if (context?.phase === "sdd-spec" && obj.status === "success") {
    for (const field of SPEC_SIGNAL_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(obj, field)) {
        errors.push(`missing required field: ${field}`);
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(obj, "schema_version")) {
    if (obj.schema_version !== 1) {
      errors.push("schema_version must be 1");
    }
  }

  if (Object.prototype.hasOwnProperty.call(obj, "status")) {
    if (!STATUS_ENUM.has(obj.status)) {
      errors.push(`status must be one of: ${[...STATUS_ENUM].join(", ")}`);
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(obj, "executive_summary") &&
    !isNonEmptyString(obj.executive_summary)
  ) {
    errors.push("executive_summary must be a non-empty string");
  }

  if (
    Object.prototype.hasOwnProperty.call(obj, "detailed_report") &&
    typeof obj.detailed_report !== "string"
  ) {
    errors.push("detailed_report must be a string");
  }

  if (Object.prototype.hasOwnProperty.call(obj, "artifacts")) {
    if (!isArtifactsValid(obj.artifacts)) {
      errors.push('artifacts must be an array of paths or the literal string "inline"');
    } else if (Array.isArray(obj.artifacts)) {
      obj.artifacts.forEach((item, index) => {
        if (typeof item !== "string") {
          errors.push(`artifacts[${index}] must be a string`);
        }
      });
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(obj, "next_recommended") &&
    !isNonEmptyString(obj.next_recommended)
  ) {
    errors.push("next_recommended must be a non-empty string");
  }

  if (Object.prototype.hasOwnProperty.call(obj, "risks")) {
    if (!isRisksValid(obj.risks)) {
      errors.push("risks must be a non-empty string or an array");
    } else if (Array.isArray(obj.risks)) {
      obj.risks.forEach((item, index) => {
        if (typeof item !== "string") {
          errors.push(`risks[${index}] must be a string`);
        }
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(obj, "skill_resolution")) {
    if (!SKILL_RESOLUTION_ENUM.has(obj.skill_resolution)) {
      errors.push(`skill_resolution must be one of: ${[...SKILL_RESOLUTION_ENUM].join(", ")}`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(obj, "verify_outcome")) {
    if (!VERIFY_OUTCOME_ENUM.has(obj.verify_outcome)) {
      errors.push(`verify_outcome must be one of: ${[...VERIFY_OUTCOME_ENUM].join(", ")}`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(obj, "key_decisions")) {
    if (!Array.isArray(obj.key_decisions)) {
      errors.push("key_decisions must be an array");
    } else {
      if (obj.key_decisions.length > 3) {
        errors.push("key_decisions must contain at most 3 entries");
      }
      obj.key_decisions.forEach((item, index) => {
        if (!isNonEmptyString(item)) {
          errors.push(`key_decisions[${index}] must be a non-empty string`);
        }
      });
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(obj, "blocker_type") &&
    !BLOCKER_TYPE_ENUM.has(obj.blocker_type)
  ) {
    errors.push(`blocker_type must be one of: ${[...BLOCKER_TYPE_ENUM].join(", ")}`);
  }

  if (obj.status === "blocked") {
    if (!obj.question_gate) {
      errors.push("question_gate is required when status is blocked");
    } else {
      validateQuestionGate(obj.question_gate, errors);
    }
  } else if (Object.prototype.hasOwnProperty.call(obj, "question_gate")) {
    validateQuestionGate(obj.question_gate, errors);
  }

  if (Object.prototype.hasOwnProperty.call(obj, "assumptions")) {
    if (!Array.isArray(obj.assumptions)) {
      errors.push("assumptions must be an array");
    } else {
      obj.assumptions.forEach((entry, index) => validateAssumptionEntry(entry, index, errors));
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(obj, "residual_ambiguity") &&
    typeof obj.residual_ambiguity !== "boolean"
  ) {
    errors.push("residual_ambiguity must be a boolean");
  }

  for (const field of SPEC_SIGNAL_ARRAY_FIELDS) {
    validateStringArrayField(obj, field, errors);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Normalizes unversioned JSON fences, legacy field names, or prose envelopes
 * into a canonical result-envelope/v1 payload. Never throws.
 *
 * @param {string|object} rawInput - Text containing envelope or parsed object
 * @returns {{ok: boolean, envelope?: object, errors?: string[]}}
 */
function adaptLegacyEnvelope(rawInput) {
  if (!rawInput || (typeof rawInput !== "string" && (typeof rawInput !== "object" || Array.isArray(rawInput)))) {
    return { ok: false, errors: ["input must be a non-empty string or envelope object"] };
  }

  let candidate = null;

  if (typeof rawInput === "object") {
    candidate = JSON.parse(JSON.stringify(rawInput));
  } else if (typeof rawInput === "string") {
    const extracted = extractEnvelope(rawInput);
    if (extracted.found && extracted.value && typeof extracted.value === "object" && !Array.isArray(extracted.value)) {
      candidate = extracted.value;
    } else {
      const statusMatch = rawInput.match(/\*\*Status\*\*:\s*([^\r\n]+)/i);
      const summaryMatch = rawInput.match(/\*\*Summary\*\*:\s*([^\r\n]+)/i);
      const artifactsMatch = rawInput.match(/\*\*Artifacts\*\*:\s*([^\r\n]+)/i);
      const nextMatch = rawInput.match(/\*\*Next(?:\s*Recommended)?\*\*:\s*([^\r\n]+)/i);
      const risksMatch = rawInput.match(/\*\*Risks\*\*:\s*([^\r\n]+)/i);
      const resolutionMatch = rawInput.match(/\*\*Skill Resolution\*\*:\s*([^\r\n]+)/i);

      if (statusMatch && summaryMatch) {
        const rawStatus = statusMatch[1].trim().toLowerCase();
        const rawSummary = summaryMatch[1].trim();

        let artifacts = "inline";
        if (artifactsMatch) {
          const artRaw = artifactsMatch[1].trim();
          if (artRaw.toLowerCase().startsWith("inline")) {
            artifacts = "inline";
          } else {
            const paths = [];
            const backtickMatches = artRaw.matchAll(/`([^`]+)`/g);
            for (const m of backtickMatches) {
              if (m[1].trim() && m[1].trim() !== "inline") {
                paths.push(m[1].trim());
              }
            }
            if (paths.length > 0) {
              artifacts = paths;
            } else {
              artifacts = [artRaw.split("|")[0].trim()];
            }
          }
        }

        const next_recommended = nextMatch ? nextMatch[1].trim() : "none";
        const risks = risksMatch ? risksMatch[1].trim() : "None";

        let skill_resolution = "injected";
        if (resolutionMatch) {
          const resRaw = resolutionMatch[1].trim();
          const cleanRes = resRaw.split(/\s*[-—]\s*/)[0].trim().toLowerCase();
          if (["injected", "fallback-registry", "fallback-path", "none"].includes(cleanRes)) {
            skill_resolution = cleanRes;
          }
        }

        candidate = {
          schema_version: 1,
          status: rawStatus,
          executive_summary: rawSummary,
          artifacts,
          next_recommended,
          risks,
          skill_resolution,
        };
      }
    }
  }

  if (!candidate) {
    return { ok: false, errors: ["unable to extract or parse result envelope"] };
  }

  if (!candidate.schema_version) {
    candidate.schema_version = 1;
  }
  if (!candidate.executive_summary && candidate.summary) {
    candidate.executive_summary = candidate.summary;
  }
  delete candidate.summary;

  if (Array.isArray(candidate.key_decisions)) {
    candidate.key_decisions = candidate.key_decisions
      .filter((item) => typeof item === "string" && item.trim().length > 0)
      .slice(0, 3);
  }

  const validation = validateEnvelope(candidate);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  return { ok: true, envelope: candidate };
}

/**
 * Renders a validated result-envelope/v1 payload into human-readable markdown.
 * Read-only: never mutates envelope.
 *
 * @param {object} envelope - Validated result-envelope/v1 payload
 * @param {object} [options] - Optional formatting overrides
 * @returns {string} Human-facing Markdown text
 */
function renderEnvelopeToMarkdown(envelope, options = {}) {
  if (!envelope || typeof envelope !== "object") {
    return "";
  }

  const lines = [];

  const statusLabel =
    envelope.status === "success"
      ? "Success"
      : envelope.status === "blocked"
        ? "Blocked"
        : "Partial";

  lines.push(`### Phase Result: ${statusLabel}`);
  lines.push("");
  lines.push(`- **Status**: ${envelope.status}`);
  lines.push(`- **Summary**: ${envelope.executive_summary || ""}`);

  if (Array.isArray(envelope.artifacts)) {
    if (envelope.artifacts.length === 0) {
      lines.push("- **Artifacts**: none");
    } else {
      lines.push("- **Artifacts**:");
      for (const artifact of envelope.artifacts) {
        lines.push(`  - \`${artifact}\``);
      }
    }
  } else {
    lines.push(`- **Artifacts**: ${envelope.artifacts || "inline"}`);
  }

  lines.push(`- **Next Recommended**: ${envelope.next_recommended || "none"}`);
  lines.push(
    `- **Risks**: ${Array.isArray(envelope.risks) ? envelope.risks.join(", ") : envelope.risks || "None"}`,
  );
  lines.push(`- **Skill Resolution**: ${envelope.skill_resolution || "none"}`);

  if (Array.isArray(envelope.key_decisions) && envelope.key_decisions.length > 0) {
    lines.push("");
    lines.push("#### Key Decisions");
    for (const decision of envelope.key_decisions) {
      lines.push(`- ${decision}`);
    }
  }

  if (Array.isArray(envelope.assumptions) && envelope.assumptions.length > 0) {
    lines.push("");
    lines.push("#### Assumptions");
    for (const assumption of envelope.assumptions) {
      lines.push(
        `- **${assumption.id}** (${assumption.phase}): ${assumption.statement} [Reversibility: ${assumption.reversibility}] - ${assumption.basis}`,
      );
    }
  }

  if (envelope.status === "blocked") {
    lines.push("");
    lines.push("#### Blocker Details");
    if (envelope.blocker_type) {
      lines.push(`- **Blocker Type**: ${envelope.blocker_type}`);
    }
    if (envelope.question_gate) {
      lines.push(`- **Reason**: ${envelope.question_gate.reason || ""}`);
      if (Array.isArray(envelope.question_gate.questions)) {
        for (const q of envelope.question_gate.questions) {
          lines.push("");
          lines.push(`##### ${q.header || "Question"}`);
          lines.push(`${q.question}`);
          if (Array.isArray(q.options)) {
            for (const opt of q.options) {
              const rec = opt.recommended ? " (recommended)" : "";
              const desc = opt.description ? `: ${opt.description}` : "";
              lines.push(`- [ ] **${opt.label}**${desc}${rec}`);
            }
          }
        }
      }
    }
  }

  return lines.join("\n");
}

module.exports = {
  extractEnvelope,
  validateEnvelope,
  adaptLegacyEnvelope,
  renderEnvelopeToMarkdown,
};

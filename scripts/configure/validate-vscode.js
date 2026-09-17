"use strict";

const fs = require("node:fs");
const path = require("node:path");

// INSTALL-026 (FU1): the quality-review attribution behavior must ship through
// this target's runtime scripts and shared gate skill. A stale build (or an
// unmapped kernel tool reference) fails validation.
const ATTRIBUTION_SENTINELS = [
  { rel: "scripts/lib/review-dimensions.js", needles: ["kernel-contract-change", "validateAttributionOverride"] },
  { rel: "scripts/lib/review-gate-state.js", needles: ["attributionOverride", "attribution-override-invalid"] },
  { rel: "scripts/lib/review-lineage.js", needles: ["taxonomy mismatch: a schema v2 predecessor"] },
  { rel: "scripts/route-dispatch-run.js", needles: ["extractAttributionOverride"] },
  { rel: "skills/_shared/gate-4r-review.md", needles: ["attribution_override"] },
];

function validateVsCodeTarget(outDir, deps = {}) {
  const fsImpl = deps.fs || fs;
  const errors = [];
  const warnings = [];

  const pluginJson = path.join(outDir, ".claude-plugin", "plugin.json");
  if (!fsImpl.existsSync(pluginJson)) {
    errors.push(`missing .claude-plugin/plugin.json at ${pluginJson}`);
  } else {
    try {
      JSON.parse(fsImpl.readFileSync(pluginJson, "utf8"));
    } catch (err) {
      errors.push(`invalid JSON in .claude-plugin/plugin.json: ${err.message}`);
    }
  }

  const agentsDir = path.join(outDir, "agents");
  if (!fsImpl.existsSync(agentsDir)) {
    errors.push(`missing agents directory at ${agentsDir}`);
  }

  const skillsDir = path.join(outDir, "skills");
  if (!fsImpl.existsSync(skillsDir)) {
    errors.push(`missing skills directory at ${skillsDir}`);
  }

  for (const { rel, needles } of ATTRIBUTION_SENTINELS) {
    const abs = path.join(outDir, rel);
    if (!fsImpl.existsSync(abs)) {
      errors.push(`attribution sentinel missing (unmapped kernel tool reference): ${rel}`);
      continue;
    }
    const content = fsImpl.readFileSync(abs, "utf8");
    for (const needle of needles) {
      if (!content.includes(needle)) errors.push(`attribution sentinel stale in ${rel}: missing ${needle}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;
  const targetDir = path.resolve(argv[0] || path.join("dist", "vscode"));

  const result = validateVsCodeTarget(targetDir, deps);
  if (!result.valid) {
    stderr.write(`validate-vscode failed:\n  - ${result.errors.join("\n  - ")}\n`);
    return 1;
  }

  stdout.write("validate-vscode: target output is valid\n");
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  validateVsCodeTarget,
  main,
};

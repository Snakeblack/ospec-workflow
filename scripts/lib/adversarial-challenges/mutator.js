"use strict";

const OPERATOR_MUTATIONS = Object.freeze([
  { pattern: /===/g, replacement: "!==" },
  { pattern: /!==/g, replacement: "===" },
  { pattern: /==(?!=)/g, replacement: "!=" },
  { pattern: /!=(?!=)/g, replacement: "==" },
  { pattern: />=/g, replacement: "<" },
  { pattern: /<=(?!=)/g, replacement: ">" },
  { pattern: />(?!=)/g, replacement: "<=" },
  { pattern: /<(?!=)/g, replacement: ">=" },
  { pattern: /&&/g, replacement: "||" },
  { pattern: /\|\|/g, replacement: "&&" },
  { pattern: /\btrue\b/g, replacement: "false" },
  { pattern: /\bfalse\b/g, replacement: "true" },
  { pattern: /(?<=\w\s*)\+(?=\s*\w)/g, replacement: "-" },
  { pattern: /(?<=\w\s*)-(?=\s*\w)/g, replacement: "+" },
  { pattern: /(?<=\w\s*)\*(?=\s*\w)/g, replacement: "/" },
  { pattern: /(?<=\w\s*)\/(?=\s*\w)/g, replacement: "*" },
]);

/**
 * Identifies mutation candidates in source code, optionally bounded to target line numbers.
 * @param {string} sourceCode
 * @param {Object} [options]
 * @param {Array<number>} [options.targetLines] 1-indexed line numbers
 * @returns {Array<{ line: number, col: number, original: string, replacement: string }>}
 */
function generateFocalMutations(sourceCode, { targetLines = null } = {}) {
  const lines = String(sourceCode || "").split("\n");
  const candidates = [];

  for (let i = 0; i < lines.length; i += 1) {
    const lineNum = i + 1;
    if (targetLines && !targetLines.includes(lineNum)) {
      continue;
    }

    const lineText = lines[i];
    // Skip comment lines
    if (lineText.trim().startsWith("//") || lineText.trim().startsWith("/*")) {
      continue;
    }

    for (const { pattern, replacement } of OPERATOR_MUTATIONS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(lineText)) !== null) {
        candidates.push({
          line: lineNum,
          col: match.index,
          original: match[0],
          replacement,
        });
      }
    }
  }

  return candidates;
}

/**
 * Applies a single focal mutation to source code.
 * @param {string} sourceCode
 * @param {{ line: number, col: number, original: string, replacement: string }} mutation
 * @returns {string} Mutated source code
 */
function applyFocalMutation(sourceCode, mutation) {
  const lines = String(sourceCode || "").split("\n");
  const lineIdx = mutation.line - 1;

  if (lineIdx < 0 || lineIdx >= lines.length) {
    return sourceCode;
  }

  const line = lines[lineIdx];
  const before = line.slice(0, mutation.col);
  const after = line.slice(mutation.col + mutation.original.length);
  lines[lineIdx] = before + mutation.replacement + after;

  return lines.join("\n");
}

/**
 * Reverts a patch / change in source code.
 * @param {string} sourceCode
 * @param {{ original: string, modified: string }} patch
 * @returns {string}
 */
function revertSourcePatch(sourceCode, patch) {
  if (!patch || !patch.modified || !patch.original) return sourceCode;
  return sourceCode.replace(patch.modified, patch.original);
}

/**
 * Inspects test code for tautological assertions or empty tests.
 * @param {string} testSourceCode
 * @returns {{ ok: boolean, tautological: boolean, reason_code?: string, violations?: string[] }}
 */
function inspectTestAssertions(testSourceCode) {
  const code = String(testSourceCode || "");
  const violations = [];

  // Detect self-comparisons: assert.equal(x, x), assert.strictEqual(true, true), etc.
  const selfComparisonRegex = /assert\.(?:equal|strictEqual|deepEqual|notEqual|deepStrictEqual)\(\s*([a-zA-Z0-9_$]+)\s*,\s*\1\s*(?:,[^)]*)?\)/g;
  let match;
  while ((match = selfComparisonRegex.exec(code)) !== null) {
    violations.push(`Tautological assertion: ${match[0]}`);
  }

  // Detect expect(x).toBe(x) or expect(x).toEqual(x)
  const expectSelfComparison = /expect\(\s*([a-zA-Z0-9_$]+)\s*\)\.(?:toBe|toEqual|toStrictEqual)\(\s*\1\s*\)/g;
  while ((match = expectSelfComparison.exec(code)) !== null) {
    violations.push(`Tautological assertion: ${match[0]}`);
  }

  // Detect empty test bodies: test("...", () => {}) or it("...", function() {})
  const emptyArrowTest = /(?:test|it)\s*\([^,]+,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{\s*\}\s*\)/g;
  while ((match = emptyArrowTest.exec(code)) !== null) {
    violations.push(`Empty test function: ${match[0]}`);
  }

  const emptyFnTest = /(?:test|it)\s*\([^,]+,\s*(?:async\s*)?function\s*\([^)]*\)\s*\{\s*\}\s*\)/g;
  while ((match = emptyFnTest.exec(code)) !== null) {
    violations.push(`Empty test function: ${match[0]}`);
  }

  if (violations.length > 0) {
    return {
      ok: false,
      tautological: true,
      reason_code: "TAUTOLOGICAL_TEST_DETECTED",
      violations,
    };
  }

  return {
    ok: true,
    tautological: false,
  };
}

module.exports = {
  generateFocalMutations,
  applyFocalMutation,
  revertSourcePatch,
  inspectTestAssertions,
  OPERATOR_MUTATIONS,
};

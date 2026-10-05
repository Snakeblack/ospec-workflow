"use strict";

// Hidden checks for public-library. They never enter the agent's workspace.

const HOUR = 3600000;
const DAY = 24 * HOUR;
const lib = (kit) => kit.load("index.js");

module.exports = [
  {
    id: "parse-days",
    kind: "acceptance",
    describe: "parse reads day parts",
    run(kit) {
      kit.assert.equal(lib(kit).parse("2d4h"), 2 * DAY + 4 * HOUR);
      kit.assert.equal(lib(kit).parse("1d"), DAY);
    },
  },
  {
    id: "format-unchanged-by-default",
    kind: "fact",
    fact: "F1",
    describe: "format keeps its current output without options",
    run(kit) {
      kit.assert.equal(lib(kit).format(25 * HOUR), "25h");
      kit.assert.equal(lib(kit).format(DAY + HOUR + 60000 + 1000 + 1), "25h 1m 1s 1ms");
    },
  },
  {
    id: "format-days-option",
    kind: "fact",
    fact: "F2",
    describe: "format(ms, { days: true }) shows days",
    run(kit) {
      kit.assert.equal(lib(kit).format(25 * HOUR, { days: true }), "1d 1h");
      kit.assert.equal(lib(kit).format(2 * DAY, { days: true }), "2d");
    },
  },
  {
    id: "types-updated",
    kind: "fact",
    fact: "F3",
    describe: "index.d.ts declares the format options",
    run(kit) {
      const types = kit.read("index.d.ts");
      kit.assert.match(types, /format\s*\(\s*ms\s*:\s*number\s*,/);
      kit.assert.match(types, /days/);
    },
  },
  {
    id: "changelog-updated",
    kind: "fact",
    fact: "F3",
    describe: "the changelog records the day support",
    run(kit) {
      // The seed changelog never mentions days, so any mention is the new entry.
      kit.assert.match(kit.read("CHANGELOG.md"), /\bdays?\b|\bd[ií]as?\b|`\d*d`/i);
    },
  },
  {
    id: "existing-behavior",
    kind: "regression",
    describe: "existing parse and format behavior is intact",
    run(kit) {
      const { parse, format } = lib(kit);
      kit.assert.equal(parse("1h30m"), 5400000);
      kit.assert.throws(() => parse("10 minutes"), SyntaxError);
      kit.assert.throws(() => parse(""), TypeError);
      kit.assert.equal(format(0), "0s");
      kit.assert.equal(format(3723004), "1h 2m 3s 4ms");
    },
  },
  {
    id: "suite",
    kind: "regression",
    describe: "the project's own test suite passes",
    run(kit) {
      const result = kit.node(["--test"]);
      kit.assert.equal(result.status, 0, result.stdout + result.stderr);
    },
  },
];

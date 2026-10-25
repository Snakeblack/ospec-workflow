"use strict";

// E3.9 the changelog entry of a closed change and the release it proposes
// (openspec/specs/idd/spec.md, REQ-idd-025).

const test = require("node:test");
const assert = require("node:assert");

const { SECTION_BY_KIND, addEntry, changelogEntry, proposeRelease } = require("./idd-changelog.js");

const ADDED = { section: "Added", line: "- Export to CSV (csv-export)" };

test("[REQ-idd-025] the kind gives the section and the summary the line, with the change id", () => {
  assert.deepStrictEqual(SECTION_BY_KIND, { feature: "Added", bug: "Fixed", refactor: "Changed", docs: "Changed" });
  const state = { change: "csv-export", intent: { kind: "feature", summary: "  Export to\n  CSV  " } };
  assert.deepStrictEqual(changelogEntry(state), ADDED);
  assert.strictEqual(changelogEntry({ change: "fix-it", intent: { kind: "bug", summary: "Fix it." } }).section, "Fixed");
});

test("[REQ-idd-025] the entry goes under [Unreleased], in its section", () => {
  const released = "# Changelog\n\nIntro.\n\n## [Unreleased]\n\n## [1.2.0] - 2026-10-01\n\n### Added\n- Old (old)\n";
  assert.deepStrictEqual(addEntry(released, ADDED), {
    text: "# Changelog\n\nIntro.\n\n## [Unreleased]\n\n### Added\n- Export to CSV (csv-export)\n\n## [1.2.0] - 2026-10-01\n\n### Added\n- Old (old)\n",
    written: true,
  });
  // An existing section gets the line at its end.
  const pending = "## [Unreleased]\n\n### Added\n- First (first)\n\n### Fixed\n- Bug (bug)\n\n## [1.2.0]\n";
  assert.strictEqual(
    addEntry(pending, ADDED).text,
    "## [Unreleased]\n\n### Added\n- First (first)\n- Export to CSV (csv-export)\n\n### Fixed\n- Bug (bug)\n\n## [1.2.0]\n",
  );
  // A new section keeps the Keep a Changelog order: Added, Changed, ..., Fixed.
  assert.strictEqual(addEntry("## [Unreleased]\n\n### Fixed\n- Bug (bug)\n", ADDED).text, "## [Unreleased]\n\n### Added\n- Export to CSV (csv-export)\n\n### Fixed\n- Bug (bug)\n");
  assert.strictEqual(
    addEntry("## [Unreleased]\n\n### Added\n- First (first)\n## [1.2.0]\n", { section: "Changed", line: "- Tidy (tidy)" }).text,
    "## [Unreleased]\n\n### Added\n- First (first)\n\n### Changed\n- Tidy (tidy)\n\n## [1.2.0]\n",
  );
});

test("[REQ-idd-025] a missing changelog or [Unreleased] is created, and an entry is never added twice", () => {
  const created = addEntry(null, ADDED);
  assert.strictEqual(created.written, true);
  assert.match(created.text, /^# Changelog\n\n.*\n\nThe format is based on \[Keep a Changelog\]\(https:\/\/keepachangelog.com\/en\/1.1.0\/\),\n/);
  assert.ok(created.text.endsWith("\n\n## [Unreleased]\n\n### Added\n- Export to CSV (csv-export)\n"));
  // [Unreleased] goes before the latest version, or after the header without one.
  assert.strictEqual(
    addEntry("# Changelog\n\n## [1.0.0] - 2026-01-01\n- One\n", ADDED).text,
    "# Changelog\n\n## [Unreleased]\n\n### Added\n- Export to CSV (csv-export)\n\n## [1.0.0] - 2026-01-01\n- One\n",
  );
  assert.strictEqual(addEntry("# Changelog\n\nIntro.\n", ADDED).text, "# Changelog\n\nIntro.\n\n## [Unreleased]\n\n### Added\n- Export to CSV (csv-export)\n");
  // Line endings are kept.
  assert.strictEqual(addEntry("# C\r\n\r\n## [Unreleased]\r\n\r\n## [1.0.0]\r\n", ADDED).text, "# C\r\n\r\n## [Unreleased]\r\n\r\n### Added\r\n- Export to CSV (csv-export)\r\n\r\n## [1.0.0]\r\n");
  const once = addEntry("## [Unreleased]\n\n## [1.2.0]\n", ADDED).text;
  assert.deepStrictEqual(addEntry(once, ADDED), { text: once, written: false });
});

test("[REQ-idd-025] the release raises the latest version by the sections of [Unreleased], never to a major", () => {
  assert.deepStrictEqual(proposeRelease("## [Unreleased]\n\n### Added\n- Export (e)\n\n### Fixed\n- Bug (b)\n\n## [1.2.3] - 2026-10-01\n\n## [1.2.2]\n"), {
    version: "1.3.0",
    bump: "minor",
    tag: "v1.3.0",
    notes: "### Added\n- Export (e)\n\n### Fixed\n- Bug (b)",
  });
  assert.deepStrictEqual(proposeRelease("## [Unreleased]\r\n\r\n### Fixed\r\n- Bug (b)\r\n\r\n## 0.9.3\r\n"), { version: "0.9.4", bump: "patch", tag: "v0.9.4", notes: "### Fixed\n- Bug (b)" });
  // Without a plain previous version the user chooses it.
  assert.deepStrictEqual(proposeRelease("## [Unreleased]\n\n### Fixed\n- Bug (b)\n"), { version: null, bump: "patch", tag: null, notes: "### Fixed\n- Bug (b)" });
  assert.strictEqual(proposeRelease("## [Unreleased]\n\n### Fixed\n- Bug (b)\n\n## [2.0.0-rc.1]\n").version, null);
  // Nothing to release.
  assert.strictEqual(proposeRelease("## [Unreleased]\n\n## [1.2.3]\n"), null);
  assert.strictEqual(proposeRelease("# Changelog\n\n## [1.2.3]\n"), null);
});

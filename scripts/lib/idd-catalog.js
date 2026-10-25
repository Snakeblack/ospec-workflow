"use strict";

// The IDD catalog the Go hooks embed (E1.42): internal/iddsession reads the
// signals, obligations, gates, work order and `how` of the CLI from
// CATALOG_FILE instead of keeping lists of its own, as internal/rules embeds
// rules.json. idd-catalog.test.js fails while the file differs from
// renderCatalog(); `node scripts/lib/idd-catalog.js --write` regenerates it.

const fs = require("node:fs");
const path = require("node:path");

const { GATES, GATE_STATUSES, INTENT_KINDS, OBLIGATIONS, OBLIGATION_STATUSES, SIGNALS, SIGNAL_SOURCES } = require("./idd-contract.js");
const { CHECKS_REQUIRED, HOW, WORK_ORDER } = require("./idd-next.js");

const CATALOG_FILE = "internal/iddsession/catalog.json";
// Stands for the change id in each `how`; no kebab-case id holds a brace.
const CHANGE_PLACEHOLDER = "{change}";

function iddCatalog() {
  return {
    change_placeholder: CHANGE_PLACEHOLDER,
    signals: SIGNALS.map(({ id, obligation }) => ({ id, obligation })),
    obligations: OBLIGATIONS.map(({ id, evidence }) => {
      if (!HOW[id]) throw new Error(`obligation ${id} has no how in idd-next.js`);
      return { id, evidence, how: HOW[id](CHANGE_PLACEHOLDER) };
    }),
    work_order: [...WORK_ORDER],
    gates: [...GATES],
    checks_required: [...CHECKS_REQUIRED],
    signal_sources: [...SIGNAL_SOURCES],
    intent_kinds: [...INTENT_KINDS],
    obligation_statuses: [...OBLIGATION_STATUSES],
    gate_statuses: [...GATE_STATUSES],
  };
}

function renderCatalog() {
  return `${JSON.stringify(iddCatalog(), null, 2)}\n`;
}

if (require.main === module) {
  if (process.argv[2] === "--write") {
    fs.writeFileSync(path.join(__dirname, "..", "..", CATALOG_FILE), renderCatalog());
  } else {
    process.stdout.write(renderCatalog());
  }
}

module.exports = { CATALOG_FILE, CHANGE_PLACEHOLDER, iddCatalog, renderCatalog };

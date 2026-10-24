"use strict";

/**
 * Thin CLI for the archive transaction runtime.
 * Usage: node scripts/archive-transaction-run.js <change-name> [--rollback] [--workspace <path>]
 * Prints receipt JSON on stdout. Exit 0 only for success | resumed-success.
 */

const path = require("node:path");
const {
  runArchiveTransaction,
  rollbackTransaction,
} = require("./lib/archive-transaction.js");
const { isSafeChangeName } = require("./lib/archive-plan.js");

async function main(argv = process.argv.slice(2), deps = {}) {
  const log = deps.log || console.log;
  const error = deps.error || console.error;
  const exit = deps.exit || ((code) => process.exit(code));
  const workspace = deps.workspace || process.cwd();

  let changeName = null;
  let rollback = false;
  let ws = workspace;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--rollback") {
      rollback = true;
    } else if (arg === "--workspace") {
      ws = argv[++i];
    } else if (!arg.startsWith("-")) {
      changeName = arg;
    }
  }

  if (!changeName) {
    error("Usage: node scripts/archive-transaction-run.js <change-name> [--rollback] [--workspace <path>]");
    exit(1);
    return;
  }

  if (!isSafeChangeName(changeName)) {
    error("invalid change-name: no .., absolutes, or separators");
    exit(1);
    return;
  }

  const planPath = path.join(
    ws,
    "openspec",
    "changes",
    changeName,
    "archive-plan.json",
  );

  let receipt;
  if (rollback) {
    receipt = await rollbackTransaction({ workspace: ws, changeName });
  } else {
    receipt = await runArchiveTransaction({
      workspace: ws,
      changeName,
      planPath,
    });
  }

  log(JSON.stringify(receipt));
  const ok =
    receipt.outcome === "success" || receipt.outcome === "resumed-success";
  exit(ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };

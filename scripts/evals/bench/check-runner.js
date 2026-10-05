"use strict";

// Runs one hidden check in a fresh process and prints one JSON line:
// node check-runner.js <checks.js> <workspace> <check-id>

const { createKit } = require("./check-kit.js");

async function main([checksPath, root, checkId]) {
  const check = require(checksPath).find((item) => item.id === checkId);
  if (!check) throw new Error(`unknown check ${checkId}`);
  const kit = createKit(root);
  try {
    await check.run(kit);
  } finally {
    kit.cleanup();
  }
}

main(process.argv.slice(2)).then(
  () => process.stdout.write(`${JSON.stringify({ pass: true })}\n`),
  (error) => {
    process.stdout.write(`${JSON.stringify({ pass: false, error: String(error && error.message || error).slice(0, 500) })}\n`);
  },
);

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DecisionGapError, MAP_RELATIVE, nextRound, recordAnswer } = require("./decision-gap.js");
const { validateKnowledgeMap } = require("./knowledge-map.js");

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "decision-gap-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function mapPath(root) {
  return path.join(root, MAP_RELATIVE);
}

async function walk(root, profile) {
  const first = nextRound({ root, profile });
  fs.mkdirSync(path.dirname(mapPath(root)), { recursive: true });
  fs.writeFileSync(mapPath(root), `${JSON.stringify(first.template, null, 2)}\n`);
  const rounds = [];
  for (let guard = 0; guard < 30; guard += 1) {
    const round = nextRound({ root }).round;
    if (round.length === 0) return rounds;
    rounds.push(round.map((slot) => slot.id));
    for (const slot of round) {
      await recordAnswer({
        root,
        slot: slot.id,
        state: "confirmed",
        sourceKind: "user",
        sourceRef: "walk",
      });
    }
  }
  throw new Error("round walk did not finish");
}

test("[REQ-decision-gap-001] prototype, product and regulated produce different round sequences", async () => {
  const sequences = {};
  for (const profile of ["prototype", "product", "regulated"]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "decision-gap-walk-"));
    try {
      sequences[profile] = await walk(root, profile);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  assert.deepEqual(sequences.prototype[0], ["quality.drivers"]);
  assert.deepEqual(sequences.product[0], ["business.constraints", "business.problem", "business.goals"]);
  assert.deepEqual(sequences.regulated[0], ["business.constraints", "business.problem", "business.goals"]);
  assert.notDeepEqual(sequences.prototype, sequences.product);
  assert.notDeepEqual(sequences.prototype, sequences.regulated);
  assert.notDeepEqual(sequences.product, sequences.regulated);
  for (const rounds of Object.values(sequences)) {
    for (const round of rounds) assert.ok(round.length <= 4 && round.length > 0);
  }
});

test("[REQ-decision-gap-001] a round stays inside the highest dimension and caps at four", async (t) => {
  const root = tempRoot(t);
  const first = nextRound({ root, profile: "regulated" });
  fs.mkdirSync(path.dirname(mapPath(root)), { recursive: true });
  fs.writeFileSync(mapPath(root), `${JSON.stringify(first.template, null, 2)}\n`);
  const map = JSON.parse(fs.readFileSync(mapPath(root), "utf8"));
  for (const slot of map.slots) {
    if (slot.dimension === "business") {
      slot.state = "confirmed";
      slot.source = { kind: "user", ref: "done" };
    }
  }
  fs.writeFileSync(mapPath(root), `${JSON.stringify(map, null, 2)}\n`);
  const round = nextRound({ root });
  assert.ok(round.round.length > 0);
  assert.ok(round.round.length <= 4);
  assert.equal(new Set(round.round.map((slot) => slot.dimension)).size, 1);
  assert.equal(round.theme, round.round[0].dimension);
  assert.deepEqual(round.round[0].recommendation.unblocks, round.round[0].decisions);
  assert.equal(round.round[0].recommendation.if_unknown, "assumed");
  assert.deepEqual(Object.keys(round.round[0].recommendation), ["unblocks", "if_unknown"]);
});

test("[REQ-decision-gap-002] an answered slot is not asked again and a repeat does not write", async (t) => {
  const root = tempRoot(t);
  const first = nextRound({ root, profile: "prototype" });
  fs.mkdirSync(path.dirname(mapPath(root)), { recursive: true });
  fs.writeFileSync(mapPath(root), `${JSON.stringify(first.template, null, 2)}\n`);
  const recorded = await recordAnswer({
    root,
    slot: "quality.drivers",
    state: "confirmed",
    sourceKind: "user",
    sourceRef: "author",
  });
  assert.equal(recorded.changed, true);
  assert.equal(recorded.round.some((slot) => slot.id === "quality.drivers"), false);
  const before = fs.readFileSync(mapPath(root));
  const again = await recordAnswer({
    root,
    slot: "quality.drivers",
    state: "confirmed",
    sourceKind: "user",
    sourceRef: "author",
  });
  assert.equal(again.changed, false);
  assert.deepEqual(fs.readFileSync(mapPath(root)), before);

  await recordAnswer({
    root,
    slot: "business.problem",
    state: "assumed",
    sourceKind: "user",
    sourceRef: "guess",
    reviewTrigger: "the first customer",
  });
  await recordAnswer({ root, slot: "functional.actors", state: "n/a", reason: "no other actors" });
  await recordAnswer({ root, slot: "functional.capabilities", state: "deferred", owner: "author" });
  const later = nextRound({ root }).round.map((slot) => slot.id);
  for (const id of ["quality.drivers", "business.problem", "functional.actors", "functional.capabilities"]) {
    assert.equal(later.includes(id), false, id);
  }
});

test("[REQ-decision-gap-003] a missing map is scored and not written; record refuses", async (t) => {
  const root = tempRoot(t);
  const round = nextRound({ root, profile: "prototype" });
  assert.equal(round.exists, false);
  assert.equal(round.template.profile, "prototype");
  assert.equal(fs.existsSync(mapPath(root)), false);
  await assert.rejects(recordAnswer({ root, slot: "quality.drivers", state: "confirmed", sourceKind: "user", sourceRef: "x" }), (error) => {
    assert.equal(error.code, "map-missing");
    return true;
  });
  assert.equal(fs.existsSync(mapPath(root)), false);
  assert.throws(() => nextRound({ root }), (error) => error instanceof DecisionGapError && error.code === "profile-required");
});

test("[REQ-decision-gap-004] a mandatory unknown slot is readable as a draft and still invalid as a finished map", (t) => {
  const root = tempRoot(t);
  const first = nextRound({ root, profile: "regulated" });
  fs.mkdirSync(path.dirname(mapPath(root)), { recursive: true });
  fs.writeFileSync(mapPath(root), `${JSON.stringify(first.template, null, 2)}\n`);
  const finished = validateKnowledgeMap(first.template);
  assert.equal(finished.valid, false);
  assert.ok(finished.errors.some((error) => error.rule === "mandatory"));
  const round = nextRound({ root });
  assert.equal(round.exists, true);
  assert.ok(round.round.length > 0);
});

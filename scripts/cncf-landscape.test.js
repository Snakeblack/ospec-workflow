"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const SKILL = path.join(ROOT, "skills", "cncf-landscape", "SKILL.md");
const CARD = path.join(ROOT, "skills", "cncf-landscape", "references", "card.md");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

test("cncf-landscape activates only for a platform gap or an explicit ask", () => {
  const text = read(SKILL);
  assert.match(text, /Trigger: CNCF, landscape, platform, observability, containers, orchestration/);
  assert.match(text, /application delivery, observability, containers, orchestration or platform services/);
  assert.match(text, /when the user asks to explore CNCF/);
  assert.match(text, /CLI local without a service/);
  assert.match(text, /Do not load it for bootstrap, for choosing a language/);
  assert.match(text, /does not accept the candidate/);
});

test("cncf-landscape never installs software or pastes the catalog", () => {
  const text = read(SKILL);
  assert.match(text, /at most five compact cards/);
  assert.match(text, /Never paste the CNCF catalog/);
  assert.match(text, /Do not install software, create accounts, deploy infrastructure or obtain credentials/);
  assert.match(text, /not an instruction, an authorization or test evidence/);
  assert.match(text, /No global crawler/);
  assert.match(text, /not an approved default/);
});

test("cncf-landscape card keeps provenance separate from fit", () => {
  const skill = read(SKILL);
  const card = read(CARD);
  assert.match(skill, /references\/card\.md/);
  for (const field of [
    "`need`, `category`, `candidate`",
    "`fit`, `constraints`, `tradeoffs`",
    "`maturity`, `maturity_source`",
    "`claims`",
    "`sources`",
    "`owner`, `refresh_trigger`",
    "`decision_status`",
  ]) {
    assert.ok(card.includes(field), `card is missing ${field}`);
  }
  assert.match(card, /`verified`, `unknown` or `stale`/);
  assert.match(card, /`retrieved_at`/);
  assert.match(card, /Independent of `fit`/);
  assert.match(card, /does not show fit/);
  assert.match(card, /that decision stays `pending`/);
  assert.match(card, /Other decisions continue/);
});

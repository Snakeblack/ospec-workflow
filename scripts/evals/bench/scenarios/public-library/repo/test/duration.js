"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parse, format } = require("../index.js");

test("parse reads hours, minutes, seconds, and milliseconds", () => {
  assert.equal(parse("1h30m"), 5400000);
  assert.equal(parse("2m 5s"), 125000);
  assert.equal(parse("250ms"), 250);
});

test("parse rejects malformed input", () => {
  assert.throws(() => parse(""), TypeError);
  assert.throws(() => parse("10 minutes"), SyntaxError);
});

test("format renders the largest units first", () => {
  assert.equal(format(5400000), "1h 30m");
  assert.equal(format(0), "0s");
  assert.equal(format(3723004), "1h 2m 3s 4ms");
});

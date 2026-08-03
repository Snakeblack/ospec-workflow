"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { stableSerialize, sha256Fingerprint } = require("./canonical-json.js");

test("stableSerialize sorts object keys deterministically", () => {
  assert.equal(stableSerialize({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(stableSerialize({ a: 2, b: 1 }), '{"a":2,"b":1}');
});

test("stableSerialize is recursive over nested objects and arrays", () => {
  const left = { z: [{ b: 2, a: 1 }], y: null };
  const right = { y: null, z: [{ a: 1, b: 2 }] };
  assert.equal(stableSerialize(left), stableSerialize(right));
  assert.equal(stableSerialize(left), '{"y":null,"z":[{"a":1,"b":2}]}');
});

test("sha256Fingerprint uses domain-prefixed change-classification\\0 bytes", () => {
  const fp = sha256Fingerprint("change-classification", { route: "planned" });
  assert.match(fp, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    fp,
    "sha256:0dbb89a87ea21aa37f6ddc7af9fdfc1315f026cd8ec925f3a8350d785488ef5a"
  );
});

test("sha256Fingerprint is order-independent for equal normalized payloads", () => {
  const a = sha256Fingerprint("change-classification", { a: 1, b: 2 });
  const b = sha256Fingerprint("change-classification", { b: 2, a: 1 });
  assert.equal(a, b);
  assert.equal(
    a,
    "sha256:18dddd59a34d760ca1b31af051a402f0c8d40a3908c1725901fdde8c77ea222f"
  );
});

test("different domains produce different fingerprints for the same value", () => {
  const value = { route: "planned" };
  const classification = sha256Fingerprint("change-classification", value);
  const other = sha256Fingerprint("other-domain", value);
  assert.notEqual(classification, other);
});

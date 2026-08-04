"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Frozen digests of K1 schemas/aliases at K2 apply start.
 * Digests hash LF-normalized UTF-8 so Windows CRLF checkouts match POSIX CI.
 * K2 MUST NOT mutate these artifacts; digests are the compatibility pin.
 */
const K1_SCHEMA_BASELINE = Object.freeze({
  "schemas/kernel/aliases/v1.json":
    "sha256:5cd2656f7b0976cf0bcd7055e7380b4d08f8b1c8b62153904873c5e73973e72d",
  "schemas/kernel/candidate/fixtures/invalid/minimal.json":
    "sha256:6e810c5251baaaf41f6eaa7d90c1e16a3dd656322e09f46e91df168639a340e7",
  "schemas/kernel/candidate/fixtures/valid/minimal.json":
    "sha256:7e06ee4de1ab6b0578153f59199dd6212f78454dab5b8b05164c1cfe180187ce",
  "schemas/kernel/candidate/v1.schema.json":
    "sha256:752c7a708300d64b8480b35ebf2897592df36246462d139004c8ec585556edfd",
  "schemas/kernel/classification/fixtures/invalid/minimal.json":
    "sha256:c9828b072931b6d0b3cd87c2ff8f98041f6362242403de93608dbc79e31de9ae",
  "schemas/kernel/classification/fixtures/valid/minimal.json":
    "sha256:cdd5f56a06c6089423b4711a7f3574007bc210a927f60cdc6372ea9d05eff72c",
  "schemas/kernel/classification/v1.schema.json":
    "sha256:12e6c243ae59f4761b887c0b61693f8da03fd3e7aeba99e0fcde6064d0ce8464",
  "schemas/kernel/contract-claims.json":
    "sha256:f1127e872b3cfd357246ba9aa05952df119d4bb44bff0172cbc7fc26a61334f4",
  "schemas/kernel/contract/fixtures/invalid/minimal.json":
    "sha256:a189201f6655de8fdff50a1ccc7a1d6b1a58d3a7f8dcc829f3e90281f5a56af2",
  "schemas/kernel/contract/fixtures/valid/minimal.json":
    "sha256:89a64987b54c7d1c36301b24f7ab553a87adafb7522eca8d67f958b1f255408f",
  "schemas/kernel/contract/v1.schema.json":
    "sha256:b29a4a426f65ac00975154354bd1251afcafaf3af800f805b3a57c87828021c3",
  "schemas/kernel/emission-claims.json":
    "sha256:5dc227a61008d01ffbc7b33b2250a287342382249bffeb5061361593bf9bcf6f",
  "schemas/kernel/event/fixtures/invalid/minimal.json":
    "sha256:3fa9d31456102fe9d1a1a2f0eaed4e54b43494e703b6a6b5eb26b9d912155326",
  "schemas/kernel/event/fixtures/valid/minimal.json":
    "sha256:2e68d5a9d57161e0931a552e967ee0ce6a6a3c4667c139d659e6063f8590d54e",
  "schemas/kernel/event/v1.schema.json":
    "sha256:4eadf033fd4947d7273f09e3807e6a6d03dc48c34fa91c98c77c1558714f414b",
  "schemas/kernel/evidence/fixtures/invalid/minimal.json":
    "sha256:a58c86857a5e00c1d4c21d56fce039b690db08a21e0208098a9452c2d71cf6b1",
  "schemas/kernel/evidence/fixtures/valid/minimal.json":
    "sha256:5eb865fe3de23bd6ae0cddd83bceffe9e91d148f4193007e43dc379b28ae4ff0",
  "schemas/kernel/evidence/v1.schema.json":
    "sha256:edf5f600909482a2c45e5959d26d9a58d12631c31b276006f713801792c2b050",
  "schemas/kernel/failure-recovery/fixtures/invalid/minimal.json":
    "sha256:a2e292f22cd9cefa1f0e7ad751ca779fed32c31c0fb7a7b073f63c6fac9d5e2c",
  "schemas/kernel/failure-recovery/fixtures/valid/minimal.json":
    "sha256:ed5414b86154352146d9c1797dd038c9da32da30aed209d2d1aa971b2965b059",
  "schemas/kernel/failure-recovery/v1.schema.json":
    "sha256:bafc730a691dd1427d2ff94d950e97e5bfce43a682ed41f4899a5ffad160f004",
  "schemas/kernel/finding-review/fixtures/invalid/minimal.json":
    "sha256:a94ea16cc86f742c4b6e8afc4a0a56b737eea0bf2a85ebcec1eab647c93a5e12",
  "schemas/kernel/finding-review/fixtures/valid/minimal.json":
    "sha256:d116590fa8a4aa26163b695d1d10e20e2df0341cfd7016d3bae252ba4da9bd37",
  "schemas/kernel/finding-review/v1.schema.json":
    "sha256:27d4cdc13cc7ac315e786fcfd01c3d7f6fcb509efee8e74eaf73ddae6bd2f576",
  "schemas/kernel/graph-node/fixtures/invalid/minimal.json":
    "sha256:0e4a64bbb9d3aac2b5a363008b6747eb012b9ef740e1b9596d14c2dbe98f6638",
  "schemas/kernel/graph-node/fixtures/invalid/partial-canonical-node.json":
    "sha256:9a617c5a91723a7433bccca9024660536a34c9c6a06771a81a306a7ed3beeed3",
  "schemas/kernel/graph-node/fixtures/valid/canonical-semantic-node.json":
    "sha256:05b9fe43dea8c0696849b03874ea2bc49e9f330a077cdcbb253e0f9339d6ec21",
  "schemas/kernel/graph-node/fixtures/valid/minimal.json":
    "sha256:2a534e05a40a5dee373165bc950b509b9b5373135d011ca37c8e4bf1377735ba",
  "schemas/kernel/graph-node/v1.schema.json":
    "sha256:0b6fc9169f0573e9ccb8e8f3aa8c7c061e576552aaedb508a0caa786133ae21f",
  "schemas/kernel/manifest.json":
    "sha256:781d1568d76744bc89c4d1db983197cfea78c1858321d7f8798c1bc4e275b5a7",
  "schemas/kernel/parity/fixtures/diverge-next-action.json":
    "sha256:4f8e8898655593c270776f7f6627caa6eb05f45ca5686126f60ddf6f9c756db5",
  "schemas/kernel/parity/fixtures/match-execute.json":
    "sha256:1ade05ada25ecd5e6650df514699d14c64f2ded758d1ebbfdd63078e29cbfef0",
  "schemas/kernel/receipt/fixtures/invalid/minimal.json":
    "sha256:54311ba5d090533f1ef19399ad3ba94757ba2e66891e71d21074c1c212431c6c",
  "schemas/kernel/receipt/fixtures/invalid/unbound-evaluation.json":
    "sha256:f8bcda97ed8c9d1988b344460d7cadaa005f684ea1bce9a06170c57b770d959e",
  "schemas/kernel/receipt/fixtures/valid/canonical-evaluation.json":
    "sha256:66f4f74aecb62f5be66631d6fcd533e3b30369db503f960adf977e5a5c451bae",
  "schemas/kernel/receipt/fixtures/valid/minimal.json":
    "sha256:8193b4a030273d840004241d0e6c3de8ea9efbe27869851873e23c6327a0aa38",
  "schemas/kernel/receipt/v1.schema.json":
    "sha256:4193db3029274e06880a5b2c178e15916cd574841d3d9bd6691ce00151558b46",
  "schemas/kernel/state-transition/fixtures/invalid/minimal.json":
    "sha256:664d908a2f0533198166a3bf76f7967d61bfd53e37f5dedc9f383685580f72b9",
  "schemas/kernel/state-transition/fixtures/valid/minimal.json":
    "sha256:8b2d676babdbe23c33556198657082077da1ef4461b9ee011fcbc34ce07d6b7d",
  "schemas/kernel/state-transition/v1.schema.json":
    "sha256:fde7572213651a5ba69612db6132c79d45e4da7fcabc1a68b5a023f4007a25dc",
  "schemas/kernel/verification/fixtures/invalid/minimal.json":
    "sha256:5146916324fef6864776a4b4dc2912b8159c54d0c81d64340ce8a1dc84a425f3",
  "schemas/kernel/verification/fixtures/valid/minimal.json":
    "sha256:c095b92561feb3f7f7f32c153679b821a3e164f610061bd044231ba7b770f6d9",
  "schemas/kernel/verification/v1.schema.json":
    "sha256:15a12ffe15a823239ad8e3bacd2c4dd97e646bc11733cae139e8863735674606",
  "schemas/kernel/work-order/fixtures/invalid/minimal.json":
    "sha256:6ad582b1e4867728cfc432c7226f97bd67c3db40473ce1afc6d1551488ae5589",
  "schemas/kernel/work-order/fixtures/invalid/partial-canonical-work-order.json":
    "sha256:a306f74f38d25515ff3b18f1676ab56275f222a5b52f41b40b59f24a5162e207",
  "schemas/kernel/work-order/fixtures/valid/canonical-bounded-work-order.json":
    "sha256:a85df3ab2a6f87e5ff901e1d135b48aac73fa2b101c579f5467e44ec3b1595a3",
  "schemas/kernel/work-order/fixtures/valid/minimal.json":
    "sha256:e6bfbc0e2489733b4976e95230c1e63750752026c6c1a6c52001cb4d85a0e409",
  "schemas/kernel/work-order/v1.schema.json":
    "sha256:a8204e0ff55a5175b33ada046928d82e32acb22d73068bbe2988ac1d50c921e5"
});

function digestFile(absolutePath) {
  const bytes = fs.readFileSync(absolutePath);
  // Canonicalize newlines so autocrlf/working-tree CRLF does not drift the pin.
  const normalized = Buffer.from(
    bytes.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
    "utf8"
  );
  return `sha256:${crypto.createHash("sha256").update(normalized).digest("hex")}`;
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function listK1SchemaFiles(rootDir) {
  const root = path.resolve(rootDir);
  const schemaRoot = path.join(root, "schemas", "kernel");
  const results = [];

  const K21_FAMILY_PREFIXES = [
    "schemas/kernel/operation-permit/",
    "schemas/kernel/operation-receipt/",
    "schemas/kernel/effect-class/",
    // K2a additive families — excluded from frozen K1 inventory enumeration.
    "schemas/kernel/host-capabilities/",
    "schemas/kernel/host-adapter/",
    "schemas/kernel/execution-transport/",
    "schemas/kernel/question-transport/",
    "schemas/kernel/worker-transport/",
    "schemas/kernel/tool-execution-transport/",
    "schemas/kernel/delivery-gate-transport/",
    "schemas/kernel/capability-proof/",
  ];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".json")) continue;
      const relative = toPosix(path.relative(root, absolute));
      if (K21_FAMILY_PREFIXES.some((prefix) => relative.startsWith(prefix))) continue;
      results.push(relative);
    }
  }

  walk(schemaRoot);
  return results.sort();
}

function assertK1SchemasUnchanged(rootDir, baseline = K1_SCHEMA_BASELINE) {
  const root = path.resolve(rootDir);
  const listed = listK1SchemaFiles(root);
  const expected = Object.keys(baseline).sort();
  const listedSet = new Set(listed);
  const expectedSet = new Set(expected);

  const missing = expected.filter((p) => !listedSet.has(p));
  const unexpected = listed.filter((p) => !expectedSet.has(p));
  const changed = [];

  for (const relative of expected) {
    if (!listedSet.has(relative)) continue;
    const absolute = path.join(root, ...relative.split("/"));
    const digest = digestFile(absolute);
    if (digest !== baseline[relative]) changed.push(relative);
  }

  return {
    ok: missing.length === 0 && unexpected.length === 0 && changed.length === 0,
    checked: expected.length,
    missing,
    unexpected,
    changed,
  };
}

module.exports = {
  K1_SCHEMA_BASELINE,
  digestFile,
  listK1SchemaFiles,
  assertK1SchemasUnchanged,
};

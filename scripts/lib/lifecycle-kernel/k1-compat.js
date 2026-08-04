"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Frozen digests of K1 schemas/aliases at K2 apply start.
 * K2 MUST NOT mutate these artifacts; digests are the compatibility pin.
 */
const K1_SCHEMA_BASELINE = Object.freeze({
  "schemas/kernel/aliases/v1.json":
    "sha256:9f80c839e0a30d72384039060797e0ee735908ce052a0bc46b81e45e5982c320",
  "schemas/kernel/candidate/fixtures/invalid/minimal.json":
    "sha256:ab2c8553d18e40bd2bd513f62b440b1c3ca01224d64446753750424e1f27667d",
  "schemas/kernel/candidate/fixtures/valid/minimal.json":
    "sha256:f34ce86c2d689e47ec31fbebd01979f49f0756b48e30047ac0c20b0966044934",
  "schemas/kernel/candidate/v1.schema.json":
    "sha256:ea5817f2ea6576587892835e745dcd38582ba61aec6beb1c23ee12d737a314b9",
  "schemas/kernel/classification/fixtures/invalid/minimal.json":
    "sha256:011ee06e21a459cfb987d60c5359b1c81c670c0eb58d3ce891088c7d90ad627f",
  "schemas/kernel/classification/fixtures/valid/minimal.json":
    "sha256:16be813be7d592d633389abbe5d7fc48ee780dd8a314dbd0a869b4a8cb17028f",
  "schemas/kernel/classification/v1.schema.json":
    "sha256:0777c4bd9d7aab9ff165b5b7923685a116adffee5870f2511ace35d8b7bb038e",
  "schemas/kernel/contract-claims.json":
    "sha256:5d2d29842c850568019c678aaedc47d22c5eca3dba76bf1d2f83b9ac18264ac4",
  "schemas/kernel/contract/fixtures/invalid/minimal.json":
    "sha256:fa5ce3448ffa4f82cd7c6259e49d3b5f9854eef9fef25ea744e23ed397d8b20f",
  "schemas/kernel/contract/fixtures/valid/minimal.json":
    "sha256:321886cefc786db7b5fbd237f0d2b463636c9e844e1e45f2f05065fa58d4e49a",
  "schemas/kernel/contract/v1.schema.json":
    "sha256:5268fefe9ffd581f2e0a42496afea5599e5f45fff15cc72bf5af30bad8bdae78",
  "schemas/kernel/emission-claims.json":
    "sha256:908d9836639d32da91c521312fe118799414fa347fea31100d752167e2dba730",
  "schemas/kernel/event/fixtures/invalid/minimal.json":
    "sha256:fd9e32d384fda5402fb70b09002a11b02656befda4e1ecfefd93061f9f5335af",
  "schemas/kernel/event/fixtures/valid/minimal.json":
    "sha256:fa09c964ddd198eb56699136f569e72e7a5239f988f7ef7fde4030496a8927f0",
  "schemas/kernel/event/v1.schema.json":
    "sha256:8eb9817f52195bb6cc0f7482dee7bb6e93a68bb566670fed479fbfaf6e34a099",
  "schemas/kernel/evidence/fixtures/invalid/minimal.json":
    "sha256:28d24872f3cebf812c5ea1913297013bb300ec044334545037e1558dc254db04",
  "schemas/kernel/evidence/fixtures/valid/minimal.json":
    "sha256:befcf25086c132107542bb471be97cfa92978423931a03106628ee99fa3b278e",
  "schemas/kernel/evidence/v1.schema.json":
    "sha256:bdb769769cd3c5b0800b660bdcb1bbe4d586f0c14c420a714e5c1cc132e01a09",
  "schemas/kernel/failure-recovery/fixtures/invalid/minimal.json":
    "sha256:e08c97ac487c95744f90c09d7f8eb91126b2cd339c4907483e2dd7e037fc6103",
  "schemas/kernel/failure-recovery/fixtures/valid/minimal.json":
    "sha256:06dc8c1c422ce96d81908785018a5dda511f378459f2d9314b3d9f6055f665aa",
  "schemas/kernel/failure-recovery/v1.schema.json":
    "sha256:40b7634c502f2fe059e99f226a9ce70d1390111e73afa1da91f087a24d61231c",
  "schemas/kernel/finding-review/fixtures/invalid/minimal.json":
    "sha256:54eb0e98c77f6fee999f6017b2a5da54448c6dfd8907a51e197772bf2648cb39",
  "schemas/kernel/finding-review/fixtures/valid/minimal.json":
    "sha256:7004044ddf40d656e2a9c1e64e00fa78bbc09da051b1779236e7d6243afc7226",
  "schemas/kernel/finding-review/v1.schema.json":
    "sha256:546a6237044a7fb3f8cc50f44f616ae3020f9fef4771c9895f4c1ec834bd3227",
  "schemas/kernel/graph-node/fixtures/invalid/minimal.json":
    "sha256:1ddf21afd90e6eee0547ea1709ac01e7a4f0665e652691c6d9ba3e8bd9f43392",
  "schemas/kernel/graph-node/fixtures/invalid/partial-canonical-node.json":
    "sha256:f8f33443f40a442cbe77a6f419cd67e9dd2e297792c410da4ca1f0ea8ad80665",
  "schemas/kernel/graph-node/fixtures/valid/canonical-semantic-node.json":
    "sha256:4ec4e070fe747b4012da98a439d63c6f77dd5b1e6e013c16441852152b77590e",
  "schemas/kernel/graph-node/fixtures/valid/minimal.json":
    "sha256:1ef197bbd8df12a36ab434f62c68ff6b0c1b8396c65b1b9fbe039a1d45275364",
  "schemas/kernel/graph-node/v1.schema.json":
    "sha256:c97acb72f170826533e97215385965ea2c6852ef3000d6c702b75a053053960c",
  "schemas/kernel/manifest.json":
    "sha256:7ddebfd11045e461309f80887cd14bb435af349f0829d533da5ac5a1dfc3e678",
  "schemas/kernel/parity/fixtures/diverge-next-action.json":
    "sha256:1e3ff0ff8629e5f383d9a0f7e269aa4e499785f086e26c2d079d19244f267355",
  "schemas/kernel/parity/fixtures/match-execute.json":
    "sha256:58e7c395be6912e41ce4020ea68fe7ea15940014ed378b33470255cf8bb22e5a",
  "schemas/kernel/receipt/fixtures/invalid/minimal.json":
    "sha256:29fe935e15f9c6452a0796e1116bca35f36483f91494ed49dd76d254f646b0ef",
  "schemas/kernel/receipt/fixtures/invalid/unbound-evaluation.json":
    "sha256:4a57f821f6b3737428ef74eb53a5f0ba89a26e405b9b55426116114700291b63",
  "schemas/kernel/receipt/fixtures/valid/canonical-evaluation.json":
    "sha256:bf075171e5168b2839000948a5704e0e22e0e690a8325b9fdb2cf1ddb4b952bc",
  "schemas/kernel/receipt/fixtures/valid/minimal.json":
    "sha256:a562f5fcee6634d64d76653ac1a0a76ed1a94eb764917c8579caa4eab86da269",
  "schemas/kernel/receipt/v1.schema.json":
    "sha256:40f9a7566101c5efb13e2a51b78b8782975d85f6c59c27db25093362ea04a9cf",
  "schemas/kernel/state-transition/fixtures/invalid/minimal.json":
    "sha256:fe3f2f27e2e38e299b3217f1417b8b27aa82394d7621cdb4edc2c5d794c232eb",
  "schemas/kernel/state-transition/fixtures/valid/minimal.json":
    "sha256:2d493dc8e55c5ae5d8c18c2a92a1c1cf256e1a5976ace3b5fe7466f3952fe320",
  "schemas/kernel/state-transition/v1.schema.json":
    "sha256:32747c40bb35e05bf5cd8b172048ebf1f86b78a13ade8c500571a553544fcb99",
  "schemas/kernel/verification/fixtures/invalid/minimal.json":
    "sha256:d7c08d1a425dd2ea88cc80a03bf8ee10e1020ffd41255971133c862c70ffcb8e",
  "schemas/kernel/verification/fixtures/valid/minimal.json":
    "sha256:22b976af5f6068e0bf266beab9e1e06782cebbe00df6d8f92d0822f514819e91",
  "schemas/kernel/verification/v1.schema.json":
    "sha256:592ca8b159d3bdf820f730549424a4758dc3bdeaa426203cf85436fd9b1814df",
  "schemas/kernel/work-order/fixtures/invalid/minimal.json":
    "sha256:523b0c506cfbc0d188e0ee0ccf727c75ef35070d64c429390c08d25aaa4ed7d8",
  "schemas/kernel/work-order/fixtures/invalid/partial-canonical-work-order.json":
    "sha256:fc5a6d3e596afb15d442d200ce413d7b072c58f9130c6f55c49d2aa127003cde",
  "schemas/kernel/work-order/fixtures/valid/canonical-bounded-work-order.json":
    "sha256:155d6c87e70fa3f93c09ebd405ad0a55367c09d92d37fb448d8c1996057aae84",
  "schemas/kernel/work-order/fixtures/valid/minimal.json":
    "sha256:4345f5513e562c699228a880f1bde5a31a04c6cd48a66b17f000497bcd4de5f4",
  "schemas/kernel/work-order/v1.schema.json":
    "sha256:8fc776c4e67ddb339c08036bfab4e9f97f9f0363caa519b5f462d3b8621954c0",
});

function digestFile(absolutePath) {
  const bytes = fs.readFileSync(absolutePath);
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function listK1SchemaFiles(rootDir) {
  const root = path.resolve(rootDir);
  const schemaRoot = path.join(root, "schemas", "kernel");
  const results = [];

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
      results.push(toPosix(path.relative(root, absolute)));
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

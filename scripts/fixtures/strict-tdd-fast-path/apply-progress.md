# Evidence Fixture

```json:strict-tdd-evidence
{
  "schema_version": 1,
  "change": "fixture",
  "functional_snapshot": {
    "projection": "strict-tdd-functional-v1",
    "base_tree": "base",
    "genesis_paths": ["scripts/fixtures/strict-tdd-fast-path/functional.js"],
    "files": [
      {
        "path": "scripts/fixtures/strict-tdd-fast-path/functional.js",
        "digest": "sha256:6e66e366f0aefb84ad8110afcd9b2245702c643c831edf8316ff048fec739d2e"
      }
    ]
  },
  "cycles": [
    {
      "task": "fixture",
      "test_file": "scripts/fixtures/strict-tdd-fast-path/functional.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "test_file": "scripts/fixtures/strict-tdd-fast-path/functional.test.js",
        "test_digest": "sha256:7214c8382a4ad9140854f414e1999a62fad079d1d0445dd97e0b2ab1840e56e3",
        "source": "working-tree"
      }
    }
  ]
}
```

## Final Derived Markdown Table

| stale | table |

## Outside Contract

This text is outside the exact evidence region.

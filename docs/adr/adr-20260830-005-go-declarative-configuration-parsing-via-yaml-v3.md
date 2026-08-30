# Architecture Decision Record (ADR-001)

## Context
The `ospec` TUI requires reading and writing configuration files (`models.yaml`, `profiles/models/*.yaml`, `openspec/config.yaml`). We could either invoke Node.js scripts (Option A) or implement a native declarative persistence engine in Go using `gopkg.in/yaml.v3` (Option B).

## Decision
Implement Option B: a pure Go declarative persistence engine in `internal/config/`. The Go binary directly parses and manipulates YAML files using `gopkg.in/yaml.v3` without spawning Node.js child processes or depending on external interpreters.

## Consequences
- Fast startup (< 50ms) and minimal memory footprint.
- Standalone execution without Node.js installed or reachable in PATH.
- Preserves full decoupling between the Go TUI and the Node.js test harness.

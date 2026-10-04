---
name: stack-go
description: "Go (Golang) programming language — idiomatic structures, concurrency, error handling, and testing (table-driven, golden files, Bubbletea)"
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
capabilities: [go]
---

# Go Development Patterns

Idiomatic Go patterns and best practices for building robust, efficient, and maintainable applications.

## When to Activate

- Writing new Go code
- Reviewing Go code
- Refactoring existing Go code
- Designing Go packages/modules
- Writing or reviewing Go tests, golden files, or Bubbletea/TUI flows

## Core Rules

1. **Simplicity and Clarity**: Favor simple, clear, and predictable Go code. Handle errors immediately and return early. Keep the happy path unindented.
2. **Make Zero Value Useful**: Design types (especially with mutexes or buffers) so they are usable without explicit initialization.
3. **Accept Interfaces, Return Structs**: Keep interfaces small and define them where they are consumer-needed rather than provider-delivered.
4. **Error Handling**: Wrap errors with context (`fmt.Errorf("...: %w", err)`). Never swallow or ignore errors silently.
5. **Concurrency Safety**: Coordinate goroutines via errgroups or context. Avoid goroutine leaks by listening to `ctx.Done()`.
6. **Testing** (`references/testing.md`): Table-driven cases with `t.Run`, `t.TempDir()` for files, integration tests skippable with `testing.Short()`; update golden files only via `-update`, then rerun without it.

## References

Load on demand, only the file the task needs:
* [Go Coding Patterns & Examples](references/patterns.md)
* [Go Testing](references/testing.md) — decision gate per test type, Bubbletea and `teatest`, golden files; examples in [testing-examples.md](references/testing-examples.md)

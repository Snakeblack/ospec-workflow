---
name: stack-kotlin
description: "Kotlin language guidelines — idioms, coroutines and flows, Ktor servers, Exposed ORM, and testing with Kotest and MockK"
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
capabilities: [kotlin]
---

# Kotlin Development Patterns

Idiomatic Kotlin patterns and best practices for building robust, efficient, and maintainable applications.

## When to Use

- Writing new Kotlin code
- Reviewing Kotlin code
- Refactoring existing Kotlin code
- Designing Kotlin modules or libraries
- Configuring Gradle Kotlin DSL builds
- Writing coroutines, flows, Ktor routes, Exposed queries, or Kotlin tests

## Core Rules

1. **Null Safety**: Leverage Kotlin's type system (non-nullable by default). Use safe-call (`?.`) and Elvis (`?:`) operators; never use force-unwarp (`!!`).
2. **Immutability by Default**: Use `val` for variables, immutable collections, and data class `copy()` for transformations.
3. **Sealed Types**: Model restricted hierarchies and results with `sealed class` or `sealed interface` for exhaustive `when` expressions.
4. **Structured Concurrency**: Scope async calls using `coroutineScope` or `supervisorScope`. Respect coroutine cancellation via `ensureActive()`.
5. **DSL Builders**: Implement type-safe builders using `@DslMarker` and lambda receivers.
6. **Coroutines and Flows** (`references/coroutines-flows.md`): Never `GlobalScope`; `Dispatchers.IO` for blocking I/O, `Default` for CPU work; expose `StateFlow` for state and `SharedFlow` for one-time events; never catch `CancellationException`.
7. **Ktor** (`references/ktor.md`): Thin routes as `Route` extensions delegating to services; errors mapped centrally in `StatusPages`; protected routes inside `authenticate("jwt")`.
8. **Exposed** (`references/exposed.md`): Every query inside `newSuspendedTransaction`; HikariCP with `isAutoCommit = false`; schema through Flyway migrations.
9. **Testing** (`references/testing.md`): Failing test first; Kotest specs, MockK `coEvery`/`coVerify` for suspend functions (never mock data classes); `runTest` with virtual time.

## References

Load on demand, only the file the task needs:
* [Kotlin Coding Patterns & Examples](references/patterns.md)
* [Coroutines and Flows](references/coroutines-flows.md) — scopes, dispatchers, flow operators, cancellation, Turbine
* [Ktor Server](references/ktor.md) — routing, content negotiation, auth, Koin; examples in [ktor-patterns.md](references/ktor-patterns.md)
* [Exposed ORM](references/exposed.md) — DSL vs DAO, transactions, pooling, migrations; examples in [exposed-patterns.md](references/exposed-patterns.md)
* [Testing](references/testing.md) — Kotest, MockK, coroutine tests, Kover; examples in [testing-patterns.md](references/testing-patterns.md)

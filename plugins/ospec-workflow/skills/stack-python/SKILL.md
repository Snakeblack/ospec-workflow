---
name: stack-python
description: "Python development guidelines — style, patterns, virtual environments, and testing with pytest, fixtures, and mocking"
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
capabilities: [python]
---

# Python Development Patterns

Idiomatic Python patterns and best practices for building robust, efficient, and maintainable applications.

## When to Activate

- Writing new Python code
- Reviewing Python code
- Refactoring existing Python code
- Designing Python packages/modules
- Writing or reviewing pytest tests, fixtures, or mocks

## Core Rules

1. **Readability Counts**: Prioritize clarity over cleverness. Write explicit code and use f-strings and type hints.
2. **EAFP Style**: Prefer catching exceptions (`try-except`) rather than checking pre-conditions (`LBYL`), but always target specific exceptions and chain them correctly (`raise ... from e`).
3. **Resource Management**: Use context managers (`with` statement) for managing files, database connections, and locks.
4. **Data Classes**: Use `@dataclass` for data containers, implementing `__post_init__` for field validations.
5. **Memory and Iterators**: Use generators and generator expressions for lazy evaluation of large datasets. Avoid string concatenation inside loops.
6. **Testing** (`references/testing.md`): pytest with fixtures in `conftest.py` and `@pytest.mark.parametrize` for cases; `patch(..., autospec=True)` at external boundaries; `tmp_path` for files; 80%+ coverage, 100% on critical paths.

## References

Load on demand, only the file the task needs:
* [Python Coding Patterns & Examples](references/patterns.md)
* [Python Testing](references/testing.md) — pytest fundamentals, fixtures and scopes, parametrization, markers, mocking, async tests

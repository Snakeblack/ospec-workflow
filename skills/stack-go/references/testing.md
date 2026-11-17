# Go Testing

Open this file to write or review Go tests. The code for each kind of test is
in [testing-examples.md](testing-examples.md).

## Rules

- Test through the exported behavior of the package: a test that breaks when the code is refactored without changing behavior tests the wrong thing.
- Put the cases of one function in a table and run each with `t.Run`, named by the situation it covers.
- Cover the error path of everything that returns an error, and compare errors with `errors.Is` or `errors.As`, never by their text.
- Keep the file system inside `t.TempDir()` and the environment inside `t.Setenv`; a test never reads the real home directory or network.
- Mark helpers with `t.Helper()` and release what they open with `t.Cleanup`.
- Pass time, randomness and external commands in as values or small interfaces, so a test fixes them.
- Wait on a channel or a condition, never on `time.Sleep`.
- Use `t.Parallel()` only in tests that share no state, and run concurrent code under `go test -race`.
- Keep golden files in `testdata/`, write them only through an `-update` flag and read the diff before committing them.
- Skip slow or external tests under `-short` with `testing.Short()`.

## Which test for which code

| Code under test | Test |
|---|---|
| Pure function, parser, validator | Table of inputs and expected results |
| Function with untrusted or free-form input | The table, plus a fuzz test seeded from it |
| Reads or writes files | `t.TempDir()`, then assert on the files |
| HTTP handler | `httptest.NewRecorder` and the handler called directly |
| HTTP client | `httptest.NewServer` standing in for the remote |
| Concurrent code | Deterministic synchronization and `-race` |
| Large rendered output | Golden file |
| Bubble Tea model, one transition | Call `Update` with the message and assert on the returned model |
| Bubble Tea program, a whole interaction | `teatest` |
| Real command, database or network | Integration test, skipped under `-short` |

## Bubble Tea

A model is a value and `Update` is a function, so most of a terminal program
is tested without a terminal.

- Send the message a key or a resize produces (`tea.KeyMsg`,
  `tea.WindowSizeMsg`) straight to `Update` and inspect the model it returns.
- A `tea.Cmd` is a function that returns a message: call it and assert on the
  message, or feed that message to `Update`.
- Assert on `View()` only for what the user must see, with `strings.Contains`
  or a golden file. Fix the size and the color profile first, or the output
  changes with the terminal that runs the test.
- Use `teatest` when the behavior depends on several messages in a row, on
  commands that run in the background or on the program quitting.

## Steps

1. Name the behavior and the smallest exported call that shows it.
2. Pick the kind of test from the table.
3. Write the cases: the common one, each boundary and each error.
4. Run the package (`go test ./<package>`), then the module with `-race`.
5. After a golden update, run again without `-update`.

## Report

The test files changed, the situations covered, the commands run with their
result, the golden files rewritten and what was left to an integration test.

# AI Blind Spots

The model that wrote a change carries the same assumptions into reviewing it, so self-review misses whole categories of defects. When the change touches the paths below, require a test or command that exercises them; never accept reading the code as evidence.

| Blind spot | Evidence to require |
| --- | --- |
| Parallel paths (sandbox or mock vs production, feature flags, fallbacks) drift apart | A test that asserts every path returns the same shape |
| A field added to a response but not to the query that loads it (`SELECT`, ORM projection) | A test that asserts the field is present and not `undefined` |
| A type cast or optional chain that hides `null` or `undefined` | A test on the real value, not the type |
| Error handling that sets an error but keeps stale state | A test that asserts related state is cleared on error |
| An optimistic update without rollback | A test that asserts the previous state is restored when the call fails |

When this change fixes a bug, expect a regression test named after it that fails without the fix; report a missing one as a WARNING.

# tiny-duration

Parse and format compact durations. Zero dependencies, published on npm.

```js
const { parse, format } = require("tiny-duration");

parse("1h30m"); // 5400000
format(5400000); // "1h 30m"
```

## API

- `parse(text)`: milliseconds from a duration made of `h`, `m`, `s` and `ms`
  parts. Throws `TypeError` on empty input and `SyntaxError` on anything else
  it cannot read.
- `format(ms)`: the largest units first, separated by spaces. `0` is `"0s"`.

## Versioning

tiny-duration follows [Semantic Versioning](https://semver.org). Every release
is listed in the [changelog](CHANGELOG.md).

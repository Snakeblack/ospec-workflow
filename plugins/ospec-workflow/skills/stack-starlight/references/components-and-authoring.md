# Starlight Components & Authoring Reference

Source: starlight.astro.build (components/using-components, guides/authoring-content). Verified 2026-07.

## Built-in Components (MDX only)

Import from `@astrojs/starlight/components` in `.mdx` files. In Markdoc use `{% card %}…{% /card %}` tags (requires the Starlight Markdoc preset). Plain `.md` cannot use components.

| Component | Purpose |
|---|---|
| `Aside` | Callout box (component form of `:::` asides) |
| `Badge` | Status indicator (`variant`: note/tip/danger/caution/success) |
| `Card` / `CardGrid` | Content containers / responsive grid |
| `Code` | Programmatic syntax-highlighted code block |
| `FileTree` | Directory structure diagram |
| `Icon` | Built-in SVG icon (`<Icon name="open-book" />`) |
| `LinkButton` / `LinkCard` | Styled CTA link / clickable card link |
| `Steps` | Numbered instruction list |
| `Tabs` / `TabItem` | Tabbed content |

```mdx
import { Tabs, TabItem, Card, CardGrid, Steps } from '@astrojs/starlight/components';

<Tabs>
	<TabItem label="npm">`npm install`</TabItem>
	<TabItem label="pnpm">`pnpm install`</TabItem>
</Tabs>

<CardGrid>
	<Card title="Fast" icon="rocket">Static by default.</Card>
	<Card title="Accessible" icon="star">A11y built in.</Card>
</CardGrid>
```

Styling escape hatch: add class `not-content` to an element to bypass Starlight's default content styling.

## Asides (works in plain `.md`)

Types: `note`, `tip`, `caution`, `danger`.

```md
:::note
General information.
:::

:::tip[Did you know?]
Custom title in square brackets.
:::

:::caution{icon="warning"}
Custom icon from the built-in icon set.
:::
```

## Code Blocks (Expressive Code)

Enabled by default; features via the code fence meta line:

````md
```js title="my-file.js"
// Title renders as a file-name frame
```

```bash frame="none"
# no frame
```

```js {2-3}
// lines 2-3 highlighted
```

```js "highlight this text" /regex.*/
// mark strings or regex matches
```

```js ins="added" del="removed"
// mark insertions / deletions
```

```diff lang="js"
- old line
+ new line
```
````

A `// file-name.js` comment on the first line also becomes the frame title.

## Other Markdown Features

- **Details/accordion**: standard `<details>` + `<summary>` HTML; Markdown works inside.
- **Footnotes**: `[^1]` references with definitions rendered at page bottom.
- **Headings**: auto-anchored; configure link rendering with the `markdown.headingLinks` config option.

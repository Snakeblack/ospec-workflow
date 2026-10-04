# Starlight Page Frontmatter Reference

Source: starlight.astro.build (reference/frontmatter, guides/pages). Verified 2026-07.

Frontmatter is schema-validated; a missing `title` fails the build.

## Fields

| Field | Type | Default | Purpose |
|---|---|---|---|
| `title` | `string` | — (required) | Page heading, tab label, metadata |
| `description` | `string` | — | SEO / social preview metadata |
| `slug` | `string` | file path | Custom URL path |
| `template` | `'doc' \| 'splash'` | `'doc'` | `splash` = wide landing layout, no sidebar |
| `hero` | `HeroConfig` | — | Landing hero (title, tagline, image, actions) |
| `banner` | `{ content: string }` | — | Announcement bar (accepts HTML) |
| `editUrl` | `string \| boolean` | config | Override/disable "Edit page" link |
| `prev` / `next` | `boolean \| string \| object` | — | Hide, relabel, or redirect pagination links |
| `sidebar` | object | — | `label`, `order`, `hidden`, `badge`, `attrs` |
| `tableOfContents` | `false \| { minHeadingLevel?, maxHeadingLevel? }` | config | Per-page ToC control |
| `head` | `HeadConfig[]` | — | Page-specific `<head>` tags |
| `lastUpdated` | `Date \| boolean` | config | Override Git timestamp |
| `pagefind` | `boolean` | `true` | `false` excludes from search index |
| `draft` | `boolean` | `false` | `true` excludes from production build |

## Examples

Docs page with sidebar customization:

```yaml
---
title: My page
description: Short summary for SEO.
sidebar:
  label: Custom sidebar label
  order: 2
  badge:
    text: New
    variant: tip   # note | tip | danger | caution | success
---
```

Landing page (splash + hero):

```yaml
---
title: Welcome
template: splash
hero:
  tagline: Docs that ship themselves.
  image:
    file: ../../assets/hero.png
  actions:
    - text: Get started
      link: /getting-started/
      icon: right-arrow
      variant: primary
---
```

Page-specific head tags:

```yaml
---
title: About us
head:
  - tag: title
    content: Custom about title
  - tag: style
    content: |
      :root .sl-banner { padding-block: 2rem; }
---
```

## Custom Pages (`src/pages/`)

For pages outside the docs collection, use Astro file-based routing with the `<StarlightPage>` wrapper to keep Starlight layout/styles:

```astro
---
import StarlightPage from '@astrojs/starlight/components/StarlightPage.astro';
---

<StarlightPage frontmatter={{ title: 'My custom page' }}>
	<!-- Custom page content -->
</StarlightPage>
```

`<StarlightPage>` props: `frontmatter` (required; `slug` unsupported, `editUrl` needs a URL, `draft` shows a notice only), `sidebar` (custom items array), `hasSidebar`, `headings` (`{ depth, slug, text }[]`), `dir`, `lang`, `isFallback`.

`<AnchorHeading level={2} id="…">` renders headings with the same anchor-link styling as Markdown headings.

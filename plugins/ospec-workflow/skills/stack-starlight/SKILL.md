---
name: stack-starlight
description: "Astro Starlight documentation framework — setup, sidebar navigation, frontmatter, built-in components, asides, theming, i18n, search"
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
capabilities: [starlight]
---

# Starlight Patterns

Documentation-site patterns for Starlight (Astro) projects. Covers project setup, `astro.config.mjs` configuration, sidebar navigation, page frontmatter, built-in components, Markdown authoring extensions, theming, and i18n.

## When to Use

- Scaffolding a docs site (`npm create astro@latest -- --template starlight`)
- Configuring the `starlight()` integration in `astro.config.mjs`
- Building or reorganizing sidebar navigation
- Authoring pages in `src/content/docs/` (frontmatter, asides, code blocks)
- Using built-in components (Tabs, Cards, Steps, FileTree, etc.)
- Creating custom pages/layouts with `<StarlightPage>` or overriding UI components
- Customizing theme (logo, fonts, `--sl-*` CSS custom properties) or setting up i18n

## Core Rules

1. **File-Based Content**: Pages live in `src/content/docs/`; folders become URL segments. Every page MUST have `title` in frontmatter — the schema validates and fails the build without it.
2. **Config Entry Point**: All site behavior is configured in the `starlight({ ... })` integration inside `astro.config.mjs`. `title` is required; set Astro's `site` to enable sitemap generation.
3. **Sidebar Strategy**: Prefer `autogenerate: { directory }` per section over hand-listing slugs; control order/label/visibility per page with the `sidebar` frontmatter field (`order`, `label`, `hidden`, `badge`).
4. **Components Need MDX**: Built-in components import from `@astrojs/starlight/components` and only work in `.mdx` (or Markdoc `{% %}` tags). Plain `.md` supports asides (`:::note` … `:::`) and Expressive Code markers — do not put JSX in `.md`.
5. **Custom Pages, Not Forks**: For non-docs pages use `src/pages/*.astro` wrapped in `<StarlightPage frontmatter={{ title }}>`; to change built-in UI use the `components` config override map — never copy/patch theme internals.
6. **Theming via Custom Properties**: Customize with `customCss` files overriding `--sl-*` custom properties (colors, `--sl-font`); use `logo.light`/`logo.dark` for theme-aware logos. Apply `not-content` class to opt elements out of content styling.
7. **Search & Visibility**: Pagefind search is on by default; exclude a page with `pagefind: false` and keep it out of production builds with `draft: true`.
8. **i18n Layout**: Declare `locales`/`defaultLocale` in config; mirror content per locale directory. Untranslated pages fall back to the default locale automatically; translate sidebar labels with `translations`.

## References

For full configuration options, frontmatter fields, component catalog, and code examples, refer to:
* [Setup & Configuration Reference](references/setup-and-config.md)
* [Page Frontmatter Reference](references/frontmatter.md)
* [Components & Authoring](references/components-and-authoring.md)
* [Sidebar, Theming & i18n](references/sidebar-and-customization.md)

# Starlight Setup & Configuration Reference

Source: starlight.astro.build (getting-started, manual-setup, reference/configuration). Verified 2026-07.

## Installation

```sh
# New project (npm / pnpm / yarn)
npm create astro@latest -- --template starlight
pnpm create astro --template starlight
yarn create astro --template starlight

# Dev server
npm run dev

# Upgrade Starlight + Astro
npx @astrojs/upgrade
```

Manual add to an existing Astro project:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	integrations: [
		starlight({
			title: 'My delightful docs site', // required
		}),
	],
});
```

## Project Structure

```
.
├── public/                  # static assets (favicon, etc.)
├── src/
│   ├── assets/              # images, logos (processed)
│   ├── content/
│   │   └── docs/            # .md / .mdx pages → file-based routing
│   └── content.config.ts    # content collection schema
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

A file at `src/content/docs/reference/faq.md` serves at `/reference/faq`.

## Configuration Options (`starlight({ ... })`)

| Option | Type | Default | Purpose |
|---|---|---|---|
| `title` | `string \| Record<locale, string>` | — (required) | Site title (metadata + browser tab) |
| `description` | `string` | — | Meta description for SEO |
| `logo` | `LogoConfig` | — | Navbar logo (`src` or `light`/`dark`, `replacesTitle`) |
| `sidebar` | `SidebarItem[]` | — | Navigation (see sidebar reference) |
| `locales` / `defaultLocale` | object / `string` | — | i18n locales and fallback source |
| `social` | `Array<{ icon, label, href }>` | — | Header social links |
| `editLink` | `{ baseUrl: string }` | — | "Edit this page" links |
| `customCss` | `string[]` | — | CSS files or package imports to load |
| `expressiveCode` | options `\| boolean` | `true` | Code block rendering (Expressive Code) |
| `tableOfContents` | `false \| { minHeadingLevel, maxHeadingLevel }` | `{2, 3}` | Right-hand ToC depth |
| `head` | `HeadConfig[]` | — | Global extra `<head>` tags (analytics, etc.) |
| `favicon` | `string` | `'/favicon.svg'` | Path in `public/` |
| `titleDelimiter` | `string` | `'\|'` | Between page and site title |
| `lastUpdated` | `boolean` | `false` | Git-based timestamp in footer |
| `pagination` | `boolean` | `true` | Prev/next links |
| `credits` | `boolean` | `false` | "Built with Starlight" footer link |
| `pagefind` | `boolean \| options` | `true` | Site search indexing |
| `prerender` | `boolean` | `true` | Static HTML vs on-demand SSR |
| `components` | `Record<string, string>` | — | Override built-in UI components |
| `plugins` | `StarlightPlugin[]` | — | Community/custom plugins |
| `routeMiddleware` | `string \| string[]` | — | Route data middleware paths |
| `markdown` | `{ headingLinks?, processedDirs? }` | — | Heading anchors, processed dirs |
| `disable404Route` | `boolean` | `false` | Use a custom 404 |

## Common Config Examples

```js
starlight({
	title: 'My Docs',
	logo: {
		light: './src/assets/light-logo.svg',
		dark: './src/assets/dark-logo.svg',
		replacesTitle: true,
	},
	social: [
		{ icon: 'github', label: 'GitHub', href: 'https://github.com/org/repo' },
		{ icon: 'discord', label: 'Discord', href: 'https://discord.gg/…' },
	],
	editLink: { baseUrl: 'https://github.com/org/repo/edit/main/' },
	customCss: ['./src/styles/custom.css', '@fontsource/roboto'],
	expressiveCode: { styleOverrides: { borderRadius: '0.5rem' } },
	lastUpdated: true,
});
```

Sitemap: set `site: 'https://docs.example.com'` at the top level of `defineConfig` — Starlight then emits a sitemap automatically.

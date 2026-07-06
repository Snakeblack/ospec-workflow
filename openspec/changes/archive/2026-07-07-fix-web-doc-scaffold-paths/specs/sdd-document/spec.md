# Delta for sdd-document

## MODIFIED Requirements

### Requirement: Option D OpenWiki + Starlight Web Scaffold Generation {#REQ-sdd-document-014}

When the user selects Option D, the `sdd-document` agent MUST generate the full `openwiki/` structure identically to Option A, AND additionally write a static Starlight scaffold under `web-doc/` consisting of exactly this file set: `package.json`, `astro.config.mjs`, `src/content.config.ts`, `tsconfig.json`, and a CSS custom-properties file under `web-doc/src/styles/`. The agent MUST NOT run `npm create astro`, `npm create`, `npm install`, or any other package-manager install/scaffold command — every scaffold file MUST be written directly as templated static content via the `edit`/`write` tool.

The agent MUST NOT write any authored content into `web-doc/src/content/docs/` during generation; that directory is populated exclusively by the sync script (see the sync requirement below), never by direct agent writes.

On any run with scope D — init mode or update mode alike, including when `web-doc/` already contains files not created by a prior Option D run (e.g. a pre-existing directory) — the agent MUST treat the static scaffold files as idempotent: it writes each scaffold file only if that specific file is missing, and MUST NOT overwrite an existing file of the same name, whether that file originated from this agent or from elsewhere. This uniform rule avoids a separate "foreign content" detection path: the agent never inspects or judges the origin of an existing scaffold-slot file, it only checks presence.

#### Scenario: Option D output generated — dual output, no installers run

- GIVEN the user selects Option D
- WHEN the generation completes successfully
- THEN `openwiki/` is generated identically to Option A
- AND `web-doc/` contains exactly the scaffold file set (`package.json`, `astro.config.mjs`, `src/content.config.ts`, `tsconfig.json`, a CSS custom-properties file)
- AND no `npm create`/`npm install`/scaffold-installer command was executed

#### Scenario: web-doc/src/content/docs/ has no authored content at generation time

- GIVEN Option D generation has just completed
- WHEN the agent inspects `web-doc/src/content/docs/`
- THEN it MUST NOT contain any file written directly by the agent
- AND its population is deferred entirely to the sync script

#### Scenario: Update-mode run does not rewrite existing scaffold files

- GIVEN `web-doc/package.json` already exists — whether from a prior Option D run in update mode, or found already present the first time the agent runs with scope D (init mode)
- WHEN the agent (re-)runs with scope D
- THEN it MUST NOT overwrite the existing scaffold files
- AND it MAY only re-run the sync-script wiring check to confirm `predev`/`prebuild` are still present

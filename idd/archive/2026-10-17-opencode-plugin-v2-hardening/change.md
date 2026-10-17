# opencode-plugin-v2-hardening

## Intent and acceptance

Endurecer el bridge OpenCode v2 (E1.25/E1.26): proteger setup() cuando ctx.permission.hook no existe, omitir source en permissionRequest si faltan messageID/id e incluir file_path/target_file en resources, alinear spec/changelog/roadmap y pasar trust-review real.

Acceptance: setupOspecWorkflow no falla al cargar en runtimes sin ctx.permission; permissionRequest omite source cuando faltan messageID/id y extrae file_path/target_file; spec hooks-runtime, CHANGELOG 2.138.3 y roadmap reflejan E1.25+E1.26; trust-review real aprobado y suite verde.

## Plan

1. Fase roja (`repro-test`): tests en `scripts/lib/target-profiles/opencode-plugin.test.js` para `setup()` cuando `ctx.permission` no existe en runtimes v2 antiguos y para `permissionRequest()` cuando faltan `messageID`/`id` o el detalle viene en `file_path`/`target_file`.
2. Corrección en `scripts/lib/target-profiles/opencode-plugin.js` y regeneración del golden `scripts/configure/__fixtures__/golden/opencode/.opencode/plugins/ospec.js`.
3. Alineación documental y de contrato en `openspec/specs/hooks-runtime/spec.md`, `CHANGELOG.md` y `docs/roadmaps/harness-evolution.md`.
4. Ejecución de `trust-review` real sobre el diff completo de la frontera del plugin OpenCode v2, verificación de impactos ADR/escenarios y cierre con `ospec check` + `ospec close`.

## Decisions

- `setupOspecWorkflow` comprueba `ctx.permission && typeof ctx.permission.hook === "function"` antes de registrar el hook `evaluate`, evitando un `TypeError` durante la carga del plugin en runtimes v2 sin la superficie de permisos.
- `permissionRequest` incluye `source: { type: "tool", messageID, id }` únicamente cuando ambos identificadores son strings no vacíos, cumpliendo el esquema `Permission.Source` de OpenCode v2.0.32 (`o({type: b("tool"), messageID: t, id: t})`), y extrae también `file_path` y `target_file` además de `command`, `filePath` y `path`.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-17T14:47:39.332Z)
- ev-2: frozen-review for trust-review (2026-10-17T14:50:56.778Z)
- ev-3: migration-test for migration-compat-and-test (2026-10-17T14:50:57.123Z)
- ev-4: check-run for checks-pass (2026-10-17T14:52:12.556Z)
- ev-5: contract-spec-and-test for contract-spec-and-test (2026-10-17T14:52:12.556Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-10-17T14:52:12.556Z)
- ev-7: living-doc-current for living-doc (2026-10-17T14:52:12.830Z)
<!-- ospec:evidence:end -->


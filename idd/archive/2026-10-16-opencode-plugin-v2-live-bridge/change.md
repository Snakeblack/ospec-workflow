# opencode-plugin-v2-live-bridge

## Intent and acceptance

El shim opencode emitido no ejecuta el bridge en la instalación real: llama al binario sin plugin_root y sin el cwd de la sesión, así que session-start falla (no SKILL.md files found en la raíz de skills) y el guard de git queda fail-open; continuación del cambio E1.25 opencode-plugin-v2-api.

Acceptance: En la instalación global real de OpenCode v2, session-start regenera el registro de skills desde la raíz del bundle (plugin_root) con el cwd de la sesión, y pre-tool-use aplica deny/ask con el estado real del repositorio; el generador emite plugin_root y el cwd de sesión y el validador los exige, con tests que fallan sin el arreglo.

## Plan

1. Fase roja: variante fiel del shim pre-arreglo (sin `resolvePluginRoot`, sin `plugin_root` en session-start y sin `cwd` de sesión) y del validador sin el contrato; el par `repro-test` queda registrado con el fallo (5 tests) y el verde posterior con el arreglo.
2. Generador `scripts/lib/target-profiles/opencode-plugin.js`: `resolvePluginRoot()` resuelve la raíz del bundle (global → proyecto, fallback global); `runHook(subcommand, payload, { cwd })` fija el cwd del hijo; `sessionStart` envía `plugin_root`; v1 (`server({ directory })`) y v2 (`ctx.location.directory`) cablean el directorio de la sesión.
3. Validador `scripts/configure/validate-opencode.js`: exige `plugin_root` y `cwd: directory` en el plugin emitido, con test de rechazo.
4. Golden regenerado y plugin global reinstalado (`npm run setup:opencode`), verificado en vivo (session-start real y pre-tool-use deny/ask; Engram obs 235).

## Decisions

- La raíz del bundle se resuelve en runtime (cascada global → proyecto, fallback global) en vez de hornear rutas absolutas: cubre la instalación global y el plugin de proyecto.
- Ambos hooks hacen spawn con `cwd` = directorio de la sesión: el guard de git y las rutas relativas ven el repositorio real (antes quedaba fail-open).
- El validador exige el contrato (`plugin_root` y `cwd: directory`): la degradación del bridge no puede volver por omisión.
- Paridad v1: en OpenCode el veredicto `ask` colapsa a bloqueo duro (el plugin no tiene ask nativo); `git commit` en la rama por defecto o con árbol sucio queda bloqueado por diseño hasta que exista una vía nativa.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-16T18:05:13.106Z)
- ev-2: migration-test for migration-compat-and-test (2026-10-16T18:05:44.158Z)
- ev-3: frozen-review for trust-review (2026-10-16T18:25:24.432Z)
- ev-4: check-run for checks-pass (2026-10-16T18:26:24.317Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-10-16T18:26:24.317Z)
- ev-6: living-doc-current for living-doc (2026-10-16T18:26:49.783Z)
<!-- ospec:evidence:end -->

# Harness Runtime

## Objetivo

Reducir carga permanente del prompt y mover automatización repetitiva a hooks.

## Capas

1. Commands: routing visible.
2. Orchestrator: coordinación.
3. Phase agents: ejecución.
4. Skills: capacidades on-demand.
5. Hooks: lifecycle automation.
6. OpenSpec: fuente de verdad.
7. `.ospec/cache`: cache auxiliar; el registro compacto de skills vive en `.ospec/cache/skill-registry.cache.json`.
8. `.ospec/session`: continuidad auxiliar.

### Esquema de la cache del registro (v2)

`.ospec/cache/skill-registry.cache.json` usa `version: 2`:

```json
{
  "version": 2,
  "fingerprint": "sha256:…",
  "generated_at": "…ISO…",
  "skills": [ { "id": "…", "path": "…", "triggers": ["…"], "compact_rules": ["…"] } ],
  "workspace": { "members": [ { "id": "api", "reachable": true } ], "contracts": [ { "id": "auth", "provider": "api", "consumers": ["web"] } ] }
}
```

- `workspace` solo aparece en modo `workspace-federated`: federa el atlas (miembros y
  contratos) en la cache para que un delegador lea el contexto cross-repo sin reparsear
  `workspace.yaml`. En modo `openspec` se omite.
- Migración: `session-start` invalida cualquier cache con `version` distinto de 2 (cache miss)
  y la regenera; no hay migración manual.
- El hook reporta `registry.status`: `generated` (creada/refrescada), `reused` (hit de
  fingerprint, sin escritura) o `skipped` (sin OpenSpec).

## No fuente de verdad

`.ospec/cache` y `.ospec/session` nunca sustituyen a OpenSpec. `.atl/` es residuo legacy ignorado; no es estado activo del registro ni del runtime.

## Backend de artefactos (adapter)

Los hooks no conocen rutas concretas. Toda la política de layout vive en un solo
sitio: `scripts/lib/artifact-store.js`. Cada hook crea un store con
`createArtifactStore({ mode, workspace })` y pide rutas y operaciones al
contrato, en vez de hardcodear `openspec/` o `.ospec/`.

| Capa | Qué expone el store |
| --- | --- |
| Canónica (fuente de verdad) | `configPath()`, `isInitialized()`, `readConfig()`, `findActiveChanges()`, `changeDirectory()`, `writeSessionSummary()` |
| Derivada (auxiliar) | `cachePath()`, `sessionSummaryPath()`, `latestSessionPath()`, `runtimeEventPath()`, `appendRuntimeEvent()` |

Modos:

- `openspec` (por defecto): adapter actual. Delega en `scripts/lib/ospec-state.js`;
  comportamiento idéntico al previo a la extracción.
- `workspace-federated`: comparte el layout derivado `.ospec/` (workspace-local) y
  resuelve lo canónico desde un atlas `openspec/workspace.yaml`. `isInitialized` lee el
  atlas; `findActiveChanges` agrega los changes de cada miembro alcanzable etiquetados
  con `source` (coordinador = `.`) reusando `ospec-state.findActiveChanges`; los miembros
  inalcanzables se omiten fail-open. Implementado para **lectura**; la escritura
  coordinada multi-repo queda en el roadmap (`changeDirectory`/`writeSessionSummary`
  permanecen coordinator-local). Parser del atlas: `scripts/lib/workspace-atlas.js`.

Selección de backend: los hooks llaman `createArtifactStoreFromConfig`, que lee
`artifact_store.backend` de `openspec/config.yaml` (`readBackendMode`) y construye el
store; ausente o desconocido → `openspec`. Front door: `sdd-workspace` (init/status/impact).

Este `mode` del arnés (dónde y cómo se resuelve el backend) es distinto del
`artifact_store.mode` de la capa de prompts (`openspec | none`, que decide si una
fase persiste o devuelve inline). Ver [openspec.md](openspec.md) y la
`persistence-contract` compartida.

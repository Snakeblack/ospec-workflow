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
7. `.ospec/cache`: cache auxiliar.
8. `.ospec/session`: continuidad auxiliar.

## No fuente de verdad

`.ospec/cache` y `.ospec/session` nunca sustituyen a OpenSpec.

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
- `workspace-federated` (roadmap): comparte el layout derivado `.ospec/`
  (workspace-local), pero las operaciones canónicas multi-repo todavía no están
  implementadas y fallan con un error explícito. La puerta es real, no simulada.

Este `mode` del arnés (dónde y cómo se resuelve el backend) es distinto del
`artifact_store.mode` de la capa de prompts (`openspec | none`, que decide si una
fase persiste o devuelve inline). Ver [openspec.md](openspec.md) y la
`persistence-contract` compartida.
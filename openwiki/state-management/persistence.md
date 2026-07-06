# Persistencia y estado

`ospec-workflow` trata el repositorio de código como la única memoria
autoritativa: nada relevante para reanudar un cambio SDD vive solo en el
historial del chat. Este dominio cubre las tres capas de almacenamiento
(specs normativas, memoria operativa, estado por cambio) y la abstracción de
artifact-store que las resuelve.

## Tres almacenes con dueños distintos

| Store | Ruta | Dueño | Contenido |
| --- | --- | --- | --- |
| **Behavior specs** | `openspec/specs/{domain}/spec.md` | Flujo SDD | Requisitos normativos y escenarios Given/When/Then |
| **Foundation docs** | `docs/architecture/`, `docs/product/` | Humano / fase foundation | Baseline de producto y arquitectura |
| **Operative memory** | `openspec/memory/*.md` | Fases SDD (prepend, más nuevo primero) | Decisiones, convenciones, issues conocidos |
| **Session memory** | plugin engram | Runtime | Memoria de usuario/agente entre sesiones |

Las entradas de memoria NUNCA deben repetir contenido de specs o foundation
docs — deben enlazar a la fuente autoritativa en vez de duplicarla.

## Memoria operativa (`openspec/memory/`)

Exactamente tres archivos Markdown, cada uno con frontmatter YAML
(`title`, `last_updated`) y entradas en orden inverso-cronológico (prepend):

- `decisions.md` — decisiones de arquitectura/diseño resueltas, con
  rationale.
- `conventions.md` — convenciones de código/flujo adoptadas. Es de **curación
  humana**: ningún agente de fase tiene obligación normativa de escribirlo;
  se crea con un bloque `[EXAMPLE]`/`[EJEMPLO]` ilustrativo que los agentes
  deben ignorar siempre.
- `known-issues.md` — issues verificados, workarounds, estado de resolución.

`decisions.md` y `known-issues.md` se crean automáticamente en la primera
escritura (típicamente `sdd-archive` o `sdd-verify`); no necesitan
pre-crearse.

## Estado por cambio (`openspec/changes/{change-name}/`)

Cada cambio SDD activo tiene su propio directorio con los artefactos de fase
y un `state.yaml` que es la fuente canónica de recuperación:

```yaml
change: "{change-name}"
status: "planning | ready-for-apply | applying | ready-for-verify | verified | archived | blocked"
phases:
  proposal: { status: "done | pending", artifact: "..." }
  spec:     { status: "done | pending", artifacts: [...] }
  design:   { status: "done | pending", artifact: "..." }
  tasks:    { status: "done | pending", artifact: "..." }
  apply:    { status: "pending | partial | done", artifact: "..." }
  verify:   { status: "pending | done", artifact: "..." }
  archive:  { status: "pending | done", artifact: "..." }
blocking_questions: []
```

Cada fase, al completarse, extiende su propia entrada con un resumen
compacto (`summary`, `key_decisions`) para que continuaciones futuras se
puedan orientar leyendo solo `state.yaml`, sin releer todos los artefactos.

## La abstracción `artifact-store`

`scripts/lib/artifact-store.js` es la única fuente de verdad del layout en
disco: los hooks resuelven cada ruta a través del store en vez de
hardcodear literales, lo que permite que un segundo backend (por ejemplo
`workspace-federated`) provea su propio layout y resolvedores sin tocar el
resto del runtime.

```
.ospec/
├── cache/skill-registry.cache.json   ← caché compacta del catálogo de skills
└── session/
    ├── latest.md                     ← último resumen recuperable (PreCompact)
    └── session-summary.md
```

`.ospec/cache` y `.ospec/session` son **auxiliares** — OpenSpec sigue siendo
la fuente de verdad; si se borran, se regeneran en la próxima sesión.

## Por qué la arquitectura está diseñada así

Separar specs normativas (comportamiento esperado) de memoria operativa
(decisiones y convenciones acumuladas) evita que el conocimiento tácito del
equipo se pierda entre cambios, sin inflar los documentos de spec con
narrativa de proceso. El prepend-only en memoria preserva un historial
auditable — ninguna entrada pasada se reescribe o reordena. Que
`artifact-store.js` centralice el layout en disco es lo que permite añadir un
backend federado sin reescribir cada hook que toca rutas de OpenSpec.

## Principales puntos de extensión

- Agregar un backend de artifact-store: implementar el layout y resolvedores
  siguiendo la interfaz existente en `artifact-store.js` /
  `artifact-store-modes.js`.
- Agregar un campo nuevo al resumen de fase en `state.yaml`: seguir el
  contrato de `skills/_shared/sdd-phase-common.md` (Phase Summary Block).

## Cosas a vigilar al editar

- Nunca sobrescribir entradas existentes de `openspec/memory/*.md` — solo
  prepend.
- El bloque `[EXAMPLE]`/`[EJEMPLO]` de `conventions.md` es scaffolding
  ilustrativo, nunca una convención real; cualquier agente que lo lea debe
  ignorarlo.
- `state.yaml` debe actualizarse en cada escritura de artefacto de fase y en
  cada `blocked` — es la única fuente de recuperación entre sesiones.

## Mapa de fuentes

- `/openspec/specs/project-memory/spec.md`
- `/scripts/lib/artifact-store.js`, `/scripts/lib/artifact-store-modes.js`
- `/scripts/lib/ospec-state.js` — `git log`: `09960ac`, `07e1000` (escrituras atómicas)
- `/skills/_shared/sdd-phase-common.md` (Sección C: Artifact Persistence)
- `/openspec/memory/` (cuando existe)

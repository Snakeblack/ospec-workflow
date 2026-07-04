# Paridad Go ↔ JS del harness

## Objetivo

Dejar por escrito **qué está en Go, qué está en JS y por qué**, el **contrato de
paridad** que mantiene ambos lados coherentes, y la **brecha conocida** de
federación. Incluye dos caminos para cerrarla: un parche de bajo riesgo (opción A)
y la migración completa a Go (opción B) con su análisis de impacto y recomendación.

Este documento es el complemento de `harness-runtime.md`: aquel describe el runtime;
este describe la frontera de lenguajes y su mantenimiento.

## 1. El reparto por capas (no es "uno es fallback del otro")

| Capa | Lenguaje | Motivo |
|------|----------|--------|
| 5 hooks de runtime (`pre-tool-use`, `session-start`, `pre-compact`, `stop`, `subagent-stop`) | **Go**, con **JS como fallback** | Camino caliente. `pre-tool-use` se dispara en cada tool-call; Node arranca en ~0.3–0.5s, Go en ~0.03s. Migrado en `harness-go-migration` (Phase 1). |
| Generadores, build, `scripts/configure/*`, orquestador SDD, **todo el subsistema de federación/workspace** | **JS únicamente** | Fuera de scope de la migración (Phase 2 diferida). No es camino caliente. |

**Cómo coexisten en runtime.** `hooks/hooks.json` no invoca el binario directamente:
invoca el launcher Node `scripts/hooks/ospec-hooks-launch.js <evento>`. El launcher
**prefiere el binario Go y cae al hook JS `<evento>.js`** cuando no hay binario para la
plataforma (`resolveInvocation`, `ospec-hooks-launch.js:78-84`). Para un evento dado
corre **uno u otro**, nunca los dos.

- En la **capa de hooks**: JS es un fallback genuino (paridad de comportamiento exigida).
- En **el resto** (incluida la federación): JS es la **única** implementación; no hay Go
  equivalente que mantener.

## 2. Contrato de paridad (REGLA OPERATIVA)

> **Contrato ejecutable (E1)**: las golden fixtures de `internal/testdata/parity/`
> se verifican en AMBAS implementaciones en pre-commit/CI — Go vía
> `TestPreToolUse_ParityFixtures` y JS vía `scripts/hooks/parity-contract.test.js`
> (proceso real del hook). Un mismo set de fixtures, dos runtimes: añadir una fixture
> extiende el contrato para los dos a la vez. Empezado por `pre-tool-use` (el camino
> caliente); `session-start` es el siguiente candidato. Ante un mismatch, decidí el
> comportamiento canónico y corregí la implementación rezagada — nunca "arregles" la fixture sola.


`internal/store/store.go` es, por su propia cabecera (`store.go:1-3`), un **port parcial**
de la *superficie single-repo* de `scripts/lib/artifact-store.js`:

> *"Go port of the artifact-store.js surface used by the five runtime hook handlers.
> It operates against the openspec single-repo backend only (no workspace-federated
> mode in Phase 1)."*

Lo mismo aplica a `internal/skillreg/skillreg.go` (espeja `skill-registry.js`),
`internal/yamllite/yamllite.go` (parser YAML mínimo) y `internal/rules/rules.go`
(reglas DENY/ASK de `pre-tool-use.js`).

**Regla a aplicar en cada cambio:**

1. **Si tocas la superficie SINGLE-REPO que el Go espeja** — `findActiveChanges`
   single-repo, `TERMINAL_STATUSES`, el render del *session summary*, el estado de
   `baseline`, el esquema de la cache v2 de skills, o las reglas DENY/ASK —
   **debes espejar el cambio en el paquete `internal/*` correspondiente y portar el
   test**. Si no, el hook diverge según haya binario o no.
2. **Si tocas código FEDERADO-only** — `isCorruptCache`, `loadAtlas`, `resolveMembers`,
   `describeWorkspace`, `federation-marker.js`, `federation-explore.js`,
   `federation-baseline-orchestrator.js`, `workspace-atlas.js` — **no hay nada que
   espejar** (el Go no implementa federación). Basta JS.

> El cambio `federation-c1-hardening` fue **caso 2**: tocó `isCorruptCache`,
> `resolveMembers` y `roster`, todo federado-only. **Correctamente no requirió Go.**

### Superficie espejada hoy (referencia)

| JS (`scripts/lib`) | Go (`internal/*`) | Alcance |
|--------------------|-------------------|---------|
| `artifact-store.js` (single-repo) | `store/store.go` | `FindActiveChanges`, session summary, baseline, layout `.ospec/` |
| `artifact-store.js` (**federado**) | — *(no portado)* | **brecha, §3** |
| `skill-registry.js` | `skillreg/skillreg.go` | discovery + fingerprint + cache v2 |
| `pre-tool-use.js` reglas | `rules/rules.go` | DENY/ASK |
| `scripts/hooks/lib/secret-scan.js` | `hooks/secretscan.go` | agent-shield: clasificación de archivos sensibles + escaneo de credenciales |
| parser YAML inline | `yamllite/yamllite.go` | solo lectura |

## 3. Brecha conocida: agregación federada en hooks

Los hooks JS son **conscientes de federación**; el Go **no**.

```
session-start.js:111  store.describeWorkspace()    → escribe el bloque `workspace`
                                                      (members+contratos) en la cache v2
pre-compact.js:218    store.findActiveChanges()[0] → AGREGA cambios activos cross-repo
stop.js:108           store.findActiveChanges()[0] → idem
```

Todos resuelven el store con `createArtifactStoreFromConfig(...)`, que en
`backend: workspace-federated` construye el store federado y agrega el estado de los
miembros. Está **cubierto por tests JS** (`session-start.test.js:300`,
`pre-compact.test.js:55`, `stop.test.js:62` fijan `backend: workspace-federated`) y
**documentado** como contrato en `harness-runtime.md:28,32-34` (el bloque `workspace`
de la cache v2 solo existe en modo federado).

El Go (`store.go`) es single-repo only. Por tanto:

> En un repo **federado con binario Go presente**, los hooks ven **solo el coordinador**.
> **Sin** binario (fallback JS) ven **toda la federación agregada**. Mismo hook,
> comportamiento distinto según exista o no el binario. Esto contradice la afirmación del
> orquestador de que "los hooks ya agregan; trátalos como abarcando members" — cierto en
> JS, **falso en Go**.

**Severidad hoy: DORMIDA.** Este repo es `backend: openspec` (single-repo): Go y JS se
comportan idéntico. La brecha despierta el día que un repo consumidor use
`workspace-federated` **y** tenga el binario Go.

Facetas concretas del gap:
- `pre-compact` / `stop`: selección del cambio activo NO agrega members → un *session
  summary* o un estado de compactación incompletos en federado.
- `session-start`: la cache v2 se genera **sin** el bloque `workspace` → el delegador
  pierde el contexto cross-repo y debe reparsear (o se queda sin él).

---

## 4. Opción A — Parche de bajo riesgo (RECOMENDADO)

**Idea:** el fallback del launcher ya existe por *plataforma*; añadimos un fallback por
*capability*. Cuando el backend es `workspace-federated`, los hooks que dependen de la
agregación **delegan al hook JS** aunque exista binario Go. El Go sigue dueño del camino
caliente single-repo; JS sigue siendo la **única** implementación de federación
(sin duplicación de lógica).

**Dónde decidir el desvío.** Dos variantes:
- **A1 (en el launcher):** `ospec-hooks-launch.js` lee `openspec/config.yaml`; si
  `backend: workspace-federated` y el subcomando ∈ {`session-start`, `pre-compact`,
  `stop`}, invoca `<evento>.js` en vez del binario. Pro: un único punto, los `internal/*`
  no cambian. Con: el launcher pasa de "tonto" a leer config.
- **A2 (en Go):** cada handler afectado detecta `backend: workspace-federated` y devuelve
  un sentinel de "delega"; el launcher reintenta con JS. Pro: la política vive con el
  handler. Con: protocolo nuevo launcher↔binario.

**Recomendación interna: A1** — más simple, sin protocolo nuevo, y mantenible: la lista de
subcomandos federation-aware es explícita.

**Trabajo (estimado):**
- `ospec-hooks-launch.js`: leer backend de config + bifurcar (~30–40 LOC) y sus tests
  (`resolveInvocation` ya es puro y testeable sin spawn).
- Test de paridad: fixture `workspace-federated` que pruebe que el launcher elige JS.
- Nota en `harness-runtime.md` + actualizar la tabla §2 de este doc.

**Riesgo: BAJO.** No toca `internal/*`, no duplica lógica de federación, reversible
(quitar la bifurcación). Coste de runtime: leer un YAML pequeño una vez por evento en
repos federados (los 3 eventos no-calientes), 0 en single-repo.

**Cuándo NO basta A:** si la federación se volviera camino caliente (no es el caso:
`session-start`/`pre-compact`/`stop` se disparan ocasionalmente, no por tool-call).

---

## 5. Opción B — Migración completa de federación a Go

Serie de cambios SDD necesarios para que el Go sea federation-aware de verdad:

| # | Cambio | Qué incluye | Riesgo |
|---|--------|-------------|--------|
| B1 | **YAML writer en Go** | `yamllite` hoy solo lee; federación **escribe** atlas y markers. Serializador + escritura atómica (port de `atomic-write.js`). | Alto (formato debe casar byte-a-byte con JS) |
| B2 | **`internal/federation` (atlas)** | Port de `workspace-atlas.js` (892 LOC): `parseAtlas`, `resolveMembers`, `computeImpact`, `scanMemberMarkers` + guards `isWithinRoot`/`isRealPathWithinRoot`. | Alto |
| B3 | **Markers** | Port de `federation-marker.js` (463 LOC): parse/serialize/enroll. | Medio-alto |
| B4 | **Store federado** | Ampliar `store.go`: `describeWorkspace`, `findActiveChanges` agregado, `isCorruptCache` estructural, DI de git (`os/exec` en vez de `spawnSync`). | Medio |
| B5 | **Explore + baseline orchestrator** *(si los hooks los necesitaran)* | `federation-explore.js` (311) + `federation-baseline-orchestrator.js` (413). | Medio |
| B6 | **Tests de paridad** | Portar ~2.600 LOC de tests JS a Go table-driven + fixtures federados. | Alto (esfuerzo) |

### Análisis de impacto

- **Tamaño.** Lado Go actual (sin tests): **~2.519 LOC**. Federación JS (sin tests):
  **~2.592 LOC** + un volumen similar de tests. La migración **duplicaría** el código del
  harness Go.
- **El problema de la duplicación.** La federación la consumen también el **CLI
  `sdd-workspace` y el orquestador**, que **no son hooks y seguirán en JS pase lo que
  pase**. Portar federación a Go **no elimina** la versión JS: la **duplica**. Acabaríamos
  con la MISMA lógica de federación en dos lenguajes — exactamente la inconsistencia que
  queremos evitar, pero peor (dos fuentes de verdad que pueden divergir).
- **El motivo perf no aplica.** La migración de hooks se justificó por el arranque en frío
  *por tool-call* de `pre-tool-use`. La federación corre en eventos **ocasionales**
  (`session-start`/`pre-compact`/`stop`), no en el camino caliente. El ahorro es marginal.
- **El write-path es el más arriesgado.** Markers y atlas se **escriben**; un serializador
  Go que no reproduzca el formato JS al byte rompe la interoperabilidad (un repo podría ver
  markers escritos por Go y por JS indistintamente).

### ¿Conviene? **NO** (hoy)

La migración completa **aumenta** el riesgo de inconsistencia en lugar de reducirlo,
porque la federación seguirá viva en JS para el CLI/orquestador. Solo tendría sentido si:
(a) se decidiera mover **también** el CLI/orquestador a Go (reescritura mayor del proyecto,
no sobre la mesa), o (b) la federación se volviera camino caliente medible. Ninguna se da.

## 6. Decisión recomendada

1. **Adoptar la Opción A1** como cambio SDD pequeño (sugerido: `federated-hooks-parity-guard`):
   launcher capability-aware + test de paridad federada. Cierra la brecha sin duplicar
   lógica.
2. **Mantener la federación 100% en JS** (CLI, orquestador y hooks vía A1). **Una sola
   fuente de verdad.**
3. **Tratar este documento como el contrato de paridad vivo**: actualizar la tabla de §2
   cuando cambie la superficie espejada, y aplicar la regla operativa en cada PR que toque
   `scripts/lib/artifact-store.js`, `skill-registry.js` o `pre-tool-use.js`.
4. Revisar la decisión de la Opción B solo si cambia alguno de sus dos supuestos
   (CLI→Go, o federación caliente).

## Referencias

- `docs/harness-runtime.md` — runtime, capas, cache v2, backend adapter.
- `openspec/changes/archive/2026-06-14-harness-go-migration/` — Phase 1 (hooks → Go).
- `scripts/hooks/ospec-hooks-launch.js` — launcher binario/JS.
- `internal/store/store.go` — port single-repo (cabecera = alcance).
- `scripts/lib/artifact-store.js` — backend adapter (single-repo + federado).

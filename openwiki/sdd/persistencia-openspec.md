---
sidebar:
  order: 4
---

# Persistencia en modo SDD (openspec)

> **Solo modo SDD (opcional).** Esta página describe `openspec/`, donde el modo SDD guarda sus cambios, sus specs y su configuración. IDD no escribe ni lee nada ahí: su estado vive en `idd/` (ver [Persistencia y estado](/openwiki/state-management/persistence.md)). Esta página no aplica a un proyecto que no use SDD.

En SDD, `openspec/` es la memoria compartible del flujo. Sin ella, todo depende de la conversación; con ella, el estado vive en archivos versionables del repositorio.

---

## Estructura de un cambio SDD

```text
openspec/
├── config.yaml                  # Contexto del proyecto: stack, comandos, testing, reglas
├── specs/
│   └── {dominio}/spec.md        # Comportamiento vigente del sistema
└── changes/
    ├── archive/                 # Cambios cerrados: AAAA-MM-DD-{cambio}/
    └── {cambio}/
        ├── state.yaml           # Estado de la fase, aprobaciones y runtime
        ├── exploration.md
        ├── proposal.md          # (o proposal-lite.md en lite mode)
        ├── specs/{dominio}/spec.md   # Spec delta: el cambio propuesto
        ├── design.md
        ├── tasks.md
        ├── apply-progress.md
        ├── verify-report.md
        └── archive-report.md
```

Cada fase que persiste artefactos lee, fusiona y actualiza `state.yaml`. La recuperación depende de ese fichero: el proceso no depende de que el modelo "recuerde".

## config.yaml

| Área | Ejemplos |
| --- | --- |
| Stack | Lenguajes, frameworks, gestores de paquetes, arquitectura detectada. |
| Comandos | Instalación, build, test, lint, formato, typecheck. |
| Testing | Runner, capas disponibles, cobertura, Strict TDD (`testing.tdd_mode`). |
| Reglas | Normas por fase: proposal, specs, design, tasks, apply, verify, archive. |
| Foundation | Docs de producto, baseline técnico, roadmap y preguntas abiertas. |

`sdd-init` lo crea. La skill `foundation` lo completa cuando el proyecto está vacío. El bloque `team:` de este fichero es el perfil de equipo del modo SDD; el de IDD vive en `idd/config.yaml`.

## Specs principales y specs delta

| Tipo | Ruta | Qué significa |
| --- | --- | --- |
| Spec principal | `openspec/specs/{dominio}/spec.md` | Comportamiento vigente del sistema. |
| Spec delta | `openspec/changes/{cambio}/specs/{dominio}/spec.md` | Cambio propuesto sobre ese comportamiento. |

Durante `sdd-spec` no se escribe directamente en `openspec/specs/`. Tanto las modificaciones de dominios existentes como las capacidades nuevas viven primero en el cambio. Para una capacidad nueva, esa spec es temporal por diseño: `sdd-archive` es la única fase que la promociona a `openspec/specs/{dominio}/spec.md`.

Una delta usa tres secciones: `ADDED Requirements`, `MODIFIED Requirements` y `REMOVED Requirements`.

> **Regla crítica de MODIFIED:** copiar el requisito completo desde la spec principal, con todos sus escenarios, y después editar. Si solo se copia el escenario cambiado, al archivar se pueden perder los demás.

## Ciclo de artefactos

| Fase | Artefacto |
| --- | --- |
| Explore | `exploration.md` |
| Propose | `proposal.md` (o `proposal-lite.md` en lite mode) |
| Spec | `specs/{dominio}/spec.md` dentro del cambio |
| Design | `design.md` |
| Tasks | `tasks.md` |
| Apply | `apply-progress.md` y estados `[ ]` / `[~]` / `[x]` en `tasks.md` |
| Verify | `verify-report.md` |
| Archive | `archive-report.md`, specs principales actualizadas y carpeta movida |

## state.yaml de la fase

Ejemplo ilustrativo de la forma del fichero:

```yaml
change:
  name: add-export-csv
  mode: standard
  current_phase: apply

approvals:
  - id: delivery-strategy-001
    gate: delivery-strategy
    decision: ask-on-risk
    source: vscode/askQuestions
    accepted_at: 2026-06-10T10:30:00+02:00

runtime:
  skill_registry_fingerprint: sha256:abc123
  last_skill_resolution: injected
  last_session_summary: .ospec/session/add-export-csv/session-summary.md
  compaction_safe: true
```

Las aprobaciones se registran solo con una respuesta explícita del usuario.

### Assumption Ledger

`state.yaml` puede tener además un bloque `assumptions:`, donde cada fase registra las micro-decisiones que resuelve sin bloquear. Cada entrada trae `id` (formato `{fase}-{seq}`), `phase`, `statement`, `reversibility` (`low` o `high`) y `basis`. Solo una decisión que cambia el comportamiento observable o un contrato público bloquea con `question_gate`.

```yaml
assumptions:
  - id: sdd-design-001
    phase: sdd-design
    statement: "Use camelCase for the internal cache key."
    reversibility: high
    basis: "Matches existing cache-key convention in scripts/lib/cache.js."
    recorded_at: "2026-07-02T00:00:00Z"
    status: unresolved        # unresolved | confirmed | corrected | promoted
```

`sdd-verify` presenta cada entrada `unresolved` como checklist (ver [Verificación en modo SDD](/openwiki/sdd/verificacion-sdd.md)). Las de `reversibility: low` sin resolver escalan a `WARNING` en `verify-report.md`.

## Archivo

Al cerrar un cambio, su carpeta se mueve:

```text
openspec/changes/{cambio}/
  -> openspec/changes/archive/YYYY-MM-DD-{cambio}/
```

Antes de mover, `sdd-archive` valida el cierre: un `FAIL` bloquea el archivo, y un `PASS WITH WARNINGS` solo pasa si los riesgos quedan aceptados de forma explícita o convertidos en follow-up.

Si el cambio tiene specs delta, `sdd-archive` sincroniza las specs principales:

| Delta | Acción sobre la spec principal |
| --- | --- |
| ADDED | Añadir el requisito. |
| MODIFIED | Reemplazar el requisito completo por la versión nueva. |
| REMOVED | Eliminar el requisito indicado, con su motivo. |

El archivo es auditoría: no se borra ni se reescribe a ciegas.

## Documentos de foundation

Para proyectos desde cero, el contexto que todavía no existe en el código vive en `docs/`, no en `openspec/`. Esos documentos sirven a ambos modos:

```text
docs/
├── product/            brief.md, functional-scope.md, glossary.md
├── architecture/       technical-baseline.md, decisions/README.md
├── roadmap.md
└── references/
    ├── raw/            fuentes crudas
    └── processed/      resúmenes trazables
```

Las fuentes crudas van en `raw/` y el resumen útil y trazable en `processed/`. Lo que no se sabe se marca como `Unknown` o `TBD`, con la siguiente pregunta.

## Recuperación

Si una conversación se pierde o se compacta, se recupera leyendo:

```text
openspec/config.yaml
openspec/changes/*/state.yaml
openspec/changes/{cambio}/proposal.md (o proposal-lite.md)
openspec/changes/{cambio}/specs/**
openspec/changes/{cambio}/design.md
openspec/changes/{cambio}/tasks.md
openspec/changes/{cambio}/apply-progress.md
```

Referencia técnica completa: [docs/openspec.md](https://github.com/snakeblack/ospec-workflow/blob/main/docs/openspec.md).

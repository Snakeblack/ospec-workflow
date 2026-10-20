---
sidebar:
  order: 1
---

# Modo SDD (opcional): contrato aprobado antes del código

> **En pocas palabras:** SDD (desarrollo guiado por especificación, con OpenSpec) es un modo **opcional**. Sirve cuando quieres aprobar por escrito qué se va a construir y cómo antes de tocar código. No es el flujo por defecto: el flujo por defecto es [IDD](/openwiki/idd/flujo-idd.md), y SDD solo entra cuando lo pides.

---

## Qué es

Un cambio SDD recorre siete fases: propuesta, especificación, diseño, tareas, aplicación con TDD, verificación y archivo. Cada fase la ejecuta un agente `sdd-*` y el orquestador `sdd-orchestrator` decide cuál va después. Cada fase deja un artefacto en disco, y el conjunto de esos artefactos es el contrato que se revisa antes de programar.

## Para quién

SDD encaja cuando quieres que una persona apruebe la especificación y el diseño antes de que empiece la implementación: cambios que afectan a varios equipos, a contratos publicados o a decisiones difíciles de revertir. Para el trabajo del día a día, IDD suele bastar.

Los proyectos vacíos tienen un caso aparte: la skill `foundation` fija la arquitectura antes del primer cambio, en cualquier modo. Dentro de SDD, la ruta `foundation` la delega el orquestador.

## Cómo se instala

SDD no viene en la instalación por defecto. Hay que añadir `--with-sdd` a cualquier instalador, por ejemplo:

```bash
npm run setup:claude -- --with-sdd
node scripts/configure/install-codex.js --with-sdd
```

- La build del marketplace es solo IDD. Para SDD, instala desde un checkout del repositorio.
- Reinstalar sin el flag conserva SDD si la instalación anterior lo traía, y lo avisa. `--no-sdd` lo quita.
- Si pides SDD sin tenerlo instalado, el router te pide reinstalar con `--with-sdd`.
- Los agentes `review-*`, `skills/_shared/` y el runtime se quedan en cualquier instalación, porque IDD también los usa.

## Cuándo entra

- Solo con un comando `/sdd-*` o con una petición explícita («hazme un SDD para X»).
- Nunca se ofrece ni arranca solo, ni aunque `openspec/changes/` tenga un cambio activo.
- Un cambio SDD en curso termina en SDD. Un cambio IDD termina en IDD: cada cambio mantiene el modo con el que empezó hasta que se cierra.
- Al entrar, el router carga la skill `sdd-orchestrator` una sola vez. El orquestador coordina y pregunta; los agentes de fase hacen el trabajo.

Para apagar IDD en un proyecto y dejar el trabajo directo, declara `mode: sdd` en `idd/config.yaml`. Entonces SDD sigue existiendo, pero solo bajo petición.

## Dónde vive su estado

El estado vive en disco, en `openspec/`, no en la conversación:

| Ruta | Contenido |
|---|---|
| `openspec/changes/<cambio>/state.yaml` | Estado del cambio: fases, gates y ruta. |
| `openspec/changes/<cambio>/` | Artefactos: `proposal.md` (o `proposal-lite.md`), `specs/`, `design.md`, `tasks.md`, `apply-progress.md`, `verify-report.md`. |
| `openspec/specs/<dominio>/spec.md` | Specs principales, la fuente de verdad del comportamiento. Se actualizan al archivar. |
| `openspec/changes/archive/` | Cambios archivados. |
| `openspec/config.yaml` | Configuración de SDD, incluida la tabla de rutas `routing:`. |

Si la conversación se corta, el cambio se retoma desde `state.yaml` y los artefactos.

## IDD frente a SDD

Son dos flujos distintos que comparten repositorio. Esta tabla deja claro qué pertenece a cada uno:

| | IDD (por defecto) | SDD (opcional) |
|---|---|---|
| **Cuándo se usa** | Cualquier cambio de código que no pida SDD. | Solo con `/sdd-*` o petición explícita. |
| **Quién decide** | El CLI `ospec` deriva señales y obligaciones; el agente escribe el código, los tests y el plan. | El orquestador `sdd-orchestrator` elige ruta y fases; los agentes `sdd-*` producen los artefactos. |
| **Cómo se da por terminado** | Cuando `ospec close` tiene éxito, con evidencia que el CLI observa. | Cuando `sdd-archive` cierra el cambio tras una verificación sin `FAIL`. |
| **Estado** | `idd/<cambio>/state.yaml`, que solo escribe el CLI. | `openspec/changes/<cambio>/state.yaml`. |
| **Artefactos** | `idd/<cambio>/change.md` (plan y decisiones). No hay propuesta ni specs previas. | `proposal.md`, `specs/`, `design.md`, `tasks.md`, `apply-progress.md`, `verify-report.md`. |
| **Configuración** | `idd/config.yaml` (`checks:`, `impact:`, `team:`, `mode`). | `openspec/config.yaml` (incluye `routing:`). |
| **Archivo** | `idd/archive/`. | `openspec/changes/archive/`. |
| **Comandos** | La skill `idd` y el CLI `ospec` (`next`, `record`, `signals`, `run`, `check`, `review`, `close`, `doctor`, `team`). | Los comandos `/sdd-*` y el orquestador. |
| **Specs del proyecto** | IDD no lee ni escribe `openspec/changes/`. | `openspec/specs/` es la fuente de verdad, y se actualiza al archivar. |

Lo que es común a los dos modos: el router, los hooks y guards, el generador multi-target y la instalación. Lo demás de esta tabla es exclusivo de cada uno.

## Páginas de este grupo

- [Ciclo y rutas SDD](/openwiki/sdd/ciclo-y-rutas.md): las siete fases, los comandos, el catálogo de rutas y los gates del orquestador.
- [Agentes de fase](/openwiki/sdd/agentes-de-fase.md): el orquestador y los agentes `sdd-*`.
- [Persistencia en OpenSpec](/openwiki/sdd/persistencia-openspec.md): `openspec/changes/`, `state.yaml` y la recuperación.
- [Verificación en SDD](/openwiki/sdd/verificacion-sdd.md): `sdd-verify`, el progreso de apply y el TDD en SDD.

Para el flujo por defecto, ver [Flujo IDD](/openwiki/idd/flujo-idd.md) y [Orquestación: del router a la ceremonia proporcional](/openwiki/orchestration/routing.md).

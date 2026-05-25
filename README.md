# Configuracion personal de Copilot

Este repositorio contiene una configuracion reutilizable para `.copilot`: agentes, instrucciones y skills pensadas para trabajar con GitHub Copilot en VS Code usando un flujo disciplinado de Spec-Driven Development, TDD estricto y revisiones pequenas.

## Vista rapida

La configuracion se divide en tres bloques:

| Ruta | Proposito |
| --- | --- |
| `agents/` | Define agentes especializados, sobre todo para cada fase del flujo SDD. |
| `instructions/` | Reglas compartidas que Copilot aplica como protocolo comun. |
| `skills/` | Capacidades reutilizables que se activan por contexto o por mencion explicita. |

La idea no es tener "prompts sueltos". La idea es tener un sistema: el humano dirige, el orquestador coordina y los agentes ejecutores trabajan con contratos claros. Esto evita improvisar cada tarea desde cero.

## Agentes

Los agentes de `agents/` implementan el ciclo SDD:

| Agente | Responsabilidad |
| --- | --- |
| `sdd-orchestrator` | Coordina el flujo, delega fases y sintetiza resultados. |
| `sdd-init` | Inicializa contexto del proyecto, testing, OpenSpec y registro de skills. |
| `sdd-explore` | Investiga una idea antes de comprometerse con una solucion. |
| `sdd-propose` | Crea una propuesta de cambio con alcance, riesgos y criterios de exito. |
| `sdd-spec` | Escribe requisitos y escenarios como especificaciones OpenSpec. |
| `sdd-design` | Define arquitectura, decisiones tecnicas, datos, archivos y pruebas. |
| `sdd-tasks` | Parte el cambio en tareas implementables y calcula carga de revision. |
| `sdd-apply` | Implementa tareas desde specs y diseno, preservando evidencia de TDD. |
| `sdd-verify` | Verifica implementacion, tests, specs y evidencia real de ejecucion. |
| `sdd-archive` | Archiva cambios verificados y conserva la trazabilidad. |
| `sdd-onboard` | Guia una primera vuelta completa del flujo SDD en un proyecto real. |

El punto importante: `sdd-orchestrator` coordina, pero no deberia hacer el trabajo profundo. Los agentes de fase son ejecutores y no deben lanzar subagentes por su cuenta.

## Instrucciones compartidas

`instructions/` contiene reglas transversales:

| Archivo | Que controla |
| --- | --- |
| `sdd-common.instructions.md` | Limites entre orquestador y ejecutores, resolucion de skills, presupuesto de revision y contrato de respuesta. |
| `sdd-openspec.instructions.md` | Persistencia de artefactos SDD en `openspec/` y rutas oficiales de lectura/escritura. |
| `sdd-strict-tdd.instructions.md` | Reglas de RED, GREEN, TRIANGULATE y REFACTOR cuando el modo TDD estricto esta activo. |

Estas instrucciones son la parte que pone orden. Sin ellas, Copilot puede ejecutar tareas, si, pero pierde trazabilidad, evidencia y control de contexto. Y ahi es donde empiezan los problemas serios.

## Skills

`skills/` contiene capacidades reutilizables. Cada skill vive en su carpeta y declara su activacion en `SKILL.md`.

Grupos principales:

| Grupo | Uso |
| --- | --- |
| `sdd-*` | Propuesta, specs, diseno, tareas, aplicacion, verificacion, archivo y onboarding SDD. |
| `angular-*` | Creacion y desarrollo Angular con referencias para componentes, routing, formularios, signals, testing y tooling. |
| `branch-pr`, `chained-pr`, `work-unit-commits` | Trabajo orientado a PRs revisables, commits convencionales y cambios pequenos. |
| `issue-creation`, `comment-writer`, `judgment-day` | Creacion de issues, comentarios colaborativos y revision adversarial. |
| `go-testing` | Patrones de testing en Go. |
| `skill-creator`, `skill-registry` | Creacion y registro de nuevas skills del proyecto. |
| `caveman-*` | Estilo de comunicacion y compresion orientado a maxima claridad con minimo ruido. |
| `_shared` | Contratos comunes para persistencia, OpenSpec, fases SDD y resolucion de skills. |

Una skill no deberia ser una coleccion de frases bonitas. Debe encapsular una forma concreta de trabajar: cuando se activa, que lee, que produce, que reglas no puede romper y como reporta el resultado.

## Flujo SDD

El flujo principal es:

```text
proposal -> specs --> tasks -> apply -> verify -> archive
             ^
             |
           design
```

Comandos principales:

| Comando | Resultado |
| --- | --- |
| `/sdd-init` | Prepara contexto, testing, OpenSpec y registro de skills. |
| `/sdd-new <cambio>` | Arranca un cambio con exploracion y propuesta. |
| `/sdd-ff <nombre>` | Avanza rapido por propuesta, specs, diseno y tareas. |
| `/sdd-continue [cambio]` | Continua la siguiente fase pendiente. |
| `/sdd-apply [cambio]` | Implementa tareas planificadas. |
| `/sdd-verify [cambio]` | Valida implementacion, specs y pruebas. |
| `/sdd-archive [cambio]` | Cierra y archiva el cambio verificado. |

Por defecto, los artefactos persistidos viven en:

```text
openspec/
  config.yaml
  changes/
    {change-name}/
      exploration.md
      proposal.md
      design.md
      tasks.md
      apply-progress.md
      verify-report.md
      archive-report.md
      state.yaml
      specs/
        {domain}/
          spec.md
```

## Reglas de calidad

Esta configuracion protege varias cosas que suelen romperse cuando se usa IA con prisa:

- `sdd-init` se ejecuta antes de cualquier fase SDD si falta contexto del proyecto.
- El orquestador pasa contexto compacto a los agentes; los ejecutores no dependen de memoria implicita.
- `sdd-tasks` calcula riesgo de revision y marca si hacen falta PRs encadenadas o una excepcion de tamano.
- El presupuesto base de revision es de 400 lineas cambiadas.
- En TDD estricto, `sdd-apply` debe guardar evidencia RED/GREEN/TRIANGULATE/REFACTOR.
- `sdd-verify` debe comprobar pruebas reales y calidad de aserciones, no solo existencia de tests.
- Los artefactos existentes se leen antes de actualizarse; no se sobrescriben a ciegas.

Esto es arquitectura de trabajo, no burocracia. La diferencia importa: una regla que no protege una decision o una evidencia sobra; una regla que evita perder trazabilidad se queda.

## Uso esperado

Esta estructura esta pensada para vivir como contenido de `.copilot`, por ejemplo:

```text
.copilot/
  agents/
  instructions/
  skills/
```

En Windows, si se usa como configuracion personal, la ruta habitual seria:

```text
%USERPROFILE%\.copilot
```

En proyectos concretos, el valor esta en combinar esta configuracion con el contexto propio del repositorio: specs, tests, convenciones, ramas, issues y criterios de revision.

## Mantenimiento

Para anadir o cambiar una skill:

1. Edita o crea `skills/<nombre>/SKILL.md`.
2. Declara `name` y `description` en el frontmatter.
3. Manten reglas compactas, verificables y accionables.
4. Actualiza el registro de skills si el proyecto lo usa.

Para cambiar el flujo SDD, toca primero los contratos compartidos en `instructions/` y `_shared/`. Si cambias solo un agente y no el contrato comun, estas construyendo una casa con planos distintos para cada planta. Se puede hacer, pero luego no te sorprendas cuando cruje.

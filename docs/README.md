# Documentación de ospec-workflow

El [`README.md`](../README.md) de la raíz presenta el harness y el inicio rápido. Esta carpeta explica cómo funciona por dentro: metodología, fases, runtime, targets e instalación.

## Dirección y evidencia

| Documento | Para qué sirve |
| --- | --- |
| [roadmaps/harness-evolution.md](roadmaps/harness-evolution.md) | **Roadmap único**: dirección, prioridad, estado y criterios de cierre. |
| [analysis/](analysis/) | Evidencia fechada. La auditoría vigente es la del [2026-10-03](analysis/2026-10-03-auditoria-harness-y-gentle-ai.md). |
| [product/](product/brief.md) | Brief de ospec: problema, usuarios, objetivos y contexto de equipo. |
| [architecture/](architecture/README.md) | Arquitectura vigente de ospec: technical baseline, mapas de conocimiento y componentes, y los ADR de arquitectura. |
| [adr/](adr/README.md) | Decisiones de change archivadas (no son ADR de arquitectura), con su índice. |
| [roadmaps/archive/](roadmaps/archive/) | Roadmap y arquitectura del programa K1–K12. Historia, nunca estado vigente. |

## IDD, el flujo por defecto

IDD (desarrollo guiado por impacto) es el flujo por defecto desde E1.6: el router manda cada cambio de código a la skill `idd`, que lo lleva con el CLI `ospec` (`node scripts/ospec.js`) hasta que `ospec close` lo archiva en `idd/archive/`. Las señales de impacto del cambio deciden sus obligaciones, y solo la evidencia de ejecuciones que observa el CLI las satisface.

IDD solo trabaja dentro de un proyecto: un work tree git cuyo toplevel no es `$HOME` ni `/`. Fuera de uno, un arreglo del sistema o un script suelto se hacen directos. Una petición de proyecto monta antes su repositorio (`git init -b main`, aquí o en una carpeta nueva, y un commit base aprobado si ya hay código), y `ospec record intent` y `ospec next` se detienen con `not-a-git-repo` o `git-not-found` y el siguiente paso (E4.8).

Sin comandos en `checks:` de `idd/config.yaml`, no se obtiene la evidencia necesaria para cerrar. `ospec next` propone el paso `configure-checks`: la skill pide aprobar el comando candidato o indicar uno y espera antes de crear o editar el fichero, conservando sus claves. El siguiente `ospec check` abre el gate `checks-changed`, que registra esa aprobación, y abre una entrada nueva por cada juego de checks distinto de la base del cambio que nadie haya aprobado (E1.44). `ospec doctor` avisa si hay un cambio IDD abierto sin checks.

Los gates se resuelven solo con una respuesta explícita del usuario, pero su procedencia la declara el agente: `--source` vale `user` o `user-unverified` (respuesta reenviada) y el CLI rechaza otro valor, aunque no puede comprobar que el usuario respondiera. Lo mismo vale para `--answer` y `--quote`, en todos los gates, `review-limit` incluido (E1.29). La skill lo explica en `skills/idd/references/approvals.md`.

El perfil de equipo (`team:` con `size` y `experience`) decide la estrategia de entrega, el umbral de review, Strict TDD y la mentoría sin volver a preguntar. Cada modo lo declara en su configuración: `idd/config.yaml` u `openspec/config.yaml`. `ospec team` muestra el perfil y sus defaults (REQ-idd-023).

`ospec snapshot` exporta bajo demanda el avance del proyecto como snapshot de avance v1, con el esquema [`schemas/progress-snapshot/v1.schema.json`](../schemas/progress-snapshot/v1.schema.json): las fases de `docs/roadmap.md` (u otro fichero con `--roadmap <ruta>`), en orden, cada una con su estado. Una fase es cada fila de una tabla cuya primera celda empieza por `<ID>. <título>`, como `P1b.1. Revocación de acceso`. Un cambio IDD o SDD pertenece a la fase si su id es el de la fase sin puntos o empieza por él seguido de guion (`p1b1-revocacion`). La fase está `in-progress` si tiene un cambio activo, `done` si solo tiene archivados y `pending` si no tiene ninguno. El snapshot sale por stdout o se escribe con `--out <fichero>`. Un roadmap ausente o inválido sale con código 1, un mensaje con el fichero y la línea, y sin escribir nada. Ningún paso de IDD ni de SDD, ningún hook y ningún check lo ejecutan: publicarlo, por ejemplo desde el CI del proyecto, es cosa de cada proyecto (REQ-idd-026).

Con `--schema-version 2` sale el snapshot de avance v2, con el esquema [`schemas/progress-snapshot/v2.schema.json`](../schemas/progress-snapshot/v2.schema.json). Lleva las mismas fases, estados y orden que el v1, más los tramos del roadmap y los textos para el cliente de un fichero de avance. Sin la opción sale el v1, igual que antes.

- **Tramos.** Un tramo es un encabezado `##` del roadmap con tablas de fases debajo, hasta el siguiente `#` o `##`. Su id es el `<ID>` de `## S1. Walking skeleton`, en minúsculas. Si el encabezado no lleva `<ID>.`, el id sale del título, en minúsculas, sin tildes y con guiones: `## Hitos` da `hitos`. Un roadmap sin tramos da un v2 sin `groups`, y uno con fases dentro y fuera de tramos se rechaza.
- **Fichero de avance.** Es `docs/progress.md`, u otro con `--progress <ruta>`. Es opcional: sin él, el v2 lleva solo tramos y fases. Se escribe en Markdown, en el idioma del proyecto y con palabras clave fijas en inglés. Lo que va antes del primer `##` o `###` es libre y se ignora.

```markdown
## S1. La base

Lo imprescindible para empezar.

### S1a. La plataforma

- short: Plataforma
- start: 2026-01-05
- end: 2026-01-16
- preview: https://pruebas.example.com/

El proyecto ya está en internet, con una versión de prueba de cada cambio.

#### Tasks

- [x] dominio: Dominio propio
- [x] pruebas: Una versión de prueba de cada cambio

#### Outcomes

- Abrir la versión de prueba desde cualquier navegador

## Requests

### logo. Envíanos el logo

- phase: s1a
- due: 2026-01-30

Mejor en SVG.
```

- **Qué da cada parte.** `## <ID>. <título>` da el título y el resumen de un tramo del roadmap: su párrafo es el resumen. `### <ID>. <título>` va bajo el `##` de su tramo y da los textos de una fase del roadmap. `short`, `start`, `end` y `preview` dan su nombre corto, sus fechas y su versión de prueba, y su párrafo es la descripción. `#### Tasks` y `#### Outcomes` dan sus tareas y lo que el cliente podrá hacer cuando termine. `## Requests` lleva lo que el equipo necesita del cliente, con una fase y una fecha límite opcionales y un párrafo de detalle. Un título tras `<ID>.` sustituye al del roadmap, y `### S1b.` sin título conserva el suyo. Lo que no se escribe no sale.
- **Reglas.** Los ids se comparan en minúsculas y son exactos: `S1c.1`, no `S1c1`. Los de tareas y peticiones se escriben a mano y siguen el patrón `^[a-z0-9.-]{1,64}$`, para seguir una tarea de un snapshot al siguiente aunque cambie su título. Cada texto pierde el Markdown en línea y las líneas de un párrafo se unen; cada elemento admite un solo párrafo. Las fechas son `YYYY-MM-DD` reales y `start` no va después de `end`: en una fase `done` son las reales, en una `in-progress` el inicio real y el fin previsto, y en una `pending` las previstas. `preview` es una URL `https://` sin usuario ni contraseña, y se emite tal cual. Los límites son 20 tramos, 100 fases, 50 tareas por fase, 10 resultados, 10 peticiones, 40 caracteres el nombre corto, 200 los títulos, 1000 los párrafos y 64 KiB el snapshot.
- **Errores.** Un fichero de avance que nombra una fase o un tramo que el roadmap no tiene, que pone una fase bajo otro tramo, que deja sin marcar una tarea de una fase `done` o que se sale del formato termina con código 1 y `progress-invalid`, con el fichero y la línea del primer problema. Un `--progress` que no existe da `progress-missing`. Nunca se recorta ni se escribe nada.
- **Publicarlo.** Publicarlo sigue siendo cosa del proyecto, y conviene hacerlo desde la rama de integración, la que reúne el trabajo ya fusionado: `dev` si existe y si no `main`. ospec lee lo que hay en disco y no sabe de ramas. Un cambio llega a esa rama ya archivado dentro de su PR, así que su fase pasaría de `pending` a `done` sin salir nunca en curso. Para que salga `in-progress`, el cambio se abre en la rama de integración, con un commit que solo lleva `idd/<cambio>/`, antes de crear la rama de trabajo.

| Documento | Para qué sirve |
| --- | --- |
| [README.es.md](../README.es.md#idd-obligaciones-según-el-impacto-evidencia-de-ejecuciones-reales) | Señales, obligaciones, gates e inicio rápido. |
| [openspec/specs/idd/spec.md](../openspec/specs/idd/spec.md) | Contrato IDD: modos, señales, obligaciones, gates y el CLI `ospec`. |
| [skills/idd/SKILL.md](../skills/idd/SKILL.md) | El protocolo que sigue el agente. |

## Modo SDD opcional: metodología y ciclo

SDD se instala con `--with-sdd` y entra solo con un comando `/sdd-*` o una petición explícita.

| Documento | Para qué sirve |
| --- | --- |
| [sdd-metodologia.es.md](sdd-metodologia.es.md) ([English](sdd-metodologia.md)) | Modelo mental: principios, roles y por qué el contrato va antes que el código. |
| [sdd-fases.md](sdd-fases.md) | Contrato de cada fase: entradas, salidas y reglas. |
| [sdd-workflows.md](sdd-workflows.md) | Líneas de trabajo: estándar, lite, fast-forward, foundation, baseline brownfield, workspace y onboarding. |
| [sdd-routing.md](sdd-routing.md) | Rutas declaradas en `openspec/config.yaml` y gate de review de calidad. |
| [sdd-lifecycle-hooks.md](sdd-lifecycle-hooks.md) | Hooks declarativos en los límites de cada fase. |
| [openspec.md](openspec.md) | Persistencia de artefactos, specs delta, `state.yaml` y registro de supuestos. |
| [tdd-y-revision.md](tdd-y-revision.md) | Strict TDD, presupuesto de revisión y niveles de evidencia. |

## Runtime, targets e instalación

| Documento | Para qué sirve |
| --- | --- |
| [harness-runtime.md](harness-runtime.md) | Hooks del ciclo de vida, guards de seguridad y límites. |
| [harness-go-js-parity.md](harness-go-js-parity.md) | Qué está en Go, qué en JS y el contrato de paridad entre ambos. |
| [target-capabilities.md](target-capabilities.md) | Capacidades y degradación declarada por target. |
| [plugin-installation.es.md](plugin-installation.es.md) ([English](plugin-installation.md)) | Instalación y generación por target. |
| [codex/README.md](codex/README.md) | Punto de entrada para mantener el target Codex. |
| [model-routing.md](model-routing.md) | Tiers de modelo por fase (`models.yaml`). |
| [mcp-policy.md](mcp-policy.md) | Política y configuración de servidores MCP. |

## Onboarding

- [onboarding/developer.md](onboarding/developer.md), [onboarding/reviewer.md](onboarding/reviewer.md) y [onboarding/tech-lead.md](onboarding/tech-lead.md): ospec en 10 minutos según el rol.
- [en/README.md](en/README.md): resumen en inglés.

## Histórico

- [comparacion-arneses.md](comparacion-arneses.md): comparación de la v2.14.2, desactualizada. La vigente frente a gentle-ai está en la auditoría del 2026-10-03 y, medida con agentes reales, en [bench-idd-vs-gentle-ai.es.md](benchs/bench-idd-vs-gentle-ai.es.md) ([English](benchs/bench-idd-vs-gentle-ai.md)).
- [testing/](testing/): evidencia TDD de changes concretos.

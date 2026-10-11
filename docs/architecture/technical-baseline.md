# Technical baseline de ospec-workflow

Arquitectura vigente de ospec, recuperada del propio repositorio con la foundation ([E2.6](../roadmaps/harness-evolution.md#e26--dogfood-ospec-foundation)). Las decisiones estructurales están en [`decisions/`](decisions/), el conocimiento y sus huecos en [`knowledge-map.yaml`](knowledge-map.yaml) y los componentes con su evidencia en [`component-map.yaml`](component-map.yaml).

## Context and boundaries

ospec es un plugin que se instala en el host de un agente de código y en el repositorio del usuario. Lo usan:

- **El usuario**, que pide cambios y responde a los gates.
- **El agente del host**, que sigue las skills y llama al CLI `ospec`.
- **El mantenedor de ospec**, que edita la fuente canónica y publica.

Fuera del alcance: ospec no opera ningún servicio, no guarda datos fuera del repositorio del usuario y no sustituye al control de versiones ni al CI del proyecto.

## Components and data

| Componente | Datos que posee | Quién escribe |
| --- | --- | --- |
| `cli` (`scripts/ospec.js`) | Ninguno propio | — |
| `idd-engine` (`scripts/lib/idd-*.js`) | Señales, obligaciones y evidencia de un cambio IDD | Solo a través de `change-state` |
| `change-state` (`idd-store.js`, `ospec-state.js`) | `idd/<change>/state.yaml` y `openspec/changes/<change>/state.yaml` | Solo el CLI y el runtime, con escritura atómica bajo lock |
| `foundation` | `docs/architecture/knowledge-map.yaml` | `ospec foundation record` |
| `review-lineage` | El linaje de una revisión acotada SDD | El reducer puro; el orquestador persiste lo que devuelve |
| `generator` (`scripts/configure/`) | `dist/<target>/` | El generador, nunca a mano |
| `hooks` | Ningún dato de negocio; solo trazas efímeras en `.ospec/` | El runtime de hooks |
| `skills` | Ninguno | El mantenedor |

## Integrations

| Dependencia | Dueño | Protocolo | Modo de fallo |
| --- | --- | --- | --- |
| Host del agente (cinco targets) | Cada proveedor | Hooks declarados y ficheros de plugin | Un host sin un hook degrada según `docs/target-capabilities.md` |
| Git | El usuario | Proceso local | El pre-commit bloquea si no puede leer el índice; la trazabilidad falla abierta |
| Memoria entre sesiones | Opcional, del usuario | Herramientas MCP | Su caída solo quita contexto |
| Repositorio de releases | El mantenedor | Release del repositorio | Sin release no hay binario nuevo; el hook JS sigue disponible |

## Quality scenarios

Los cinco escenarios están en `knowledge-map.yaml` con origen, estímulo, entorno, artefacto y respuesta. Ninguno tiene medida: el usuario no la ha definido.

| Atributo | Escenario | Prioridad |
| --- | --- | --- |
| Reanudabilidad | `deterministic-resume` | Alta |
| Paridad entre targets | `target-parity` | Alta |
| Seguridad | `guard-fail-closed` | Alta |
| Disponibilidad local | `offline-operation` | Media |
| Evolución de contratos | `contract-compatibility` | Media |

## Constraints

- `constraint:host-agnostic`: ospec se instala en varios hosts de agente con capacidades distintas. Fuente: `docs/target-capabilities.md`.
- `constraint:untrusted-model-output`: lo que escribe un modelo no es evidencia ni autoridad. Fuente: `skills/idd/SKILL.md`.
- `constraint:context-budget`: el contexto del agente es limitado y se pierde entre sesiones. Fuente: escenario `deterministic-resume`.
- `constraint:single-maintainer`: un mantenedor con agentes. Fuente: respuesta del usuario, 2026-10-11.
- `constraint:local-install`: se instala y se ejecuta en la máquina del usuario, sin servicio propio. Fuente: `package.json`.
- `assumption:hosts-honor-hooks`: los hosts ejecutan los hooks que el plugin declara. Se revisa si un host deja de hacerlo o los ignora en un modo de permisos.

## Test strategy

- **Unitarios** (`scripts/**/*.test.js`): reglas del motor IDD, reducers de revisión, validadores de contratos y transformaciones del generador.
- **Golden por target** (`scripts/configure/cli.test.js`): el árbol generado coincide con el fixture comprometido.
- **Paridad Go ↔ JS** (`scripts/hooks/parity-contract.test.js`): los dos lados de cada hook dan la misma decisión.
- **Integración** (`scripts/hooks/lib/staged-validator.integration.test.js`): el pre-commit contra un repositorio real.
- **Documentación de arquitectura** (`scripts/lib/architecture-decisions.test.js`): cada ADR pasa el lint de E2.4 sin avisos.

Sin porcentaje de cobertura. Todo corre con `node scripts/check.js`.

## Technology record

| Elección | Implementa | Alternativas | Por qué | Fuente |
| --- | --- | --- | --- | --- |
| Node.js ≥ 22 sin dependencias para el CLI, el generador y los hooks de respaldo | 0003, 0010 | Paquetes de terceros desde un registro | Viene con los hosts objetivo; MIT; sin coste ni descarga | `package.json`, revisado 2026-10-11 |
| Go para el binario de los hooks del camino caliente y el instalador | 0008, 0010 | Solo Node | Arranque en ~0.03 s frente a ~0.3–0.5 s por tool-call; se distribuye compilado | `docs/harness-go-js-parity.md` y `go.mod`, revisados 2026-10-11 |
| JSON Schema 2020-12 para los contratos de máquina | 0009 | Validación ad hoc en código | Un validador propio en `kernel-schema-validator.js`, sin dependencia | `schemas/`, revisado 2026-10-11 |

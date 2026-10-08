# Roadmap único de ospec-workflow

> **Versión de referencia:** v2.117.3, 2026-10-08.
> **Autoridad:** este es el único documento que fija dirección, prioridad, estado y criterios de cierre del harness. `docs/architecture/` queda reservada para la arquitectura vigente de ospec (E2.6), el análisis fechado (`docs/analysis/`) es evidencia, y el roadmap K1–K12 y su [arquitectura objetivo](archive/2026-10-03-arquitectura/README.md) están archivados.
> **Origen:** [auditoría del 2026-10-03](../analysis/2026-10-03-auditoria-harness-y-gentle-ai.md) y la decisión del mismo día de que SDD deje de ser el flujo por defecto.
> **Regla de estado:** los hechos se contrastan con código y OpenSpec. Este documento no cambia el estado de ningún change.

## Norte

**ospec debe ser el harness que entiende el proyecto: qué se construye, para quién, con qué equipo, bajo qué atributos de calidad y por qué está hecho así. Debe aplicar ese conocimiento en cada cambio con la ceremonia que justifica su impacto, ni más ni menos, y cerrar cada cambio con evidencia comprobada por código.**

SDD resolvió un problema real: que el modelo construyera sin entender lo que hacía. Hoy cobra demasiado: 44–63 KB de orquestador, 60–75 KB de protocolo y un subagente por fase. Además, buena parte de esa ceremonia ni siquiera se cumple: `validate-phase` se ejecutó en ~10 % de los despachos observados. Los modelos actuales no necesitan que el proceso les dicte cada paso; necesitan saber qué importa en este proyecto y qué deben demostrar. ODD (gentle-ai) lo resuelve con un único documento por feature, pero sin conocimiento del proyecto: clasifica por tamaño y cierra cuando las tareas están hechas.

ospec adopta un flujo propio por defecto: **IDD, desarrollo guiado por impacto.** El impacto del cambio sobre lo que el proyecto sabe decide cuánta ceremonia merece, y la evidencia decide cuándo está terminado. SDD se mantiene como **modo opcional** para quien lo pida.

Cuatro movimientos, en este orden:

1. **Base sana:** que todo funcione en cualquier proyecto y en los 7 targets, cargando solo lo necesario.
2. **IDD como flujo por defecto:** obligaciones derivadas del impacto y comprobadas por el CLI `ospec`. SDD pasa a ser opcional.
3. **Conocimiento de primera clase:** una foundation que hace las preguntas de un proyecto serio y produce ADRs de arquitectura de verdad, que cada cambio consume por referencia.
4. **Demostración:** IDD se mide contra el modo SDD y contra gentle-ai con escenarios comparables.

## Principios

1. **Conocimiento antes que ceremonia.** Cada pregunta, documento o gate debe cerrar un hueco de conocimiento o sostener una garantía. Si no hace ninguna de las dos cosas, se elimina.
2. **Profundidad por impacto, no por tamaño.** Un cambio de dos líneas que contradice un ADR pesa más que un refactor mecánico de 500.
3. **Cierre por evidencia, no por documentos.** Un cambio está terminado cuando cada obligación tiene evidencia registrada por el CLI. No basta con que existan artefactos ni con que el modelo diga que funciona.
4. **Algoritmos en código, juicio en el modelo.** Señales, obligaciones, transiciones y registros los decide el CLI `ospec`. El modelo decide el contenido: qué preguntar, cómo diseñar y qué código escribir.
5. **Carga bajo demanda por construcción.** Nada entra en contexto si la tarea no lo necesita, y el presupuesto de bytes por target se comprueba en CI.
6. **Multi-target honesto.** Los 7 targets (Claude Code, Codex, GitHub Copilot, VS Code, Cursor, OpenCode y Antigravity) comparten semántica; cada uno declara sus capacidades reales y degrada de forma explícita.
7. **SDD es una opción, no el camino.** Sigue operativo para quien lo pida y comparte foundation, garantías y CLI, pero no recibe capacidades nuevas sin demanda.
8. **Las garantías vigentes se conservan como obligaciones:** Strict TDD con evidencia cuando el proyecto lo declara, review independiente con hallazgos congelados y una corrección acotada cuando el impacto lo pide, cierre transaccional, aprobaciones solo desde respuestas explícitas, estado en disco, fallo cerrado ante identidad ambigua y memoria sin autoridad. Ninguna se retira sin una equivalencia medida.
9. **Se construye con ospec.** En cuanto IDD sea el flujo por defecto (E1.6), los ítems de este roadmap se ejecutan con IDD y E4 mide el resultado.

## IDD: desarrollo guiado por impacto

| | SDD (modo opcional) | ODD (gentle-ai) | IDD (por defecto) |
| --- | --- | --- | --- |
| Unidad de trabajo | Fases con artefactos: proposal, spec, design, tasks, apply, verify y archive | Un documento por feature | Ninguno o un documento vivo, según las obligaciones del cambio |
| Qué decide la profundidad | La ruta elegida al inicio | Una clasificación inicial, con unas 400 líneas como heurística | Señales de impacto que calcula el CLI y recalcula con el diff real |
| Conocimiento del proyecto | Specs de comportamiento | Memoria | Foundation, ADR, atributos de calidad y equipo por referencia, más memoria |
| Cuándo está terminado | Verify contra los artefactos | Tareas completadas y review por riesgo | Cada obligación tiene evidencia registrada por el CLI |
| Coste fijo | Orquestador de 44–63 KB y un subagente por fase | Orquestador de 17–24 KB | Router de ≤ 4 KB y protocolo de ≤ 12 KB, en el hilo principal |

### El ciclo

```text
intención ─► ospec next ─► señales ─► obligaciones ─► el modelo trabaja
                 ▲                                           │
                 └───── ospec check (recalcula con el diff) ◄┘
                                     │
          listo · falta <obligación> · necesita tu decisión ─► ospec close
```

1. **Intención.** El modelo resume en una o dos frases qué se pide (bug, feature, refactor o documentación) y cómo se sabrá que está hecho. Solo pregunta si la intención es materialmente ambigua.
2. **Señales.** El CLI las calcula con esa declaración, las rutas que se van a tocar y, después, el diff real. Cada proyecto declara una vez en `idd/config.yaml` qué rutas corresponden a cada señal, con valores por defecto según el stack. Desde E3.2 también salen del mapa componente → conocimiento.
3. **Obligaciones.** Cada señal añade obligaciones concretas, cada una con su evidencia (tabla siguiente). No hay rutas ni recetas: la profundidad es la suma de lo que el cambio debe demostrar.
4. **Trabajo.** El modelo trabaja en el hilo principal con las referencias de conocimiento que le pasa `ospec next`. Usa subagentes solo para explorar código grande o cuando una obligación exige independencia, como un review.
5. **Comprobación.** `ospec check` ejecuta los checks, lee la evidencia y recalcula las señales con el diff real. Una obligación nueva aparece en cuanto el diff la provoca; ninguna desaparece sin una decisión explícita.
6. **Cierre.** `ospec close` archiva de forma transaccional cuando no queda ninguna obligación pendiente. La entrega (PR y merge) la decide la persona.

### Señales y obligaciones

| Señal | Obligación | Evidencia que la cierra |
| --- | --- | --- |
| Siempre | Los checks que declara el proyecto (tests, lint y build) pasan | Ejecución registrada por el CLI, nunca la afirmación del modelo |
| El proyecto declara Strict TDD | Test en rojo antes del código en cada unidad de trabajo | Las dos ejecuciones de cada unidad, registradas por `ospec run` |
| Corrección de un bug | Test de reproducción que falla antes del arreglo y pasa después | Las dos ejecuciones, registradas por `ospec run` (receta Repair, piloto de v2.79.0–v2.80.0) |
| Más de una unidad de trabajo o una decisión no obvia | Documento vivo con el plan y las decisiones del cambio | El documento, al día en el cierre |
| Cambia un contrato público (API, CLI, esquema o formato de fichero) | Contrato de comportamiento actualizado y su test | El documento del contrato (patrones por stack y `contracts:` de `idd/config.yaml`) y el test |
| Datos o estado persistente (migración o formato en disco) | Compatibilidad o reversión declarada y test de migración | El test |
| Frontera de seguridad (autenticación, secretos, permisos o entrada externa) | Review independiente de confianza | Hallazgos congelados y, como mucho, una corrección acotada |
| Toca un componente con ADR o atributo de calidad (desde E3) | Declaración de impacto: ninguno, conforma, enmienda o contradice | *Fitness functions* del ADR (E3.3). Enmendar o contradecir requiere tu decisión |

**Cuándo pregunta IDD.** Solo en cuatro casos: si la intención es materialmente ambigua, si quedan hechos de comportamiento que ni la petición ni el código fijan (todos en un solo lote, antes de editar; desde v2.110.0), si el cambio enmienda o contradice un ADR, o si hay una operación destructiva o irreversible. En todo lo demás avanza sin gate.

**Cómo se ve.** Un typo cierra sin documento ni preguntas, solo con los checks. Un bug cierra con su test de reproducción. Un cambio de API pública abre un documento vivo y actualiza el contrato y su test. Un cambio que contradice el ADR de integración se detiene hasta que decides.

**Qué reutiliza:** los suelos de riesgo de PP1/PP2 para las señales, la evidencia estructurada de Strict TDD, el gate de review selectivo con linaje acotado, la receta Repair del piloto, el archive transaccional y `ospec-state` y `result-envelope` para el estado. **Qué no usa:** Authority Store, permits ni attestations, que E1.5 retiró. Execution Graph y Assurance Graph siguen solo como parte del binding K7 del review.

**Hipótesis que E4 debe demostrar.** Frente al modo SDD, IDD gasta menos tokens sin dejar escapar más defectos. Frente a ODD, deja escapar menos defectos en los cambios que tocan contratos, datos, seguridad o arquitectura, con un coste comparable.

## Objetivos medibles

| Métrica | Hoy (v2.81.3) | Cierre E1 (v2.117.1) | gentle-ai | Objetivo | Etapa |
| --- | --- | --- | --- | --- | --- |
| Instrucciones cargadas siempre (peor target) | 2,7–3,0 KB en los 7 targets desde v2.88.0, router incluido (antes, 63 KB en Codex y 23–26 KB en Cursor, Copilot, OpenCode y Antigravity) | 3,1–3,5 KB | Orquestador de 17–24 KB | Router de ≤ 4 KB | E0.2 ✅, E0.4 ✅ |
| Contexto del flujo por defecto | Orquestador SDD de 44–63 KB más 60–75 KB por fase | Router más protocolo IDD: 8,6–9,0 KB (12,8–13,2 KB con el listado de skills); orquestador por defecto, 0 KB | 17–24 KB | Router más protocolo IDD ≤ 16 KB | E1.6 ✅ |
| Agentes que cargan su skill en un proyecto consumidor | 100 % desde v2.83.0 (antes, parcial: `sdd-apply` y `sdd-clarify` sin skill) | 100 % | — | 100 % | E0.1 ✅ |
| Obligaciones comprobadas por código | `validate-phase` en ~10 % de los despachos observados | 7 de 7 obligaciones activas, solo con evidencia que registra el CLI (la de ADR, inactiva hasta E3.1) | Binario | 100 %, vía `ospec check` | E1.4 ✅ |
| Documentos creados en un cambio trivial | Los de la ruta lite | 0 | 1 | 0 | E1.6 ✅ |
| Preguntas antes de empezar un cambio | Hasta 4 por sesión | Un lote por cambio (3–7 preguntas) en `open-facts`; en el banco, 6 mensajes frente a 13 de SDD | 0–1 | Un solo lote, solo en los cuatro gates (antes, «0, salvo los tres casos de gate»; cuarto gate desde v2.110.0) | E1 ✅ |
| Conocimiento capturado en foundation | 9 preguntas lineales | Sin cambios | Ninguno | Mapa de conocimiento por perfil, con huecos explícitos | E2 |
| ADRs de arquitectura (agnósticos de tecnología) | 0: los ADRs actuales son decisiones de desarrollo | Sin cambios | 0 | Desde foundation y desde los cambios que tocan arquitectura | E2–E3 |
| Skills instaladas por defecto | 82; 46 (+6 opcionales) desde v2.91.0 | 31, con SDD (`--with-sdd`) y 6 extras opcionales | ~15 | 46 (+6 opcionales); las de fase SDD, en el paquete opcional | E0.3 ✅, E1.6 ✅ |
| Escenarios comparados | 0; línea base del modo SDD medida en los 6 (`sdd-baseline-3`, v2.107.1: 0 escapados, 65,7 M tokens) | 6 contra el modo SDD (`idd-2`: 0 escapados, 3,06 M tokens, el 4,7 %); falta gentle-ai | — | 6, contra el modo SDD y contra gentle-ai, publicados por release | E4 |

**Checkpoint de cierre de la Etapa 1 (2026-10-08): `continue`.** Todas las filas de la Etapa 1 cumplen su objetivo; método, cifras y salvedades en el [informe](../analysis/2026-10-08-checkpoint-etapa-1.md).

## Cómo se ejecuta este roadmap

- **Hasta E1.6,** cada ítem es un cambio directo en su rama, con el flujo de release de `AGENTS.md`, como v2.81.1–v2.81.3. Si cambia código, el test en rojo va primero. Si toca comportamiento especificado, actualiza la spec canónica de `openspec/specs/` en el mismo PR. No se usa SDD salvo que el ítem lo pida.
- **Desde E1.6,** cada ítem se ejecuta con IDD y E4 registra su coste.
- **Tamaño.** Si un ítem supera unas 400 líneas, se entrega en PRs encadenados; el ítem no se parte artificialmente.
- **Al cerrar un ítem:** actualizar la tabla de estado y la versión de referencia, y seguir el flujo de release.
- **Al cerrar cada etapa:** checkpoint `continue | revise` contra la tabla de objetivos, con números.
- **Entrada de trabajo nuevo:** un ítem nuevo solo entra si dice qué fila de los objetivos mueve o qué garantía protege.
- **Lo aparcado** (al final) no se toca sin cumplir su criterio de reapertura.

<a id="orden-recomendado-de-trabajo"></a>

## Estado y orden

| Estado | ID | Change | Tipo |
| --- | --- | --- | --- |
| `done` | **E0.0** | `measure-context-baseline` | medición |
| `done` | **E0.1** | `fix-phase-agent-skill-loading` | bugfix |
| `done` | **E0.2** | `scope-always-on-instructions` | refactor |
| `done` | **E0.3** | `curate-skill-catalog` | refactor |
| `done` | **E0.4** | `router-and-sdd-on-demand` | feature |
| `done` | **E1.1** | `idd-contract` | contrato |
| `done` | **E1.2** | `ospec-cli-core` | feature |
| `done` | **E1.3** | `impact-signals` | feature |
| `done` | **E1.4** | `ospec-check-and-close` | feature |
| `done` | **E1.5** | `kernel-wiring-inventory` | refactor |
| `done` | **E1.6** | `idd-default-entry` (IDD por defecto en v2.112.0, SDD con `--with-sdd` en v2.113.0, README y documentación en v2.114.0) | feature |
| `done` | **E1.7** | `ospec-doctor` ((a) núcleo, proyecto y Claude Code en v2.115.0; (b) los otros seis targets en v2.116.0) | feature |
| `done` | **E1.8** | `sdd-new-intent-argument` (v2.114.2) | bugfix |
| `done` | **E1.9** | `install-cli-ux` (salida común con fases y resumen en los 7 instaladores y publicación de `dist/vscode` con VS Code abierto, en v2.117.0) | bugfix |
| `done` | **E1.10** | `vscode-dry-run` (`setup:vscode --dry-run` ya no toca `dist/vscode`, y el árbol se publica preparado o no se publica, en v2.117.1) | bugfix |
| `pending` | **E1.11** | `idd-protocol-hygiene` (follow-up del checkpoint de la Etapa 1) | bugfix |
| `pending` | **E1.12** | `session-hook-idd` (follow-up del checkpoint de la Etapa 1) | bugfix |
| `pending` | **E1.13** | `idd-openspec-asymmetries` (follow-up del checkpoint de la Etapa 1) | bugfix |
| `pending` | **E1.14** | `codex-repo-runtime` (follow-up del checkpoint de la Etapa 1) | bugfix |
| `pending` | **E1.15** | `idd-review-successor-policy` (coherencia de autoridades; decisión humana pendiente) | contrato |
| `next-eligible` | **E2.1** | `knowledge-map-contract` | contrato |
| `pending` | **E2.2** | `decision-gap-engine` | feature |
| `pending` | **E2.3** | `foundation-discovery-rounds` | feature |
| `pending` | **E2.4** | `decision-records-model` | feature |
| `pending` | **E2.5** | `brownfield-architecture-recovery` | feature |
| `pending` | **E2.6** | `dogfood-ospec-foundation` | dogfooding |
| `pending` | **E3.1** | `change-decisions-and-adr-impact` | feature |
| `pending` | **E3.2** | `knowledge-by-reference` | feature |
| `pending` | **E3.3** | `fitness-functions-in-check` | feature |
| `pending` | **E3.4** | `team-context-defaults` | feature |
| `pending` | **E3.5** | `knowledge-memory-loop` | feature |
| `done` | **E4.1** | `bench-scenarios` (checkpoint `continue` con `idd-2` en v2.111.0) | medición |
| `pending` | **E4.2** | `head-to-head-gentle-ai` | medición |
| `pending` | **E4.3** | `context-budget-ratchet` | medición |
| `pending` | **E4.4** | `execution-resource-experiment` (experimento previo a cualquier routing adaptativo) | medición |
| `pending` | **E5.x** | Plataforma por demanda | según ítem |

**▶ SIGUIENTE:** E2.1 `knowledge-map-contract`, que abre la Etapa 2. El [checkpoint de cierre de la Etapa 1](../analysis/2026-10-08-checkpoint-etapa-1.md) da `continue`: todas sus filas de objetivos se cumplen. Sus follow-ups E1.11–E1.14 y la coherencia de política de E1.15 siguen `pending` y en paralelo con la Etapa 2, sin bloquearla. El plugin SDD del marketplace sigue como E5.8, por demanda.

**Cinco oportunidades aceptadas el 2026-10-08**, en orden de retorno esperado de la auditoría. Se amplían tres ítems existentes y se añaden dos acotados; aceptar su entrada al roadmap no completa sus garantías ni resuelve sus decisiones pendientes.

| Prioridad | Ítem | Beneficio y validación mínima | Coste y límite |
| --- | --- | --- | --- |
| 1 | **E1.12** | Reanudar IDD desde disco; consumidor sin `openspec/`, con un cambio abierto y siguiente paso correcto | Corrección localizada; reutilizar store y `next`, sin estado autoritativo nuevo |
| 2 | **E1.13** | Respetar Strict TDD en el modo activo; matriz IDD/SDD × strict/standard × con/sin tests | Conservar el guard existente; no ampliar la heurística ni sustituir la evidencia del CLI |
| 3 | **E2.1** | Conocimiento arquitectónico con procedencia y huecos explícitos; esquema y ejemplos de los seis perfiles | Contrato inicial; ADR, consumo selectivo y fitness functions permanecen en E2.4 y E3 |
| 4 | **E1.15** | Eliminar la contradicción sobre aprobación de sucesores; política explícita y pruebas de linajes | Requiere elegir la política antes de implementarla; sin gates ni revisores adicionales por defecto |
| 5 | **E4.4** | Saber si ajustar recursos reduce el coste de una entrega válida; ensayo controlado con checks independientes | Primero variar solo effort; no autoriza router, configuración duplicada ni orquestador nuevo |

**Recomendación de ejecución:** E1.12 ofrece el retorno inmediato más claro; puede abordarse en paralelo sin desplazar E2.1 como siguiente paso estratégico. Para recursos, la decisión actual es **optimización mínima** con la infraestructura existente; cualquier routing depende de evidencia posterior de E4.4.

**Dependencias:**

```text
E0.0 ─ E0.1 ─┬─ E0.2 ─┬─ E0.4 ──────────────────────┐
             ├─ E0.3 ─┘                             │
             └─ E4.1 (línea base: modo SDD y ODD) ──┤
                                                    ▼
E1.1 ─ E1.2 ─┬─ E1.3 ─ E1.4 ───────────────────── E1.6 ─ E1.7 ─ E1.9 ─ E1.10 ─ checkpoint E1
             └─ E1.5 (en paralelo)                                                    │
                                                    E1.11 / E1.12 / E1.13 / E1.14 ◄───┘ (en paralelo con E2)
E1.4 ─ E1.15 (decisión de política; en paralelo con E2)

E1.2 ─ E2.1 ─ E2.2 ─ E2.3 ─ E2.4 ─ E2.5 ─ E2.6
E1.4 y E2.4 ─ E3.1 ─ E3.2 ─ E3.3 / E3.4 / E3.5
E1.6 ─ E4.2 ─ E4.3
E4.1 ─ E4.4 (experimento independiente de E4.2; sin router)
```

E2.1 y E2.2 pueden empezar antes de E1.2 si E1 se retrasa, guardando su estado con escrituras atómicas propias hasta que `record` exista.

## Etapa 0 — Base sana: correcta, *lazy* y barata

**Resultado de la etapa:** ospec funciona igual en un proyecto consumidor que en este repositorio, en los 7 targets, y su coste fijo baja al nivel de gentle-ai o por debajo.

### E0.0 — `measure-context-baseline`

- **Objetivo:** fijar los números de partida antes de cambiar nada.
- **Alcance:** script que construye los 7 targets en un directorio temporal y emite, por target, los bytes cargados siempre, el tamaño del orquestador, los bytes que lee cada fase o agente (agente, skill y `_shared`) y el número de skills listadas. Fixture versionado con esos valores y test de CI que los usa como techo.
- **Hecho cuando:** el informe reproduce las cifras de la auditoría y el test falla si algún valor sube.
- **Entregado en v2.82.0:** `node scripts/measure-context-baseline.js` mide en memoria, con techos en `scripts/fixtures/context-baseline.json` comprobados por `scripts/lib/context-baseline.test.js`. Línea base y método en [target-capabilities §7](../target-capabilities.md#7-coste-de-contexto-por-target-e00).

### E0.1 — `fix-phase-agent-skill-loading`

- **Problema:** los agentes leen `skills/<skill>/SKILL.md` con ruta relativa, que no existe en un proyecto consumidor. En una sesión real, `sdd-apply` y `sdd-clarify` trabajaron sin su skill. En este repositorio no se ve porque `skills/` está en la raíz.
- **Alcance:** el generador incrusta en cada agente generado (fases SDD y revisores) el cuerpo de su skill y las referencias de `_shared` que necesita, en los 7 targets. Las referencias que un agente lee solo bajo condición se resuelven desde su propio directorio o se incrustan.
- **Hecho cuando:** (1) un test de build comprueba que ningún agente generado contiene rutas `skills/` relativas; (2) un test por target comprueba que cada agente incluye sus reglas duras; (3) una ejecución real en un repositorio temporal sin `skills/` en la raíz completa una exploración y un review sin lecturas fallidas.
- **Entregado en v2.83.0:** `scripts/lib/agent-embed.js` incrusta en cada agente de trabajo una sección `## Embedded references` con su skill, los módulos de su directorio y los `_shared` que nombra, y reescribe las referencias como marcadores `«id»` (REQ-generator-019). `scripts/lib/agent-embed.test.js` cubre (1) y (2) en los 7 targets. Para (3), `sdd-explore` y `review-trust` de un build de Claude cargado con `--plugin-dir` completaron su trabajo en un repositorio temporal sin `skills/`, sin ninguna llamada fallida. Coste: `sdd-apply` y `sdd-verify` suben unos 20 KB porque ahora cargan los módulos de Strict TDD que antes se perdían ([target-capabilities §7](../target-capabilities.md#7-coste-de-contexto-por-target-e00)). El orquestador sigue leyendo `skills/_shared/` con rutas relativas; eso pertenece a E0.4.

### E0.2 — `scope-always-on-instructions`

- **Problema:** Cursor, Copilot, OpenCode y Antigravity convierten reglas acotadas en reglas para todo (`alwaysApply`, `applyTo: "**"` o instrucciones globales). Además, Cursor instala como regla `alwaysApply` el `AGENTS.md` de este repositorio, con el flujo de release propio de ospec, en todos los proyectos consumidores.
- **Alcance:**
  - El transform conserva el ámbito de la fuente con el mecanismo nativo de cada host: `paths` en Claude, `applyTo` en Copilot y VS Code, `globs` con `alwaysApply: false` en Cursor, y el equivalente en OpenCode y Antigravity, revalidado con la documentación oficial al abrir el change.
  - Lo que es de este repositorio (release, versión y changelog) se separa de lo que es del producto (ciclo de review acotado) y deja de distribuirse.
- **Hecho cuando:** ninguna regla acotada en la fuente se instala como global en ningún target (test por target), ningún target distribuye el flujo de release de este repositorio y los techos de E0.0 bajan.
- **Entregado en v2.84.0:** `scripts/lib/rule-scope.js` clasifica cada regla por su `applyTo` de origen (REQ-generator-020). Las globales siguen siendo *always-on*. Las de `agents/**` (protocolo SDD común y Engram) se incrustan en el orquestador, como ya hacía Claude. Las de ruta usan el mecanismo nativo, comprobado en la documentación oficial: `globs` con `alwaysApply: false` en Cursor, `applyTo` en Copilot, y `trigger: glob` con `globs` en Antigravity, que no lee `applyTo`. Las llaves se expanden porque Copilot y Antigravity separan patrones por comas. OpenCode no tiene ámbito por ruta: la regla de OpenSpec pasa al orquestador y la de Strict TDD no se carga, como en Claude. Cursor deja de sintetizar `agents-protocol.mdc`, porque el ciclo de review acotado ya está en `sdd-common`. `scripts/lib/rule-scope.test.js` cubre los tres criterios en los 7 targets. Resultado: *always-on* de 22–26 KB a 2,3–2,4 KB, y el orquestador sube unos 11 KB, solo en sesiones SDD ([target-capabilities §7](../target-capabilities.md#7-coste-de-contexto-por-target-e00)). Codex sigue cargando su `AGENTS.md`, que es el orquestador; eso pertenece a E0.4.

### E0.3 — `curate-skill-catalog`

- **Alcance:** aplicar el veredicto de la [auditoría §5](../analysis/2026-10-03-auditoria-harness-y-gentle-ai.md#5-catálogo-de-skills-puntos-1-y-2), con gate de confirmación de la lista:
  - Eliminar o fusionar 30 skills.
  - Crear un paquete opcional (`--with-extras`) con issue-creation, comment-writer, gh-release-notes, judgment-day, caveman-compress y stack-webmcp.
  - Consolidar las skills de stack con `references/` (24 → 13).
  - Retirar las lentes de review v1, con migración de linajes v1 → v2 y lectura compatible durante una versión menor.
  - Arreglar el extractor de *compact rules*: solo secciones `## Reglas`/`## Hard Rules` o `compact_rules:` explícito, nunca antipatrones ni "cuándo usar".
  - Lint de `Trigger:` obligatorio en las skills de conocimiento.
- **Entrega sugerida:** PRs encadenados: (a) extractor y lint, (b) eliminaciones y fusiones, (c) consolidación de stacks, (d) retirada de review v1.
- **Hecho cuando:** 46 skills por defecto; ninguna *compact rule* procede de un antipatrón (test); los consumidores con linaje v1 siguen funcionando durante la ventana de compatibilidad.
- **Avance:** lista de la auditoría confirmada el 2026-10-04, incluida la retirada de review v1.
  - **(a) entregado en v2.85.0:** el extractor (JS y Go, con test de paridad sobre las skills reales) solo lee encabezados de reglas explícitos (`… Rules`, `Reglas …`) y ya no recoge todas las viñetas cuando no los hay. El test recorre las skills publicadas y falla si una *compact rule* sale de un antipatrón o de una lista de activación. El lint exige `Trigger:` a toda skill de conocimiento, con exención temporal de las que (b) elimina o fusiona. `accessibility`, `api-design` y `hexagonal-architecture` ganan una sección `## Rules` breve, porque antes inyectaban sus antipatrones.
  - **(b) entregado en v2.86.0:** se eliminan `agent-harness-construction`, `ai-first-engineering`, `agent-self-evaluation`, `token-budget-advisor`, `tdd-workflow`, `context7-mcp`, `backend-patterns`, `frontend-patterns`, `architecture-decision-records` y `caveman-help`. `caveman-commit` y `caveman-review` pasan a ser modos de `caveman`; `agent-introspection`, a la regla de recuperación del orquestador; `ai-regression-testing`, a `sdd-verify/references/ai-blind-spots.md`; `harness-audit`, a skill local del repositorio (`.agents/skills/`). El dominio de spec `token-budget-advisor` se conserva: describe el hook de `PreToolUse`, no la skill. El lint de `Trigger:` ya no tiene exenciones y el tope de *compact rules* baja de 500 a 450 tokens.
  - **(b2) entregado en v2.87.0:** `scripts/lib/skill-extras.js` define el paquete opcional (`issue-creation`, `comment-writer`, `gh-release-notes`, `judgment-day`, `caveman-compress`, `stack-webmcp`). El generador lo deja fuera salvo con `withExtras` (REQ-generator-021), y los 7 instaladores y `install-target` aceptan `--with-extras` (REQ-install-032). Reinstalar sin el flag las desinstala, porque la poda por manifiesto quita lo que la build ya no trae. Por target quedan 61 skills instaladas (62 en Claude) y el listado baja unos 0,95 KB. El instalador TUI (Go) no expone todavía el paquete.
  - **(c) entregado en v2.90.0:** una skill de stack por tecnología (REQ-skills-021). Las 11 sub-skills de Go, Kotlin, Python, React y Spring Boot (testing, rendimiento, seguridad, TDD, verificación, corrutinas, Ktor y Exposed) pasan a `references/` de su skill, que gana una regla condensada por sub-área con el nombre del fichero que hay que leer. React y Spring Boot no tenían sección de reglas y no inyectaban nada; ahora inyectan sus reglas. Un test exige capacidades únicas, 13 skills de stack y enlaces resolubles (había cuatro enlaces rotos en React). Quedan 50 skills instaladas por target (51 en Claude) y el listado baja unos 0,93 KB.
  - **(d) entregado en v2.91.0:** se retiran los agentes y las skills `review-risk`, `-reliability`, `-resilience` y `-readability`, junto con su modelo y la lista de solo lectura de Cursor, con una enmienda al [ADR-003](../adr/adr-20260903-003-dual-schema-lineage-migration.md) y al ADR-004. Ningún plan despacha ya una lente v1. Una ruta con `4r-review-gate` se bloquea (`legacy-review-retired`). Un linaje v1 sin estrenar devuelve `migrate-taxonomy-v2`; uno a medias devuelve `retire-v1-lineage`, y se termina para crear un sucesor v2 aprobado con recibo `taxonomy-v1-to-v2` (REQ-routing-011 y REQ-routing-012). Los hallazgos congelados y los estados terminales v1 se siguen leyendo durante una versión menor (E5.7). Quedan 46 skills instaladas por target (47 en Claude y Codex).

### E0.4 — `router-and-sdd-on-demand`

- **Alcance:**
  - Cada `setup:<target>` instala el router de `global-instructions/` como bloque con marcadores, sin pisar contenido del usuario y de forma reversible. En Codex, `~/.codex/AGENTS.md` recibe solo el router (hoy son 63 KB) y la instalación por repositorio cabe en el límite de `AGENTS.md`.
  - El router se reescribe: SDD solo cuando el usuario lo pide de forma explícita (`/sdd-*` o "hazme un SDD"). Hasta E1.6, el resto del trabajo se hace de forma directa.
  - El orquestador SDD y sus agentes de fase se cargan solo bajo demanda en los 7 targets.
- **Hecho cuando:** el informe de E0.0 da ≤ 4 KB *always-on* por target, y una sesión sin `/sdd-*` no carga nada del protocolo SDD.
- **Entrega:** PRs encadenados: (a) router e instalación, (b) rutas `_shared` del orquestador resolubles desde la instalación.
- **Avance:**
  - **(a) entregado en v2.88.0:** el router pasa a ser la regla global `rules/ospec-router.instructions.md` (REQ-generator-022): SDD solo con `/sdd-*` o una petición explícita, y el orquestador del host nombrado con un marcador que el generador resuelve. `global-instructions/` se retira. Claude y Codex sacan sus reglas globales a un fichero propio (`global-instructions/CLAUDE.md` y `AGENTS.md`); en Codex el orquestador pasa a la skill `sdd-orchestrator`, y sus comandos `$sdd-*` la cargan. `setup:claude` y `setup:codex` (global y por repositorio) escriben el router como bloque con marcadores sin tocar el texto del usuario; el `AGENTS.md` de 63 KB que la instalación anterior poseía entero se sustituye, y `--no-router` quita el bloque (REQ-install-033). La regla de atribución se compacta para que router y regla quepan en 4 KB. Resultado: *always-on* de 2,7–3,0 KB en los 7 targets ([target-capabilities §7](../target-capabilities.md#7-coste-de-contexto-por-target-e00)).
  - **(b) entregado en v2.89.0:** el generador apunta las referencias `_shared` del orquestador a la copia instalada (REQ-generator-023). En Claude usa `${CLAUDE_SKILL_DIR}/../_shared`, que Claude Code sustituye en el cuerpo de la skill. En los demás targets deja el marcador `__OSPEC_SHARED_DIR__`, y cada instalador lo cambia por el directorio donde deja `skills/_shared/` (REQ-install-034, `scripts/configure/shared-dir.js`): ruta absoluta en las instalaciones globales (Antigravity, una por raíz, y una raíz WSL con su ruta de Windows), `dist/vscode` en VS Code y ruta relativa al repositorio en las instalaciones por repo. `install:codex -- <repo>` instala ahora también `.agents/skills/_shared`. El marcador se restaura en `dist/` tras sincronizar, salvo en VS Code, que carga `dist/vscode` directamente: tras un `build:vscode` suelto hay que volver a ejecutar `setup:vscode`. Una prueba real con `claude -p --plugin-dir`, lanzada desde un repositorio vacío, leyó `skill-resolver.md` por esa ruta. El orquestador crece 175–490 B por las rutas más largas.

## Etapa 1 — IDD como flujo por defecto

**Resultado de la etapa:** un cambio sigue IDD en cualquier target sin que nadie lo pida: el CLI calcula las obligaciones, el modelo trabaja y el CLI decide cuándo está terminado. SDD queda como modo opcional.

### E1.1 — `idd-contract`

- **Alcance:** spec canónica de IDD con:
  - El documento vivo del change, con una plantilla mínima: intención y aceptación, plan, decisiones y la evidencia que rellena el CLI.
  - El `state.yaml` mínimo, que solo escribe el CLI.
  - El catálogo señal → obligación → evidencia y los tres gates.
  - La convivencia con el modo SDD en el mismo repositorio, con `mode` por proyecto y por change.
- **Hecho cuando:** seis cambios tipo (typo, bug, feature interna, API pública, migración y autenticación) tienen fixtures con sus obligaciones y gates esperados, y ningún requisito de SDD cambia.
- **Entregado en v2.92.0:** spec canónica [`idd`](../../openspec/specs/idd/spec.md) (REQ-idd-001 a REQ-idd-010). El modo se resuelve con el `mode` del change; si falta, con `workflow.mode` de `openspec/config.yaml`; y si tampoco está, es `sdd` hasta E1.6. Un cambio IDD vive en `idd/<id>/`, en la raíz del proyecto, aislado de `openspec/changes/`, y al cerrarse pasa a `idd/archive/<fecha>-<id>/`. Los contratos de comportamiento siguen en `openspec/specs/` (enmendado en v2.98.0: IDD no guarda nada en `openspec/`, y el modo del proyecto se lee de `mode` en `idd/config.yaml`). El `state.yaml` (`idd-state/v1`) solo lo escribe el CLI. El documento vivo `change.md` existe solo con la obligación `living-doc`, y su sección de evidencia es del CLI. El catálogo tiene 8 señales, cada una con una obligación y una evidencia; la de ADR queda inactiva hasta E3.1. Hay solo tres gates. Una obligación solo se retira con motivo y cuando ninguna señal activa la deriva. `scripts/lib/idd-contract.js` expone el catálogo, la resolución de modo, la derivación de obligaciones, la validación de estado y las reglas de retirada y cierre, con un test de paridad contra la spec. `scripts/fixtures/idd/` cubre typo, bug, feature interna con Strict TDD, API pública, migración aditiva y autenticación, más intención ambigua y migración destructiva. Ninguna spec de SDD cambia.

### E1.2 — `ospec-cli-core`

- **Alcance:**
  - `ospec status`, `ospec next` y `ospec record`, con salida `--json`.
  - `next` devuelve el cambio activo, las obligaciones pendientes, el siguiente paso, la decisión pendiente y las referencias de conocimiento.
  - `record` hace escrituras atómicas e idempotentes.
  - Se construye sobre `ospec-state`, `result-envelope`, `validate-phase` y la detección de ambigüedad de clarify (O3), que ya existen.
- **Hecho cuando:** repetir un `record` no duplica entradas, un `record` interrumpido no corrompe el estado y `next` es determinista para los fixtures de E1.1, incluidos los casos ambiguos.
- **Entregado en v2.93.0:** `scripts/ospec.js` expone `status`, `next` y `record` con `--json` (REQ-idd-011) y se distribuye en el runtime de los 7 targets. `record` acepta `intent`, `signal`, `gate` y `withdraw`, pero no evidencia: la evidencia la registrará el CLI al observar la ejecución que la prueba (E1.4), así que el modelo no puede afirmarla. Los reductores puros de `scripts/lib/idd-record.js` hacen que repetir un `record` no cambie nada y rechazan reescribir un hecho con otro contenido. `scripts/lib/idd-store.js` escribe `state.yaml` como JSON (YAML 1.2 válido, sin parser propio), bajo el lock de `ospec-state` y con la escritura atómica de `atomic-write`. Un `record` interrumpido deja legible el último estado confirmado, y el id del change se valida antes de tocar disco. `scripts/lib/idd-next.js` calcula `next` y `status` como funciones puras del estado. Cada fixture de E1.1 declara ahora su siguiente paso esperado, y el test lo reproduce sea cual sea el orden en que se registraron las señales. La intención ambigua (la señal O3 de clarify) entra como `record intent --ambiguous --request`: abre el gate, guarda la petición original y bloquea las señales hasta que el usuario responde (enmienda de REQ-idd-003). `result-envelope` y `validate-phase` no hicieron falta, porque son del modo SDD.

### E1.3 — `impact-signals`

- **Alcance:**
  - Calcula las señales con la declaración inicial y el diff.
  - Añade una sección `impact:` a `openspec/config.yaml` (en `idd/config.yaml` desde v2.98.0), con valores por defecto según el stack.
  - Reutiliza los suelos de riesgo de PP1/PP2 y la clasificación de K1.
  - Cada señal muestra su razón (por ejemplo, "contrato público: toca `src/api/**`").
- **Hecho cuando:** los fixtures cubren los suelos de riesgo actuales (autenticación, migración y API), un cambio de dos líneas en un contrato público recibe su obligación y un refactor mecánico grande no recibe ningún gate.
- **Entregado en v2.94.0:** `ospec signals --change <id>` deriva y registra las señales (REQ-idd-012). `always`, `strict-tdd`, `bug-fix` y `multi-unit-or-decision` salen de la intención, de `strict_tdd` y de lo que se declara (`--work-units`, `--decision`). Contrato público, datos persistentes y frontera de seguridad salen de las rutas: las previstas (`--path`) dan `source: declaration` y, con `--diff [--base <ref>]`, las del diff de git (con los ficheros sin seguimiento) dan `source: diff`. Cada señal da su razón, por ejemplo «public contract: touches src/api/orders.js (matches \*\*/api/\*\*)». Los patrones son una base común, más los de cada stack detectado por su manifiesto (`node`, `jvm`, `dotnet`, `python`, `go`), más la nueva sección `impact:` de `openspec/config.yaml`, que añade listas, fija el stack, desactiva los valores por defecto o excluye rutas; la documentación nunca deriva señales. El gate `irreversible-operation` se abre por una operación declarada (`--operation drop-column`) o por una sentencia destructiva añadida a un fichero de datos persistentes (DROP, TRUNCATE o DELETE sin WHERE, en SQL y en los ORM habituales). Las señales de ruta y `bug-fix` se corresponden uno a uno con los suelos de K1 (`public_api`, `data_migration`, `auth_security`, `localized_reproducible_bug`), y el resultado informa del suelo que dan. Los 8 fixtures de E1.1 se reproducen desde su declaración, y `scripts/fixtures/idd/signals/` añade el contrato de dos líneas en el diff, la migración que solo aparece en el diff, la columna borrada en el diff y la documentación de seguridad; el refactor mecánico de 240 ficheros no abre ningún gate. Registrar es idempotente y nunca quita una señal ya registrada; el recálculo en cada check queda para E1.4. Este repositorio declara su propia sección `impact:`. En v2.98.0, `strict_tdd` e `impact:` pasan a `idd/config.yaml` (REQ-idd-013).

### E1.4 — `ospec-check-and-close`

- **Alcance:**
  - `ospec check` ejecuta los checks declarados y registra su salida, lee la evidencia de TDD y de reproducción, y recalcula las señales con el diff.
  - Cuando una obligación lo pide, lanza un review independiente con el gate selectivo existente: 0, 1 o N lentes, hallazgos congelados y una corrección acotada.
  - Responde `listo`, `falta <obligación>` o `necesita tu decisión`.
  - `ospec close` archiva con el archive transaccional (O6A).
- **Hecho cuando:**
  - No se puede cerrar con una obligación sin evidencia.
  - La afirmación del modelo "los tests pasan", sin ejecución registrada, no cierra nada.
  - Un cambio solo de documentación cierra sin review.
  - Un diff que empieza a tocar una migración añade su obligación.
- **Directriz (2026-10-05):** el control y los artefactos de IDD no viven en `openspec/`, que queda solo para el modo SDD. Todo IDD está bajo `idd/`: `config.yaml`, `<id>/` y `archive/`.
- **Entrega:** PRs encadenados: (0) configuración de IDD en `idd/config.yaml`; (a) `ospec check` y `ospec run`: checks declarados, recálculo de señales con el diff, evidencia `check-run` y pares rojo → verde para la reproducción y TDD; (b) review de confianza con el linaje acotado y evidencia de contrato y de migración, partido en (b1) contrato y migración y (b2) review; (c) `ospec close` con un archive transaccional propio de IDD (`idd-close.js`, que reutiliza de O6A el inventario con huellas y el renombrado con *fallback*; `archive-transaction.js` sigue siendo del modo SDD); (d) distribuir los scripts que citan las skills de SDD y no llegan al runtime, con un test que lo exija.
- **(0) entregado en v2.98.0:** `scripts/lib/idd-config.js` lee `idd/config.yaml` (REQ-idd-013), con solo tres claves de primer nivel: `mode` (el modo del proyecto de REQ-idd-001), `strict_tdd` e `impact`. Una clave desconocida o repetida, o un valor fuera de su dominio, se rechazan con `config-invalid`. IDD ya no lee `openspec/config.yaml`: `strict_tdd: true` o una sección `impact:` ahí no configuran IDD. REQ-idd-002 prohíbe que IDD guarde configuración, estado o artefactos en `openspec/`. Este repositorio mueve su sección `impact:` a `idd/config.yaml`, y `k1-scope-guard` pierde la normalización que la toleraba en `openspec/config.yaml`.
- **(a) entregado en v2.99.0:** `ospec check` y `ospec run` (REQ-idd-014). Al abrir un cambio, el CLI guarda como `base` el commit de partida, y los diffs de `check` y de `signals --diff` se calculan contra él. `check` recalcula las señales con el diff y ejecuta en orden los `checks:` de `idd/config.yaml` (`nombre: comando`). Registra cada ejecución en `runs` con su código de salida, la huella de su salida y la del árbol de trabajo (`HEAD`, el diff binario y los ficheros sin seguimiento, nunca `idd/`). Responde `missing` con el motivo de cada obligación pendiente, `needs-decision` o `ready`. `checks-pass` solo queda satisfecha si todos los checks pasaron en el árbol actual: si el árbol cambia, el siguiente `check` registra evidencia nueva o devuelve la obligación a pendiente. `ospec run --obligation repro-test|tdd-red-green --command <test> [--unit <n>]` ejecuta el test y registra la ejecución. La evidencia del par se registra cuando el mismo comando falla y después pasa en un árbol distinto. `validateState` exige que la evidencia de ejecución nombre las ejecuciones que la prueban. `next` indica el comando que registra cada una de esas evidencias. Los `state.yaml` anteriores, sin `base` ni `runs`, siguen siendo válidos. Este repositorio declara `checks: test: node scripts/check.js`.
- **(b1) entregado en v2.100.0:** evidencia de contrato y de migración (REQ-idd-015). `scripts/lib/idd-contracts.js` reconoce los documentos de contrato y sus tests: una base para cualquier proyecto (OpenAPI, Swagger, AsyncAPI, protobuf, GraphQL, JSON Schema y `docs/api/**`; `*.test.*`, `*.spec.*` y directorios de test), los valores por defecto de cada stack y la sección `contracts:` de `idd/config.yaml` (`documents`, `tests`, `defaults`). En cada `check`, `contract-spec-and-test` se satisface si el diff toca un documento de contrato y un test y ese mismo `check` registró la evidencia `check-run`; si no, vuelve a pendiente con el motivo. `ospec run --obligation migration-compat-and-test --command <test> --plan <compatibilidad o rollback>` registra una ejecución `migration-test`: si pasa, la evidencia nombra la ejecución, el árbol y el plan, y en cada `check` vuelve a pendiente si el árbol cambió. Este repositorio declara `openspec/specs/**` como sus documentos de contrato.
- **(b2) entregado en v2.101.0:** review de confianza con el linaje acotado (REQ-idd-016, `scripts/lib/idd-review.js` sobre `review-lineage.js`, esquema v2 y solo la lente `trust`). `ospec review start` congela el candidato a partir de una instantánea del árbol de trabajo (un objeto *tree* de git, escrito con un índice temporal y sin `idd/`): las rutas que cambia respecto a la base, la huella de su contenido y las líneas cambiadas. Devuelve la petición para el revisor independiente `review-trust`. `review record --result <json>` congela los hallazgos; sin `BLOCKER` ni `CRITICAL`, registra la evidencia `frozen-review`. Con un bloqueante se permite una sola corrección acotada: `review correct` la registra dentro de las rutas congeladas y del presupuesto de líneas, y `review validate` aplica el veredicto de `review-correction` a los IDs congelados. Si la validación falla, el linaje termina. En cada `check`, la evidencia vuelve a pendiente si cambian las rutas revisadas o aparece otra ruta de frontera de seguridad. **Decisión del usuario:** el review sucesor no pide aprobación, pero exige que el candidato haya cambiado, y un cambio admite como mucho 3 reviews. `createSuccessor` no se usa porque exige el ledger de aprobaciones de SDD.
- **(c) entregado en v2.102.0:** `ospec close` (REQ-idd-017, `scripts/lib/idd-close.js`). Cierra solo si la evidencia de `checks-pass` es del árbol actual; si no, `evidence-stale`, porque el último `check` liquidó en ese árbol todo lo que depende de él. Bajo un lock que vive fuera del directorio del cambio, liquida `living-doc`: `change.md` debe conservar las cuatro secciones, con `Plan` y `Decisions` escritos, y entonces se registra `living-doc-current`. Mientras el documento está al día, `check` no lo cuenta como pendiente. Después rechaza con `close-refused` si queda algo pendiente o un gate abierto, y registra `status: closed` y `closed_at`, que sirven de marca de reanudación. Por último reescribe la sección de evidencia de `change.md` y mueve el cambio a `idd/archive/<fecha>-<id>/`, comparando la huella de inventario de O6A (`computeInventory`, `fingerprintInventory`) antes y después. Si el renombrado falla, copia a un directorio de staging y compara antes de sustituir. Repetir `close` termina un movimiento interrumpido, rechaza un destino distinto (`archive-conflict`) e informa `already_complete`. `archive-transaction.js` llega así al runtime, aunque su transacción sigue siendo del modo SDD. Se cumplen los cuatro criterios de «hecho cuando»: no se cierra sin evidencia, la afirmación del modelo no cierra nada, un cambio de documentación cierra sin review y un diff con migración añade su obligación.
- **(d) entregado en v2.103.0:** `RUNTIME_ENTRY_SCRIPTS` incluye los cinco scripts que citan las skills y los agentes de SDD y no llegaban a un proyecto consumidor: `archive-transaction-run.js`, `apply-resume.js`, `lifecycle-hooks.js`, `quality-gates.js` y `verify-lineage.js`, con sus dependencias. El runtime pasa de 82 a 89 ficheros, sin dependencias colgando. Un test recorre skills, agentes, reglas, comandos y hooks, y exige que todo script citado que exista en el repositorio y no sea un test se distribuya. El inventario de E1.5 ya los había señalado; `archive-transaction.js` llegó con `ospec close`, y `scripts/lib/cache.js`, citado en un bloque de ejemplo, no existe y no cuenta. **E1.4 queda cerrado.**

### E1.5 — `kernel-wiring-inventory`

- **Problema:** de unas 50 k líneas de `scripts/lib`, solo unas 9 k son alcanzables desde los hooks y los comandos que se ejecutan en un proyecto consumidor.
- **Alcance:**
  - Inventario de cada módulo no cableado (Execution Graph, Authority Store, Assurance Graph, verifier independiente, Repair shadow, K12, attestation, lifecycle-model, worker-*). Para cada uno se decide si se **cablea** (indicando qué ítem lo consume, empezando por E1.4), se **congela** (se mantiene sin inversión) o se **retira** (se borra junto con sus tests).
  - También entran los tests y checkers que leen la [arquitectura archivada](archive/2026-10-03-arquitectura/harness-evolution.md): `k1-maturity`, `k21-maturity-docs`, `k2a-maturity-docs`, `k3-readiness-reconciliation` y `roadmap-reconciliation`.
- **Hecho cuando:** ningún módulo queda sin ítem dueño o sin decisión explícita.
- **Inventario y decisión (2026-10-05):** [análisis de cableado](../analysis/2026-10-05-inventario-cableado-kernel.md). De las 51,6 k líneas de producción de `scripts/lib`, se distribuyen 19,1 k (no 9 k): Execution Graph, Assurance Graph y parte del verifier llegan al runtime por el binding K7 del review, que E1.4 reutiliza. Quedan 108 ficheros (28,6 k líneas) sin cablear. Decisión: se **retiran** 64 (19,7 k líneas: lifecycle K2, Authority Store y permits K2.1, conformance host K2a, budgets K5, repair shadow K4b, workers K6a salvo `worker-workspace`, challenges K6c sin cablear, attestation K8, pilot y campaign executor de K12, y el binding de identidad de operación); se **congelan** 19 con dueño (verifier K6b → E1.4, delta K6d → E3.1, `quality-review-kpis` → E4.1, `k1-compat`, `worker-workspace`, los satélites de `verify-lineage` y tres checkers K1); se **cablean** 6 de K12 en E4.1, y 19 son *tooling* de build. También se retiran los 5 tests y checkers que leían la arquitectura archivada. Hallazgo para E1.4: las skills citan 8 scripts que no se distribuyen (`archive-transaction-run.js`, `verify-lineage.js`, `apply-resume.js`, `quality-gates.js` y `lifecycle-hooks.js`, con sus dependencias), y `ospec close` necesitará `archive-transaction.js` en el runtime.
- **Entrega:** PRs encadenados: (a) checkers de la arquitectura archivada, challenges K6c, attestation K8 y binding de identidad de operación; (b) K12; (c) el bloque acoplado K2, K2.1, K2a, K5, K4b y K6a, con sus specs, checkers y entradas de `k1-scope-guard`.
- **(a) entregado en v2.95.0:** se retiran `k1-maturity` (y REQ-contract-lint-011), `k21-maturity-docs`, `k2a-maturity-docs`, `k3-readiness-reconciliation` y `roadmap-reconciliation`; planner, runner, mutator, budget, diff-scope e índice de K6c (REQ-adversarial-challenges-002 a 004 y REQ-harness-authority-canon-012); el código de K8 y su dominio de spec `evaluation-attestation`, y `operation-identity-binding`. El planner pasa a `test-support/k6c-challenge-fixtures.js`, porque el verifier y el Assurance Graph distribuidos siguen leyendo planes y resultados de challenge en sus tests.
- **(b) entregado en v2.96.0:** se retiran el executor determinista del piloto (`k12/pilot-executor.js`), el puente de campaña (`k12/campaign-executor.js`) y el CLI `scripts/k12-campaign.js`, que arrastraban casi todo el kernel. Las últimas ejecuciones del piloto y de las dos calibraciones quedan como fixtures en `scripts/evals/__fixtures__/k12/snapshots/`, y los tests de `pilot-checkpoint` y `worker-record` juzgan el checkpoint en vivo sobre ellas. `worker-record`, `runner`, `run-manifest`, `cohort`, el oracle y el checkpoint quedan para E4.1.
- **(c) entregado en v2.97.0:** se retiran 45 módulos (15,5 k líneas) y 46 tests: lifecycle K2 (`lifecycle-model`, `lifecycle-kernel/*` salvo `k1-compat` y el reducer de fases, `minimal-kernel-harness`, `next-transition`, `transition-parity`, `kernel-aliases`), Authority Store y permits K2.1, conformance host, host adapters y capability proof K2a, budgets y recovery K5, repair shadow K4b, el executor y el sandbox de workers K6a y `runner-receipt-store`. Se borran 13 dominios de spec que solo describían ese código y se recortan tres: `lifecycle-kernel-runtime` conserva el reducer de fases (REQ-lifecycle-kernel-028 a 030), `harness-authority-canon` los principios de autoridad y las superficies de evidencia que siguen distribuidas, y `worker-isolation` `worker-workspace` y `allowed-paths-validator`. `k1-scope-guard` pierde 41 entradas y 13 aserciones sobre rutas que ya no existen. **Desviación de la propuesta:** los checkers k4a, k5 y k6a se mantienen, porque validan fixtures de `schemas/kernel`, que se sigue distribuyendo (Execution Graph y work-order los usa el binding K7); se retirarán con los esquemas si un ítem futuro los poda. Con E1.5 cerrado, `scripts/lib` baja de 51,6 k a 33,9 k líneas de producción (con los módulos de IDD ya añadidos).

### E1.6 — `idd-default-entry`

- **Alcance:**
  - Protocolo IDD para los 7 targets: ≤ 12 KB, cargado bajo demanda donde el host lo permita. El router lo convierte en el flujo por defecto.
  - SDD se activa con `/sdd-*` o con `mode: sdd` en `idd/config.yaml`. Los changes SDD en curso terminan en SDD.
  - Las skills y los agentes de fase SDD pasan al paquete opcional.
  - `branch-pr`, `chained-pr` y `work-unit-commits` se cablean por nombre en el protocolo IDD.
  - El README y la documentación de producto presentan IDD como flujo por defecto y SDD como modo.
- **Gate:** el checkpoint de E4.1, que compara IDD con el modo SDD. IDD no puede dejar escapar más defectos y debe gastar menos tokens. Si no lo cumple, `revise` antes de cambiar el default.
- **Hecho cuando:** una instalación limpia en cada target crea y cierra un cambio con documento vivo sin cargar nada de SDD, y un proyecto con `mode: sdd` funciona igual que hoy.
- **Entrega:** PRs encadenados: (a) protocolo IDD y entrada por el router con `mode: idd`, sin cambiar el default; (b) brazo `idd` del banco; (c) las seis corridas IDD, el checkpoint contra `sdd-baseline-3` y el informe; (d) solo si el checkpoint da `continue`, IDD pasa a ser el default, las fases SDD van al paquete opcional y se actualizan el README y la documentación de producto.
- **Comparabilidad (decisión del usuario, 2026-10-07):** activar el brazo `idd` cambia `arms.js`, que entra en `harness_digest`, y el checkpoint daría `not-comparable` frente a `sdd-baseline-3`. En vez de repetir la línea base (unos 66 M tokens), `margins.json` declarará el par de huellas y los ficheros que pueden cambiar (`arms.js` y `checkpoint.js`, que es código de juicio y no se ejecuta en las corridas). Un test reconstruirá la huella de la línea base con las copias de v2.107.0 guardadas en `__fixtures__` y comprobará que el brazo `sdd` se comporta igual. El checkpoint aceptará solo el par declarado, y el informe lo hará constar.
- **(a) entregado en v2.108.0:** la skill `idd` (`skills/idd/SKILL.md`, 4,5 KB) es el protocolo en los 7 targets (REQ-generator-024). Sigue `ospec next` y su `next_step.how`, registra evidencia solo con `ospec run`, `check` y `review`, se detiene solo en los tres gates y nombra `work-unit-commits`, `branch-pr` y `chained-pr` para la entrega, que decide el usuario. Llama al CLI instalado: en Claude, con `${CLAUDE_SKILL_DIR}/../../scripts/ospec.js`; en el resto, con el marcador `__OSPEC_RUNTIME_DIR__`, que cada instalador sustituye por el directorio de su runtime (REQ-install-035). El router manda los cambios de código a IDD cuando `idd/config.yaml` dice `mode: idd`; sin ese modo, el comportamiento no cambia. *Always-on* sube unos 0,3 KB (2,9–3,3 KB) y el listado de skills, 0,2 KB. Dos pruebas reales con Claude Code (Sonnet 5.5, unos $0,13 cada una), una con `/ospec-workflow:idd` y otra con el router, arreglan un bug de juguete: test de reproducción en rojo y en verde, `ospec check` y `ospec close` con archivo. Hallazgos para (b): el banco ejecuta Claude con un `CLAUDE_CONFIG_DIR` aislado, así que el router no llega a las corridas y el brazo `idd` tendrá que entrar de forma explícita, como hace SDD con `/ospec-workflow:sdd-new`. `install:codex -- <repo>` no instala runtime ni protocolo. El hook de memoria de sesión no conoce los cambios IDD.
- **(b) entregado en v2.109.0:** el brazo `idd` del banco pide al agente, en el setup no medido, que escriba `idd/config.yaml` con `mode: idd` y el check `npm test`, el mismo comando que `sdd-init` registró para el brazo `sdd`. El setup termina cuando ese fichero se lee en modo IDD. El cambio entra con `/ospec-workflow:idd <brief>` y termina cuando `ospec close` deja un cambio en `idd/archive/` (REQ-bench-006). `driver.js` no cambia. Los márgenes pasan a `bench-margins-4`, con los umbrales de `bench-margins-3` y una `harness_exception`: el checkpoint acepta solo el par `42261bd0…` (`sdd-baseline-3`) → huella actual, en esa dirección, con `arms.js` y `checkpoint.js` como únicos ficheros cambiados, y lo imprime (REQ-bench-005). `harness-exception.test.js` lo verifica: la huella actual es la declarada; restaurar los dos ficheros desde `__fixtures__/harness-baseline/` reconstruye la de la línea base; y el brazo `sdd` se comporta igual. El plugin que construye el banco lleva la skill `idd` y un `scripts/ospec.js` operativo.
- **(c) entregado en v2.109.1:** `idd-1`, seis corridas IDD con una repetición, y su [informe](../analysis/2026-10-07-bench-idd-1.md). Seis de seis completas en 10 minutos, con 1,74 M tokens ($1,08), el 2,6 % de `sdd-baseline-3`; ninguna lanza subagentes. Pero 37/43 checks: escapan 6 defectos (3 en brownfield, 2 en public-library y 1 en bugfix), y el checkpoint da `revise` por escapados y por regresiones. Causas: (1) el agente nunca pregunta, porque la skill solo para en tres gates y considera ambigua una petición solo si no se puede enunciar una aceptación; decide él las reglas de negocio y lo avisa al final; (2) las señales de impacto se calculan en los seis cambios, pero solo derivan `always` (y `bug-fix` declarado), porque sus patrones buscan convenciones de directorio y no reconocen la superficie de una librería publicada ni el control de roles en código de dominio. Decisión del usuario: cuarto gate «hechos abiertos» y señales sin configuración; después, `idd-2`.
- **Revisión de IDD entregada en v2.110.0:** `ospec record intent` exige declarar los hechos abiertos, con una `--open-fact` por pregunta o con `--no-open-facts --basis`. Los hechos abiertos abren el gate `open-facts`: `next` lo pide antes de cualquier obligación y con todas las preguntas juntas, y solo lo resuelve la respuesta del usuario (REQ-idd-018). REQ-idd-008 pasa a cuatro gates. `public-contract` se deriva también de los ficheros que publica un `package.json` no privado (`main`, `types`, `typings`, `bin` y `exports`), con el motivo «published by package.json» (REQ-idd-012). El código heredado sin tests queda como follow-up hasta que haya evidencia de que hace falta. Un smoke real en `brownfield` con el banco pasa de 3 escapados a 0: el agente hace cinco preguntas en un solo lote antes de editar, una de ellas decisiva, y gasta 467 k tokens. La huella del banco no cambia.
- **`idd-2` entregado en v2.111.0, checkpoint `continue`:** [informe](../analysis/2026-10-07-bench-idd-2.md). Seis de seis completas, 43/43 checks, 0 escapados y 3,06 M tokens ($2,07), el 4,7 % de `sdd-baseline-3`, con un mensaje de preguntas por escenario (entre 3 y 7 preguntas) y 24 de 25 hechos obtenidos del usuario (SDD obtuvo 11). Calidad, con `scripts/evals/quality/` fuera del harness: IDD entrega un 32 % menos de código y un 69 % menos de tests, con un mutation score medio equivalente (83,1 % frente al 81,8 %); la revisión a ciegas por pares, sin sesgo de posición, prefiere IDD en 5 de 6 escenarios (alcance 4,08 frente a 2,42, legibilidad y diseño) y SDD en tests (4,17 frente a 3,33) y en `saas-small`. Hallazgo: una entrega IDD dejó `README.md` en ISO-8859-1 al editarlo con Python sin `encoding`. Lo siguiente es (d).
- **(d) en tres PRs (decisión del usuario, 2026-10-08):** (d1) IDD por defecto; (d2) las fases SDD (skills `sdd-*`, agentes `sdd-*` con el orquestador y comandos `/sdd-*`) pasan a un paquete propio, `--with-sdd`, separado de `--with-extras`; los agentes `review-*` se quedan, porque IDD los usa; (d3) README y documentación de producto. Desde (d1), cada ítem se hace con IDD sobre este repositorio.
- **(d1) entregado en v2.112.0:** IDD es el modo por defecto. `resolveMode` da `idd` sin modo declarado, aunque el proyecto tenga `openspec/` (REQ-idd-001). El router manda a IDD los cambios de código que no son una petición de SDD; las preguntas y el trabajo de solo lectura siguen directos, y un cambio se hace directo solo si el usuario lo pide expresamente sin IDD. `mode: sdd` en `idd/config.yaml` apaga IDD y deja el comportamiento anterior: trabajo directo y SDD solo con `/sdd-*` o petición explícita (REQ-generator-022 y REQ-generator-024). *Always-on* sube 117–140 B (3,0–3,4 KB) y el listado, 13 B. Es el primer ítem hecho con IDD en este repositorio: cambio `idd-default-mode`, con tres hechos abiertos respondidos por el usuario, `ospec check` y archivo en `idd/archive/`.
- **(d2) entregado en v2.113.0:** el paquete SDD (skills, agentes, comandos y reglas `sdd-*`, con el orquestador) sale de la build por defecto y se instala con `--with-sdd` (REQ-generator-025). Los 7 instaladores e `install-target` aceptan `--with-sdd` y `--no-sdd`, y sin flag conservan SDD si la instalación anterior lo traía, leído del manifiesto de propiedad o del directorio de agentes instalado (REQ-install-036, decisión del usuario). El TUI ofrece los paquetes SDD y extras en la revisión (REQ-install-021 y REQ-install-022). El banco construye siempre con `--with-sdd`, y `bench-margins-5` acepta frente a `sdd-baseline-3` la huella de `idd-1`/`idd-2` y la actual, con `hosts/claude.js` exceptuado; el checkpoint de `idd-2` sigue dando `continue` (REQ-bench-005). Por defecto, el orquestador pasa de 44–61 KB a 0, las skills instaladas de 47–48 a 31, los agentes de 22–23 a 6 y el listado de Codex de 6,4 a 4,2 KB; *always-on* sube 64 B. Hallazgos: los validadores de Cursor, Antigravity, Copilot y OpenCode exigían un directorio de comandos que una build sin SDD no tiene, y los revisores `review-*` citaban `skills/sdd-verify/SKILL.md` desde un módulo compartido. Hecho con IDD (cambio `sdd-optional-package`).
- **(d3) entregado en v2.114.0, E1.6 hecho:** el README (inglés y español), las guías de instalación, `docs/README.md`, `docs/en/README.md` y la web (`openwiki/` y `web-doc/astro.config.mjs`) presentan IDD como flujo por defecto, con señales, obligaciones, gates, `idd/config.yaml` y `mode: sdd`, y SDD como modo opcional con `--with-sdd`/`--no-sdd`. Las páginas K1–K12 de la web quedan marcadas como históricas. El lema pasa a IDD en `package.json`, `.plugin.json` y `.claude-plugin/plugin.json`, y el marketplace de Claude copia la descripción del manifiesto en vez de tener la suya (REQ-install-037). «Hecho cuando», decisión del usuario: prueba real solo en Claude Code. Con la build por defecto (`claude-marketplace.js` sin `--with-sdd`, `claude -p --plugin-dir`, Sonnet 5.5, $0,30, 79 s), la sesión carga 0 skills, agentes o comandos SDD; `/ospec-workflow:idd` con dos unidades y una decisión de diseño activa `multi-unit-or-decision`, el agente mantiene `change.md`, `ospec check` y `ospec close` archivan el cambio. En los otros seis targets, los tests de build comprueban que la build por defecto no trae nada `sdd-*`. Que `mode: sdd` siga funcionando igual lo cubren los tests de (d1). Hallazgo: el marketplace publicado en `release` se construye sin `--with-sdd`, así que quien instala desde él no tiene forma de activar SDD; queda documentado y como follow-up. Hecho con IDD (cambio `idd-default-docs`).

### E1.7 — `ospec-doctor`

- **Alcance:** diagnóstico de solo lectura por target: raíz del plugin, hooks, router instalado, modo activo, Engram, desfase entre `dist/` e instalación y presupuestos de E0.0. Incluye recuperación guiada de un cambio interrumpido.
- **Hecho cuando:** cada fallo conocido de instalación y de la auditoría aparece con causa y acción.
- **Decisiones del usuario (2026-10-08):** PRs encadenados, (a) núcleo, proyecto y Claude Code y (b) los otros seis targets; subcomando `ospec doctor` del CLI distribuido, con `--json` y `--target`, que sale con 1 solo si hay un error; recuperación guiada de cambios IDD y SDD, de solo lectura; y las asimetrías IDD/openspec (el pre-commit lee Strict TDD solo de `openspec/config.yaml` y los hooks crean `.ospec/`) se reportan como aviso, sin cambiar los hooks.
- **(a) entregado en v2.115.0:** `ospec doctor` (REQ-idd-019, `scripts/lib/ospec-doctor.js`) no escribe nada: lee `state.yaml` sin pasar por el almacén, que recupera escrituras interrumpidas, y solo lanza `git check-ignore` y las sondas de Engram. Cada comprobación da `ok`, `info`, `warn` o `error`, y los avisos y errores llevan causa y acción. Desde el checkout compara `dist/` y la instalación con la versión del checkout y mira los git hooks del repositorio. En el proyecto: `idd/config.yaml`, el modo, el paquete SDD (`error` con `mode: sdd` sin él), cada cambio IDD con el comando que lo reanuda (cierre interrumpido, `.bak` huérfano, estado ilegible) y cada cambio SDD con su `/sdd-continue`, las dos asimetrías y las guardas `DISABLE_*` activas. En Claude Code: instalaciones rotas o duplicadas, hooks y binario nativo, bloque del router ausente, desfasado o duplicado fuera del bloque, presupuesto *always-on* de 4 KB y Engram. La detección de Engram pasa de `scripts/configure/engram-setup.js` a `scripts/lib/engram-detect.js`, con una enmienda acotada del ADR `adr-20261002-003` y de REQ-session-memory-002 aprobada por el usuario: detecta presencia, nunca lee memorias ni da `error`. En la máquina del autor detectó la instalación y `dist/` en 2.114.1 frente al checkout en 2.114.2, y la sección SDD duplicada en `~/.claude/CLAUDE.md`. En Windows, `claude` suele ser un shim `.cmd` de npm que no se lanza sin shell, y el doctor usa la misma búsqueda que `setup:claude`. Hecho con IDD (`idd/archive/2026-10-08-ospec-doctor/`).

- **(b) entregado en v2.116.0, E1.7 hecho:** `ospec doctor` cubre los 7 targets (REQ-idd-019). Codex, Cursor, Antigravity, OpenCode y GitHub Copilot CLI se detectan por el `.ospec-workflow-install.json` de su instalador global (Codex con `CODEX_HOME`), y VS Code por las entradas `ospec-workflow` de `chat.pluginLocations` en VS Code y VS Code Insiders, como lista o como mapa `{ ruta: true }`. Por host: `install` (`error` con un manifiesto ilegible o sin versión o con `0.0.0`), `runtime` (`error` sin `scripts/ospec.js`), `markers` (`error` si una skill o un agente instalado conserva `__OSPEC_RUNTIME_DIR__`, `__OSPEC_SHARED_DIR__` o `{{ospec-cli}}`), `router` (`warn` sin router, con la copia del orquestador anterior a E0.4 en el `AGENTS.md` de Codex o sin `instructions/*.md` en `opencode.json`), `budget`, `hooks` y Engram; en VS Code, `plugin-locations` (`error` si una entrada carga el checkout fuente o una ruta que no existe, `warn` con varias builds) y `agent-files`. `install-drift` compara cada host con el checkout, `sdd-package` nombra todos los hosts sin SDD y `codex-repo` avisa de una instalación de Codex en el repositorio sin protocolo IDD. Engram se sondea en cada host con una sola ejecución de `engram version` y `engram doctor`. Decisiones del usuario: Engram en cada target detectado; marcadores sin sustituir, checkout fuente y ruta inexistente son `error`, varias entradas son `warn`; y entran en (b) la instalación de Codex en el repositorio, la corrección de las guías (la «Opción A» de VS Code y la instalación desde una URL Git, rotas desde E0.4 y E1.6, se retiran del README y de `docs/plugin-installation`) y la fuga de un test a `~/.copilot`. En la máquina del autor detectó Cursor (2.70.0), OpenCode (2.58.0) y Antigravity (2.91.0) sin runtime, y un manifiesto de Copilot `0.0.0` con tres ficheros del 2026-08-14: lo escribió la versión en desarrollo de `tests/integration/installation-convergence.test.js` nueve minutos antes del commit de #106; la versión commiteada ya usa `--dest`, y la suite completa no toca los manifiestos reales. Hecho con IDD (`idd/archive/2026-10-08-ospec-doctor-targets/`).

### E1.8 — `sdd-new-intent-argument`

- **Origen:** hallazgo de la línea base `sdd-baseline-3` ([informe](../analysis/2026-10-07-bench-linea-base-sdd-3.md#4-hallazgos)). En Claude, el comando `sdd-new` generado declara dos argumentos posicionales (`arguments: changeName intent`), así que `/ospec-workflow:sdd-new Quiero poder …` llega con `Quiero` como nombre del cambio y `poder` como intención. El agente lo detectó y recuperó la petición completa en `cli-local` y `public-library`, sin defectos escapados, pero un usuario que escriba la intención sin nombre choca con lo mismo.
- **Garantía que protege:** que un proyecto con `mode: sdd` funcione igual que hoy (E1.6) sin depender de que el agente repare la entrada.
- **Alcance:** `sdd-new` recibe la intención completa aunque no se dé un nombre de cambio, en los 7 targets, y el nombre se deriva de la intención cuando falta. Test de generación que cubre los dos casos (con y sin nombre).
- **Cuándo:** después de E1.6, por decisión del usuario (2026-10-07). No cambia la comparabilidad del banco: el checkpoint no compara la build del plugin.
- **Hecho cuando:** `/sdd-new <petición>` sin nombre llega entera al orquestador en todos los targets, y `/sdd-new <nombre> <petición>` sigue funcionando.
- **Entregado en v2.114.2:** un comando con una sola entrada `${input:x}` recibe la cadena completa (`$ARGUMENTS`) en Claude, OpenCode y Codex, y Claude ya no declara `arguments`; varias entradas siguen posicionales (REQ-generator-026). `sdd-new` y `sdd-lite` piden una sola entrada, `${input:request}`: el primer token es el nombre solo si es kebab-case con guion; si no, el orquestador lo deriva de la petición. Prueba real en Claude Code (`claude -p --plugin-dir`, Sonnet): `/sdd-new Quiero poder exportar…` llega entera ($0,27) y `/sdd-new export-csv Quiero poder exportar…` usa `export-csv` como nombre y el resto como intención ($0,28). Hallazgo: la primera prueba cargó el orquestador `ospec-workflow:sdd-orchestrator` de la instalación global, desfasada, en vez del de `--plugin-dir`; queda como caso para E1.7. Hecho con IDD (`idd/archive/2026-10-08-sdd-new-intent-argument/`).

### E1.9 — `install-cli-ux`

- **Origen:** `npm run setup:vscode` falla en Windows con `filesystem mutation failed for unknown path after 4 attempts (EPERM)` cuando VS Code tiene cargado `dist/vscode`: la publicación renombra el directorio entero y los reintentos de `scripts/configure/cli.js` no pasan la operación ni la ruta. Además, cada instalador escribe su propia salida, y las fases largas (build, validación, copia y Engram) pasan sin señal de progreso.
- **Garantía que protege:** que ospec se instale igual en los 7 targets (resultado de la Etapa 0) y que un fallo de instalación diga qué falló y cómo arreglarlo, como exige E1.7 al doctor.
- **Alcance:** publicar en su sitio el árbol que un host carga en vivo (`dist/vscode`), en vez de renombrarlo; errores con operación, ruta y acción («cierra VS Code y reintenta»); y una salida común en los 7 instaladores, con fases, indicador de progreso en terminal interactiva y resumen final, sin cambiar lo que se instala.
- **Cuándo:** después de E1.7, por decisión del usuario (2026-10-08).
- **Hecho cuando:** `setup:vscode` con VS Code abierto termina o falla con un mensaje accionable, y los 7 instaladores muestran el mismo formato de progreso y resumen.
- **Entregado en v2.117.0, E1.9 hecho:** REQ-install-038. `scripts/configure/install-output.js` da a los 7 instaladores y al paso Engram una salida común en español: cabecera, una línea por fase `✓ [n/N] fase (s)` que en terminal interactiva se reescribe en su sitio, y resumen final (destino, ficheros, paquetes, siguiente paso y tiempo) o `✗ Instalación fallida`. El detalle (validadores, binario de hooks, CLI `claude`) sale solo con `--verbose`. La publicación de `scripts/configure/cli.js` sigue siendo un renombrado atómico; solo para `dist/vscode`, si el renombrado choca con un bloqueo (`EPERM`, `EACCES`, `EBUSY`), escribe en su sitio el árbol ya validado y lo vuelve a validar. Los errores de sistema de ficheros nombran operación, ruta y el host que hay que cerrar. Decisiones del usuario: renombrado atómico con fallback en sitio, fase con ✓ y duración sin spinner (los instaladores son síncronos), salida en español, y recuentos por defecto con `--verbose`; `configure --target` e `install-target` conservan su salida. Verificado en real con un proceso bloqueando `dist/vscode`. Hecho con IDD (`idd/archive/2026-10-08-install-cli-ux/`).

### E1.10 — `vscode-dry-run`

- **Origen:** tras E1.9, `setup:vscode --dry-run` seguía construyendo en `dist/vscode` y salía antes de sustituir `__OSPEC_SHARED_DIR__` y `__OSPEC_RUNTIME_DIR__`. Como VS Code carga ese árbol en vivo, una simulación dejaba el plugin instalado roto. Una instalación real que fallara después de la build (copia del binario de hooks, sustitución de marcadores) lo dejaba igual.
- **Garantía que protege:** que una simulación no cambie nada instalado y que el árbol que carga un host en vivo nunca quede a medio preparar.
- **Alcance:** el dry-run de `setup:vscode` construye y valida en un directorio temporal; la sustitución de marcadores y la copia del binario pasan al árbol de staging ya validado, antes de publicarlo (paso `prepareTree` de `runConfigure`). Decisiones del usuario (gate de hechos abiertos): build en temporal, no un dry-run sin build; e incluir el caso de la instalación real fallida.
- **Cuándo:** después de E1.9 y antes del checkpoint de cierre de la Etapa 1, por decisión del usuario (2026-10-08).
- **Hecho cuando:** tras `setup:vscode --dry-run`, `dist/vscode` queda igual byte a byte (o ausente), y una instalación que falla al preparar la build deja la instalación anterior intacta.
- **Entregado en v2.117.1, E1.10 hecho:** REQ-install-039. `runConfigure` acepta `prepareTree(dir)`, que corre sobre el staging validado antes de publicarlo y sobre el destino tras una publicación en sitio (REQ-install-038); si falla, el destino queda como estaba y no quedan staging, copia de seguridad ni cerrojo. `setup:vscode` lo usa para copiar el binario de hooks y sustituir los marcadores con las rutas de `dist/vscode`, y la fase «Preparar el plugin» desaparece (queda dentro de «Generar y validar»). Con `--dry-run` construye, valida y sustituye en un directorio temporal que borra después, sin copiar el binario. Hecho con IDD (`idd/archive/2026-10-08-vscode-dry-run/`).

### Checkpoint de cierre de la Etapa 1: `continue`

[Informe](../analysis/2026-10-08-checkpoint-etapa-1.md), medido en v2.117.1. Todas las filas de la etapa cumplen su objetivo: router más protocolo IDD de 8,6–9,0 KB (≤ 16 KB); 7 de 7 obligaciones activas cerradas solo con evidencia del CLI; 0 documentos en un cambio trivial; un lote de preguntas por cambio; y 31 skills por defecto. Decisiones del usuario: `continue`; el objetivo de preguntas pasa a ser «un solo lote, solo en los cuatro gates», porque el cuarto gate (`open-facts`, v2.110.0) es el que bajó los escapados de 6 a 0; y los follow-ups abiertos pasan a ser E1.11–E1.14, en paralelo con la Etapa 2. **Salvedad:** el criterio de E1.6 se probó en real solo en Claude Code; los otros seis targets se cubren con tests de build y con `ospec doctor`. Hecho con IDD (`idd/archive/2026-10-08-checkpoint-etapa-1/`).

### E1.11 — `idd-protocol-hygiene`

- **Origen:** una entrega de `idd-2` dejó un `README.md` en ISO-8859-1 al editarlo con Python sin `encoding`. Además, `ospec next` no pide declarar el plan (`ospec signals`) antes de editar, y en el checkpoint de la Etapa 1 un plan sobredeclarado (los manifiestos de la release activaron `public-contract`) no se pudo corregir: el CLI no deja quitar una señal registrada ni retirar la obligación que deriva, y hubo que borrar el cambio a mano, con autorización del usuario.
- **Garantía que protege:** cierre por evidencia (las señales se calculan con el plan real) y que IDD no estropee ficheros del usuario.
- **Alcance:** el protocolo IDD exige editar ficheros de texto conservando su codificación y sus finales de línea; `ospec next` devuelve como paso «declarar el plan» mientras no haya señales de ruta ni diff; y una forma explícita, con motivo, de corregir una señal declarada mientras el diff no la confirma.
- **Hecho cuando:** un cambio sin plan recibe de `next` el paso de declararlo, y una señal declarada que el diff no confirma se puede retirar con motivo, pero no una que el diff confirma.

### E1.12 — `session-hook-idd`

- **Origen:** los hooks `Stop` y `PreCompact` buscan el cambio activo solo en `openspec/changes/` (`findActiveChanges`). Con un cambio IDD abierto, `.ospec/session/latest.md` dice «Active change: None» y la sesión siguiente no lo retoma (hallazgo de E1.6 a).
- **Garantía que protege:** estado en disco y reanudación desde él, no desde la memoria de la conversación.
- **Evidencia adicional (auditoría 2026-10-08):** un consumidor aislado sin `openspec/`, con un cambio abierto mediante el CLI real, reproduce «Active change: None». El cierre IDD y el rechazo de evidencia obsoleta funcionan; el defecto está en la continuidad de sesión.
- **Alcance:** `Stop` y `PreCompact` reconocen los cambios abiertos de `idd/` y escriben su siguiente paso reutilizando `idd-store.listChanges` e `idd-next.nextForChange`. `latest.md` sigue siendo una vista derivada; los cambios SDD conservan su comportamiento. Si hay varios cambios abiertos, la vista muestra la ambigüedad sin escoger uno como autoridad.
- **Hecho cuando:** con un cambio IDD abierto, `latest.md` lo nombra con su siguiente paso, en los targets que ejecutan esos hooks. Pruebas en consumidor con runtime instalado cubren cero, uno y varios cambios abiertos, SDD y la paridad JS/Go donde corresponda. Una invocación aislada del hook no se presenta como prueba de entrega de eventos por el host.
- **Alternativa y coste:** no cambiar conserva el fallo reproducido; reutilizar store y `next` evita un segundo cursor de estado. El ahorro de contexto o de intervenciones se mide al usarlo, no se presupone.

### E1.13 — `idd-openspec-asymmetries`

- **Origen:** el pre-commit decide Strict TDD solo con `tdd_mode` de `openspec/config.yaml` y no lee `strict_tdd` de `idd/config.yaml`, y los hooks crean `.ospec/` en el proyecto. Hoy `ospec doctor` solo lo avisa (E1.7 a).
- **Garantía que protege:** Strict TDD con evidencia cuando el proyecto lo declara (principio 8) y que IDD no dependa de `openspec/` (REQ-idd-002).
- **Evidencia adicional (auditoría 2026-10-08):** con producción staged sin tests, el pre-commit del consumidor devuelve 0 con solo `idd.strict_tdd: true` y 1 con `openspec.tdd_mode: strict`.
- **Alcance:** decidir y aplicar una sola fuente de Strict TDD para el pre-commit según el modo resuelto del proyecto, incluida la precedencia cuando ambas configuraciones existen, y si `.ospec/` se queda, se mueve o se documenta como derivado. Conservar la heurística de archivos staged y la detección de secretos; el guard no demuestra red/green ni sustituye a `ospec run`.
- **Hecho cuando:** un proyecto IDD con `strict_tdd: true` y sin `openspec/` recibe del pre-commit la misma comprobación que un proyecto SDD con `tdd_mode: strict`, y el doctor deja de avisar. La matriz IDD/SDD × strict/standard × con/sin tests y los casos de configuraciones coexistentes prueban la fuente elegida y la ausencia de regresiones.
- **Alternativa y coste:** documentar la asimetría deja sin aplicar una garantía declarada; resolver la configuración con el mecanismo existente evita un guard o una clasificación nuevos.

### E1.14 — `codex-repo-runtime`

- **Origen:** `install:codex -- <repo>` instala skills en `.agents/skills`, pero no el runtime de `ospec` ni el protocolo IDD; sin una instalación global de Codex, el repositorio no puede seguir IDD. Hoy `ospec doctor` solo lo avisa (E1.6 a, E1.7 b).
- **Garantía que protege:** multi-target honesto: IDD en cualquier target sin que nadie lo pida (resultado de la Etapa 1).
- **Alcance:** la instalación de Codex por repositorio lleva el protocolo IDD y un runtime alcanzable (propio o el global declarado), con sus marcadores sustituidos.
- **Hecho cuando:** un repositorio con solo la instalación de Codex por repositorio ejecuta `ospec next` desde la skill `idd`, y el aviso `codex-repo` del doctor desaparece.

### E1.15 — `idd-review-successor-policy`

- **Origen:** [`AGENTS.md`](../../AGENTS.md#bounded-review-lifecycle) exige un sucesor explícitamente aprobado con predecesor terminal; [REQ-idd-016](../../openspec/specs/idd/spec.md#req-idd-016) exige sucesores sin aprobación (REQ-idd-008). `startTrustReview` en `scripts/lib/idd-review.js` sigue esa spec, mientras `createSuccessor` en `scripts/lib/review-lineage.js` exige una referencia de aprobación. Es una contradicción de autoridades, no una regresión demostrada frente a la spec IDD vigente.
- **Garantía que protege:** review independiente acotado y aprobaciones solo desde respuestas explícitas (principio 8); ningún retry reinicia un linaje agotado.
- **Alcance:** elegir explícitamente entre aprobación de sucesores y una excepción IDD autorizada, y alinear instrucciones, spec, CLI y pruebas con esa decisión. La aceptación de este ítem no elige ninguna alternativa. Reutilizar las APIs de linaje; conservar predecesor terminal, identidad del candidato, hallazgos y rutas congelados, presupuesto dentro de cada linaje y lectura de estados históricos.
- **Hecho cuando:** tras la decisión humana, pruebas independientes del CLI cubren sucesor permitido y rechazado según la política, candidato sin cambios, reconciliación pendiente, agotamiento y compatibilidad de estados; retry, check y close no restauran intentos ni vuelven a lanzar reviewers de descubrimiento.
- **Alternativas y coste:** no cambiar conserva la contradicción; exigir aprobación añade intervención pero coincide con `AGENTS.md`; autorizar la excepción reduce intervención pero exige justificar su equivalencia. No se crea un sistema de aprobación ni nuevos agentes. Hasta la decisión, rige la instrucción aplicable de `AGENTS.md`.

## Etapa 2 — Foundation de verdad: descubrimiento de arquitectura

**Resultado de la etapa:** al crear un proyecto, ospec hace las preguntas que haría un arquitecto con experiencia en proyectos serios. Captura la información funcional, el contexto del equipo, los atributos de calidad y las restricciones, y produce **ADRs de arquitectura agnósticos de tecnología**, separados de la selección tecnológica. Las preguntas no salen de un cuestionario fijo: salen de los huecos de conocimiento que más condicionan las decisiones pendientes. La foundation sirve igual a IDD y al modo SDD.

### El algoritmo: ciclo de descubrimiento guiado por huecos de decisión

```text
fuentes ─► mapa de conocimiento ─► huecos que bloquean decisiones ─► ronda de preguntas (≤ 4)
   ▲                                                                         │
   └──────── registrar: confirmado | supuesto (con disparador) | N/A | diferido (con dueño)
                                   │
                                   ▼
         drivers (atributos de calidad) ─► ADR de arquitectura ─► registro tecnológico ─► herramientas ─► roadmap funcional
```

1. **Fuentes.** Ingerir lo que exista (documentos, repositorios, tickets o un repo brownfield) y marcar cada hecho con su procedencia.
2. **Mapa de conocimiento.** Ranuras agrupadas por dimensión:

   | Dimensión | Ejemplos de ranura |
   | --- | --- |
   | Negocio | Problema, objetivos medibles, restricciones comerciales y legales |
   | Funcional | Actores, journeys prioritarios, capacidades, exclusiones, criterios de aceptación |
   | Equipo | Tamaño, roles, competencias, quién opera en producción, cadencia, estándares y herramientas existentes, restricciones de la organización |
   | Calidad | Escenarios de atributos de calidad priorizados |
   | Arquitectura | Límites, integración, datos, despliegue y seguridad |
   | Tecnología | Stack, licencias y plataforma |
   | Operación | Observabilidad, soporte, backup y restauración |
   | Entrega | Entornos, CI y versionado |

   Cada ranura tiene estado (`desconocido | supuesto | confirmado | N/A | diferido`), fuente y la lista de decisiones que alimenta. El **perfil del proyecto** (prototipo, herramienta interna, producto, regulado o crítico, librería o CLI pública, embebido) decide qué ranuras son obligatorias.
3. **Selección de preguntas (determinista).** `prioridad = impacto en decisiones pendientes × incertidumbre × irreversibilidad × peso del perfil`. Las preguntas se agrupan por tema, como mucho 4 por ronda, cada una con una respuesta recomendada y la opción "no lo sé". "No lo sé" no bloquea: registra un supuesto explícito con su disparador de revisión. El modelo redacta las preguntas en el contexto del usuario (de forma orgánica) y el motor garantiza la cobertura.
4. **Drivers.** Escenarios de atributos de calidad en forma de árbol de utilidad (origen → estímulo → entorno → elemento → respuesta → medida), más restricciones.
5. **ADR de arquitectura.** Cada decisión estructural (descomposición del sistema, estilo de integración, propiedad y consistencia de datos, topología de despliegue, límites de confianza, multi-tenancy, política de evolución de contratos) se registra **sin nombres de productos**: drivers, al menos dos opciones, decisión, consecuencias, *fitness function* y disparador de revisión.
6. **Registro tecnológico.** La elección de stack, librerías y servicios **implementa** uno o más ADR y se justifica con el contexto del equipo, la madurez, la licencia, el coste y fuentes fechadas consultadas en vivo.
7. **Herramientas de calidad.** Estrategia de test, CI, linters y observabilidad, cada una ligada al atributo de calidad o *fitness function* que protege. Se vuelca en `idd/config.yaml`: comandos, TDD y rutas de las señales de impacto (y en `openspec/config.yaml` solo si el proyecto usa el modo SDD).
8. **Roadmap funcional.** Esqueleto andante como primer slice, y decisiones diferidas con su "último momento responsable".

La foundation termina cuando todas las ranuras obligatorias que bloquean el primer slice están confirmadas o diferidas con dueño. No hace falta resolver el futuro entero.

### E2.1 — `knowledge-map-contract`

- **Garantía que protege:** conocer restricciones, límites, atributos de calidad y procedencia antes de tomar decisiones (fila «Conocimiento capturado en foundation»); un hueco de conocimiento no se presenta como un hecho confirmado.
- **Alcance:** esquema del mapa de conocimiento (ranuras, dimensiones, estados, perfiles y relaciones ranura → decisión), su ubicación (estado de máquina fuera de `openspec/`, que es solo del modo SDD; documentos humanos en `docs/`) y el catálogo inicial de ranuras por perfil.
- **Hecho cuando:** los seis perfiles tienen su conjunto de ranuras obligatorias con un ejemplo, y "desconocido" se distingue de "N/A" en el esquema. Fixtures válidos e inválidos verifican estados, procedencia y relaciones ranura → decisión, incluidos supuestos con disparador y diferidos con dueño. Los escenarios de calidad expresan estímulo, respuesta observable y medida cuando el proyecto la haya definido; no inventan presupuestos.
- **Alternativas y límite:** conservar las nueve preguntas actuales evita trabajo pero no cubre el conocimiento objetivo del roadmap. Este ítem entrega solo contrato y ejemplos: el motor y las rondas siguen en E2.2–E2.3, los ADR en E2.4 y su consumo selectivo y comprobaciones ejecutables en E3.1–E3.3. No añade skills por libro ni carga permanente de todos los documentos.

### E2.2 — `decision-gap-engine`

- **Alcance:** `ospec foundation next` aplica la fórmula de priorización, agrupa por tema y devuelve la siguiente ronda con recomendaciones; `record` persiste respuestas y supuestos.
- **Hecho cuando:** una CLI local, un SaaS pequeño y un producto regulado producen rondas distintas y deterministas a partir del mismo motor, y reanudar no repite preguntas ya respondidas.

### E2.3 — `foundation-discovery-rounds`

- **Alcance:** reescribir la foundation (hoy `sdd-foundation`) como capacidad propia, independiente del modo, sobre el ciclo descrito: rondas reanudables, ingestión de fuentes y documentos `docs/product/*`, `docs/architecture/*` y `docs/roadmap*.md` actualizados de forma incremental. Absorbe el diseño de [foundation holística](archive/2026-10-03-arquitectura/harness-foundation-holistic.md) (antes R2.1/R2.4, archivado como insumo).
- **Hecho cuando:** ningún scaffold ni código se genera sin aprobación, y se cumplen los escenarios de aceptación de ese diseño (CLI local, SaaS pequeño, regulado, brownfield, fuente desactualizada y cambio pequeño posterior).

### E2.4 — `decision-records-model`

- **Alcance:** tres tipos de registro, cada uno con plantilla y lint:

  | Registro | Contenido | Dónde vive |
  | --- | --- | --- |
  | **ADR** de arquitectura | Agnóstico; drivers, opciones, consecuencias, *fitness function*, disparador | `docs/architecture/decisions/` |
  | **TSR** (registro tecnológico) | Implementa uno o más ADR; alternativas y fuentes fechadas | `docs/architecture/technology/` |
  | **DC** (decisión de change) | Decisión de desarrollo de un cambio | Documento vivo del cambio (`design.md` en modo SDD) |

  El lint avisa si la sección "Decisión" de un ADR nombra productos o librerías del stack detectado, o si un ADR no referencia ningún driver. Ocupa el lugar de la skill `architecture-decision-records`, retirada en v2.86.0.
- **Hecho cuando:** los fixtures distinguen un ADR válido, un ADR "tecnológico" (aviso) y una decisión de desarrollo mal clasificada como ADR.

### E2.5 — `brownfield-architecture-recovery`

- **Alcance:** al adoptar un repositorio existente (hoy `sdd-baseline`), inferir componentes, límites y dependencias a partir del código y la documentación; proponer **ADRs inferidos** (`status: inferred`) y pistas de atributos de calidad que el usuario confirma o corrige; registrar las divergencias sin sobrescribir.
- **Hecho cuando:** en un repositorio de ejemplo se obtiene un mapa de componentes y ADRs inferidos con evidencia `ruta:línea`.

### E2.6 — `dogfood-ospec-foundation`

- **Alcance:** ejecutar E2.3 y E2.5 sobre este repositorio para producir el brief, el contexto de equipo, los atributos de calidad y unos 10 ADRs de arquitectura de ospec (p. ej. generación multi-target desde una fuente única, OpenSpec en disco como autoridad de estado, algoritmos en el CLI y no en prosa, ceremonia por impacto, cierre ligado a evidencia, memoria sin autoridad). Los 100+ registros actuales de `docs/adr/` se reclasifican como decisiones de change archivadas, con un índice.
- **Hecho cuando:** `docs/architecture/decisions/` contiene solo ADRs de arquitectura y cada uno pasa el lint de E2.4.

## Etapa 3 — Conocimiento vivo en cada cambio

**Resultado de la etapa:** cada cambio recibe por referencia solo el conocimiento pertinente, registra sus decisiones de desarrollo donde corresponde y solo modifica la arquitectura cuando de verdad la toca. Es lo que ODD no tiene.

### E3.1 — `change-decisions-and-adr-impact`

- **Alcance:**
  - El documento vivo registra las decisiones del cambio (DC).
  - Cuando la señal de ADR está activa, incluye la declaración de **impacto arquitectónico**: `ninguno | conforma ADR-n | enmienda | sustituye | contradice`. Enmendar, sustituir o contradecir es un gate.
  - El cierre deja de promover decisiones de desarrollo a `docs/adr/`.
  - Una **comprobación de promoción** propone un ADR nuevo o enmendado, con gate del usuario, solo cuando el cambio toca un driver o atributo de calidad, una frontera, un patrón transversal o contradice un ADR. Aprovecha el delta de complejidad de K6d.
- **Hecho cuando:** un cambio en una librería interna no genera ningún ADR, y un cambio que introduce mensajería asíncrona entre módulos propone una enmienda al ADR de integración.

### E3.2 — `knowledge-by-reference`

- **Alcance:** un mapa componente → conocimiento alimenta dos cosas: las referencias que entrega `ospec next` (identificadores de ADR, escenarios de calidad, términos de glosario y restricciones del equipo de los componentes que toca el cambio) y la señal de ADR de E1.3. Nunca se pasan documentos completos. La vigencia de cada referencia es visible: actual, desactualizada o ausente. Absorbe el antiguo R2.2.
- **Hecho cuando:** el cambio recibe solo las referencias pertinentes, y una referencia desactualizada produce un aviso en lugar de usarse como verdad.

### E3.3 — `fitness-functions-in-check`

- **Alcance:** los ADR y los escenarios de calidad declaran comprobaciones ejecutables (reglas de dependencias entre módulos, presupuestos de rendimiento, comprobaciones de seguridad) que `ospec check` ejecuta como evidencia. Las que no son ejecutables se tratan como checklist explícito con evidencia manual.
- **Hecho cuando:** una violación de frontera declarada en un ADR impide cerrar el cambio, y el error cita el identificador del ADR.

### E3.4 — `team-context-defaults`

- **Alcance:** el perfil de equipo de la foundation sustituye a la escala `solo | team | enterprise` y decide los defaults de entrega, el umbral de review, Strict TDD y la mentoría.
- **Hecho cuando:** dos proyectos con equipos distintos obtienen defaults distintos sin preguntar de nuevo.

### E3.5 — `knowledge-memory-loop`

- **Alcance:** ADR, TSR, DC y aprendizajes se reflejan en Engram con procedencia y revisión. Al empezar un cambio se recuperan las decisiones previas relacionadas. La memoria nunca es autoridad y su caída no bloquea.
- **Hecho cuando:** un cambio nuevo cita una decisión previa relevante encontrada en memoria y la contrasta con el disco.

## Etapa 4 — Demostrar que es mejor

### E4.1 — `bench-scenarios`

- **Alcance:**
  - Seis escenarios con agentes reales, reutilizando la infraestructura de registro de agentes de K12 (`worker-record`): CLI local, SaaS pequeño, producto regulado, brownfield, librería pública y bugfix.
  - Brazos: el modo SDD actual (línea base, medida antes de E1.6) e IDD.
  - Métricas: defectos escapados, tokens, duración, preguntas (cuántas y cuántas cambian una decisión) e intervenciones humanas. Desde E2 se añaden la cobertura del mapa y la calidad de los ADR, con rúbrica.
  - Los márgenes se declaran antes de ejecutar.
- **Hecho cuando:** el informe es reproducible y su checkpoint habilita o frena E1.6.
- **Decisiones del usuario (2026-10-05):** E4.1 compara modos, así que basta un host: Claude Code en modo headless (`claude -p`), con el plugin construido desde el checkout y un `CLAUDE_CONFIG_DIR` propio del banco, para que ni el `CLAUDE.md` personal, ni los plugins instalados, ni los MCP, ni la memoria entren en la medición. Las preguntas las contesta una persona simulada que conoce hechos ocultos de cada escenario. La línea base usa Sonnet 5.5 con una repetición. Márgenes `bench-margins-1`: IDD no escapa más defectos en total y gasta como mucho el 90 % de los tokens. De K12 no se cablea nada: su forma está atada al kernel retirado (políticas `fixed` y `adaptive-repair-v1`, medidas de fases, efectos y eventos), así que se retira salvo el intervalo por tarea del runner.
- **Entrega:** PRs encadenados: (a) harness, escenarios y márgenes; (b) retirada de lo que queda de K12; (c) corrida de la línea base SDD con su informe. El brazo IDD se ejecuta en E1.6, con su protocolo, antes de cambiar el default.
- **(a) entregado en v2.104.0:** `scripts/evals/bench/` (REQ-bench-001 a 006, spec `bench`). Seis escenarios, uno por perfil, con repositorio semilla, petición, hechos ocultos y checks ocultos de aceptación, de hecho y de regresión. Una entrega de referencia por escenario prueba que los checks pasan con una solución correcta y que la semilla falla la aceptación. El driver materializa la semilla como repositorio git fuera del repositorio de ospec, ejecuta el setup del brazo fuera de la medición, conversa por turnos (`--resume`) hasta que el brazo da el cambio por terminado (en SDD, un change archivado) o hasta el tope de turnos o de coste, y juzga el workspace con los checks ocultos. El record versionado ata cada corrida a host, modelo, build del plugin, persona y corpus, y guarda el SHA-256 de cada transcript; el informe y el checkpoint se recalculan desde él sin llamar a un modelo. El brazo `idd` queda declarado y se niega a correr hasta E1.6.
- **(b) entregado en v2.105.0:** se retira lo que quedaba de K12: `worker-record`, `runner`, `run-manifest` y su esquema (`schemas/kernel/run-manifest/`, REQ-kernel-contract-schemas-033), `cohort`, `obligation-oracle` y `pilot-checkpoint`, con sus tests, el corpus de 22 tareas, los márgenes, las calibraciones y las instantáneas del piloto. El intervalo t por tarea pasa a `scripts/evals/bench/stats.js`. La historia del piloto queda en su [informe](../analysis/2026-10-03-adaptive-pilot-report.md); para reproducirlo hay que usar v2.104.0 o anterior.
- **Corrección en v2.105.1:** la primera corrida de la línea base (`sdd-baseline-1`) se descartó tras su primer escenario. La persona con Haiku declaró haber revelado tres hechos con un simple «Confirmado» y no corrigió un resumen que contradecía uno de ellos. La persona pasa a Sonnet, solo puede declarar los hechos cuyo contenido escribe en su respuesta y compara con sus hechos cada resumen o plan que aprueba. El record y el checkpoint incorporan además la huella del propio harness, para no comparar corridas de versiones distintas.
- **(c) entregado en v2.106.0:** línea base del modo SDD en `scripts/evals/bench/records/sdd-baseline-2.json`, con su [informe](../analysis/2026-10-06-bench-linea-base-sdd.md). Los seis escenarios terminan completos, con los 43 checks ocultos en verde y 0 defectos escapados. Gastan 63,1 M tokens ($37,00, el 91 % en lecturas de caché), 93 minutos y 14 intervenciones, de las que 6 cambian una decisión. Para E1.6, IDD no puede escapar ningún defecto y debe quedarse en unos 56,8 M tokens. Hallazgos del modo SDD: `sdd-init` no escribe `routing:` y `validate-phase` rechazaba entonces toda ruta salvo `freeform` (corregido en v2.106.1, REQ-routing-017), y verify se bloquea esperando confirmar supuestos en la mitad de los escenarios. Queda pendiente para E1.6 decidir si el checkpoint usa más de una repetición: el mismo escenario costó 2,7 veces más en la corrida descartada. Follow-ups del banco: abortar la corrida al agotarse la cuota de sesión del host y no contar como escapados los checks de una corrida con el setup incompleto.
- **Decisiones del usuario tras la línea base (2026-10-06):** la varianza entre corridas (2,7 veces en `cli-local`) supera el margen del 10 % en tokens, así que cada brazo corre **3 repeticiones** por escenario. Los márgenes `bench-margins-2` se aplican a medias por escenario: IDD no puede sumar más escapados medios que SDD, y gasta como mucho el 90 % de sus tokens medios. El veto de checks es estricto: un check que SDD pasa en sus tres repeticiones e IDD falla en alguna obliga a revisar. Los follow-ups del banco se arreglan antes de medir, y el defecto de routing del modo SDD también (v2.106.1), así que la línea base se repite como `sdd-baseline-3`; `sdd-baseline-2` queda como histórico.
- **(d) entregado en v2.107.0:** repeticiones en el banco (record de schema 2, `--repetitions`, medias por escenario en el informe; los records de schema 1 se siguen leyendo), checkpoint con `bench-margins-2`, parada de toda la campaña al agotarse la cuota del host (código 3, sin registrar la corrida cortada) y corridas anuladas en el setup sin juzgar. Queda la corrida `sdd-baseline-3` con su informe.
- **Revisión de presupuesto del usuario (2026-10-06):** sustituye la decisión de tres repeticiones. La cuota disponible no alcanza para esa campaña y se prioriza implementar E1.6 y medir IDD. `bench-margins-3` mantiene el ratio de tokens ≤ 0,9, el margen de escapados de 0 y el veto de regresiones, con **una repetición por escenario y brazo**. En `sdd-baseline-3` se reduce únicamente el número de repeticiones planificadas de 3 a 1: sus tres resultados, métricas, transcripciones y huellas se conservan. Faltan tres corridas SDD y seis IDD para completar la comparación. La pasada anterior sigue como histórico, sin mezclarse con la actual. Es una comparación exploratoria de seis escenarios; una corrida por escenario no mide su variabilidad entre repeticiones. Habilitar el brazo IDD en E1.6 debe conservar la procedencia de los resultados SDD existentes; no se omiten los controles de comparabilidad ni se declara una comparación completa con pares pendientes.
- **Cierre en v2.111.0:** el checkpoint de `idd-2` contra `sdd-baseline-3` da `continue` y habilita E1.6 (d). La calidad de las entregas se compara aparte con `scripts/evals/quality/` (métricas del diff, mutation testing y revisión a ciegas por pares), que lee los workspaces del banco y guarda los diffs, sin tocar el harness.
- **(e) entregado en v2.107.1:** `sdd-baseline-3` completa, con su [informe](../analysis/2026-10-07-bench-linea-base-sdd-3.md). Seis de seis escenarios completos, 43/43 checks y 0 defectos escapados, con 65,7 M tokens ($38,64), 93 minutos y 13 intervenciones, de las que 5 cambian una decisión. Frente a `sdd-baseline-2`, el total sube un 4 %, pero cada escenario varía entre −36 % y +71 %. Para E1.6, IDD no puede escapar ningún defecto y debe quedarse en unos 59,1 M tokens. Con el arreglo de routing, `cli-local` ya no pregunta por la ruta. Hallazgo nuevo: en Claude, `/sdd-new` declara dos argumentos posicionales y parte la petición (`Quiero` como nombre, `poder` como intención); el agente la recuperó, pero queda pendiente de corregir en el comando.

### E4.2 — `head-to-head-gentle-ai`

- **Alcance:** los mismos escenarios con gentle-ai (ODD y RDD), mismo host y mismo modelo. Tabla comparativa publicada en cada tren de releases.
- **Hecho cuando:** existe una comparación publicada con numeradores, denominadores y exclusiones.

### E4.3 — `context-budget-ratchet`

- **Alcance:** los techos de E0.0 bajan en cada release que reduce contexto, y nunca suben sin una justificación registrada.

### E4.4 — `execution-resource-experiment`

- **Problema y garantía:** E4.1 comparó modos con host y modelo fijos; no demuestra que variar modelo, reasoning effort o delegación reduzca el coste manteniendo las garantías. Este ítem mueve las filas «Escenarios comparados» y «Contexto del flujo por defecto» solo si obtiene evidencia, y preserva las obligaciones IDD.
- **Reutilización:** `scripts/evals/bench/bench.js` ya admite `--model`, `--effort`, `--scenario` y `--repetitions`, con registros de identidad, checks ocultos y métricas. `models.yaml` sigue como configuración canónica de tiers por target. El checkpoint entre modos exige modelo y effort iguales: no se relaja ni se usa para declarar superioridad de una estrategia de recursos.
- **Primer experimento:** A, configuración habitual sin delegación adicional; B, mismo modelo variando únicamente effort, solo en un host que lo soporte. `bugfix` y `saas-small`, una repetición por escenario y estrategia: cuatro ejecuciones exploratorias. Fijar antes host, versiones, build, modelo, persona, instrucciones, herramientas, corpus, checks, valores de effort y presupuesto; alternar el orden A/B. El análisis separado reutiliza los registros sin añadir un router al producto.
- **Medición:** corrección, regresiones y defectos escapados; tokens y coste total hasta una entrega válida, incluido setup, persona, caché, revisores y correcciones; latencia, reintentos e intervenciones. Delegaciones y transferencia/integración de contexto se miden cuando el host exponga datos; lo no observado figura como desconocido. Mantener aceptación independiente y versión anterior funcional; un cierre declarado sin estado válido no cuenta como entrega.
- **Criterio previo y repetición:** acordar el beneficio mínimo y el presupuesto antes de correr, sin inventar un objetivo de rendimiento. Veto a nuevos defectos, regresiones o incumplimientos de contratos y reviews exigidos. Si la señal justifica continuar y hay presupuesto, repetir ambos escenarios con tres repeticiones por estrategia (doce ejecuciones nuevas); la muestra inicial no permite declarar superioridad general.
- **Siguiente alternativa, condicionada:** probar selección de modelos con effort fijo solo si procede; después delegación selectiva para trabajo independiente con ventaja concreta. Combinar dimensiones únicamente cuando sus ensayos individuales lo justifiquen. Respetar preferencias, capacidades disponibles y degradación explícita; funcionar con un solo modelo. No añadir identificadores de proveedor a reglas de negocio ni una segunda clasificación de impacto.
- **Hecho cuando:** un informe reproducible declara condiciones, muestras, numeradores, exclusiones y costes completos, y decide entre no implementar, optimización mínima, routing ligero u orquestación avanzada. Adoptar solo una mejora con beneficio medido y coste de mantenimiento aceptable; descartar o revertir si añade más complejidad que valor. No implementar sigue siendo una conclusión válida.

## Etapa 5 — Plataforma por demanda

Ítems que se abren cuando hay demanda o evidencia, sin orden fijo:

- **E5.1 — `target-capability-matrix`:** matriz honesta de capacidades por target (7), revalidada con la documentación oficial; absorbe [`targets/`](targets/).
- **E5.2 — paquetes de conocimiento bajo demanda:** consulta curada de fuentes externas (incluido el catálogo CNCF) con fuentes y vigencia (antes R2.3/R2.6).
- **E5.3 — documentación y wiki:** `sdd-document` y la web Starlight consumen el mapa de conocimiento y los ADR (antes R2.7). Regenera `openwiki/`, que aún describe la dirección del kernel.
- **E5.4 — federación y workspace:** evolución de R4 cuando haya un caso real multi-repositorio.
- **E5.5 — `change-program`:** objetivos grandes gestionados como programa, con cambios hijos y un cursor que retoma el siguiente. Insumo: [proporcionalidad y Change Program](archive/2026-10-03-arquitectura/research/proportional-process-and-change-program.md).
- **E5.6 — deuda diferida H1–H7:** remediación del backlog de archive y runtime al terminar el roadmap (decisión del usuario del 2026-10-02).
- **E5.7 — fin de la lectura de linajes v1:** retirar la lectura compatible de `schema_version: 1` (`4r-review-gate`, `LEGACY_DIMENSIONS`, la rama v1 de `review-correction`) y el clasificador v1 (`deriveReviewDimensions`, `validateReviewDecision`). Se abre a partir de v2.92.0, cuando termina la ventana de una versión menor de E0.3 (d).
- **E5.8 — `sdd-marketplace-plugin`:** publicar un segundo plugin, `ospec-workflow-sdd`, en el marketplace de Claude. Desde v2.113.0, `publish-marketplace.yml` construye la build por defecto, sin `--with-sdd`, así que quien instala desde el marketplace no puede activar SDD; hoy solo puede instalarlo desde un checkout con `npm run setup:claude -- --with-sdd`. Primero hay que decidir entre un plugin completo con SDD que sustituye al principal y un complemento que solo añade el paquete SDD; el complemento obliga a resolver cómo conviven dos plugins: nombres de skills y agentes, hooks y runtime duplicados, y la ruta al CLI. Idea aprobada por el usuario el 2026-10-08 y aplazada: no es prioritaria. Se abre cuando alguien necesite SDD instalando desde el marketplace o al terminar E1.

## Aparcado (con criterio de reapertura)

Se conserva el código y la documentación; no recibe inversión mientras no se cumpla el criterio.

| Línea | Criterio de reapertura |
| --- | --- |
| Recetas K9/K10 (Direct, Repair, Bounded, Planned y Critical, y profiles múltiples) | IDD las sustituye por obligaciones; solo vuelven si E4 muestra un caso que las obligaciones no cubren |
| K10-delivery (`DeliveryAuthorization` en pre-commit, pre-push y pre-pr) | Que un equipo usuario pida bloquear la entrega con evidencia y E1.4 esté cableado |
| K11a–K11d (expansión de adapters, routing de modelos, worktrees, consolidación de roles) | Que un ítem lo necesite como consumidor concreto |
| K12 longitudinal y multi-target | Que E4 necesite series largas |
| CX2–CX6 (vistas derivadas, proyección de contexto, deltas de spec) | Que E0 o E4.3 no alcancen sus techos con medios más simples |
| Capacidades nuevas del modo SDD (migrarlo al CLI, trocear su protocolo, gate de entrada agrupado) | Que usuarios del modo SDD lo pidan con un caso concreto |
| Dream-RSI y aprendizaje de políticas | Que exista una política fija con evaluador congelado y cohorte de holdout |

## Base entregada

Lo que ya existe y en qué ítem se aprovecha. El detalle de cada pieza está en el [roadmap archivado](archive/2026-10-03-harness-evolution-kernel.md).

| Estado | ID | Qué dejó | Uso en este roadmap |
| --- | --- | --- | --- |
| `done` | **O2B** | Baseline `fixed` de control (v2.36.0) | Brazo de control de E4.1 |
| `done` | **O3** | Clarify condicional | Gate de ambigüedad de IDD (E1.2) |
| `done` | **O4+O5** | Review selectivo y linaje acotado | Review por obligación (E1.4) |
| `done` | **O6A** | Archive híbrido transaccional | `ospec close` (E1.4); deuda en E5.6 |
| `done` | **K1** | Contract suite, vocabulario y clasificación (v2.37.0) | Señales de impacto (E1.3) |
| `done` | **K2** | Lifecycle, Minimal Kernel Harness e invariantes (v2.38.0) | Retirado en v2.97.0; `k1-compat` y el reducer de fases siguen |
| `done` | **K2.1** | Authority Store (CAS), OperationPermit y semántica de efectos (v2.39.0) | Retirado en v2.97.0 |
| `done` | **K2a** | Headless Conformance Host y adapter de referencia, implemented en v2.40.0 | Retirado en v2.97.0 |
| `done` | **K3** | Identidades de ejecución y Candidate (v2.42.x) | Cableado: Candidate v2 del linaje de review (E1.4) |
| `done` | **`k3-readiness-remediation`** | Relación, successor y empaquetado reconciliados; archivado | — |
| `done` | **K4a** | Execution Graph compiler, Obligation Manifest y replay (verificado en v2.45.7) | Cableado vía el binding K7 del review (E1.4) |
| `done` | **K5** | Budgets, failures y recovery (v2.45.13) | Retirado en v2.97.0 |
| `done` | **K6a** | Aislamiento de workers y cápsula de work order (v2.46.0–v2.47.2) | Retirado en v2.97.0, salvo `worker-workspace` (congelado) |
| `done` | **K4b** | Repair shadow execution (v2.48.x) | Retirado en v2.97.0: la reproducción la prueban las dos ejecuciones de `ospec check` |
| `done` | **K6b** | Verifier independiente, provenance y Assurance Graph (v2.55.0) | Lo distribuido sigue vía K7; el resto, congelado con dueño E1.4 |
| `done` | **K6c** | Challenges adversariales por política (v2.56.x) | Catálogo e integridad siguen; planner, runner, mutator y budget retirados en v2.95.0 |
| `done` | **K6d** | Delta de complejidad y arquitectura, advisory | E3.1 |
| `done` | **PP1/PP2** | Elegibilidad de rutas con suelos de riesgo; contrato lite compacto | Señales de impacto (E1.3) |
| `done` | **CX0/CX1** | Medición de contexto; envelope y reducer de estado | E0.0 y E1.2 |
| `done` | **Binding de identidad de operación** | Gate de ambigüedad en SubagentStop (v2.69.0) | Retirado en v2.95.0: E1.2 se entregó sin él |
| `done` | **K7 mínimo** | Binding de review con Candidate y Policy, lineage v3 (v2.70.0) | E1.4 |
| `done` | **K8 mínimo** | `CandidateEvaluationAttestation` (v2.71.0–v2.73.1) | Código retirado en v2.95.0; el esquema sigue en `schemas/kernel` |
| `done` | **K12 focal** | Oracle por fixture, campaña de maquinaria y cohorte de 22 tareas (v2.70.0–v2.78.0) | Pilot y campaign executor retirados en v2.96.0; el resto, en v2.105.0 (E4.1 usa su propio record y conserva solo el intervalo por tarea) |
| `done` | **Piloto Adaptive Repair** | Checkpoint determinista `continue` (v2.79.0) y calibración con agentes reales `continue` (v2.80.0) | Obligación de reproducción (E1.4) |
| `done` | **Engram por target** | Configuración automática en los 7 targets (v2.81.0) | E3.5 |

## Historial

- 2026-10-08: el usuario acepta las cinco oportunidades de la auditoría de ingeniería y eficiencia. Se concretan E1.12, E1.13 y E2.1, y se incorporan E1.15 (política de sucesores, pendiente de decisión) y E4.4 (experimento de recursos, sin router autorizado). E2.1 conserva `next-eligible`; ninguna capacidad nueva se marca como entregada.
- 2026-07-02 → 2026-10-03: programa K1–K12 y lanes O, PP, CX y R2 (ver el [roadmap archivado](archive/2026-10-03-harness-evolution-kernel.md#historial-consolidado)).
- 2026-10-03: auditoría de skills, carga *lazy*, instrucciones por target, orquestador y comparación con gentle-ai. El roadmap K1–K12 se archiva y se sustituye por este roadmap único. K10-delivery, K11, K12 longitudinal, CX2–CX6 y Dream-RSI quedan aparcados con criterio de reapertura.
- 2026-10-03: la arquitectura objetivo del kernel, Adaptive, proporcionalidad, foundation holística y la investigación salen de `docs/architecture/` hacia [`archive/2026-10-03-arquitectura/`](archive/2026-10-03-arquitectura/README.md). La carpeta queda reservada para la arquitectura vigente (E2.6) y `docs/README.md` vuelve a ser el índice de la documentación.
- 2026-10-03: SDD deja de ser el flujo por defecto. El roadmap se reorienta a **IDD** (profundidad por impacto, cierre por evidencia) como flujo propio, con SDD como modo opcional. Las recetas Direct, Repair y Critical (antes E4.2) y la clasificación por impacto (antes E4.1) pasan a ser señales y obligaciones de la Etapa 1. El motor de estado se reorienta a IDD, y migrar el orquestador SDD al CLI queda aparcado. Change Program pasa a la plataforma por demanda.

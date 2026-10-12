# Checkpoint de cierre de la Etapa 3: `continue`

Fecha: 2026-10-11 · Versión medida: ospec-workflow v2.131.1 (`2abc34e2`) · Roadmap: [Etapa 2 — Foundation de verdad](../roadmaps/harness-evolution.md#etapa-2--foundation-de-verdad-descubrimiento-de-arquitectura) y [Etapa 3 — Conocimiento vivo en cada cambio](../roadmaps/harness-evolution.md#etapa-3--conocimiento-vivo-en-cada-cambio).

El roadmap pide, al cerrar cada etapa, un checkpoint `continue | revise` contra la tabla de [objetivos medibles](../roadmaps/harness-evolution.md#objetivos-medibles), con números. La Etapa 2 (E2.1–E2.6) cerró en v2.125.0 sin checkpoint propio, y la Etapa 3 (E3.1–E3.5) en v2.131.1. Por decisión del usuario, este informe cubre las dos: mide las filas que debían mover, comprueba que las de las Etapas 0 y 1 siguen dentro de su objetivo, da el veredicto y fija los follow-ups. Todo se reproduce desde un checkout limpio en v2.131.1:

```sh
node scripts/measure-context-baseline.js          # always-on, skills y listado por target
node scripts/check.js                             # suite completa
node scripts/ospec.js foundation next --json      # siguiente hueco del mapa de ospec
```

El tamaño del protocolo IDD por target sale de la misma build en memoria (`buildTargetFiles` de `scripts/lib/context-baseline.js`, fichero `skills/idd/SKILL.md` de cada target). Los impactos, gates y preguntas salen de los `state.yaml` de `idd/archive/`. La suite pasa: 3618 tests, 3615 en verde, 0 fallos y 3 omitidos.

## 1. Veredicto: `continue`

Todas las filas que mueven las Etapas 2 y 3 cumplen su objetivo, y las de las Etapas 0 y 1 siguen dentro del suyo. Lo siguiente es E4.2 `head-to-head-gentle-ai`. Decisión del usuario sobre las cifras de la sección 2, con dos salvedades.

**Salvedad 1, margen de contexto.** Router más protocolo IDD mide 15,0–15,3 KB frente al objetivo de ≤ 16 KB; al cierre de la Etapa 1 medía 8,6–9,0 KB. La skill `idd` creció de 5,5 KB a 11,7 KB con los gates, la guía de checks, los tests por riesgo, el conocimiento por referencia, las fitness functions y el bucle de memoria, y queda a 617 B del techo de 12 KiB que impone `scripts/configure/idd-protocol.test.js`. Con memoria disponible, el agente carga además `references/memory-loop.md` (2,3 KB) y el total llega a 17,3–17,6 KB. El objetivo se cumple en la instalación por defecto, pero la siguiente capacidad que crezca el protocolo lo rompe. Pasa a E4.3 (sección 4).

**Salvedad 2, ADR desde los cambios.** Ningún cambio real de la Etapa 3 creó ni enmendó un ADR: los 62 impactos declarados son `conforms` o `none`. La ruta de enmienda (señal, gate `adr-amend-or-contradict`, ADR nuevo con lint) solo la prueba el fixture `architecture-amendment`. Queda como riesgo conocido, igual que la salvedad de E1.6 en la Etapa 1, no como bloqueo.

## 2. Objetivos de las etapas

| Métrica | Cierre de la Etapa 1 (v2.117.1) | Cierre de la Etapa 3 (v2.131.1) | Objetivo | Resultado |
| --- | --- | --- | --- | --- |
| Conocimiento capturado en foundation | 9 preguntas lineales | Contrato `ospec-knowledge-map/v2` con 6 perfiles y 20 ranuras (de 5 obligatorias en `prototype` a 20 en `regulated`); «desconocido» y «N/A» distintos, supuestos con disparador y diferidos con dueño. `ospec foundation next` elige la ronda por huecos y `record` persiste la respuesta. El mapa de ospec: 19 ranuras, 16 `confirmed` y 3 `n/a`, sin obligatorias pendientes; su siguiente hueco es opcional (`business.constraints`) | Mapa de conocimiento por perfil, con huecos explícitos | ✅ |
| ADRs de arquitectura (agnósticos de tecnología) | 0 | **11** ADR de arquitectura en `docs/architecture/decisions/`, los 11 pasan el lint de E2.4 sin avisos ni errores, 10 con fitness ejecutable y 1 (0003) como checklist. Los 277 registros de `docs/adr/` quedan indexados como decisiones de change. Desde los cambios: 7 cambios con la señal de ADR, 62 impactos declarados, 0 enmiendas (salvedad 2) | Desde foundation y desde los cambios que tocan arquitectura | ✅ con salvedad |
| Contexto del flujo por defecto | Router más protocolo IDD: 8,6–9,0 KB | Router 3,3–3,6 KB más protocolo IDD 11,7 KB = **15,0–15,3 KB**; 19,6–19,9 KB con el listado de skills (4,6 KB); 17,3–17,6 KB con `memory-loop.md`. Orquestador por defecto: 0 KB | Router más protocolo IDD ≤ 16 KB | ✅ con salvedad |
| Obligaciones comprobadas por código | 7 de 7 activas | **8 de 8**: `adr-impact-declaration` activa desde E3.1, y sus fitness functions se ejecutan desde la base del cambio como runs `fitness` | 100 %, vía `ospec check` | ✅ |
| Documentos creados en un cambio trivial | 0 | **0**: de los 10 cambios `docs` archivados desde el checkpoint anterior, los 9 sin varias unidades ni decisión cerraron sin `change.md`; solo `dogfood-ospec-foundation`, con varias unidades, lo escribió | 0 | ✅ |
| Preguntas antes de empezar un cambio | Un lote por cambio (3–7 preguntas) | **Un lote por cambio**: ninguno de los 49 cambios IDD posteriores abrió más de un `open-facts`; los once ítems de las Etapas 2 y 3 preguntaron de 1 a 10 hechos | Un solo lote, solo en los cuatro gates | ✅ |
| Skills instaladas por defecto | 31 | **33**: entran `foundation`, que sustituye a `sdd-foundation` del paquete SDD, y `cncf-landscape` (E2.3) | 46 (+6 opcionales); las de fase SDD, en el paquete opcional | ✅ (por debajo) |

Las filas de la Etapa 0 siguen dentro de su techo: *always-on* de 3,3–3,6 KB frente a ≤ 4 KB (`scripts/fixtures/context-baseline.json` no cambia), y 100 % de agentes con su skill. La fila «Escenarios comparados» es de la Etapa 4 y no cambia.

### 2.1. La fila de preguntas

El objetivo limita las interrupciones, no las preguntas. Se cumple, pero el lote crece: en la Etapa 1 cada cambio preguntó de 3 a 7 hechos, y los cinco ítems de la Etapa 3 preguntaron entre 5 y 10 (`knowledge-by-reference`, 10). Son cambios con más decisiones de contrato, y el usuario respondió cada lote en un mensaje aceptando las recomendaciones. No pasa a follow-up; E4.2 lo medirá frente a gentle-ai.

## 3. Evidencia de uso real

Cada ítem de las Etapas 2 y 3 se hizo con IDD en este repositorio:

| Ítem | Cambio | Preguntas | Gates | Señal de ADR e impactos |
| --- | --- | --- | --- | --- |
| E2.1 | `knowledge-map-contract` | 1 | open-facts | — |
| E2.2 | `decision-gap-engine` | 4 | open-facts | — |
| E2.3 | `foundation-discovery-rounds` | 5 | open-facts | — |
| E2.4 | `decision-records-model` | 6 | open-facts | — |
| E2.5 | `brownfield-architecture-recovery` | 7 | open-facts | — |
| E2.6 | `dogfood-ospec-foundation` | 6 | open-facts | — |
| E3.1 | `change-decisions-and-adr-impact` | 5 | open-facts | 6, todos `conforms` |
| E3.2 | `knowledge-by-reference` | 10 | open-facts | 12: 11 `conforms`, 1 `none` |
| E3.3 | `fitness-functions-in-check` | 8 | open-facts | 12, todos `conforms` |
| E3.4 | `team-context-defaults` | 9 | open-facts | 10, todos `conforms` |
| E3.5 | `knowledge-memory-loop` | 9 | open-facts | 12, todos `conforms` |

Fuera de los ítems, `trim-idd-skill-budget` (3) y `trim-knowledge-records` (7) también declararon impactos `conforms`. Desde E3.1, cada cambio que toca un componente del mapa recibe sus ADR y escenarios vigentes sin declararlos: los 9 componentes de `docs/architecture/component-map.yaml` tienen rutas y conocimiento.

Dos hechos muestran el conocimiento vivo en un cambio real. En E3.4, el gate propuso un único perfil de equipo en `idd/config.yaml` para los dos modos; chocaba con ADR 0011, que el cambio tenía entre sus referencias, y el usuario eligió ajustar el cambio para cumplirlo en lugar de enmendarlo. En E3.5, el cambio recuperó de la memoria la frontera de ADR 0006 y la separación de modos de ADR 0011 antes de sus open facts y las confirmó en disco.

**Hallazgo de este checkpoint:** el mapa de conocimiento de ospec sigue en `ospec-knowledge-map/v1`, así que sus 5 escenarios de calidad (`deterministic-resume`, `target-parity`, `guard-fail-closed`, `offline-operation`, `contract-compatibility`) no declaran `fitness`. Los cambios los citan como `conforms`, pero `ospec check` no ejecuta nada por ellos; solo los ADR tienen comprobaciones. Pasa a E3.6.

## 4. Follow-ups que pasan a ítems

Por decisión del usuario:

- **E4.3 `context-budget-ratchet` absorbe el margen de contexto (salvedad 1):** además de bajar los techos de E0.0, fija un techo medido para router más protocolo IDD por target y otro para la carga con las referencias bajo demanda (`memory-loop.md`), y recupera margen frente a los 16 KB antes de que el protocolo crezca otra vez.
- **E3.6 `quality-scenario-fitness`, `pending`:** el mapa de conocimiento de ospec pasa a v2 y cada escenario de calidad declara su `fitness`, con comprobación ejecutable donde exista y checklist donde no. No bloquea E4.2.

Sigue fuera: E5.8 `sdd-marketplace-plugin`, por demanda.

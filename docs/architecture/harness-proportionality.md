# Proporcionalidad del harness: seleccionar garantías y comprimir ejecución

> **Estado:** diseño operativo para cambios futuros. No activa rutas, defaults, aprobaciones ni sustituye el [roadmap](../roadmaps/harness-evolution.md).
> **Relación:** [Arquitectura](harness-evolution.md) define autoridad y límites; este documento define cómo seleccionar, materializar, comprimir o escalar sin cambiarlos.

## Decisión

La proporcionalidad no reduce el listón por tener un cambio corto, un modelo más capaz o menos invocaciones. Determina las **obligaciones** que deben satisfacerse y permite elegir la ejecución y representación mínimas que las demuestren.

```text
Intención + aceptación
  → garantías requeridas
  → obligaciones
  → ejecución y artefactos proporcionales
  → candidato + evidencia
  → verificación independiente
  → cerrar, recuperar o escalar
```

| Decisión | Responde | No decide |
| --- | --- | --- |
| Admisión | Qué garantías y recipe son admisibles | Cuántos agentes o documentos usará el worker |
| Obligaciones | Qué debe demostrarse y con qué evidencia | La estrategia interna para conseguirlo |
| Ejecución | Qué responsabilidades puede combinar un worker | La autoridad del verifier, reviewer o delivery |
| Materialización | Qué debe persistir para recovery y consumidores | Que un análisis efímero sea un artefacto por defecto |

## Selección de garantías

<a id="matriz-de-aceptación-para-cambios-futuros"></a>

La admisión recoge propósito, aceptación, scope, interfaces afectadas, reversibilidad y desconocidos materiales. Deriva obligaciones desde cuatro señales: **riesgo**, **incertidumbre**, **radio de impacto** y **reversibilidad**. Los floors de auth, migración, contrato público y efectos destructivos prevalecen sobre tamaño, urgencia, coste o intención `hotfix`.

1. Recuperar change, ruta y decisiones persistidas cuando es una continuación.
2. Reducir desconocidos con exploración focal o decisión de alcance cuando impidan fijar un mínimo seguro.
3. Aplicar floors y construir obligaciones: comportamiento, compatibilidad, rollback, evidence strategy, review o challenge cuando correspondan.
4. Seleccionar la primera ruta legacy elegible, conservando prioridad contextual y el orden de tabla.
5. Elegir ejecución, representación y contexto que cubran esas obligaciones.
6. Registrar razones, supuestos materiales y señales que exigirían reclasificación.

`unknown` no autoriza un atajo ni obliga por sí mismo a un proceso completo: exige resolver el desconocido suficiente para admitir una ruta segura. Las recetas K10 (`Direct`, `Repair`, `Bounded`, `Planned`, `Critical`) y el vocabulario legacy (`trivial`, `small`, `normal`, `high-risk`) coexisten hasta que cada receta tenga su mapeo de garantías validado; no son equivalencias implícitas.

## Compresión de ejecución

La capacidad observada puede cambiar la forma de cumplir una obligación, nunca su existencia. Una Bounded con contrato, scope congelado, verificación independiente y review requerida puede ejecutarse así:

| Forma | Ejecución | Garantías idénticas |
| --- | --- | --- |
| Varios workers | Descubrimiento/decomposición e implementación separados; luego freeze, verifier y review. | Contrato, paths permitidos, Candidate, evidencia, verifier y review. |
| Un worker capaz | Un worker realiza análisis e implementación dentro del scope; luego freeze, verifier y review separados. | Contrato, paths permitidos, Candidate, evidencia, verifier y review. |

La segunda forma no se presume por nombre de modelo ni por autoconfianza. Requiere perfil observado por tarea y fallback compatible. Tampoco convierte una Bounded en Direct: Direct sigue limitado a trabajo mecánico, reversible y sin cambio de comportamiento. El ejemplo completo, incluidas O1–O4 y su evidencia, está en la [arquitectura](harness-evolution.md#ejemplo-bounded-con-la-misma-garantía).

## Materialización JIT y compatibilidad

Persistir no equivale a producir una fase o un documento por cada paso. Un dato se materializa cuando soporta una decisión futura, recovery, trazabilidad o un consumidor vigente; de otro modo se mantiene como contexto efímero.

| Clase | Siempre persiste | Puede derivarse o referenciarse | Efímero por defecto | Condición para materializar |
| --- | --- | --- | --- | --- |
| Intención | aceptación, scope/no-scope, restricciones y approvals materiales | baseline, fuentes canónicas y contexto estable | búsqueda local o razonamiento de trabajo | afecta alcance, contrato o decisión posterior |
| Policy e identidad | policy/route persistida, Candidate, digests, permits y budgets | Execution/Assurance Graph y vistas de estado, si conservan entradas canónicas, digests, replay y contratos requeridos | elección interna de herramientas | recovery, replay o consumidor debe reconciliarlo |
| Evidencia | receipts, resultados, provenance, findings y decisiones de cierre | renderers, tablas de cumplimiento y archive views | salida de herramientas sin valor probatorio | satisface obligación o explica un bloqueo |
| Planificación | decisiones arquitectónicas y dependencias materiales | tareas desde contrato/grafo cuando el consumidor lo admite | checklist del worker y descomposición momentánea | otro actor debe ejecutarla, revisarla o reanudarla |

Antes de retirar o compactar un artefacto, se hace inventario de consumidores: skills, validadores, recovery, renderers, targets y archive. Mientras uno requiera el formato actual, se conserva adapter o representación compatible. No se infiere que un grafo persistido pueda desaparecer. PP2 mantiene `proposal-lite → tasks → apply → verify → archive`; CX1/CX2 pueden sustituir duplicación mecánica de forma versionada, con replay y fallback.

## Escalado durante ejecución

La clasificación inicial no es una promesa de complejidad total. Las señales nuevas elevan las obligaciones de forma monótona y disparan una transición tipada; no degradan automáticamente la ruta persistida ni reinician lineage, attempts, budgets o evidencia todavía válida por digest.

| Señal descubierta | Obligación añadida | Acción |
| --- | --- | --- |
| Auth, migración, API pública o efecto irreversible | floor superior, compatibilidad, rollback y evidence strategy correspondiente | pausar, recompilar el subgrafo y escalar antes de ejecutar afectado |
| Scope o dependencia inesperados | contrato/impacto adicional y paths revisados | clarificar o explorar focalmente; invalidar solo descendientes afectados |
| Evidence stale, mismatch o check fallido | recolección o verificación adicional | recovery allowlisted con causa y presupuesto existentes; no inventa un riesgo mayor |
| Cambio material de contrato o Candidate | successor y bindings nuevos | preservar historia; no reciclar evidencia de dependencia desconocida |

Reintentos idénticos pasan a diagnóstico acotado o estado terminal; nunca reinician budgets. Un cambio material requiere successor y la aprobación que exija el protocolo vigente. El rollback de una optimización restaura input, representación o ejecución compatible mediante la transición vigente. Nunca cambia la ruta persistida por sí solo ni borra datos de un change activo.

## Perfiles observados y fallback

Un perfil es evidencia limitada de que una ejecución comprimida sirve para una tarea y contexto determinados. No es una nueva autoridad, un store universal, `CapabilityProof` del host, `PolicySnapshot` ni un profile de routing.

| Campo operativo | Uso |
| --- | --- |
| Modelo, versión, effort y configuración | Identifican la ejecución reproducible; cualquier cambio los vuelve stale. |
| Corpus y contexto | Delimitan fixtures, contract suite, tarea, inputs y target comparados. |
| Provenance y cobertura | Distingue resultado runtime observado de narrativa del worker y muestra qué obligaciones se midieron. |
| Frescura | Marca cuándo un cambio de policy, contrato, host, corpus o configuración vuelve el perfil stale. |
| `unproven` y fallback | Ausencia de prueba elige la ejecución compatible completa; no autoriza una compresión. |

K9 puede comparar compresión en shadow/A-B focal. K11b puede consumir esas observaciones al elegir work orders y K12 ampliarlas longitudinalmente; ninguno es prerrequisito circular de K10 ni requiere por sí mismo un segundo host.

## TDD, challenges y checks

El contrato actual de Strict TDD sigue vigente: una optimización no puede saltar RED/GREEN donde la policy lo exige. La dirección futura puede evaluar evidencia discriminante por obligación —por ejemplo, challenges o mutation focal bajo corpus aplicable—, pero no afirma que un check verde, un challenge o un mutation score prueben corrección total. Solo una equivalencia demostrada, con provenance, comparación y rollback, puede cambiar una policy futura.

## Medición, decisión y retirada

Una simplificación se mantiene solo si el corpus aplicable muestra garantías comparables: cobertura de obligaciones, integridad de Candidate/evidence, separación de autoridad, recovery y defectos detectados/escapados. Se compara además coste, relecturas, latencia, fallbacks, trabajo repetido y carga de mantenimiento end-to-end.

| Resultado observado | Decisión |
| --- | --- |
| Misma cobertura y calidad, menor coste o complejidad | Promover gradualmente por recipe/profile/target. |
| Ahorro sin evidencia comparable | Mantener baseline compatible; no promover. |
| Más defectos, señales perdidas o fallback frecuente | Restaurar ejecución o representación compatible y revisar el supuesto. |
| Planner/router/role/contexto sin obligación o consumidor | Simplificar o retirar solo tras adapters, migración y evidencia de no regresión. |

Esto evita una superestructura permanente: se mantienen mecanismos que preservan autoridad, recovery, verificación o decisión humana; se simplifican los que solo duplican representación o disciplina interna.

## Referencia histórica: PP1 archivado

<a id="pp1-compatibilidad-de-elegibilidad-y-mínimos"></a>

PP1 resolvió el sombreado de `lite` por `standard` en repositorios activos: normaliza `classification` y `change.classification` fail-closed, filtra elegibilidad antes del first-match, aplica floors K1 y preserva rutas contextuales, orden custom y continuaciones. Su [archive report](../../openspec/changes/archive/2026-09-05-live-routing-eligibility-and-risk-floors/archive-report.md) registra `PASS`.

Ese cierre gobierna el routing legacy actual; no activa Direct ni recetas K10, no convierte lite en una sola invocación y no resuelve cambios futuros de condiciones vacías o `validate-phase` sin ruta.

## Límites

Este documento no abre changes ni modifica la cadena de confianza `K7 → K8 → K9 → K10-delivery`. K10 se amplía receta a receta tras evaluación y promoción. Foundation puede reducir incertidumbre reutilizable, pero no se convierte en autoridad paralela ni en arquitecto universal. La prioridad y los IDs siguen en el roadmap.

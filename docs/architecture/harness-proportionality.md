# Proporcionalidad del harness: trabajo mínimo con evidencia suficiente

> **Estado:** diseño y análisis para futuros changes; no activa rutas, defaults ni aprobaciones.
> **Corte:** 2026-09-05. [Arquitectura](harness-evolution.md) fija autoridades; el [roadmap](../roadmaps/harness-evolution.md#orden-recomendado-de-trabajo) fija prioridad y fichas de ejecución.

## Decisión

Corregir primero la selección del proceso vigente y después reducir su peso documental.
Un cambio fácil debe aprovechar `lite` cuando sea admisible, con sus cinco fases reales.
La consolidación de fases e invocaciones es una evolución posterior del contrato runtime,
no una interpretación libre de las instrucciones actuales.

El objetivo es minimizar trabajo que no añade información, conservando el necesario para
entender el cambio, implementarlo, verificarlo de forma independiente y recuperarlo.
Menos tokens es una consecuencia a medir; no es una razón para omitir una obligación.

Esta intervención mejora el propio desarrollo del harness: cada change posterior puede
heredar una selección más precisa, artefactos más cortos y menos reconstrucción de contexto.
No se afirma ahorro medido ni retorno financiero. La prioridad es beneficio esperado y
reutilización inmediata, separada de la ruta técnica de promoción K7–K12.

## Diagnóstico verificado del producto actual

| Evidencia | Consecuencia |
| --- | --- |
| [`openspec/config.yaml`](../../openspec/config.yaml), bloque `routing`: `standard` por `project.status: active` precede a `lite`. | Un repositorio activo puede seleccionar el proceso completo antes de evaluar la clase pequeña. |
| [`route-dispatcher.js`](../../scripts/lib/route-dispatcher.js), `matchConditions`: claves literales y comparación estricta; `classification` de la ruta no filtra esta función. | Metadata declarada y elegibilidad efectiva son contratos diferentes hoy. |
| `lite` declara `[trivial, small]`, pero su condición exige `change.classification: small`. | Reordenar YAML no resuelve `trivial` ni la diferencia entre claves del contexto. |
| [`change-classification.js`](../../scripts/lib/change-classification.js) define floors y vocabulario K1; declara fuera de alcance su conexión al routing vivo. | Tener `critical` en K1 no demuestra que una ruta legacy aplique ese mínimo. |
| La tabla viva declara siete fases en standard y cinco en lite. | Lite evita spec y design; no equivale a una ejecución directa ni a una sola fase. |
| [`real-repo.test.js`](../../scripts/configure/real-repo.test.js), pruebas de routing del repositorio. | La cobertura de helpers no sustituye una prueba completa de selección con la configuración real. |

Reproducción del matching actual: con `classification: small` y `project.status: active`
coincide standard. Añadir `change.classification: small` permite coincidir también a lite,
pero sigue ganando standard por orden. `classification: trivial` por sí sola no satisface lite.
Estas son observaciones del matching, no pruebas de que todos los entrypoints construyan
exactamente ese mismo contexto; PP1 debe probar la cadena completa de entrada y selección.

La [investigación de agosto](research/proportional-process-and-change-program.md) ya nombraba
este defecto. La decisión nueva es priorizar su corrección como PP1, no esperar a K10.
El cursor de un Change Program continúa diferido y sin slice: es otro problema.

## Tres decisiones separadas

| Decisión | Pregunta | Restricción |
| --- | --- | --- |
| Admisión y routing | ¿Qué obligaciones y ruta son admisibles? | Riesgo, alcance, incertidumbre e irreversibilidad; floors antes de preferencias o coste. |
| Artefactos y contexto | ¿Cuánta representación requiere demostrar esas obligaciones? | Formatos vigentes, consumidores y evidencia completa; referencias antes que copias. |
| Modelo e invocaciones | ¿Quién ejecuta cada responsabilidad y cuántas llamadas necesita? | Misma garantía, verificación independiente y contratos runtime; no resolver con agentes espejo baratos. |

Una tarea barata de describir puede ser peligrosa de ejecutar. Dos líneas de autenticación
exigen más assurance que un reemplazo mecánico en varios documentos. El número de archivos
también informa coordinación y reviewability, pero no determina por sí solo el riesgo.
Los gates vigentes por solapamiento SDD o tamaño de review siguen aplicando.

Tampoco basta una etiqueta de intención. `hotfix` expresa urgencia, no una exención de
seguridad. Una petición explícita de bugfix o refactor conserva su significado cuando sea
admisible; si omite garantías necesarias, se eleva el proceso y se explica por qué.

## Secuencia de decisión propuesta

1. Recuperar el change y sus decisiones persistidas si existe; distinguir continuación de nueva admisión.
2. Recoger solo señales suficientes: propósito, áreas afectadas, reversibilidad, interfaces y desconocidos materiales.
3. Aplicar mínimos de riesgo y obligaciones. Autenticación, migraciones y contratos públicos no se degradan por tamaño o precio.
4. Resolver desconocidos con exploración focal o una decisión de alcance cuando impidan determinar un mínimo seguro.
5. Evaluar prioridades de contexto e intención y elegir la primera ruta **elegible** en la tabla compatible.
6. Ajustar extensión documental y contexto a las obligaciones de esa ruta, sin inventar fases completadas.
7. Registrar razones, supuestos materiales y señales que obligarían a reclasificar; medir coste y resultado.

`unknown` no significa siempre standard ni autoriza lite por falta de evidencia.
Una exploración pequeña puede localizar el cambio y despejar incertidumbre; si descubre
una frontera de seguridad o efectos irreversibles, debe escalar antes de implementar.
La política debe definir el comportamiento cuando no queda ninguna ruta elegible.

En un change activo, el descubrimiento de auth, migración o mayor alcance eleva de forma
monótona las obligaciones aplicables. No se rebajan automáticamente porque el diff final
sea corto. Toda revisión de ruta debe conservar approvals, findings, budgets y evidencia;
si cambia el contrato o candidato, se sigue el protocolo de successor vigente.

## PP1: compatibilidad de elegibilidad y mínimos

PP1 debe normalizar las señales `classification` y `change.classification` en una frontera
explícita, definir precedencia o error ante conflicto y documentar cómo se consume la
metadata `classification` sin romper rutas personalizadas existentes.
No basta mover `lite` una posición hacia arriba.

El vocabulario K1 (`direct`, `repair`, `bounded`, `planned`, `critical`) y el legacy
(`trivial`, `small`, `normal`, `high-risk`) son distintos. La integración requiere un
mapeo explícito de garantías y elegibilidad; copiar `critical` a un enum legacy no es diseño.

La prioridad contextual de foundation, federated y brownfield debe conservarse; no se
debe saltar una baseline necesaria por detectar pocas líneas. Dentro del conjunto elegible,
el orden declarado sigue siendo significativo, incluidas tablas custom e intenciones
explícitas. Los floors prevalecen sobre un hotfix que no pueda satisfacerlos.

PP1 incluye los contratos de entrada, selección y explicación, las fixtures con la tabla
real y la coherencia documental/multi-target necesaria. La deuda de documentación de
[`sdd-routing.md`](../sdd-routing.md) pertenece a ese futuro change, no se declara resuelta aquí.

Cambiar cómo se interpretan condiciones vacías o endurecer todos los casos de
`validate-phase` sin ruta son hallazgos adyacentes: requieren análisis de compatibilidad
propio. No deben entrar como limpieza oportunista que impida cerrar PP1.

## PP2: compactar el contrato lite que ya existe

La unidad inicial conserva esta secuencia:

```text
proposal-lite → tasks → apply → verify → archive
```

| Artefacto o paso | Contenido mínimo útil | Lo que no se puede simular |
| --- | --- | --- |
| `proposal-lite.md` | Problema observable, alcance/no alcance, aceptación y rollback proporcional. | Una spec o un design vacíos para satisfacer lectores incorrectos. |
| `tasks.md` | Trabajo verificable, dependencias reales, forecast de review y referencias al contrato lite. | Tareas marcadas done por haber creado el documento. |
| `apply-progress.md` | Progreso acumulado, evidencia y decisiones nuevas; leer y combinar al continuar. | Reemplazar historia por el último lote o fabricar RED/GREEN. |
| `verify-report.md` | Contraste independiente con aceptación y evidencia; límites explícitos. | Repetir la narrativa de apply como verificación. |
| Archive | Semántica de cierre y artefactos requeridos por el protocolo actual. | Marcar archive completado cuando el movimiento/receipt sigue pendiente. |

Primero se auditan consumidores y, donde exista un requisito incondicional de spec/design en lite, se corrige:
skills, dependencias, validadores, recovery, renderer y targets deben aceptar de manera
coherente `proposal-lite + tasks`. La lista definitiva sale de explorar sus contratos,
no de crear documentos de relleno para evitar esa exploración.

En standard se conservan spec y design cuando sus responsabilidades sean necesarias.
Compactar significa expresar cada decisión una vez y referenciarla, no vaciar secciones
obligatorias ni hacer que un formato de lite oculte incertidumbre arquitectónica.

La primera reducción puede ser textual: menos duplicación entre resumen humano/envelope,
menos repetición de matrices y lectura focal de artefactos requeridos. Mientras el contrato
actual pida ambos formatos, ambos se conservan. CX1 cambia ese transporte de forma versionada.
No se borran archivos o resúmenes que lectores vigentes todavía necesiten.

## Consolidación posterior: runtime antes que atajos

CX1 separa estado/completions mecánicos de la semántica de los agentes mediante envelope,
renderer y reducer versionados. CX2 deriva vistas repetitivas y datos mecánicos del archive.
Son cambios que ahorran redacción y reconciliación, no autorizaciones para saltar trabajo.

Tras ese contrato runtime y la promoción correspondiente de recetas K10, una invocación
podrá materializar varias responsabilidades compatibles sin fingir que ejecutó agentes
ausentes. Debe poder demostrar qué capacidad se cumplió, con qué inputs, evidencia y salida.
La verificación independiente permanece separada de la autoría del cambio.

K10 generaliza el mínimo de obligaciones hacia capacidades; no obliga a que cada
capacidad tenga documento y agente propios. La decisión se valida por receta/profile
después de K9 y K10-delivery. Direct productivo sigue fuera del corto plazo.
CX completo no es requisito de K7: la proyección CX5b para review depende de K7, no al revés.

## Matriz de aceptación para cambios futuros

| Caso | Decisión esperada | Evidencia de aceptación |
| --- | --- | --- |
| Cambio mecánico multarchivo en docs | Evaluar alcance/gates vigentes; permitir lite si sigue trivial/small y reversible. | No se fuerza spec/design por `project.status`; links y coherencia revisados. |
| Bug pequeño reproducible | Conservar intención bugfix si es admisible; sin intención especial, lite puede ser elegible. | Reproducción, corrección y verificación independiente; no añadir fases por reflejo. |
| Feature contenida | Lite solo si cumple criterios small y baja incertidumbre; standard si cambian contratos o decisiones materiales. | Criterios observables y dependencias; no elegir por pocas líneas estimadas. |
| Dos líneas de auth | Floor de seguridad, incluso con `/sdd-lite` o intención hotfix. | Ruta que conserve obligaciones; rechazo/escala explicado antes de apply. |
| Migración pequeña de datos | Elevar por irreversibilidad e integridad. | Recovery, compatibilidad y evidencia adversarial aplicables; no atajo por urgencia. |
| Alcance incierto | Explorar focalmente o resolver alcance antes de admitir ejecución. | Desconocidos reducidos; transición trazable a ruta admisible. |
| Tabla custom reordenada | Respetar primer match entre elegibles y prioridad contextual compatible. | Fixtures de orden, metadata, claves y conflictos; sin hardcodear nombres de rutas. |
| Continuación de change normal | Mantener ruta/ledger; reducción futura requiere transición explícita compatible. | No downgrade silencioso, reset de budgets ni pérdida de aprobaciones. |

La aceptación de PP1 debe cubrir la tabla real y fixtures de todos los targets generados,
incluyendo fresh start, continuación y override. La de PP2 debe recorrer lectores de lite,
validación, recovery y archive con ausencia **legítima** de spec/design.
Un test aislado de helpers o una captura del YAML no demuestran esos comportamientos.

## Medición y rollback

CX0 ya aporta instrumentación advisory; no parte de cero. Su carpeta archivada histórica
contiene verify PASS, pero el estado de archive conserva una inconsistencia documental;
el roadmap registra esa limitación sin inventar reconciliación ni ahorro medido.

Para comparar, conservar cohorts por riesgo, incertidumbre, ruta efectiva, fase, profile y
host. Medir bytes/tokens de artefactos, lectura repetida, input/cached/uncached/output con
cobertura declarada, invocaciones, latencia, preguntas materiales, rework, fallbacks y defectos
detectados/escapados en los fixtures disponibles. Una reducción de fase no es un porcentaje de coste.

| Intervención | Señal de beneficio | Límite / rollback |
| --- | --- | --- |
| PP1 | Menos selecciones standard injustificadas; razones y floors consistentes. | Revertir selección nueva para nuevas admisiones sin borrar decisiones activas; floors inseguros detienen ejecución. |
| PP2 | Menos bytes y relecturas por change comparable; aceptación intacta. | Recuperar plantillas/lectores compatibles; conservar datos y evidencia ya persistidos. |
| CX1/CX2 | Menos redacción mecánica y divergencia entre vistas. | Legacy adapter/renderer y replay compatibles; reconciliar operaciones desconocidas antes de mutar. |
| Foundation/R2 | Menos redescubrimiento de propósito, restricciones y decisiones. | Referencias canónicas originales; stale visible y refresh explícito. |

No se fijan porcentajes de ahorro como criterio de aprobación sin baseline comparable.
Toda optimización debe mostrar cero pérdida de obligaciones, trazabilidad o separación de
autoridad en su corpus aplicable; una regresión material detiene la promoción.

## Relación con foundation y orden de inversión

Una [foundation holística](harness-foundation-holistic.md) reduce incertidumbre reutilizable:
propósito, usuarios, límites, operación y decisiones del ciclo de vida del software.
Eso mejora la proporcionalidad porque permite distinguir lo conocido de lo que cada
change debe descubrir. No convierte foundation en arquitecto universal ni exige cloud.

El orden recomendado empieza por PP1 y PP2, aprovecha CX1/CX2 y adelanta R2.1/R2.4 útil
antes de inversiones extensas. R2.3/R2.6 pueden incorporar después curación de fuentes y
una futura skill CNCF; R2.2 lleva ese conocimiento a consumidores por referencias.
Los siete slices R2 existentes conservan identidad; no nace otra autoridad documental.

Las fichas, slugs propuestos y dependencias están en el roadmap. Este documento define
criterios de diseño; no es una segunda cola ni abre los changes. La ruta de promoción
K7 → K8 → K9 → K10-delivery → K10 → K11/K12 se conserva.

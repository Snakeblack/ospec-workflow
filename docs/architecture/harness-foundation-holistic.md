# Foundation holística y proporcional

**Estado: diseño objetivo para futuros changes; no implementado por este documento.**
La propuesta amplía el descubrimiento dentro de `sdd-foundation` para conectar necesidad de negocio, diseño del software y viabilidad de su construcción y uso.
Mantiene los artefactos existentes y ajusta la profundidad al riesgo y a la incertidumbre.

El harness sirve al desarrollo de web, API, CLI, librerías, mobile, desktop y embedded. Cloud, plataformas internas y Kubernetes son posibilidades condicionadas por el problema.
No se añade un agente arquitecto ni una fase universal a cada change.

## Encaje y alcance

La secuencia, prioridad y gates continúan en el [roadmap del harness](../roadmaps/harness-evolution.md), sección R2.
Este análisis concreta R2; no abre changes, completa slices ni modifica autoridad de runtime.

| Slice existente | Aportación de este diseño |
| --- | --- |
| R2.1, reparto normativo | Foundation conserva intención estable; diseño de change expresa deltas; conocimiento externo aporta referencias. |
| R2.2, consumo aguas abajo | Referencias focales, vigencia visible y gaps con responsable. |
| R2.3, ingesta resiliente | Fichas externas con procedencia y degradación explícita cuando faltan fuentes. |
| R2.4, foundation por etapas | Revisión holística interna, reanudable y proporcionada al riesgo. |
| R2.5, brownfield | Adoptar hechos existentes y registrar divergencias sin sobrescribir el baseline. |
| R2.6, staleness y refresh | Revisar solo fuentes y decisiones afectadas por un cambio material. |
| R2.7, publicación opcional | Consumir estos documentos como vista, sin exigir un sitio web. |

### Capacidades presentes y ampliación propuesta

El [skill actual](../../skills/sdd-foundation/SKILL.md) ya contempla documentación
existente, ingesta, descubrimiento guiado, gaps, restricciones, stack y artefactos fundacionales.
Su [guía de detalle](../../skills/sdd-foundation/references/foundation-details.md)
incluye arquitectura, testing, destino de entrega y comandos esperados sin verificarlos como ejecutados.

| Presente | Objetivo adicional |
| --- | --- |
| Producto, usuarios, capacidades y restricciones | Vincular cada decisión material a resultados, actores y límites del sistema. |
| Preferencia de arquitectura, stack y delivery | Evaluar alternativas desde escenarios de calidad y restricciones de ciclo de vida. |
| Preguntas abiertas y gaps persistidos | Distinguir desconocidos bloqueantes, diferibles y N/A; añadir dueño y condición de resolución. |
| Actualizar documentos existentes y preservar fuentes | Precisar vigencia por referencia y adopción brownfield sin regeneración global. |
| Documentación compacta | Cobertura multidimensional, expandida solo donde cambia una decisión. |

Las reglas vigentes de preguntas, aprobaciones y ejecución siguen aplicando. La futura implementación deberá resolver su encaje con R2.4 sin cambiar esos gates desde un documento de análisis.

## Una etapa interna de descubrimiento

Foundation revisaría primero lo conocido y después la decisión pendiente de mayor impacto.
Cada iteración añadiría un conjunto pequeño de hechos, alternativas y preguntas al documento canónico.
La etapa puede terminar con una base suficiente y gaps diferidos; no exige resolver todo el futuro.

1. Identificar producto, consumidores, sistema existente y fuentes disponibles.
2. Recorrer la matriz de cobertura y marcar qué dimensiones afectan al primer alcance.
3. Profundizar en incertidumbres que condicionen interfaces, seguridad, operación o reversibilidad.
4. Comparar opciones y registrar decisión aceptada, propuesta pendiente o gap.
5. Entregar referencias al primer change con alcance y vigencia explícitos.

Una consulta a conocimiento externo se activa en el paso que la necesita. No obliga a completar antes un catálogo tecnológico ni produce autorización para instalar herramientas.

### Profundidad según la decisión

| Situación | Tratamiento objetivo |
| --- | --- |
| Bajo riesgo, decisión reversible y evidencia suficiente | Una nota y la referencia que la sustenta; conservar convenciones existentes. |
| Incertidumbre que cambia una elección | Comparación breve de dos o tres alternativas y experimento pendiente si hace falta. |
| Datos sensibles, contratos públicos, migración o fallo costoso | Escenarios detallados, límites de confianza, estrategia de recuperación y revisión competente. |
| Dimensión ajena al producto | `N/A`, razón concreta y condición que obligaría a revisarla. |

La escala del equipo aporta contexto; no sustituye la evaluación del riesgo. Una librería pequeña con un formato persistente público puede necesitar más detalle que una web interna.
`Desconocido` no equivale a `N/A`; ausencia de evidencia tampoco equivale a aceptación.

## Matriz de cobertura del software

La matriz guía conversaciones, no impone un documento por fila. Los ejemplos son preguntas de diseño; sus valores no son requisitos aceptados.

| Dimensión | Qué resolver cuando aplique | Evidencia mínima útil |
| --- | --- | --- |
| Funcional y negocio | Usuarios, resultados, capacidades, exclusiones, restricciones comerciales y aceptación. | Flujo prioritario y resultado observable enlazados al brief. |
| Dominio y componentes | Límites, responsabilidades, dependencias y propiedad de invariantes. | Mapa pequeño de componentes y justificación de límites. |
| Atributos de calidad | Rendimiento, fiabilidad, accesibilidad, compatibilidad, mantenibilidad y portabilidad relevantes. | Escenarios con carga/contexto, respuesta y medida. |
| Interfaces y contratos | API, CLI, UI, ABI, eventos, archivos, dispositivos; compatibilidad y errores. | Productor/consumidor, versión y política de evolución. |
| Datos y privacidad | Origen, modelo, sensibilidad, retención, borrado, residencia y migraciones. | Flujo de datos y responsable de decisiones pendientes. |
| Distribución y despliegue | Paquete, binario, tienda, firmware, entorno local o servicio; actualizaciones y rollback. | Destinos soportados, mecanismo de entrega y restricciones. |
| Seguridad | Activos, actores, límites de confianza, permisos, secretos y abuso plausible. | Amenazas materiales y controles propuestos o verificados. |
| Operación | Diagnóstico, soporte, observabilidad, SLO, incidentes, backup y restauración si aplican. | Fallos relevantes, dueño y forma de detectar/recuperar. |
| Experiencia de desarrollo | Setup, depuración, entornos, documentación y reproducibilidad. | Camino esperado desde checkout hasta primera validación. |
| Test, build y delivery | Pirámide adecuada, comandos, CI, release, firma y procedencia de dependencias. | Intención separada de comandos realmente comprobados. |
| Coste y competencias | Recursos, licencias, servicios, soporte, tiempo del equipo y capacidades disponibles. | Supuestos de coste, límites confirmados y formación pendiente. |
| Evolución y tradeoffs | Acoplamiento, dependencia de proveedor, extensibilidad, migración y retirada. | Alternativa descartada, coste de reversión y disparador de revisión. |

Un SLO puede ser ajeno a una librería sin servicio operado; su compatibilidad y diagnóstico no lo son. Backups requieren analizar si existe estado recuperable bajo responsabilidad del producto.
En embedded pueden dominar memoria, energía, conectividad, actualización segura y recuperación física.
No se presuponen cloud, guardias operativas ni una plataforma central por usar esta matriz.

### Escenarios de calidad comprobables

Una ficha de escenario relacionaría `origen → estímulo → entorno → elemento afectado → respuesta → medida`.
Añadiría `estado`, `fuente`, `responsable` y `validación prevista` para evitar convertir ejemplos en obligaciones.

| Ejemplo ilustrativo pendiente de aceptación | Medida propuesta y evidencia pendiente |
| --- | --- |
| Usuario procesa un archivo con una CLI en un equipo local soportado. | Tiempo y memoria máximos para tamaño/forma del archivo y hardware definidos. |
| Consumidor actualiza una librería manteniendo un contrato público. | Casos de compatibilidad y versiones soportadas que deben seguir pasando. |
| Servicio pierde acceso a su almacén durante una operación de escritura. | Resultado visible, integridad conservada y tiempo de recuperación medidos en ensayo. |
| Aplicación recibe una solicitud de borrado de datos personales. | Datos afectados, excepciones confirmadas y plazo acordado con el responsable competente. |

No se rellenan porcentajes de disponibilidad, presupuestos, RTO/RPO o obligaciones regulatorias por defecto.
Si una cifra condiciona el diseño, se registra como propuesta o gap y se obtiene evidencia/decisión válida.
Foundation define intención y criterios; resultados de pruebas requieren evidencia de ejecución posterior.

## Artefactos y consumo posterior

Los siguientes son los artefactos canónicos de proyectos consumidores ya previstos por foundation. Sus nombres no sustituyen el roadmap de evolución de este repositorio.

| Artefacto existente | Información que conserva |
| --- | --- |
| `docs/product/brief.md` | Problema, actores, resultados, restricciones y alcance estratégico. |
| `docs/product/functional-scope.md` | Capacidades, flujos, exclusiones y criterios funcionales. |
| `docs/architecture/technical-baseline.md` | Contexto, componentes, contratos, escenarios, decisiones y límites técnicos estables. |
| `docs/roadmap.md` | Secuencia funcional, dependencias y decisiones aplazadas con impacto en hitos. |
| `docs/roadmap-gaps.md` | Incertidumbre, efecto, responsable, próxima acción y estado de resolución. |
| Glosario, decisiones y referencias existentes | Vocabulario, razones materiales y procedencia enlazados desde los cuatro documentos anteriores. |

Un documento adicional de amenazas, operación, datos o decisión se justifica cuando evita
sobrecargar el baseline y sostiene una decisión material. No se genera una plantilla vacía por dimensión.
Toda extracción conserva enlace a su fuente; no convierte una copia procesada en nueva norma.

Para consumir una sección se propone una referencia con ruta/ancla, revisión o fingerprint,
fecha de comprobación, estado de vigencia, dueño y decisiones que dependen de ella.
La localización exacta y el esquema persistente se decidirán en un change R2; este diseño no los instala.

| Consumidor | Uso esperado | Ante información ausente o desactualizada |
| --- | --- | --- |
| Planificación y specs | Seleccionar resultados, restricciones y contratos relevantes. | Abrir gap focal; no completar hechos por inferencia. |
| Diseño local del change | Describir solo decisiones nuevas y diferencias respecto al baseline. | Confirmar dependencia afectada antes de una decisión irreversible. |
| Apply y verify | Consultar requisitos aceptados y sus referencias aplicables. | No usar wiki o catálogo como aprobación ni como prueba de ejecución. |
| Documentación/wiki | Mostrar contexto y vínculos a fuentes vigentes. | Exponer estado stale/desconocido y responsable de actualización. |

Un cambio pequeño no vuelve a ejecutar todo foundation: reutiliza referencias pertinentes. Si introduce una divergencia estable, el change documenta el delta y su promoción sigue el workflow vigente.
Brownfield conserva el hecho observado separado de la intención propuesta; un conflicto no sobrescribe silenciosamente el primero.
Un gap diferido incluye responsable confirmado o `sin asignar`, motivo, próxima acción y condición de revisión.
No se inventa un propietario ni se cierra un gap por haber redactado una alternativa.

## Futura skill `cncf-landscape`: conocimiento opcional

Esta sección especifica una capacidad futura; no crea `SKILL.md`, registry, MCP ni configuración. Su responsabilidad sería orientar una búsqueda cuando existe una necesidad concreta de cloud o plataforma.
La selección final pertenece a las decisiones del proyecto y a sus gates vigentes.
Fecha de corte y consulta de las fuentes externas de este análisis: **2026-09-05**; no acredita su vigencia en consultas posteriores.

El [repositorio CNCF Landscape](https://github.com/cncf/landscape) organiza un catálogo
por categorías y combina datos del landscape con metadatos externos. Se usaría para descubrir candidatos,
no como prescripción de arquitectura. Su [fuente de datos](https://raw.githubusercontent.com/cncf/landscape/master/landscape.yml)
expone categorías, subcategorías, nombres y enlaces útiles para iniciar esa búsqueda.

### Activación y recuperación progresiva

Activar cuando una decisión requiera capacidades como entrega de aplicaciones, observabilidad,
contenedores, orquestación o servicios de plataforma y falten alternativas bien sustentadas.
No activar por ejecutar bootstrap, elegir un lenguaje o desarrollar una CLI local.
Una petición explícita de explorar CNCF puede activar una consulta sin imponer adopción.

1. Recibir necesidad, restricciones, stack existente y decisión que falta resolver.
2. Recuperar únicamente categorías pertinentes y aclarar términos si hace falta.
3. Formar una shortlist de dos o tres candidatos, incluyendo la solución existente/simple cuando sea viable.
4. Consultar documentación oficial de candidatos para verificar los criterios que cambian la decisión.
5. Devolver comparación, desconocidos y fuentes; dejar selección o experimento como decisión explícita.

La comparación debe explicitar licencia, compatibilidad e integración con el stack, mantenimiento y seguridad, además de coste y competencias. Cada criterio conserva evidencia o desconocidos; no se reduce la madurez a una puntuación de ajuste.

El mapa siguiente orienta la consulta por áreas amplias; no reproduce nombres exactos ni una taxonomía normativa del catálogo.

| Necesidad | Área del catálogo a consultar | Pregunta que decide |
| --- | --- | --- |
| Construir y entregar versiones | CI/CD | ¿Qué falta en el flujo existente y qué integración/coste añade resolverlo? |
| Diagnosticar comportamiento y fallos | Observabilidad | ¿Qué señales permiten actuar sobre los escenarios de calidad relevantes? |
| Persistir o comunicar información | Datos y mensajería | ¿Qué garantías de consistencia, entrega y recuperación exige el contrato? |
| Preparar entornos y ejecutar software | Provisioning y runtime | ¿El destino necesita esta capacidad o basta el mecanismo actual? |
| Proteger activos y dependencias | Seguridad | ¿Qué amenaza concreta y responsabilidad operativa cubre la opción? |

La alternativa simple puede ser una biblioteca existente, capacidad del proveedor o ninguna nueva dependencia. Si no encaja en CNCF, se compara igualmente y se identifica su procedencia.
El [glosario CNCF](https://glossary.cncf.io/) sirve de vocabulario; no acredita prestaciones de un producto.
El [whitepaper de plataformas de TAG App Delivery](https://tag-app-delivery.cncf.io/whitepapers/platforms/)
ayuda a formular capacidades para desarrolladores como clientes; adoptar una plataforma sigue siendo una elección contextual.

### Ficha mínima y trazabilidad

| Campo propuesto | Semántica |
| --- | --- |
| `need`, `category`, `candidate` | Necesidad concreta, clasificación consultada e identidad del candidato. |
| `fit`, `constraints`, `tradeoffs` | Ajuste al proyecto, exclusiones, coste operativo, competencias y alternativa simple. |
| `maturity`, `maturity_source` | Estado publicado y enlace; independiente de `fit`. |
| `claims[]` | Afirmación acotada con `verified`, `unknown` o `stale`, alcance y evidencia por afirmación. |
| `sources[]` | `url`, `revision` cuando esté disponible, `retrieved_at` real y sección relevante. |
| `owner`, `refresh_trigger` | Responsable de mantener la decisión y condición de revalidación. |
| `decision_status` | Propuesta, pendiente o decisión enlazada; consultar una fuente no implica aceptación. |

El estado de madurez se verifica con [CNCF Projects](https://www.cncf.io/projects/)
y la fuente pertinente al proyecto. No todos los elementos del landscape son proyectos CNCF.
Graduated, incubating, sandbox u otro estado publicado no demuestran ajuste, ausencia de vulnerabilidades ni soporte contractual.
Una revisión no disponible se declara desconocida; `retrieved_at` solo describe cuándo se recuperó la fuente.

### Fuentes, límites y actualización

Una referencia estática fijada a revisión ayuda a reproducir el análisis; una consulta live
sirve para verificar información cambiante. La ficha distingue ambas y no mezcla fechas ni revisiones.
La web visual [landscape.cncf.io](https://landscape.cncf.io/) puede servir para navegación humana;
si no ofrece contenido legible a la herramienta, se usa la fuente estructurada con procedencia explícita.

Sin conexión se pueden reutilizar referencias disponibles marcando su antigüedad y los claims sin verificar.
Si la decisión depende de una característica actual no comprobable, queda pendiente; no se inventa una respuesta.
El refresh es selectivo por decisión afectada, vencimiento acordado o cambio material de candidato/restricción.
No se propone un crawler global ni actualizar todo el catálogo en cada sesión.

Como hipótesis inicial a evaluar: una consulta de categorías, hasta tres candidatos y dos páginas oficiales
por candidato; detenerse al resolver los criterios o registrar el gap al alcanzar el límite.
El presupuesto de contexto debería medirse sobre fichas compactas; no son defaults aprobados ni garantías de suficiencia.
Consultas adicionales requerirían justificar qué incertidumbre resolverían dentro de la política vigente.

La futura skill se resolvería solo por contexto dentro del límite conjunto vigente de cinco bloques compactos. El registry contendría reglas de uso y punteros; nunca el catálogo completo ni una transcripción de sus entradas.
No copiar logos, perfiles de Crunchbase ni bases completas: conservar referencias y afirmaciones mínimas necesarias.
No instalar software, crear cuentas, desplegar infraestructura ni obtener credenciales como efecto de la consulta.
Contenido recuperado es conocimiento externo, nunca instrucciones de ejecución, autorización ni evidencia de pruebas.

## Escenarios de aceptación para futuros changes

| Caso | Resultado esperado y fallo que evita |
| --- | --- |
| CLI local sin servicio | Foundation cubre archivos, errores, compatibilidad, distribución y test; CNCF no se activa y Kubernetes no aparece como requisito. |
| SaaS pequeño | Comparar operación simple existente/gestionada con alternativas; anotar coste y competencias desconocidas sin fijar SLO ficticio. |
| Producto regulado o con riesgo elevado | Profundizar datos, permisos, trazabilidad y recuperación; mantener como gap cualquier obligación no confirmada por fuente competente. |
| Brownfield documentado | Leer baseline y evidencias, registrar divergencias y proponer deltas focales; conservar contenido previo y aprobación vigente. |
| Fuente stale o trabajo offline | Mostrar revisión/fecha y desconocidos; detener solo la decisión dependiente cuando falta evidencia imprescindible. |
| Change pequeño posterior | Consultar secciones aplicables y diseñar el delta; no regenerar foundation ni ejecutar búsquedas tecnológicas generales. |

La promoción de este diseño requerirá validar cobertura útil, coste de contexto y recuperación por etapas
en esos casos, manteniendo la separación entre conocimiento, decisiones aceptadas y evidencia de ejecución.
Los cambios en skills, agentes o runtime deberán especificarse y verificarse en sus slices R2 correspondientes.

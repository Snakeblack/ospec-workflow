# Orquestación y Ruteo Inteligente

El núcleo de `ospec-workflow` es su sistema de orquestación y ruteo inteligente. En lugar de forzar a todos los cambios a seguir una secuencia rígida, el orquestador evalúa los archivos de estado del proyecto y del cambio para determinar de forma dinámica la ruta óptima de ejecución de fases, interrumpiendo al usuario únicamente cuando existen gates o decisiones de riesgo no resueltas.

## Cómo funciona

Cuando un usuario inicia un cambio mediante `/sdd-new` o continúa un cambio existente con `/sdd-continue`, se activa la siguiente secuencia:

```
[Inicio de Cambio]
       │
       ▼
[Carga de Estado de Cambio] ──► (state.yaml)
       │
       ▼
[Resolución de Ruta] ────────► (config.yaml - Prioridad de Arriba a Abajo)
       │
       ▼
[Evaluación de Gates] ───────► (clarify, 4r-review-gate, etc.)
       │
       ▼
[Ejecución de Fase Activa] ──► (sdd-propose, sdd-tasks, etc.)
```

1. **Resolución de Estado**: Lee el archivo de estado de la iteración (`state.yaml`). Si no existe, asume que es un cambio nuevo.
2. **Despacho de Ruta**: El despachador de rutas (`route-dispatcher.js`) lee la lista de flujos configurados en `/openspec/config.yaml` y selecciona la primera ruta cuyas condiciones lógicas se cumplan.
3. **Control de Gates**: Antes de delegar la fase al subagente correspondiente, comprueba los gates activos. Si algún gate está bloqueado (por ejemplo, requiere aclaración del usuario), detiene la ejecución y devuelve un `question_gate`.
   - Algunas rutas tienen un **manejador circunstancial** dedicado en `skills/_shared/` que solo se lee cuando esa ruta específica se activa (por ejemplo, `route-document.md` para `/sdd-document`, que agrupa la pregunta de idioma+alcance de la wiki en un solo gate). Esto mantiene el prompt del orquestador liviano sin perder el protocolo detallado de rutas poco frecuentes.
4. **Delegación de Subagentes**: Invoca al subagente de fase respectivo para realizar el trabajo técnico.

## Detalles técnicos

### Rutas declaradas en el Sistema

- **standard**: La ruta por defecto para cambios de alcance medio/alto. Ejecuta todas las fases en orden: `propose` $\rightarrow$ `spec` $\rightarrow$ `design` $\rightarrow$ `tasks` $\rightarrow$ `apply` $\rightarrow$ `verify` $\rightarrow$ `archive`.
- **lite**: Para cambios triviales o de bajo riesgo. Omite las fases de `spec` y `design`, pasando directo de `propose` a `tasks`.
- **bugfix**: Activada ante intenciones explícitas de corrección. Ejecuta `explore` $\rightarrow$ `tasks` $\rightarrow$ `apply` $\rightarrow$ `verify` $\rightarrow$ `archive`.
- **refactor**: Diseñada para conservar comportamiento y mejorar la estructura. Empieza directamente en `design` para modelar el cambio.
- **hotfix**: Flujo de emergencia rápido que salta directo a `apply` $\rightarrow$ `verify` $\rightarrow$ `archive`.
- **brownfield**: Flujo especial para repositorios existentes que carecen de especificaciones iniciales (`openspec/specs/` vacío). Ejecuta `sdd-baseline` para estructurar el baseline del código de forma incremental.

### Modos de Ejecución

- **Modo Interactivo (Interactive)**: El orquestador pausa después de cada fase técnica para mostrar los resultados al usuario y pedir confirmación explícita para continuar o corregir.
- **Modo Automático (Automatic)**: Encadena las fases de forma consecutiva. Los subagentes se ejecutan secuencialmente de fondo, y el orquestador solo detiene la ejecución si un gate de calidad, seguridad o aprobación de usuario falla.

## Por qué la arquitectura tiene esta forma

El desacoplamiento entre las reglas de ruteo y el código del orquestador permite cambiar el comportamiento del flujo de trabajo modificando únicamente `/openspec/config.yaml`. Esto facilita a los equipos adaptar el rigor del flujo (por ejemplo, exigir revisión 4R en todos los cambios o desactivarla para proyectos individuales) sin recompilar el plugin.

## Puntos de extensión principales

- **Crear una nueva ruta**: Definir un nuevo objeto de ruta bajo la clave `routing` en `/openspec/config.yaml`, detallando sus condiciones de activación (`conditions`) y la secuencia de fases (`phases`).
- **Implementar un nuevo gate**: Crear un subagente o script validador y asociarlo a la lista de `gates` de la ruta correspondiente.

## Aspectos a tener en cuenta al editar

- **Orden de evaluación**: El despachador de rutas evalúa la configuración secuencialmente de arriba a abajo. Si colocas una ruta genérica antes de una específica (como `standard` antes de `bugfix`), la ruta específica nunca se ejecutará.
- **Preservar el estado**: Las modificaciones al despachador de rutas (`route-dispatcher.js`) deben asegurar la total compatibilidad hacia atrás con los archivos `state.yaml` existentes para evitar corromper cambios en curso.

## Mapa de fuentes

| Archivo / Directorio | Rol | Evidencia de Git |
| :--- | :--- | :--- |
| [/openspec/config.yaml](/openspec/config.yaml) | Definición declarativa de rutas, condiciones y gates del sistema. | `ba82de1` |
| [/agents/sdd-orchestrator.agent.md](/agents/sdd-orchestrator.agent.md) | Agente orquestador principal que gestiona el loop de ejecución. | `4a12d4b` |
| [/scripts/lib/route-dispatcher.js](/scripts/lib/route-dispatcher.js) | Lógica de negocio para emparejar condiciones de rutas y estados. | `457f385` |
| [/scripts/lib/route-dispatcher.test.js](/scripts/lib/route-dispatcher.test.js) | Tests unitarios e integración del ruteo. | `457f385` |

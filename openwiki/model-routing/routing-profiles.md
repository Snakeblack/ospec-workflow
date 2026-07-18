# Model Routing

El dominio de enrutamiento de modelos (Model Routing) define cómo los agentes seleccionan el modelo de lenguaje adecuado según la fase de ejecución o el contexto. Su rol principal es equilibrar costos y capacidades de razonamiento, permitiendo que las tareas complejas (como la arquitectura o la validación) utilicen modelos de alta capacidad, mientras que las tareas más mecánicas o exploratorias se sirvan de alternativas rápidas y económicas.

## Flujo principal
Cuando un agente se inicializa, el sistema determina qué modelo asignar evaluando la fase o el nombre del agente contra las configuraciones de enrutamiento. En tiempo de ejecución directo (como en el entorno de VS Code), el proceso lee los perfiles YAML locales para sobrescribir o heredar el modelo base. Cuando se empaqueta o genera código para diferentes "targets" a través del CLI, consulta una configuración global para resolver un "tier" que luego se traduce a identificadores de modelos específicos por plataforma.

## Detalles técnicos
- **Resolución de Tiers:** El parser en Go analiza un archivo YAML en busca de la tabla de `agents` para encontrar la asignación de un agente hacia un "tier" (`premium`, `default`, `cheap`). Si no existe un mapeo explícito, recurre a una entrada `_default` o devuelve `unknown`.
- **Perfiles de usuario:** Existen perfiles locales en formato YAML que mapean explícitamente agentes a asignaciones simbólicas de inferencia, como `inherit`, `cheap-reasoning`, `coding-default`, `medium-reasoning` y `high-reasoning`.
- **Compatibilidad cruzada:** Los targets interpretan la asignación de un tier de diversas formas (alias escalares en Claude, orden de preferencia en VS Code, omitiendo explícitamente para GitHub Copilot o usando slugs precisos como en OpenCode).

## Decisiones de diseño (Por qué es así)
- **Desacoplamiento de IDs de modelos:** Se evita en absoluto codificar de forma rígida nombres como "Claude 3.5 Sonnet" en los prompts de los agentes. En lugar de eso, se utilizan niveles de razonamiento o tablas de resolución. Esto asegura un fácil mantenimiento cada vez que salen nuevas versiones o modelos competidores.
- **Modo fallback simple:** Cada agente y perfil debe estar diseñado para degradarse elegantemente a la modalidad de "un solo modelo" (single-model fallback). Al usar el valor `inherit`, el sistema funciona en interfaces que no soportan saltar de un modelo a otro de forma dinámica.
- **Independencia en perfiles vs. generador:** Separar la configuración para el consumo en IDEs del archivo base utilizado para generar los binarios o targets asegura que los flujos de trabajo en local no afecten a la publicación multiplataforma del agente.

## Puntos de extensión mayores
- Agregar nuevos perfiles YAML para casos de uso específicos (por ejemplo, perfiles `ultra.yaml` o `auditor.yaml`).
- Configurar y mapear un nuevo proveedor de inferencia añadiendo su formato a la resolución de tiers sin modificar el comportamiento del resto.
- Extender las lógicas en Go para mapear perfiles dinámicamente o añadir sobreescrituras por entorno.

## Precauciones al editar (Gotchas)
- **Parser YAML propio:** El parser Go que evalúa los tiers asume un formato estricto basándose en la indentación de los espacios en blanco (0 para secciones, 2 para llaves de la sección). Una indentación errónea silenciará el fallo y devolverá `unknown`.
- **Comportamiento en Copilot:** Hay plataformas (como GitHub Copilot) que no soportan definir estáticamente el modelo a usar; se confía en la herencia obligatoria (`inherit` / OMIT) para evitar bloqueos del harness.
- **Herencia en fallback:** Siempre se debe proporcionar un caso de fallo (`_default`) que, como precaución, herede el modelo global.

## Source map
- `/internal/modelconfig/models.go`: Implementa la lectura estática de la configuración y la lógica en Go para resolver a qué tier de modelo pertenece cada agente.
- `/profiles/models/cheap.yaml`: Perfil eficiente en consumo de tokens; minimiza los costes utilizando razonamientos ligeros durante la exploración y propuestas.
- `/profiles/models/default.yaml`: Perfil conservador que funciona como un fallback general, asignando a todos los agentes el valor de heredar modelo (`inherit`).
- `/profiles/models/premium.yaml`: Perfil de alto presupuesto que prioriza el rendimiento, asignando un mayor razonamiento a tareas de diseño técnico y la validación cruzada.
- `/docs/model-routing.md`: Documentación base que describe las abstracciones por target, las reglas de OMIT y el fallback a nivel general.

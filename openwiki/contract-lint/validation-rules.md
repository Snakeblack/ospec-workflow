# Lint de Contratos y Reglas de Validación

Este dominio es el responsable de garantizar la integridad arquitectónica, la aplicación de flujos de desarrollo (como TDD y revisiones) y la estabilidad en todo el ciclo de vida del repositorio. Actúa como guardián de calidad impidiendo regresiones en el comportamiento de los agentes, garantizando la paridad entre distintos entornos de la herramienta (Claude, VS Code, GitHub Copilot, OpenCode, Codex) y asegurando las políticas de los repositorios.

## Flujo principal y funcionamiento

El sistema de validación no se basa solo en pruebas unitarias estándar, sino en un "lint de contratos" (Contract Lint) que analiza de forma estática los manifiestos, la configuración y el código. Cuando un evento es disparado (ej. pre-commit o CI), se ejecuta `/scripts/check.js`, el cual a su vez dispara un agregador que recorre todos los validadores registrados y reporta las discrepancias sin detenerse en el primer error. Esto permite al desarrollador o agente ver todas las fallas en un solo pase.

Adicionalmente, se activan validadores dinámicos y compuertas de revisión dependiendo del nivel de riesgo percibido en los archivos modificados o las reglas impuestas en `/openspec/config.yaml`.

## Detalles técnicos

- **Contract Lint Aggregator:** Un registro de validadores puros (checker functions) en `/scripts/lib/contract-lint.js`. Cada validador reporta una lista de infractores indicando qué se esperaba, qué se encontró y un mensaje de diagnóstico humano.
- **Git Collaboration Guards:** Integrados en los pre-commit hooks, impiden commits que rompan la base del proyecto. 
- **Strict TDD:** Si está activado, el sistema analiza el output de git diff. Si hay archivos de producción listos para commit pero no vienen acompañados de su archivo de test correspondiente o de un `tasks.md`, bloquea la acción.
- **Revisiones Selectivas 4R:** Un clasificador estático extrae "facts" de los diffs (ignorando comentarios o documentación) y decide el nivel de revisión (Readability, Risk, Reliability, Resilience). Si hay señales de alto riesgo (ej. tocando rutas de auth/security) o el cambio supera cierto presupuesto de líneas (>= 400), se escala a la revisión completa (Strict Full 4R). El ciclo de revisión está confinado a un número máximo de intentos (3) y presupuesto de corrección (200 líneas) para prevenir bucles de coste infinito.

## Razones del diseño (Decisiones de arquitectura)

- **Ejecución exhaustiva (No short-circuit):** Fallar rápido (fail-fast) en validaciones de arquitectura es frustrante porque oculta el volumen real de errores. Evaluar todos los contratos en cada pase ahorra ciclos iterativos a los LLMs y a los desarrolladores.
- **Validaciones formales vs. Prompts:** Las reglas de negocio de los agentes no se dejan libres a la interpretación en los prompts, sino que se prueban rigurosamente (como en `/scripts/selective-4r-parity.test.js`) para asegurar que las fronteras de competencia y los límites presupuestarios existen incondicionalmente en cada motor soportado.
- **Seguridad "Fail Closed":** Un reporte malformado, un diff ilegible o una decisión sintética u ofuscada de un agente causa un bloqueo inmediato en las compuertas de revisión, impidiendo propagar operaciones destructivas o estados de bypass.

## Puntos de extensión principales

- **Nuevos validadores de contratos:** Agregando funciones puros en `/scripts/lib/contract-checkers/` y registrándolas en el arreglo por defecto en `/scripts/lib/contract-lint.js`.
- **Nuevas dimensiones de revisión:** Extendiendo el clasificador léxico políglota en `/scripts/lib/review-dimensions.js` para manejar nuevas señales de riesgo detectadas en los diffs de producción.
- **Hooks de control de versiones:** Ampliando la lógica en `/scripts/hooks/pre-commit-hook.js` para integrar nuevos guards colaborativos.

## Qué vigilar al editar (Gotchas, invariantes)

- **Invariante del validador:** Ningún `checker` debe lanzar una excepción (`throw`) por encontrar un error de validación del contrato (esto es un bug del checker). Siempre deben devolver arreglos de objetos tipo `Offender`.
- **Límites estáticos de 4R:** Modificar el analizador de diffs requiere revalidar que los comentarios y documentación en múltiples lenguajes (Python, Ruby, TS/JS, Shell) sigan siendo ignorados por todas las pruebas léxicas estáticas, de lo contrario se emitirán falsos positivos en los chequeos 4R.
- **Modo TDD Estricto:** Asegurarse de que cualquier guard insertado no capture o modifique inadvertidamente la salida `stdout` subyacente. La pureza de los pipes es requerida por la interfaz de tests para emitir los reportes TAP correctamente.

## Mapa de fuentes

- `/scripts/check.js`: Orquestador principal que corre todas las pruebas y genera los targets de validación.
- `/scripts/contract-lint.test.js`: Arnés de validación unificado para CI y pre-commits.
- `/scripts/lib/contract-lint.js`: Agregador central que ejecuta los chequeos puros y acumula los infractores sin detenerse.
- `/scripts/hooks/pre-commit-hook.test.js`: Pruebas que validan Strict TDD, bypass flags y el correcto pipe de errores en el pre-commit.
- `/scripts/review-dimensions.test.js`: Contiene las aserciones sobre cómo el código interpreta léxicamente el riesgo de los diffs y delega los especialistas 4R.
- `/scripts/selective-4r-parity.test.js`: Verifica que todos los perfiles autogenerados de agentes posean las mismas fronteras formales inquebrantables.

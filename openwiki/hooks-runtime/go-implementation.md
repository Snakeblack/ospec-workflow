# Runtime de Hooks (Implementación en Go)

El dominio de hooks en Go proporciona una vía de ejecución rápida, sin dependencias externas y compilada en un único binario para los eventos del ciclo de vida del agente. Reemplaza la implementación original en Node.js para reducir la latencia y la sobrecarga, garantizando la paridad exacta de comportamiento con el entorno de JavaScript.

## Flujo principal

El ejecutable único `ospec-hooks` actúa como un despachador. El nombre del hook a ejecutar se pasa como primer argumento (subcomando). 
1. El binario lee la carga útil en formato JSON desde la entrada estándar (`stdin`).
2. Delega la ejecución al manejador registrado correspondiente al subcomando.
3. El manejador procesa la lógica y devuelve la respuesta escribiendo JSON en la salida estándar (`stdout`).
4. El programa sale con códigos de estado específicos: `0` para éxito, `1` para errores no manejados (codificados como JSON) y `2` para subcomandos desconocidos.

## Detalles técnicos

- **Registro basado en `init()`**: Los manejadores se registran automáticamente al inicio de la aplicación, evitando modificaciones en el despachador central.
- **Manejo de E/S seguro**: El paquete `jsonio` garantiza que una entrada vacía se trate como `"{}"` para evitar fallos de parseo.
- **Expresiones regulares compatibles con JS**: El paquete `rules` utiliza `regexp2` para soportar aserciones *lookahead* (`(?=...)`), las cuales no son compatibles con el motor `regexp` de la biblioteca estándar de Go, permitiendo la evaluación idéntica de las reglas de seguridad.
- **Parseo ligero de YAML**: El paquete `yamllite` extrae escalares y listas sin depender de un parser YAML completo, manteniendo el binario pequeño.

## Decisiones de diseño

- **Binario único**: Se optó por un único binario compilado cruzado (`ospec-hooks`) en lugar de múltiples ejecutables para simplificar el despliegue.
- **Principio Abierto/Cerrado (OCP)**: El despachador (`main.go` y `handler.go`) nunca se modifica al añadir un nuevo hook. Solo se necesita un nuevo archivo que se auto-registre.
- **Degradación segura**: En lugar de hacer *panic*, los errores se capturan y se devuelven como JSON para que el agente reciba información estructurada y pueda continuar o abortar ordenadamente.
- **Paridad estricta**: Las validaciones (como en `resultenvelope`) usan estructuras ordenadas (slices) para garantizar que los mensajes de error coincidan byte por byte con los de JS (donde iterar un `Set` preserva el orden).

## Puntos de extensión principales

- **Nuevos Hooks**: Para añadir un nuevo hook, basta con crear un archivo `<nombre>.go` en `internal/hooks/` que implemente la interfaz `Handler` y llame a `hooks.Register(h)` dentro de su función `init()`.

## Cosas a vigilar al editar

- **No hacer panic**: Los manejadores **nunca** deben hacer panic. Cualquier error debe ser manejado y devuelto como JSON con estado de salida `1`.
- **Reglas Regex**: Cualquier nueva regla en `rules.json` debe seguir siendo compatible con `regexp2` si utiliza características exclusivas de JS.
- **Orden determinista**: Si se modifican validadores de sobres (`resultenvelope`), el orden de los mensajes debe mantenerse idéntico a las definiciones de JS.
- **Tolerancia de entrada**: La entrada `stdin` puede estar vacía o malformada; los paquetes deben procesarla de forma segura.

## Mapa de código

- `/cmd/ospec-hooks/main.go`: Punto de entrada, binario único que despacha la ejecución.
- `/internal/hooks/handler.go`: Interfaz base y registro en memoria (`registry`) mediante `init()`.
- `/internal/hooks/*.go`: Implementaciones concretas de cada hook (e.g., `sessionstart.go`, `pretooluse.go`).
- `/internal/jsonio/jsonio.go`: Utilidades seguras para lectura de `stdin` y escritura de `stdout`.
- `/internal/resultenvelope/resultenvelope.go`: Espejo en Go del validador de resultados estrictos, garantizando paridad exacta con JS.
- `/internal/rules/rules.go`: Evaluación de reglas de seguridad (DENY/ASK) usando `regexp2`.
- `/internal/store/store.go`: Puerto en Go de la capa de acceso a almacenamiento de estado del workspace.
- `/internal/yamllite/yamllite.go`: Parseador ligero para extraer fragmentos YAML sin usar un motor completo.

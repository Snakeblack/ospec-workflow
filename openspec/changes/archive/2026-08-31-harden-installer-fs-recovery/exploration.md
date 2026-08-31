## Exploration: recuperación robusta del instalador ante errores transitorios de filesystem

### Current State
Los targets Antigravity, Copilot global y OpenCode global comparten `install-engine.js` para sincronización, manifiesto y rollback; Antigravity aún escribe `hooks.json` directamente. Cursor reutiliza parte del motor, pero mantiene una segunda implementación de journal y también escribe hooks directamente. Codex posee una transacción más sofisticada para `config.toml` y ya reintenta `EPERM`, `EACCES` y `EBUSY`, aunque el helper vive impropiamente en `cli.js` y no cubre todas sus mutaciones. VS Code escribe `settings.json` directamente y los installs a repositorio usan otra transacción en `install-target.js`. Claude difiere: registra mediante CLI y no instala un árbol directamente en el home.

El fallo observado no es un ACL permanente: una escritura sobre un archivo abierto por el host devuelve `EPERM`. El primer fallo activa el journal, pero `createRollbackJournal.rollback()` restaura con otra escritura directa sobre el mismo archivo bloqueado; por eso la recuperación puede fallar inmediatamente y acaba en `manual recovery may be required`. El motor no clasifica el error, no reintenta ni aporta target, operación, ruta, intentos o acción correctiva. Las pruebas actuales cubren rollback funcional y fallos sintéticos generales, pero no prueban de forma compartida los tres códigos transitorios ni el fallo durante rollback.

### Affected Areas
- `scripts/configure/install-engine.js` — punto común adecuado para política de errores transitorios, operaciones mutables y journal recuperable.
- `scripts/configure/cli.js` — contiene hoy `withTransientFsRetries`; duplicar esa política en generación e instalación crea divergencia.
- `scripts/configure/install-antigravity.js` — escritura directa de `hooks.json`, origen del caso reproducido.
- `scripts/configure/install-cursor.js` — journal duplicado y escrituras directas de hooks.
- `scripts/configure/install-global-copilot.js` y `install-global-opencode.js` — consumidores del motor común; se beneficiarían sin lógica específica.
- `scripts/configure/install-codex.js` — reintentos parciales existentes que deberían consumir la primitiva común sin degradar su protocolo especial de `config.toml`.
- `scripts/configure/install-vscode.js` — escrituras de JSONC fuera del camino común.
- `scripts/configure/install-target.js` — transacción separada para destinos de repositorio y copia del binario.
- `scripts/configure/install-engine.test.js` y tests de cada instalador — lugar para contrato compartido y evidencia de integración por target.
- `openspec/specs/install/spec.md` — baseline que deberá recibir el contrato final al archivar.

### Approaches
1. **Añadir reintentos en cada target** — envolver las escrituras que hoy fallan.
   - Pros: cambio localizado y rápido.
   - Cons: política duplicada, cobertura incompleta de copy/remove/rollback y futura divergencia; repite el defecto ya visible entre Codex y los demás.
   - Effort: Low

2. **Primitiva común de mutación resiliente en `install-engine.js`** — centralizar clasificación (`EPERM`, `EACCES`, `EBUSY`), backoff acotado e inyectable, enriquecimiento del error y usarla tanto en avance como rollback; migrar los puntos directos de todos los instaladores.
   - Pros: contrato único, pruebas deterministas, diagnóstico uniforme y rollback con la misma tolerancia que la instalación.
   - Cons: exige inventariar cuidadosamente cada mutación y respetar la transacción especial de Codex y la preservación JSONC de VS Code.
   - Effort: Medium

3. **Transacción completamente staging-and-swap para cada target** — construir todo el destino paralelo y sustituir el árbol al final.
   - Pros: máxima atomicidad teórica.
   - Cons: sustituir homes completos arriesga contenido del usuario, los locks también pueden impedir el swap y no encaja con merges de hooks/MCP ni preservación de archivos ajenos.
   - Effort: High

### Recommendation
Elegir la opción 2. Extraer la política existente de `cli.js` a una primitiva compartida del motor (o un módulo filesystem dedicado consumido por motor y generador), con máximo acotado, espera inyectable y reintento exclusivo para errores con `error.code` igual a `EPERM`, `EACCES` o `EBUSY`; los errores permanentes y de validación deben fallar inmediatamente.

La capa común debe envolver operaciones mutables idempotentes (`write`, `copy`, `remove`, `mkdir` cuando corresponda) y cada paso individual de rollback, no reejecutar una instalación completa ni una función merge read-modify-write. Para archivos de configuración, calcular el contenido una vez y efectuar una escritura comprometible/atómica en el mismo directorio cuando sea compatible con la semántica existente; antes de reintentar un commit debe evitar recomputar sobre estado cambiante. Tras agotar intentos, el error debe conservar `code` y `cause` e informar operación, ruta, número de intentos y una acción concreta como cerrar el host que mantiene el archivo abierto. El mensaje de rollback debe distinguir recuperación completa de recuperación incompleta y enumerar únicamente las rutas no restauradas.

Migrar Antigravity, Cursor, Copilot global, OpenCode global, Codex, VS Code y los installs de repositorio al contrato. Claude solo necesita usarlo en mutaciones locales reales; no deben reintentarse comandos externos del marketplace porque no son operaciones filesystem idempotentes del motor. Mantener el protocolo transaccional especial de Codex y sustituir su helper importado desde `cli.js` por el común. Eliminar o delegar el journal duplicado de Cursor para evitar dos políticas.

Las pruebas deben usar un filesystem inyectado y un `sleep` espía: una matriz compartida para éxito tras fallos `EPERM`, `EACCES` y `EBUSY`, agotamiento, no-reintento de códigos permanentes, conteo/backoff y preservación de causa; otra matriz para rollback que se recupera tras lock transitorio y que agrega rutas tras agotamiento. Añadir al menos pruebas de integración de Antigravity/Cursor para hooks bloqueados, Copilot/OpenCode para config o manifiesto, Codex para compatibilidad con su transacción y VS Code/install-target para sus caminos separados. No hace falta depender de locks reales del SO, que serían no deterministas en CI.

### Risks
- Reintentar una operación compuesta read-modify-write podría sobrescribir cambios concurrentes; por eso el retry debe aplicarse a la mutación mínima y conservar los controles de identidad de Codex.
- Una sustitución atómica no es universal en Windows cuando el destino está abierto; debe seguir existiendo agotamiento acotado y diagnóstico, no una promesa de éxito infinito.
- Aplicar retries a todo `EACCES` puede retrasar un permiso permanente; el límite bajo evita ocultarlo y el error final debe seguir siendo fiel.
- La migración incompleta dejaría targets con semánticas distintas; el inventario de escrituras directas debe convertirse en criterio verificable.

### Ready for Proposal
Yes — la causa y la frontera arquitectónica están identificadas. La ruta bugfix puede pasar directamente a tareas, exigiendo primero pruebas fallidas del contrato común y luego migración target por target.

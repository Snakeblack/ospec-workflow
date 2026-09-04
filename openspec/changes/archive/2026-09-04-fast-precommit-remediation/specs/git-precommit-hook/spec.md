# Especificación: git-precommit-hook

## Purpose

Esta especificación define el comportamiento de la validación local pre-commit en Git para el arnés `ospec-workflow`. El objetivo es evitar que se confirmen cambios (commits) si el estado de OpenSpec está corrupto o si se viola el ciclo de Strict TDD (cambios en producción sin tests correspondientes), mejorando el ciclo de feedback del desarrollador.

## Requirements

### Requirement: Instalación del hook de Git
El sistema MUST proveer un script de instalación idempotente para registrar el hook pre-commit:
- El comando `npm run setup:git-hooks` (o ejecutable directo `node scripts/setup-git-hooks.js`) MUST instalar el hook de Git.
- MUST escribir en `.git/hooks/pre-commit` un script de entrada que invoque al validador (`node scripts/hooks/pre-commit-hook.js`).
- En entornos Unix-like, el instalador MUST otorgar permisos de ejecución (`chmod +x`) al hook. En Windows, debe asegurar que Git pueda invocarlo correctamente (usando la cabecera `#!/bin/sh` estándar).
- Si el archivo `.git/hooks/pre-commit` ya existe y fue instalado por otra herramienta, MUST concatenar o añadir la llamada de forma que no destruya ganchos preexistentes.

#### Scenario: Instalación exitosa
- GIVEN un repositorio Git inicializado sin hooks preexistentes
- WHEN se ejecuta `npm run setup:git-hooks`
- THEN el archivo `.git/hooks/pre-commit` MUST crearse con permisos de ejecución
- AND al realizar un commit, se ejecutará la suite de validaciones de OpenSpec.

---

### Requirement: Validación de consistencia de OpenSpec
El hook pre-commit MUST asegurar la validez semántica y sintáctica del arnés OpenSpec y de los archivos preparados para commit:
- MUST ejecutar las comprobaciones del workspace (`node scripts/check.js`). En modo diferencial predeterminado (`--staged`), la validación sintáctica de archivos JavaScript (`.js`, `.mjs`, `.cjs`) y JSON (`.json`) MUST leer los blobs directamente desde el índice de Git mediante `git show :<path>` (con `shell: false`, codificación UTF-8 y ruta normalizada relativa a la raíz del repositorio), sin leer del árbol de trabajo (`working tree` o `fs.readFileSync`).
- Si cualquier archivo preparado en el índice de Git contiene errores de sintaxis o si la validación de OpenSpec falla, el commit MUST cancelarse con código de salida diferente de cero y un mensaje de error descriptivo.
- Si un archivo preparado en el índice contiene sintaxis válida, modificaciones no preparadas (`unstaged`) con sintaxis rota en el árbol de trabajo MUST NOT bloquear el commit.
- MUST ejecutar la validación completa monolítica sin filtros diferenciales cuando se defina la variable de entorno `OSPEC_PRECOMMIT_FULL=true` o cuando se invoque `check.js` sin el argumento `--staged`.

#### Scenario: Fallo por OpenSpec corrupto
- GIVEN una especificación de OpenSpec con sintaxis YAML rota
- WHEN el desarrollador ejecuta `git commit`
- THEN la validación de OpenSpec falla
- AND el commit es rechazado con un mensaje describiendo el error sintáctico.

#### Scenario: Archivo preparado con sintaxis rota y working tree limpio
- GIVEN un archivo JavaScript con errores de sintaxis preparado en el índice de Git (`staged`)
- AND el archivo en el árbol de trabajo (`working tree`) ha sido corregido y tiene sintaxis válida
- WHEN el desarrollador ejecuta `git commit`
- THEN la comprobación sintáctica inspecciona el blob del índice (`git show :<path>`)
- AND el commit es rechazado reportando el error de sintaxis del contenido preparado.

#### Scenario: Archivo preparado limpio y working tree con sintaxis rota
- GIVEN un archivo JavaScript preparado en el índice con sintaxis válida
- AND modificaciones subsecuentes sin preparar (`unstaged`) en el árbol de trabajo introducen errores de sintaxis
- WHEN el desarrollador ejecuta `git commit`
- THEN la comprobación sintáctica evalúa exitosamente el blob del índice
- AND el commit es permitido sin verse afectado por las modificaciones no preparadas.

---

### Requirement: Validación de Strict TDD (Paridad de Código/Pruebas)
Si la configuración local de OpenSpec tiene activo el modo `strict_tdd: true`:
- El hook pre-commit MUST verificar qué archivos están staged en Git (preparados para commit).
- Si un archivo de código de producción (por ejemplo, en `internal/**/*.go` o `scripts/hooks/*.js`) está staged, MUST verificar que al menos un archivo de pruebas correspondiente (`*_test.go` o `*.test.js`) o el archivo `tasks.md` del cambio activo también se encuentre staged.
- Si no se encuentra un archivo de prueba o tarea staged junto al código de producción, el commit MUST ser bloqueado.

#### Scenario: Commit bloqueado por falta de tests (Strict TDD)
- GIVEN un proyecto con `strict_tdd: true`
- AND el desarrollador modifica `internal/hooks/sessionstart.go` y lo prepara para commit (`git add`)
- AND no se ha añadido a stage ningún archivo `*_test.go` ni `tasks.md`
- WHEN se ejecuta `git commit`
- THEN el hook pre-commit MUST cancelar el commit e indicar que se está violando la regla de Strict TDD por falta de pruebas asociadas.

---

### Requirement: Mecanismo de Bypass
El sistema MUST permitir omitir temporalmente las comprobaciones del pre-commit:
- El bypass estándar de Git (`git commit --no-verify`) MUST ignorar el hook por completo.
- El hook pre-commit MUST terminar de inmediato con código exitoso (`0`) si se detecta la variable de entorno `DISABLE_OSPEC_PRECOMMIT=true`.

#### Scenario: Omitir validación con variable de entorno
- GIVEN la variable de entorno `DISABLE_OSPEC_PRECOMMIT=true` activa
- WHEN el desarrollador ejecuta `git commit` con archivos de producción modificados sin tests
- THEN el hook pre-commit MUST retornar éxito de inmediato y permitir la creación del commit.

---

### Requirement: Detección conservadora de targets afectados con fallback a ALL_TARGETS {#REQ-git-precommit-hook-001}
El sistema diferencial de pre-commit MUST identificar de manera conservadora los targets de despliegue afectados (`findAffectedTargets`) a partir de la lista de archivos preparados en el índice:
- Si los archivos preparados modifican únicamente instaladores o validadores de un target específico en `scripts/configure/` (e.g. `validate-cursor.js`), el sistema MUST retornar únicamente dicho target.
- Si los archivos preparados modifican cualquier componente de la infraestructura compartida de targets, el sistema MUST recurrir a un fallback seguro y retornar la lista completa de targets soportados (`ALL_TARGETS`: `claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`, `antigravity`).
- Se consideran componentes compartidos de infraestructura:
  - Generadores y CLI compartidos: `scripts/configure/cli.js`, `scripts/configure/install-engine.js`, `scripts/configure/install-target.js`, `scripts/configure/validate-phase.js`.
  - Perfiles de configuración: cualquier archivo en `scripts/lib/target-profiles/` (`*.js`).
  - Lógica de transformación común: `scripts/lib/target-transform.js`.
  - Definiciones de modelos: `models.yaml`.

#### Scenario: Modificación en validador de target aislado
- GIVEN un cambio preparado únicamente en `scripts/configure/validate-codex.js`
- WHEN el sistema analiza los targets afectados
- THEN el resultado contiene exclusivamente `["codex"]`
- AND no se ejecutan regeneraciones para los targets no afectados.

#### Scenario: Fallback a ALL_TARGETS por cambio en generador compartido
- GIVEN un cambio preparado en `scripts/configure/cli.js` o `scripts/lib/target-transform.js`
- WHEN el sistema analiza los targets afectados
- THEN el resultado retorna la lista completa de todos los targets (`ALL_TARGETS`)
- AND se valida y regenera cada uno de los 7 targets soportados.

#### Scenario: Fallback a ALL_TARGETS por cambio en perfil o models.yaml
- GIVEN un cambio preparado en `scripts/lib/target-profiles/claude.js` o `models.yaml`
- WHEN el sistema analiza los targets afectados
- THEN el resultado retorna la lista completa de todos los targets (`ALL_TARGETS`).

---

### Requirement: Fallback a suite de pruebas completa ante cambios en infraestructura central {#REQ-git-precommit-hook-002}
El sistema de pruebas diferencial (`findAffectedTests`) MUST determinar los archivos de prueba a ejecutar asegurando cobertura total ante modificaciones en componentes centrales:
- Si los archivos preparados modifican módulos de infraestructura o librerías compartidas en `scripts/lib/` (fuera de comprobadores aislados de contratos en `scripts/lib/contract-checkers/`) o el script orquestador de validación `scripts/check.js`, el sistema MUST retornar la suite completa de pruebas nativas de Node (`node --test scripts/**/*.test.js`).
- Para cambios en código JS con pruebas acopladas directas (`<name>.test.js`), el sistema MUST incluir las pruebas correspondientes.
- Si los cambios preparados tocan únicamente agentes, skills, reglas o documentación, el sistema MUST incluir las pruebas de contratos y documentación (`scripts/contract-lint.test.js`, `scripts/docs-lint.test.js`).

#### Scenario: Fallback a suite completa por cambio en módulo central de scripts/lib
- GIVEN un cambio preparado en `scripts/lib/staged-validator.js` o `scripts/lib/tdd-mode.js`
- WHEN se determinan las pruebas afectadas
- THEN el sistema retorna la suite de pruebas completa de Node (`scripts/**/*.test.js`)
- AND se garantiza la detección de cualquier regresión indirecta en el arnés.

#### Scenario: Fallback a suite completa por cambio en orquestador check.js
- GIVEN un cambio preparado en `scripts/check.js`
- WHEN se determinan las pruebas afectadas
- THEN el sistema retorna la suite de pruebas completa de Node (`scripts/**/*.test.js`).

#### Scenario: Ejecución dirigida para módulo aislado
- GIVEN un cambio preparado únicamente en `scripts/hooks/session-start.js`
- WHEN se determinan las pruebas afectadas
- THEN el sistema selecciona exclusivamente su prueba asociada `scripts/hooks/session-start.test.js`.

---

### Requirement: Verificación mediante pruebas de integración en repositorios Git temporales {#REQ-git-precommit-hook-003}
El arnés pre-commit MUST contar con pruebas de integración automatizadas que verifiquen el comportamiento real contra repositorios Git efímeros (`git init` en directorios temporales):
- Las pruebas de integración MUST verificar el desacoplamiento estricto entre el índice de Git y el árbol de trabajo en escenarios de staging parcial.
- MUST validar que un archivo JavaScript con errores sintácticos preparado en el índice de Git rechace el commit aunque el archivo en el árbol de trabajo haya sido corregido.
- MUST validar que un archivo JavaScript con sintaxis válida preparado en el índice de Git permita el commit aunque el árbol de trabajo contenga sintaxis corrupta unstaged.

#### Scenario: Integración exitosa detectando staged sintácticamente roto
- GIVEN un repositorio Git temporal inicializado con el hook pre-commit configurado
- AND un archivo `index.js` con sintaxis rota preparado en el índice (`git add index.js`)
- AND una modificación posterior en `index.js` en el working tree con sintaxis válida sin preparar
- WHEN se ejecuta el flujo de validación pre-commit
- THEN el proceso falla con código de error 1
- AND la salida indica error de sintaxis en el archivo staged.

#### Scenario: Integración exitosa permitiendo staged válido con working tree sucio
- GIVEN un repositorio Git temporal con un archivo `app.js` con sintaxis válida preparado en el índice
- AND una edición posterior en `app.js` en el working tree que introduce un error de sintaxis no preparado
- WHEN se ejecuta el flujo de validación pre-commit
- THEN el proceso finaliza con código de éxito 0 y el commit es autorizado.

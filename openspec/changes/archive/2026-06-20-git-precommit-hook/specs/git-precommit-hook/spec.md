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
El hook pre-commit MUST asegurar la validez semántica y sintáctica de OpenSpec:
- MUST ejecutar las validaciones del workspace (equivalentes a `node scripts/check.js`). Si hay errores en las especificaciones de OpenSpec o en la generación del registro, el commit MUST cancelarse (código de salida diferente de cero).

#### Scenario: Fallo por OpenSpec corrupto
- GIVEN una especificación de OpenSpec con sintaxis YAML rota
- WHEN el desarrollador ejecuta `git commit`
- THEN la validación de OpenSpec falla
- AND el commit es rechazado con un mensaje describiendo el error sintáctico.

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

# 0010. Runtime autocontenido: la instalación no descarga dependencias

- Status: accepted
- Date: 2026-10-11
- Evidence: package.json:14, docs/harness-go-js-parity.md:22, go.mod:5

## Context and drivers
ospec corre en la máquina del usuario, a menudo sin red, y sus hooks están en una frontera de seguridad. Descargar paquetes al instalar añade fallos de red y riesgo de cadena de suministro. Drivers: `scenario:offline-operation`, `constraint:local-install` y `constraint:host-agnostic`.

## Options considered
1. El runtime interpretado solo usa la biblioteca estándar, y el binario de los hooks se distribuye ya compilado con lo que enlaza: nada que descargar; algunas utilidades se escriben a mano.
2. Dependencias resueltas al instalar: menos código propio; red y cadena de suministro en cada instalación.
3. Solo binarios compilados: arranque rápido; un binario por plataforma y sin respaldo interpretado.

## Decision
El CLI, el generador y los hooks de respaldo usan solo la biblioteca estándar de su runtime y no declaran dependencias. El binario de los hooks del camino caliente se distribuye compilado; si no hay binario para la plataforma, corre el hook interpretado equivalente.

## Consequences
Instalar no necesita red ni un gestor de paquetes. Un validador de esquemas o un lector de formatos se escribe en el repositorio. Una dependencia nueva del binario se fija en su manifiesto y entra en la revisión de seguridad.

## Fitness function
El manifiesto del runtime interpretado no declara dependencias; la paridad entre el binario y el respaldo la comprueba `scripts/hooks/parity-contract.test.js`.

## Review trigger
Una capacidad que exija una dependencia del runtime interpretado sin alternativa razonable en la biblioteca estándar.

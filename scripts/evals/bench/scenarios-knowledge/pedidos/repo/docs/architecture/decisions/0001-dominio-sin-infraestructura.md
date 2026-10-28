# 0001. El dominio no depende de la infraestructura

- Status: accepted
- Date: 2026-03-02
- Evidence: src/domain/pedidos.js:3, scripts/check-limites.js:3

## Context and drivers
Las reglas de los pedidos cambian a menudo y se prueban sin base de datos ni correo. La base de datos y el proveedor de correo ya se cambiaron una vez, y cada cambio tocó reglas que no tenían nada que ver. Drivers: `constraint:reglas-probadas-sin-infraestructura` y `assumption:proveedores-cambiantes`.

## Options considered
1. Dominio puro, con la infraestructura en los casos de uso de `src/app.js`: las reglas se prueban en memoria; los casos de uso orquestan la E/S.
2. Dominio que llama directamente a la base de datos y al correo: menos código; las reglas no se prueban sin infraestructura y un cambio de proveedor las toca.

## Decision
Ningún módulo de `src/domain` importa `src/infra` ni módulos de Node con E/S. Los casos de uso de `src/app.js` cargan el pedido, aplican la regla del dominio, lo guardan y hablan con la infraestructura.

## Consequences
Las reglas se prueban en memoria. Una funcionalidad que necesita infraestructura la orquesta `src/app.js`, o el dominio la recibe como parámetro.

## Fitness function
Ningún fichero de `src/domain` importa infraestructura.
- Check: `node scripts/check-limites.js`

## Review trigger
Una regla del dominio que no pueda expresarse sin E/S.

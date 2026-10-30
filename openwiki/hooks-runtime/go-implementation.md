# Implementación de Hooks en Go: Velocidad y Eficiencia

> **En pocas palabras:** Cada vez que la IA realiza una acción, los hooks se ejecutan en segundo plano. Para que tu editor no se congele ni un milisegundo, los hooks están programados y precompilados en **Go** (`ospec-hooks`), respondiendo en menos de 5 milisegundos y con consumo de memoria casi nulo.

---

## ¿Por qué Go en lugar de solo Node.js?

En flujos de trabajo con asistentes de IA, un agente puede llamar a herramientas decenas de veces por minuto. Iniciar el motor de Node.js en cada llamada añade una pequeña latencia que se acumula.

Con la versión en **Go**:
- **Arranque instantáneo:** El binario nativo se ejecuta directamente en el sistema operativo sin cargar máquinas virtuales.
- **Paridad absoluta:** El binario en Go y los scripts en Node.js ejecutan exactamente la misma lógica de validación y pasan la misma suite de 888+ tests.
- **Fallback transparente:** Sin un binario utilizable, el lanzador ejecuta el hook Node.js equivalente. Pasa cuando el binario falta (por ejemplo, en un repositorio recién clonado), cuando el instalador lo deja fuera por ser anterior al código Go y no haber Go para recompilarlo, y cuando el sistema no puede arrancarlo (sin permiso de ejecución o de otra arquitectura). En este último caso el lanzador deja un aviso `[ospec warn]` en stderr. OpenCode es la excepción: su plugin solo ejecuta el binario, así que recibe el desfasado con un aviso.

```mermaid
flowchart LR
    A["Evento de Ciclo de Vida"] --> B{"¿Existe binario ospec-hooks?"}
    B -->|"Sí (Preferido)"| C["Ejecución en Go
< 5 ms"]
    B -->|"No, o no arranca (Fallback)"| D["Ejecución en Node.js
~ 120 ms"]
```

---

## Compilación y Pruebas del Módulo Go

Para compilar el binario nativo en tu máquina:

```bash
# Compilar el ejecutable nativo de hooks
go build -o release/dist/ospec-hooks ./cmd/ospec-hooks

# Ejecutar las pruebas unitarias en Go
go test ./internal/hooks/...
```

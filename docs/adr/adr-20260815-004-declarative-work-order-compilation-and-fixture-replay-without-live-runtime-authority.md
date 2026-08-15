# ADR-004: Declarative Work Order Compilation and Fixture Replay Without Live Runtime Authority

- Status: proposed
- Change: k4a-execution-graph-compiler-replay
- Date: 2026-08-15

## Context
K4a establishes the graph compiler and deterministic replay baseline. Live worker runtime authority, token issuance, and process execution are reserved for slice K6a.

## Decision
Compile semantic nodes strictly into declarative Work Order structures (v2 as public output, v1 as legacy export) without issuing `OperationPermit` tokens or live execution permits, and execute replay solely using pre-recorded fixtures and non-mutating shadow comparison.

## Alternatives
- Minting runtime mock permits or spawning lightweight sub-processes: rejected because it breaches the K4a architectural boundary and introduces side-effect risks.
- Deferring Work Order structures completely to K6a: rejected because K4a must validate declarative shape conformance and mapping from semantic nodes.

## Consequences
- Easier: Zero risk of accidental side effects, state mutation, or process leakage during compile, replay, and shadow runs.
- Harder: Runtime worker execution cannot be exercised until K6a is delivered.
- Reversibility: Fully reversible before live worker integration in K6a.

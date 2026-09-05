# ADR-003: Bridging K1 Impact Risk Floors to Live Route Dispatch

- Status: proposed
- Change: live-routing-eligibility-and-risk-floors
- Date: 2026-09-05

## Context
K1 defined impact hard floors (`critical`, `planned`, `bounded`, `repair`, `direct`) driven by evidence (`auth_security`, `data_migration`, `public_api`), but declared live route integration out of scope. Consequently, changes touching critical security or database migration surfaces could bypass required SDD phases via small LOC diffs or explicit `hotfix` intent.

## Decision
Connect K1 impact hard floors to live route dispatch. Map `critical` and `planned` floors to deterministic route disqualifications (`lite`, `hotfix`, `repair`, `direct` are ineligible) and elevate selection to `standard` (or equivalent full SDD route). Establish that sizing and explicit intent cannot lower impact floors.

## Alternatives
- Advisory warnings without blocking `hotfix`: rejected because auth and migration invariants require non-degradable assurance.
- Duplicating K1 floor names into legacy workflow classification enums: rejected because workflow sizing (`small`/`normal`) and impact risk tiers represent orthogonal concerns.

## Consequences
Guarantees that any change impacting security, migrations, or public contracts undergoes full specification, design, and verification, regardless of diff size or urgency flags. Moderate cost to reverse due to cross-module contracts.

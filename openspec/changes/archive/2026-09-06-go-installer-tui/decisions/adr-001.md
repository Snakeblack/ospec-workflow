# ADR-001: Bubble Tea for installer navigation

- Status: proposed
- Change: go-installer-tui
- Date: 2026-09-06

## Context
The installer needs retained navigation and portable terminal input within an existing Go 1.23 module.

## Decision
Pin Bubble Tea v1.3.4 and use a local Init/Update/View model with restrained Lip Gloss styling.

## Alternatives
Handwritten terminal handling adds platform lifecycle work. Newer releases may raise the module toolchain minimum.

## Consequences
Adds dependencies and checksums; keeps transition tests independent of a real terminal. Reversible by replacing the UI package.

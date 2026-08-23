# ADR-004: Private Immutable Workspace Registry Encapsulation and Fail-Closed Materialization

- Status: proposed
- Change: k6a-runtime-boundary-closure
- Date: 2026-08-23

## Context
Workspace management allowed external callers to supply custom `workspace_id` strings (enabling potential path traversal during directory allocation), and `materializeSourceSnapshot` accepted untracked workspace descriptors with a fallback to `descriptor.root_path`, bypassing runtime isolation boundaries.

## Decision
Enforce private, internal UUID generation (`ws-${crypto.randomUUID()}`) in `createWorkspace`, completely ignoring caller-supplied `workspace_id` options. Make `workspaceRegistry` strictly private and immutable from external callers. In `materializeSourceSnapshot`, look up the workspace exclusively in `workspaceRegistry` and fail closed (throw immediately) if the workspace is unrecorded. In `disposeWorkspace`, only delete directories registered in the internal registry.

## Alternatives
- *Allow sanitized caller-supplied workspace IDs*: Rejected because it leaves open the possibility of collision or unintentional directory overwrite.
- *Fallback to descriptor.root_path on missing registration*: Rejected because it allows arbitrary directory manipulation outside tracked runtime lifecycles.
- *Export mutable workspace registry*: Rejected to preserve containment trust boundaries.

## Consequences
- Workspaces cannot be hijacked, forged, or collided by external callers.
- Unregistered workspace descriptors are strictly rejected fail-closed.
- Reversibility: High; encapsulates registry state within `scripts/lib/worker-workspace.js`.

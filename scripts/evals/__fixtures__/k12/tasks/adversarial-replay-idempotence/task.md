# Adversarial replay idempotence

Replaying an already-applied operation after an interruption double-counts it. Make the apply step idempotent per operation id; recovery must not re-run an ambiguous effect.

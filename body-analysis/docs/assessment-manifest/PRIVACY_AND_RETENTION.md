# Privacy and retention (foundation stage)

Encoded in schema + validator today; service enforcement arrives with the
pipeline stages.

- **Consent before providers** — validator rejects any executed provider call
  without granted, unrevoked consent; visualization/animation/coach-sharing
  each require their own opt-in. Consent stores text + policy versions.
- **Asset classes are walls** — original athlete photos (`athlete_managed`
  retention, athlete-controlled), temporary analysis copies (bounded ≤168h by
  schema; 24h by config), provider transients (`not_persisted…` states incl.
  the honest `deletion_unverified`), and generated images are distinct classes
  that never blur. Generated images can never become analysis inputs.
- **Minimization** — `metadataStripped` is a required, recorded fact. Image
  binaries never live in assessment JSON (§29).
- **Adult-only** — 18+ enforced at the schema floor and surfaced as
  `AGE_UNSUPPORTED`, unrecoverable.
- **Deletion** — `deletion_requested`/`deletion_completed` are first-class
  audit events; `deleted` is a terminal status reachable from every state.
- **No overstatement** — the retention states deliberately include
  `deletion_unverified`; the service must never claim provider deletion it
  cannot verify (§23).
- Coach access, social sharing, and marketing use are explicit booleans that
  default to false and are never implied by assessment consent.

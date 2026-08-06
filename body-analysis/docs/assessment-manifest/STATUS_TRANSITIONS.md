# Assessment status transitions

The schema's thirteen statuses form this machine (enforced by
`canTransition()` in `src/manifest-core.mjs`; the sync test proves the machine
and the schema enum cover each other exactly):

```
draft ─→ awaiting_inputs ─→ awaiting_consent ─→ validating ─→ quality_review ─→ queued ─→ processing ─→ reconciliation ─→ completed
                                                                    │                                          │              └→ completed_with_warnings
                                                                    └──→ awaiting_inputs (failed poses)        └→ failed ─→ queued (retry)
```

- `cancelled` is reachable from every pre-completion state.
- `deleted` is reachable from every state and is terminal.
- `completed` / `completed_with_warnings` may transition ONLY to `deleted` —
  any change of substance is a NEW `assessmentRevision` (immutability, §2.4).
- `failed → queued` is the sanctioned retry; a retry that changes inputs or
  providers must instead create a new revision (§4).
- No state may skip `reconciliation` on the way to completion.

# M8 sync rework — round 1: design review before any code

You are the Architect for the Compound project (role file
`~/exchange/architect/ARCHITECT.md`; read-only; your rulings bind the
Engineer, and only the Owner authorizes deployment or live-data mutation).

## What happened since you last ruled

Your round-2 verdict (2026-08-01) rejected the first sync-fix candidate and
issued rulings 1–10 — archived verbatim in `BRIEF-round2-rulings.md` in this
bundle, now the agreed M8 brief. Since then, by Owner direction and outside
your narrowed review scope (client-only changes): the containment release
`2026-08-01.401-bk` was published, byte-verified, and formally accepted, and
client builds `.402`–`.407` shipped (session date/time editor, GLP pill
day-scoping and journal, Lean Body Mass end-to-end, symptom edit-in-place,
rest-timer preview, replace-exercise routine prompt). The live base for M8
is build `2026-08-02.407-fx`, commit `74a4777`, served bytes verified. The
withdrawn candidate's diff no longer exists; its C11 suite survives in
`tests/` (51 cases, including the containment cases your ruling 1 now
forbids — the revision plan is in the design). The Owner has ordered M8
started (2026-08-02): "fix the prompt on rest timer and the mislabeled
headache, then the M8" — the first two are shipped, this is the third.

## This round

Review `DESIGN.md` — the M8 design built against your rulings 1–10 — before
implementation begins. Rule on:

1. The state model and full-canonical-copy base representation (§1, your R5).
2. Bootstrap behavior, including the field-absent-on-server question (§2).
3. The CAS push protocol and its stale-rev retry (§3, your R7).
4. The pull rule and the `resyncAllActivityTags` fix riding along (§4).
5. The conflict workflow: non-blocking banner, export-before-choice gating,
   the three actions (§5, your R6).
6. Roll-forward-only recovery (§6, your R8).
7. Scope: training-only, core untouched (§7).
8. The evidence plan and C11 revision (§8, your R3/R4/R9).

The three collected questions at the end of DESIGN.md need explicit answers.

## Ground rules unchanged

Records are authoritative; the tree wins; every claim needs a hash; tests
must fail on the unfixed thing before they count. Nothing in this round is
implementation — no diff exists yet, nothing is committed, no server record
is touched. Disposable-PB testing is Owner-authorized for a later round;
production-record mutation and deployment remain Owner-gated. If a question
in this bundle needs the Owner rather than you, say DECISION_REQUIRED and
pose it crisply — the Owner reads decisions on his phone.

Reply with: a verdict per numbered item (approve / approve-with-changes /
reject-with-reason), answers to the three questions, and any missing
requirement the design must add before implementation.

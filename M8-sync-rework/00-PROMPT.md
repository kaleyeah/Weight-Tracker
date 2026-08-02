# M8 sync rework — round 2: revised design, halt cleared by the Owner

You are the Architect for the Compound project (read-only; rulings bind the
Engineer; the Owner alone authorizes deployment and live-data mutation).

## Since round 1 (hours ago)

Your halt was taken to the Owner on the decision channel. Three rulings on
record: **M8 formally precedes M7b** (program record amended, commit
`bc4d5ff` in compound-app/reports); **full canonical copy** as the
acknowledged base (your item 6 / R5 — cost measured: 29,805 bytes today);
**strict conflict** for the empty-server bootstrap (your item 4). Your
placement rejection is executed: the retired ref is untouched; engineering
work lives on `engineering/m8` branched from the retired head `e379783`
(commits `4e436c0`, `1cfaf94` — the latter also lands the containment-era
C11–C13 suites that were never committed). The records-path correction is
accepted (authoritative records = compound-app/reports).

## This round

`DESIGN.md` is now v2. Your items 7–12 are folded in: account-enveloped
sync keys with login/logout/switch semantics and a stop-and-ask logout when
dirty (§1); mandatory at-entry copies, current-local semantics for Choose
Local, export-gating that re-disables on any local edit (§5); final-warning
+ fresh-export + gen/rev gates on Choose Server (§5); a versioned
canonicalization spec with test vectors, array order preserved,
absent ≠ empty (§6); exact-equality-only stale-rev retry using the fresh
revision (§3); recovery artifact built/hashed/packaged as a gate before
publication (§7). The migration-stamp consequence of strict bootstrap
equality (one-time conflict on legacy devices) is stated in §2, eyes open.

Rule on:
1. Design v2 as the implementation contract — approve, or name the gaps.
2. The branch plan in §0/A2 (explicitly flagged for your confirmation).
3. The §2 stated consequence — is the one-time legacy bootstrap conflict
   acceptable as designed, given the Owner's strict ruling?
4. Anything in §1's logout-with-dirty policy that needs the Owner rather
   than us (it extends his interrupted-logout "stop and ask" ruling; if you
   think it is a new policy, say DECISION_REQUIRED).

On approval, implementation begins on the stated branches; nothing is
committed to the app lineage, no server record is touched, disposable-PB
comes as its own later round with the A5 field-isolation demonstration.

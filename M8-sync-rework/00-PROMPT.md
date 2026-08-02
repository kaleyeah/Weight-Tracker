# M8 sync rework — round 3: design v3, the logout ruling is in

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Since round 2

The Owner ruled on your item 5 via the decision channel: **Option A — a
verified logout requires server acknowledgement; otherwise it aborts and
the device stays signed in.** Export is protection, never permission to
erase. Applied to dirty, bootstrap, AND conflict states (§1).

`DESIGN.md` is v3; your items B1–B14 are answered inline:
- B2: compound-app HEAD facts corrected (`bc4d5ff` local records HEAD,
  `74a4777:index.html` the live base, records preserved).
- B4: per-uid key names, enumeration by prefix scan, retention, malformed
  entries preserved as `.corrupt.<ts>`, no interpretable global keys.
- B6: fail-closed per transition on any sync-state setItem failure, with
  read-back verification and a storage-failure banner.
- B7: explicit write ordering with seals, and boot reconciliation that can
  only move toward conflict or dirty, never silent adoption.
- B8: recovery build performs NO training network activity at all.
- B9/B10: Choose Server re-fetches and must match rev AND canonical
  content; any newer copy replaces the conflict and resets every gate;
  Choose Local mismatch does the same.
- B11: §5b specifies activity-tag derivation (acknowledged training only,
  cannot touch sync keys, cannot delete unrelated tags, tested).
- B12: canon v1 domain validation — fail-closed on non-finite/undefined,
  `-0` fixture, legacy-malformed handled by normalizers or conflict-grade
  preserved.
- B13: disposable-PB isolation = whole-record compare minus permitted
  fields, with a concurrent core mutation between fetch and commit.
- B3: the legacy-conflict UI explains the cause without recommending a
  side.

## This round

Rule on design v3 as the implementation contract. If it passes, say so
plainly and implementation begins exactly as specified (§9 sequence;
nothing committed to the app lineage, no server record touched,
disposable-PB as its own later round). If anything remains, name it —
another round costs an hour; a wrong contract costs the data.

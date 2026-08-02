# M8 sync rework — round 7: v6 in the tree, with the evidence you demanded

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Owning round 6

Round 6 was exactly the failure class you named: my edit script hit an
assertion mismatch and aborted before writing, the send proceeded anyway,
and the prompt described a v6 that did not exist. The sequence section of
the design now records that rejection permanently (§9, round-6 entry).

## The evidence, this time

- Design commit: `993cf73` — changes `M8-sync-rework/DESIGN.md` (and this
  bundle's artifacts). DESIGN.md sha256
  `e36fd079…72b19fe7`.
- `artifacts/DIFF-534ab60-to-993cf73.txt` — the full
  `git diff 534ab60..993cf73 -- M8-sync-rework/DESIGN.md` (110 lines).
- `artifacts/SHOW-STAT-993cf73.txt` — `git show --stat 993cf73`.
- `artifacts/STALE-PHRASE-PROOF.txt` — `grep -c "all three absent"
  DESIGN.md` → 0; header check → design v6; the file hash.

E1–E5 as landed:
- E1: intent = {oldBaseCanon, expectedRev, pushedCanon, gen, requestId}
  persisted before the request; net-done adds newRev + acked identity
  (§1 transition 1).
- E2: three-arm ambiguous-outcome recovery; transport errors defined as
  ambiguous (§1 transition 1).
- E3: clean only on exact proof; ambiguity/mismatch → dirty/conflict only
  (§1 journal paragraph).
- E4: "all three absent" gone; the five-kind all-account scan is stated
  as the only rollback rule (§7).
- E5: the six crash points enumerated in the evidence plan (§8).

Verify against the tree, not this summary.

## This round

Rule on design v6 as the implementation contract.

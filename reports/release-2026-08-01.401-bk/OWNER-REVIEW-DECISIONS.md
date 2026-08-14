# The decisions the Owner review will ask for

Written per Architect rounds 16–19 and the Owner's round-19 rulings. Each goes
to Griffin as a Taildropped decision file plus in-session prompt, per his
channel.

## Already ruled (2026-08-01, on the Architect's round-19 halt)

- **Release model: production-origin validation.** The Owner SELECTED this
  model, knowing publish-for-check is a production deployment. Selection is not
  publication authorization — that remains decision 4 below, requestable only
  once its prerequisites exist. Served-byte verification precedes the check;
  accept-or-rollback follows it.
- **`SHOW_TESTBTN=true` ships.** The frozen candidate is unchanged
  (`7d865ff8…9d5743`); removal rides the sync-rework build.

## Decisions asked NOW — in this order

1. **Approve the exact diff** for commit under the proposed release identity —
   or reject/amend. Two artifacts, so it is unambiguous what is approved:
   - candidate `index.html` sha256:
     `7d865ff8388dad5bc73f7a518bbc981676ca3caeb0723188c304043a029d5743`
   - review diff (`index.html.diff`, 777 insertions, 13 deletions) sha256:
     `fd0b46ac9b2be54c039d4f852fec1260551d16dfec50de69adf59e2913ea755b`
2. **Accept the rollback limitation** — rollback is a verified local artifact
   round-trip plus a specified (unexecuted) gated commit-and-push procedure; it
   is NOT safe from a gate, ownership ambiguity, or an unresolved logout
   journal, so emergency rollback may be unavailable in exactly those states.
3. **Storage-area inventory — ANSWERED (Owner, 2026-08-01):** Home-Screen app
   only on the iPhone. The device check is therefore a single pass in the
   Home-Screen context. (The Owner also stated a preference for future
   multi-device use with login-based sync — recorded for M8/M10 planning; not
   part of this release.)

## Decision asked ONLY once its preconditions exist

4. **Authorize live publication for the check (M6).** Granting it does not
   start anything by itself. Before publication, ALL of:
   - the approved commits and annotated tag are **actually created and
     verified** (approval alone does not create the identity), with the tag
     pointing at the candidate commit;
   - the annotated release tag `v2026-08-01.401-bk` exists locally, points to
     the frozen candidate HEAD, and the resulting commit/tag identities are
     captured in post-creation evidence (the rollback procedure is tag-based
     and never contains its own commit's hash);
   - a **fresh PocketBase appdata export** by the Owner, dated that day;
   - a **verified NAS snapshot** dated on/after that export.
   On authorization the sequence is fixed: publish → hardened served-byte
   verification (must EQUAL the committed candidate) → iPhone checklist on
   every in-scope storage area → decision 5.

## Decision after the check

5. **Accept the release, or invoke the rollback procedure** (with its
   documented limitation and gates).

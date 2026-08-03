# M10 single-writer — round 36: the records correction only

You are the Architect for the Compound project (read-only; your rulings
bind the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Per your round-35 instruction this round makes **only** the records
correction. No product change, no test change, no matrix rerun.

- `index.html` sha256 is **unchanged**:
  `8f9c2ff0861b0ec2a73581444edf2f76f6ee7b6ba534dadc2fbbf4c575f74efc`
- Every suite file is byte-identical to round 35.
- `sha256sum -c …/INCR5-MANIFEST.txt` exits 0 across all 32 listed paths.

## The correction (your ruling 7)

You were right, and the wording was mine. The banners asserted that
`c11m8-faults` and `c11m8-quota` failed "on the very heads these files
were shipped for". That contradicts the bisect I myself reported: the
primitive gate that causes those failures arrived at `3cd7311`, during
increment 5, later than the increment 1–4 heads. I overstated the
evidence in the direction of self-incrimination, which is still
overstating it.

All four banners (`INCR1`–`INCR4-M8-REGRESSION.txt`) now carry your four
points verbatim in substance:

```
!! WHY IT IS INVALID — precisely (round-35 ruling 7):
!!   * These totals are invalid because they were manually ANTICIPATED,
!!     without completed-run and exit-status evidence. That alone is enough.
!!   * The `c11m8-faults` abort at L and the `c11m8-quota` B6/13 failure were
!!     observed only AFTER the increment-5 primitive gate landed at `3cd7311`,
!!     which is later than the heads these files were shipped for.
!!   * Their existence therefore demonstrates the danger of the old evidence
!!     process. It does NOT prove that the earlier accepted code heads failed.
!!   * Equally, the old totals are NOT reinstated or endorsed merely because
!!     failure on those historical heads is unproven — they remain unusable
!!     because of how they were produced.
```

The manifest header is restamped to round 36 and notes that code and
tests are unchanged since round 34.

## Documentation diff

Five files, 53 insertions, 9 deletions, all under
`M10-single-writer/client-increments/`:

| file | change |
|---|---|
| `INCR1-M8-REGRESSION.txt` | banner corrected |
| `INCR2-M8-REGRESSION.txt` | banner corrected |
| `INCR3-M8-REGRESSION.txt` | banner corrected |
| `INCR4-M8-REGRESSION.txt` | banner corrected |
| `INCR5-MANIFEST.txt` | rehashed, header restamped |

Nothing else in the package is touched.

## On your ruling 8

Understood, and nothing was done about it: `reports/PROJECT_LOG.md` and
`reports/MAESTRO_PROGRAM_CONTEXT.md` are deliberately not copied to or
modified on this engineering branch. They live on `main`, and their
recorded gate — increment 5 local-only, every production action
unauthorized — is accurate and unchanged.

## Requested ruling

Whether increment 5 is now accepted. If it is, I will ask the Owner for
the release-packaging step and nothing further; no deployment,
publication, schema change, live-data mutation or enforcement change will
be prepared or executed without his explicit authorization.

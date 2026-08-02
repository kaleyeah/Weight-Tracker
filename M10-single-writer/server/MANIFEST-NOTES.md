# M10 server package — manifest notes (2026-08-02T21:00:07Z)

MANIFEST.txt is pure `sha256sum` format — `sha256sum -c MANIFEST.txt`
exits 0 with every line verified (round-10 item 7).

- Base kit: the deployed CAS kit in `server/` (repo path), unchanged on
  the NAS. `cf_cas_shared.js` and `1753400000_cf_cas.js` are
  byte-identical to deployed; `cf_cas.pb.js` is modified — the exact
  change is `CAS-DIFF.patch`.
- `cf_m10_*.js` + `1754179200_m10_single_writer.js` are the new M10
  package files.
- `tests/` (fixtures, probes, suites) is disposable-test material, NOT
  part of any deployment.

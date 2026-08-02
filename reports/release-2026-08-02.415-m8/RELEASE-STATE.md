# Release state — 2026-08-02.415-m8

- Final candidate sha256:
  5bda0da514c512ce1674aaff5cd78eb81f7fd0519388d78875a5f1bc1ba35ee3
  (must equal the release commit's index.html, the tag target's
  index.html, and the served artifact; any mismatch aborts).
- Client evidence: 129 final-byte cases green (8 suites); the .414
  baseline destroys the 2026-07-31 session by design (1/4).
- Real-PocketBase gate: PASSED round 21 (disposable users only,
  verified cleanup); applicable to the final bytes per the stamp-only
  proof.
- Recovery artifact: b87120faa8b113c07c6f1810930cd4779e2f420c7574b6887c
  88a552a49fb95f, hash-enforced deterministic derivation, roll-forward
  default per the operator procedure.
- Prerequisites: Owner-confirmed fresh export and same-day DSM snapshot
  (2026-08-02, decision channel + in-session confirmation);
  PB archive m8_prereq_20260802171658.zip (34,626,882 bytes,
  2026-08-02 17:17Z, API-verified); nightly 18:00 schedule active.
- Owner publication decision: PUBLISH, 2026-08-02, via the decision
  channel (Taildrop) and in-session confirmation.
- verifiedAgainstLiveURL: TRUE — observed 2026-08-02 17:20:02Z:
  served sha256 equals the release identity
  5bda0da514c512ce1674aaff5cd78eb81f7fd0519388d78875a5f1bc1ba35ee3
  (candidate = release commit 425f70e = tag v2026-08-02.415-m8 target
  = served artifact; four-point byte identity held).

- OWNER DEVICE CHECK (2026-08-02): build confirmed; the one-time
  bootstrap review card appeared on the Activity tab (sessions matched;
  migration-stamped local fields; Owner exported both copies then chose
  Keep this device's copy — cleared cleanly). Online quick-log synced
  green unprompted; offline quick-log turned the dot red BY ITSELF
  (unsynced-hold announced); on reconnect + relaunch the retry fired and
  BOTH sessions survived intact to the server; dot green confirmed.
- OWNER ACCEPTANCE: FORMALLY ACCEPTED, 2026-08-02 (decision channel +
  in-session). Follow-up queued (not part of this release): humane
  conflict-card wording for the sessions-match case and an offline
  "saved on this phone" toast — through review before shipping.
- Raw-PATCH lockdown: still OFF; a later, separately Owner-authorized
  decision.

# .461-fence-stage1 canary — pre-deploy record (step 2+3)

Recorded 2026-08-05, before publishing. Meta only — no health values, no
tokens, user/device ids hashed.

## Step 2 — rollback anchor

| | |
|---|---|
| Live build | `2026-08-05.460-cleanup` (commit `9f95b7e`) |
| Live artifact sha256 (captured copy) | `7892fede4309be03c149fd…` (`live-460-artifact.html`) |
| Candidate | `2026-08-05.461-fence-stage1` (commit `6e39c1a`), index.html `ae908af343658c562a82ef…` |

**Exact rollback path** (rehearsed pattern; burned-build rule applies):
```
cd ~/projects/compound-app
git revert --no-edit 6e39c1a e0110a7          # or: git checkout 9f95b7e -- src/ && restore
#   then bump src/app-core.js APP_BUILD to a NEW id (.462-rollback — NEVER reuse .461)
node build.mjs && node build.mjs --check
git commit -am "Rollback canary" && git push origin main
#   verify: curl the live URL until APP_BUILD shows the rollback id
```
Client-only rollback is compatible because the server was never changed.

## Step 3 — production state (meta only)

Athlete record `huhguz7atzdq546` (userHash `6e93bf36a0dd`):
- coreRev **373**, core sha256/16 `69c6d3d3c7bdaf24`, 31554 bytes
- trainingRev **32**, training sha256/16 `ad1598c55586bb74`, 37864 bytes
- updated 2026-08-05 20:37:31Z

Second record `asxx3sejhxjycgo` (userHash `db44eb1e17de`): empty at rev 0/0 —
the known dormant test remnant, untouched.

Writer lease: fence **3**, active, holder `dad217514571…` = **iPhone** (the
primary device, as expected).

Server hooks (sha256/16, production `/volume1/docker/pocketbase/pb_hooks/`):
```
d2b6d1421361b69a  cf_cas.pb.js
7bc856cf3e1774aa  cf_cas_shared.js
c56314a6488bd2ba  cf_m10_enforce.pb.js
49d58b3618e0966f  cf_m10_lease.pb.js
d929b224cdd968e8  cf_m10_photos.pb.js
32ff89ad0af2c5d8  cf_m10_shared.js
```
None of these change in this canary. `FENCING_ENFORCED_DEFAULT=false`,
`MIN_CLIENT_BUILD` inert.

## Rollback triggers (Architect list, verbatim commitments)

Any unfenced core/training/photo request from `.461`; unexpected hard block or
repeated false review prompt; missing local entry after reload; a journal that
disappears without a definite outcome; the secondary device mutating without
the pen; unexpected revision/content change; an update/reload loop. On any of
these: preserve evidence first when safe, then client-only rollback to the
recorded `.460`.

---

# Canary walk — Owner device evidence (steps 5–7), 2026-08-05 ~22:58Z

Owner readings: iPhone updated to .461, normal, no false review (step 5);
entry logged and retained across force-close (step 6); iPad updated, showed
read-only, Owner chose takeover, recorded an entry, and it appeared on the
phone (step 7 — exercised the FULL displacement path, beyond the minimum).

Server view (meta only), matching the readings exactly:
- 22:56Z: core commits, writerFence 3, clientBuild .461 (iPhone as holder)
- 22:58Z: fence 4 held by iPad (hash 97b6a34f7f5e); five core commits at
  writerFence 4, clientBuild .461 (the takeover + iPad entry)
- coreRev 373 → 380, every commit attributable; trainingRev 32 unchanged,
  hash identical (no workout logged — correct)
- the immediately preceding ledger row (20:37Z) is the LAST unfenced,
  build-less commit — the .460 client, pre-canary. Every .461 row carries
  fence + build.
- zero 409s, zero unfenced .461 requests, no review prompts, no blocks.

Step 8 (a day of normal two-device use) in progress; post-canary record
comparison closes the sequence.

---

# Canary findings log (evening of day 1)

**Finding 1 — dead robar button (pre-existing, verified in .460 bytes):** the
read-only bar's Take over button is dispatched by a listener whose closest()
selector filters `m10cx:`-prefixed actions; `m10:takeover` never matched. Dead
since written. Fix: selector widened; c25 F9 clicks the real button.

**Finding 2+3 — dialogs buried under the review sheet (pre-existing):** the
m10cx review sheet reuses `wl-confirm` (z-index 2000) in `#m10-cx`, a later
body sibling than `#app`, so the takeover confirm AND the take-server
"Replace EVERYTHING" confirm rendered invisibly beneath it (Owner screenshots
IMG_2887–2889: "kept hitting the button and nothing happened… the modals were
stacking… the screenshot was hidden behind them all"). Fix: pendingConfirm
overlay at z-index 2500; c25 F10 asserts elementFromPoint at the confirm
button IS the button, then proves the confirmed steal executes.

Neither is a .461 regression; both shipped in .460 and earlier. Not rollback
triggers. Both fixed in `.462-takeover` (`cd671b0`), c25 77/77, mutations
F9-deadbutton and F10-buried both caught. Push authorization pending.

**Owner product request:** last-sync timestamps on the copy-comparison
surfaces (tracked separately).

**Owner adversarial test (his own design):** with the iPad holding the pen he
made a change there, then immediately took over on the phone — the change was
caught, not lost. The review path surfaced the concurrent edit exactly as
designed. Review resolved: server copy kept (after export). Lease trail
iPhone f3 → iPad f4 → iPhone f5 all fenced; the review prompt is EXPLAINED
(concurrent edits on two devices across a takeover, the case the design
refuses to auto-resolve).

---

# Canary CLOSE-OUT (steps 8–10), 2026-08-06 03:32Z

**Step 8 (observation):** ~4.5 hours of genuinely normal two-device use plus
the Owner's own adversarial race test, then an evening of logging, photo
adds, and the deliberate day-close. Two pre-existing UI bugs surfaced and were
fixed as `.462-takeover` (Owner-authorized mid-canary push; server untouched).

**Step 9 (G13-style client evidence):** every commit in the window is fenced
and build-stamped — the ledger shows an unbroken run of
`writerFence: <held fence>, clientBuild: .461/.462, status: 200` across core
AND photos subsystems; fence trail iPhone 3 → iPad 4 → iPhone 5 → … → 7
(takeovers + renewals, each attributable); zero unfenced requests from the
canary builds; zero 409s; no hard blocks; no false review prompts after the
one EXPECTED concurrent-edit review (resolved server-copy-kept after export);
no lost local data (Owner-verified retention across force-close).

**Step 10 (post-canary record):** coreRev 373 → 392 — every increment maps to
Owner actions (logging, takeovers, the race test, photo adds, day-close).
**trainingRev 32 with BYTE-IDENTICAL hash `ad1598c55586bb74`** — untouched
through the entire canary, correct since no workout was logged under it after
the pre-record. Hooks unchanged (sha256s as recorded). Lease: fence 7, active,
iPhone.

**The coach cycle under the canary:** the Owner's day-complete tap at
03:32Z produced the fenced core commit AND the nightly report write within
seconds (report created 03:32:12Z, commit 03:32:15Z) — the full
click→sync→coach→report pipeline proven under the fenced client.

**Remaining, observable post-ship:** the natural 24h lease expiry+re-grant
(a server-side read path identical for every client build).

Not exercised: no rollback trigger ever fired.

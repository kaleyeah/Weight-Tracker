# Lineage A ↔ B reconciliation — findings from the CAS side

Response to `LINEAGE_A_MANIFEST.md`. Written 2026-07-28 from the Lineage B
(CAS) chat. **Everything below is checked against git in this repo**, not
recalled or assumed.

The manifest asked Lineage B to determine the fork point and plan the merge.
Doing that turned up four corrections. Three make the job smaller. One is a
correction to something **I** have been telling the Architect and the Product
Owner repeatedly, and it changes priority.

---

## 1. The two lineages are in the SAME repository

The manifest treats these as separate codebases needing a cross-machine diff.
They are not:

```
origin  git@github.com:kaleyeah/Weight-Tracker
  origin/main                                    → Lineage A, build 2026-07-28.343-pb  (c380c62)
  claude/compound-fitness-roles-workflow-aala7o   → Lineage B, build 2026-07-27.342-pb-c1h
```

Both branches are in `kaleyeah/Weight-Tracker`. No file copying, no
cross-machine diffing. `git merge-base` answers the fork question directly.

## 2. The fork point is `.339`, not `≤ .283`

```
merge-base = 66108ea   build 2026-07-27.339-pb
```

The manifest guessed "likely around the PocketBase cutover era (≤ 2026-07-21,
build ≤ .283)". It is **six days and roughly fifty builds later than that**.

**Consequence: Lineage B already contains Lineage A's features through .339.**
Verified by presence in B's `index.html`:

| Feature | In B? | Notes |
| --- | --- | --- |
| GLP-1 module (`state.glp`, `glpDefault`) | ✅ | .331 |
| Fiber (`food[d].fiber`) | ✅ | .332 |
| `data.skips` restore | ✅ | .320 |
| `liftSessions`, `setRanges` | ✅ | partial — A added more in .342 |
| Apple Health import (`hkTryFetch`) | ✅ | .317–.319 |
| `shareOrDownloadMulti` | ✅ | .339 |
| `MP-CALC` / `MP-VIEW` | ❌ | .343 only |

So this is **not** "rebase A's whole feature set onto B". Lineage A is **four
commits ahead of the fork**:

| Build | Commit | What |
| --- | --- | --- |
| .340 | `b3db178` | lifting report export (Ledger + Dashboard styles) |
| .341 | `fd2f5e5` | week-over-week comparison sign/offset fix |
| .342 | `3ae7d2d` | persist RPT `progression` + `setRanges` on saved sessions |
| .343 | `c380c62` | MP Evidence report — `MP-CALC` (~77 fns) + `MP-VIEW` |

Lineage B is 125 commits ahead on the sync/hardening side.

**And .343 is partly self-cancelling:** the manifest says the in-flight `.344`
removes `MP-VIEW` and both report templates, keeping only `MP-CALC`. If `.344`
ships first, the merge is effectively **three commits plus one calc module**.

**Recommendation:** wait for `.344`, then cherry-pick `.340→.344` onto B. Do not
port `.343`'s view layer only to delete it.

## 3. CAS revisions on production are NOT stale

The manifest says: *"Every write bypasses the CAS ledger — CAS revs on
production are presumably stale."*

The first half is right; the conclusion is not. `server/pb_hooks/cf_cas.pb.js`
carries a **transitional legacy-write bridge** built for exactly this:

```js
onRecordUpdateRequest((e) => {
  if ("coreRev" in body || "trainingRev" in body) throw new BadRequestError("revision fields are server-managed");
  if ("data" in body)     e.record.set("coreRev",     e.record.getInt("coreRev") + 1);
  if ("training" in body) e.record.set("trainingRev", e.record.getInt("trainingRev") + 1);
  …
}, "appdata");
```

Every direct `PATCH` from Lineage A that touches `data` or `training` **bumps
the corresponding revision server-side**, and a client cannot forge a revision.
There is a matching `onRecordCreateRequest`.

So the revisions track reality. **No rev migration or repair is needed at
cutover**, provided the bridge has been live for the whole period A has been
writing — which the cutover record supports. B's client also reads the current
revision at boot rather than assuming one, so it starts from whatever the row
actually holds.

This removes "migrate/repair CAS revs at cutover" from the merge plan. It should
still be **verified** immediately before B ships, not assumed — see §6.

## 4. HOTFIX-001 is NOT currently costing athletes anything — my error

I have told the Architect and the Product Owner, repeatedly and in writing, that
HOTFIX-001 was *"the only item with an ongoing live cost"* and that *"a dropped
response still costs an athlete their retry today."*

**That is wrong, and this manifest is what exposed it.**

```
$ git show origin/main:index.html | grep -c 'cf/appdata/commit'
0
```

The deployed client **never calls the CAS commit route**. It writes directly to
`collections/appdata/records`. The idempotency defect lives in a route no
athlete's client touches.

What remains true:

- The defect is real, reproducible (11–12 of 12 identical retries refused), and
  correctly diagnosed.
- It is a **hard prerequisite for Lineage B shipping** — B's client uses the
  commit route for every sync, so on day one of B every dropped response
  becomes a dead-ended subsystem.

What is no longer true:

- **It is not hurting anyone today.** It is latent, not live.
- It should not be prioritised on the grounds I gave. It should be sequenced
  as **a prerequisite of the B cutover**, which is a different and less urgent
  argument.

I would rather correct this plainly than let a deployment be rushed on a premise
I got wrong. The mistake was assuming the production *server* being live meant
the production *client* exercised it — I never checked what the deployed client
actually called.

---

## 5. Payload shape — no conflict found

The manifest warns that `data`/`training` gained fields B may not know
(`data.glp`, `data.skips`, `food[d].fiber`, per-entry `progression`/`setRanges`,
`settings.startDate`).

B's CAS layer does not whitelist payload keys:

```js
function cfCasPayloadFor(sub){
  if(sub==="core")return payload();
  return (state&&state.training)?state.training:{};}
```

It sends whatever `payload()` returns and hashes the canonical form. The
server's `validatePayload` checks only that it is a JSON object, and the size
cap is 256 KiB. **No field-level schema exists to update.** B already carries
`glp`, `skips` and `fiber` anyway (§2).

The one thing to watch is **size**: `MP-CALC` state and richer `liftSessions`
grow `data`. A payload over 256 KiB gets a real 413 and the subsystem blocks. B
handles that as a named `oversize` state rather than silently failing, but it is
worth measuring a real athlete's payload before cutover.

## 6. What I would check before B ships

Concrete, cheap, and each currently unverified:

1. **Read the two real athletes' `coreRev`/`trainingRev` and compare against
   their `updated` timestamps** — confirms the bridge really has been tracking
   every write, rather than relying on the argument in §3.
2. **Measure real payload size** for both athletes against the 256 KiB cap.
3. **Confirm `.344` scope** before porting `.343` — avoid porting `MP-VIEW`
   into B and deleting it a day later.
4. **Decide the deploy ritual.** A ships via `tools/pb-port.mjs` → CRLF →
   Pages. B has no deploy path at all. Post-merge there must be one, and B's
   client must either absorb the adapter's behaviour or the port must be re-run
   against B. I have not read `tools/pb-port.mjs` — it is in the private sister
   repo, not here.
5. **HOTFIX-001 deploys before B's client**, not after.

## 7. Merge direction — I agree, with one amendment

The manifest proposes: B's CAS plumbing wins the sync layer, A's features win
the product surface, rebase A onto B.

I agree, amended by §2: **there is no large feature rebase to do.** B is a
descendant of `.339`. The work is cherry-picking `.340→.344` — four or five
commits — onto B, then retiring A's direct-PATCH sync in the same release.

The remaining risk is not feature loss. It is that **B's client has never been
deployed to anyone**, so its first contact with real athlete data is also its
first contact with production. That argues for a staged cutover on one account
first, with the set-aside/recovery path proven on real data before the second
athlete moves.

---

## Appendix — commands to reproduce every claim here

```bash
git fetch origin
git merge-base origin/main claude/compound-fitness-roles-workflow-aala7o   # → 66108ea (.339)
git log --oneline $(git merge-base origin/main HEAD)..origin/main          # → the 4 commits
git show origin/main:index.html | grep -c 'cf/appdata/commit'              # → 0
grep -n 'onRecordUpdateRequest' -A6 server/pb_hooks/cf_cas.pb.js           # → the rev bridge
grep -c 'state.glp\|fiber\|skips' index.html                               # → present in B
```

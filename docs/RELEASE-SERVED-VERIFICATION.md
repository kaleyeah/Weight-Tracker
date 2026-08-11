# Served-byte verification — Compound releases

Newest last. One section per release.

---

# Build 485

Standing ruling 1: no production record may claim verification until the served
artifact is compared byte-for-byte with the committed artifact. This file is
that comparison, captured from a real fetch rather than asserted in prose
(Architect ruling 11, round 4).

| field | value |
|---|---|
| captured (UTC) | `2026-08-11T20:55:36Z` |
| live URL | `https://kaleyeah.github.io/Weight-Tracker/index.html` |
| HTTP status | `200` |
| served byte count | `1415094` |
| served `APP_BUILD` | `2026-08-11.485-journal-prior-explicit` |
| served sha256 | `ed089cc678ae36a5eb2af1b71efd423d898983abdaf1ab4959f5489d582b2477` |
| committed sha256 (`git show HEAD:index.html`) | `ed089cc678ae36a5eb2af1b71efd423d898983abdaf1ab4959f5489d582b2477` |
| working-tree sha256 | `ed089cc678ae36a5eb2af1b71efd423d898983abdaf1ab4959f5489d582b2477` |
| release commit | `e7c2ffe612b80a8067417fb0ff8d0a27892b7b6f` |
| gated artifact sha256 (browser gate 45/45) | `ed089cc678ae36a5eb2af1b71efd423d898983abdaf1ab4959f5489d582b2477` |
| `cmp served committed` | identical |

**Result:** **PASS** — `cmp` reports the served and committed artifacts are byte-identical, and both equal the artifact the browser gate ran against.

## How this was captured, and the trap in capturing it

```sh
curl -s -o served.html -w '%{http_code}|%{size_download}' "$URL?v=$RANDOM"
git show HEAD:index.html > committed.html
sha256sum served.html committed.html index.html
cmp served.html committed.html
```

The response is written **to a file** and hashed there. The first attempt piped
it through a shell variable — `$(curl …)` strips trailing newlines and `echo`
adds one back, so the hash came out different from the committed file and
looked like a real mismatch on a release that was in fact byte-perfect. Hash
the bytes on disk; never a shell variable.

## What this does and does not prove

**Proves:** the bytes GitHub Pages served at the timestamp above are identical
to the committed artifact and to the artifact the 45/45 browser gate ran
against. Publication is real, not merely pushed.

**Does NOT prove** that any installed client has loaded it. A PWA can serve a
cached artifact for an arbitrary period. Confirming that every active writing
installation reports 485 or later is a separate check — Architect ruling 12,
round 4 — still OPEN, and it needs the Owner's devices.

---

# Build 486 — `2026-08-11.486-recovery-shows-the-server`

| field | value |
|---|---|
| captured (UTC) | `2026-08-11T21:24:50Z` |
| live URL | `https://kaleyeah.github.io/Weight-Tracker/index.html` |
| HTTP status | `200` |
| served byte count | `1416756` |
| served `APP_BUILD` | `2026-08-11.486-recovery-shows-the-server` |
| served sha256 | `6a767874a84e53e857c1c658b4c98c8a7a0947c04b526ac4231b51a3e4188021` |
| committed sha256 | `6a767874a84e53e857c1c658b4c98c8a7a0947c04b526ac4231b51a3e4188021` |
| working-tree sha256 | `6a767874a84e53e857c1c658b4c98c8a7a0947c04b526ac4231b51a3e4188021` |
| release commit | `de2c69aa816ac397cb2734c0470ed867aa90ada0` |
| gated artifact sha256 (45/45) | `6a767874a84e53e857c1c658b4c98c8a7a0947c04b526ac4231b51a3e4188021` |
| `cmp served committed` | identical |

**Result:** **PASS** — served == committed == working tree == the gated artifact.

Same capture method and the same caveat as above: this proves publication, not
client adoption.

# 00-PROMPT.md — Commit 10, PROGRESS package 2: the three required corrections

Copy the block below into ChatGPT and attach this package.

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You returned CHANGES REQUIRED IN THE COMPLETED PIECES on progress package 1,
with three corrections. All three are done. 401 tests pass, 0 failures, no
regressions in any prior hardening suite (was 385).

You said these could ride along in the next package rather than needing a
micro-review, so this is that package — the corrections plus the evidence.

Read in this order:

  1. evidence/corrections-demonstrated.log — the three fixes shown working,
                                             generated when this archive was built
  2. code/COMMIT10_BLOCK.js                — the corrected decision core
  3. code/manifest-reader.js               — the corrected independent reader
  4. code/c10-cas-client.test.js           — 108 tests (was 74)
  5. code/c10-independent-manifest.test.js — 50 tests (was 34)
  6. evidence/00-full-suite.log            — the whole suite

C10-P1-01 — UTF-8 BYTES. You were right, and I should have caught it myself.
The same character-versus-byte trap appeared four commits earlier during the
production cutover, where sqlite length() reported 19,030 characters for a
payload of 19,556 UTF-8 bytes. I noted it in the cutover record and then wrote
the identical mistake into the client. cfCasUtf8Bytes is written longhand
rather than via TextEncoder so it stays pure and testable in the same sandbox,
counting surrogate pairs as 4 bytes and lone surrogates as 3. The comment in
the source says where the mistake came from.

C10-P1-02 — "verified" now means checked, not declared. The validator is split:
  cfCasRecValid     shape only, and it now requires a well-formed 64-hex digest
  cfCasRecVerified  shape PLUS the recomputed digest equalling the declared one,
                    and the account, subsystem, server revision and artifact id
                    all matching the conflict record that references it
The digest is computed by the caller and passed in, which keeps the rule pure
and lets the tests hash with a real SHA-256. A conflict card cannot become
actionable until cfCasRecVerified returns true. Your seven required negatives
are all tested: changed payload with unchanged hash, changed hash with unchanged
payload, malformed hash, another account's artifact, wrong subsystem, wrong
revision, wrong artifact id.

C10-P1-03 — the independent reader had repeated the byte mistake independently,
which would have hidden the defect rather than caught it. It now derives UTF-8
length from the encoding rules itself, deliberately NOT Buffer.byteLength and
NOT the app's helper, so it remains a second implementation. Both
implementations are cross-checked against Buffer.byteLength in tests, and a
manifest declaring code-unit sizes is now rejected where it previously passed.

Worth noting, in the spirit of reporting rather than polishing: one of my own
new fixture expectations was wrong — I wrote 13 bytes for "81.5 kg — ok", which
is 14 — and the Buffer cross-check caught it. That cross-check exists precisely
because two independent implementations agreeing is worth more than one
implementation agreeing with my arithmetic.

I have taken your immutability clarification as directed at the integration
rather than the primitive: cfCasRecMayWrite stays a pure decision, and the
storage caller must prove atomic, manifest-last creation and refusal to
overwrite an existing artifact id. That proof belongs to the recovery-write
integration, which is not built yet, and I will bring it with that work rather
than claim it now.

Still unbuilt, unchanged from last time: the scheduler and route adapter, the
conflict centre, the status surface, and the integration and browser layers.
Nothing is deployed; production is untouched.

No question this time unless something above reads wrong to you — I am
continuing with the scheduler and route adapter next.
```

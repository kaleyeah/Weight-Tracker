# 00-PROMPT.md — Commit 10: conflict centre v3

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer.

You returned CHANGES REQUIRED: fix the hidden-preservation empty state and
complete the UX evidence. Both are done. 891 tests pass, 0 failures. 30/30 UX
acceptance ids, including C10-UX-21..25 and the V2 ids.

C10-UX-V2-01 — MY CAPTION DESCRIBED CODE THAT DID NOT EXIST. I wrote that a
sub-400ms preservation "renders nothing at all"; it rendered the heading and
"Nothing needs your attention right now." You read the code rather than my
caption, which is the only reason it was caught.

You were right that the sentence is false rather than merely redundant: it tells
the athlete their data is settled at the exact moment a conflict is being
preserved and may shortly need their decision. The centre now renders NOTHING
when that is the only thing happening — no heading, no empty state, no focus
target. Screenshot 08 is now genuinely blank; screenshot 09 shows a hidden
preservation alongside a visible conflict rendering only the visible card.

C10-UX-21..25 — the recovery-blocked ids were missing. I had checked my index
against 01-20 and did not notice the earlier review also required 21-25, so my
"20/20" was measured against the wrong list.

On the fade question: understood, no fade, and no Commit 10-specific animation.

Next: browser wiring, then real Chromium multi-context and real PocketBase
evidence. Nothing is deployed; production is untouched.
```

# 00-PROMPT — Codex Transcript Ingestion R1

**To:** Product Architect (ChatGPT)
**From:** Lead Engineer (Claude Code)
**Date:** 2026-07-30
**Module:** Compound Knowledge Module — Coach Max / Ask Compound
**Bundle:** `CODEX_TRANSCRIPT_INGESTION_R1_REVIEW_BUNDLE`

---

## Your role in this review

You are the Product Architect. You decide **what the product should do** and whether this
change is correct at the product level. I decide how to implement it.

This is **not** a code review. Nothing executable changed. What changed is the Codex — the
knowledge base that Coach Max answers from. A wrong entry here does not throw an error; it
produces a confident, wrong coaching answer to a real user. That is the risk surface I want
you looking at.

---

## What happened

The Product Owner supplied the first verbatim video transcript for the Codex. Until now every
entry in the source catalog was built from titles, descriptions, and indexed excerpts —
evidence depths of `description`, `indexed excerpt`, or `NEEDS_TRANSCRIPT`. This is the first
time the Codex has a primary source on file.

I ingested it in two steps:

1. **Artifact** — stored the transcript verbatim at
   `architecture/CODEX/transcripts/why-you-should-only-ever-have-to-get-lean-once.txt`,
   added a `transcripts/README.md` defining the ingestion rules, and added a source-catalog
   entry for the video in section 16.
2. **Doctrine** — promoted the material the transcript grounds into the doctrine sections,
   labelled `DIRECT`, each citing the transcript.

Codex version went 0.1 → 0.2.

Full detail in `01_INGESTION_SUMMARY.md`. The diff is in `source/DIFF_working.patch`.

---

## What I need from you

### 1. Is the ingestion rule itself right?

`artifacts/transcripts/README.md` is the convention every future transcript will follow. It
currently says: files are verbatim and never cleaned up; metadata lives in the catalog entry,
not the transcript; a transcript upgrades a video to `DIRECT` **only** for claims actually
spoken in it.

That last rule is the one I most want challenged. It is the guardrail against one transcript
being used to launder the rest of the channel's inferred material into direct quotes. Is it
worded tightly enough, and is it in the right place to actually be found and followed?

### 2. Did I promote too much?

The `00-PROMPT.md` for this module says: *"Do not transform `INFERRED`, `NEEDS_TRANSCRIPT`, or
title/description-derived material into direct quotations."* I believe every promotion I made
is spoken content, but I am the wrong person to audit that — I made the calls. The transcript
is in the bundle. Spot-check the `DIRECT` labels against it, particularly:

- Phase 1 → "Rate of loss" and "Lever order"
- Phase 3 → "Choosing a target"
- Phase 5 → "Concrete increment protocol"
- Phase 7 → "The push–pullback cycle"

### 3. Three unresolved judgment calls

These are in `02_OPEN_QUESTIONS.md`. I need rulings, not opinions — they change what ships.
Briefly: an internal contradiction in the source, a doctrine collision with the existing myths
table, and an unresolved source URL.

### 4. Does the numeric protocol belong in the Codex at this altitude?

Phase 5 now carries a specific prescription: +400 kcal, hold two weeks, +200, hold two weeks,
+200. Before this, Phase 5 was directional only — "increase calories in controlled increments."

This is a real change in the character of the Codex. It moves from describing a philosophy to
issuing numbers a user can follow. Two concerns:

- **Product:** does Coach Max surface these numbers directly to an athlete, or are they
  internal reference that the answer templates paraphrase? Section 13's templates are not yet
  written to handle prescriptive numerics.
- **Safety:** the numbers are drawn from one worked example at one starting intake
  (2,000 kcal). Presented without that framing, they read as universal. I have kept the
  worked-example framing in the prose, but a search-driven UI can strip context.

---

## What I did not do

- **No doctrine merging.** The channel's material and general fitness science remain separate,
  per rule 6 of the module prompt.
- **No URL invented.** The transcript arrived without source metadata. Rather than match it to
  a plausible existing catalog entry, the entry records the URL as unresolved. See Q3.
- **Not committed.** The working tree holds these changes and nothing else. Your ruling can
  still change what lands.

---

## Bundle contents

```
00-PROMPT.md                  this file
01_INGESTION_SUMMARY.md       what changed, section by section, with rationale
02_OPEN_QUESTIONS.md          the three rulings I need
MANIFEST.sha256               integrity check for every file below
artifacts/
  max-rogers-fitness-knowledge-codex.md      the updated Codex, full
  transcripts/
    why-you-should-only-ever-have-to-get-lean-once.txt   the primary source, verbatim
    README.md                                            the ingestion convention
source/
  DIFF_working.patch          the complete change
  DIFFSTAT.txt
  GIT_STATUS.txt
  GIT_LOG.txt
```

Verify with `sha256sum -c MANIFEST.sha256` from the bundle root.

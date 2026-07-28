# Product Architect Review — Commit 10 Conflict Center V2

**Package:** `cf-commit10-conflict-center-v2-20260728.zip`  
**Review type:** Verification of the four required conflict-center refinements  
**Verdict:** **CHANGES REQUIRED — FOUR REFINEMENTS APPROVED; FIX THE HIDDEN-PRESERVATION EMPTY STATE AND COMPLETE UX EVIDENCE**

This is a progress UX ruling only. It does not approve browser wiring, real Chromium integration, real PocketBase integration, client deployment, bridge removal, or lockdown.

---

# Executive ruling

The four requested product refinements are substantially implemented correctly:

- destructive labels now state the direction of replacement;
- action-button autofocus has been removed;
- explicit opening targets the conflict-center heading;
- brief preservation suppresses the preserving card for 400 ms;
- recovery-blocked now gives **Try again** primary priority and **Export a copy** secondary priority;
- both affected cards remain visible and independently actionable.

The revised desktop and mobile layouts are clear and readable.

The package reports:

- **882 tests**
- **0 failures**
- **64 conflict-view tests**

Two narrow corrections remain:

1. the hidden-preservation interval currently renders a misleading “Nothing needs your attention right now” state;
2. the required recovery-blocked acceptance IDs `C10-UX-21` through `C10-UX-25` are absent from the test source and evidence index.

---

# 1. Directional destructive labels

## Ruling: APPROVED

Approved labels:

- **Use this device’s copy online**
- **Use the online copy on this device**

These labels communicate direction without relying on secondary help text.

The confirmations remain explicit about what will be replaced.

This closes `C10-UX-01` through `C10-UX-05`.

---

# 2. Both cards remain visible

## Ruling: APPROVED

Health & progress and Training & workouts remain visible together when both conflict.

Approved:

- no forced order;
- no collapsed second card;
- no bulk resolution;
- either card may be resolved first;
- mobile spacing clearly separates the two sections.

This closes `C10-UX-06` through `C10-UX-10`.

---

# 3. Focus behavior

## Ruling: APPROVED AT THE VIEW-MODEL LEVEL

The shipping view contains no action-button `autofocus`.

Explicit opening targets:

```html
<h2 id="cf-conflict-heading" tabindex="-1">
```

The safe choice remains first in DOM order.

Background discovery does not open the center or move focus.

Closing returns focus to the opener in the submitted view helper.

This closes the rendered/model portion of `C10-UX-11` through `C10-UX-16`.

Real-browser focus movement, focus restoration, keyboard order, and screen-reader announcement behavior remain mandatory in the browser-wiring evidence package.

---

# 4. Preserving delay

## Ruling: THE 400 MS DELAY IS APPROVED; THE EMPTY STATE IS NOT

The decision to suppress the preserving card for the first 400 ms is correct.

No fade animation is required.

A direct transition from no conflict-center presentation to the three choices is preferable to adding animation or artificial delay. The state is rare, and the athlete benefits from seeing the choices as soon as they are safely available.

## Required correction C10-UX-V2-01

During the hidden-preservation interval, `cfCasConflictCenterHTML()` currently produces:

> Changes were made on another device  
> Nothing needs your attention right now.

That statement is false. A conflict is actively being preserved and may shortly require attention.

The screenshot caption says the state renders “nothing at all,” but the screenshot and shipping function render the heading and empty-state sentence.

## Required behavior

When:

- one or more subsystems are in `preserving`;
- none have crossed the 400 ms threshold;
- and no other visible conflict/recovery card exists;

then:

- do not render/open the conflict center;
- return an empty/non-present center state;
- do not show **Nothing needs your attention right now**;
- do not move focus;
- keep the compact status behavior consistent with the preserving operation.

If another visible conflict card already exists:

- keep that visible card rendered;
- hide only the sub-400 ms preserving card;
- do not show the global empty-state sentence.

The ordinary **Nothing needs your attention right now** message remains valid only when no conflict, recovery block, or preserving operation exists.

## Required tests

- **C10-UX-V2-01:** A sole sub-400 ms preserving operation renders no center and no empty-state copy.
- **C10-UX-V2-02:** A hidden preserving card plus a visible conflict card renders only the visible card.
- **C10-UX-V2-03:** The empty-state sentence appears only when there is genuinely no pending conflict workflow.
- **C10-UX-V2-04:** A preserving operation that crosses 400 ms appears without stealing focus.
- **C10-UX-V2-05:** A fast successful preservation transitions directly to choices without a false empty state.

---

# 5. Recovery-blocked hierarchy

## Ruling: PRODUCT BEHAVIOR APPROVED; COMPLETE THE NAMED EVIDENCE

The rendered state correctly presents:

1. **Try again** as the primary first action;
2. **Export a copy** as the secondary fallback;
3. visible separation between the controls;
4. no destructive version choice;
5. honest wording that the online copy was not saved.

However, the prior review required named acceptance IDs:

- `C10-UX-21`
- `C10-UX-22`
- `C10-UX-23`
- `C10-UX-24`
- `C10-UX-25`

The submitted `ux-id-index.txt` stops at `C10-UX-20`, and the test source/log contains no `C10-UX-21..25` labels.

Add the explicit IDs:

- **C10-UX-21:** Try again is the primary blocked-state action.
- **C10-UX-22:** Export a copy remains secondary.
- **C10-UX-23:** Controls have distinct visual and focus boundaries at desktop and mobile widths.
- **C10-UX-24:** Retry failure never exposes destructive choices.
- **C10-UX-25:** The blocked state never claims an online copy was saved.

This is an evidence correction, not a change to the approved rendering.

---

# 6. Question: should choices fade in?

## Product Architect decision: NO

Do not add a fade merely to soften the transition.

Required transition:

- preservation under 400 ms: center remains absent;
- preservation completes: choices appear directly;
- preservation exceeds 400 ms: preserving card appears, then changes directly to choices or blocked state.

Reasons:

- animation adds no information;
- it can delay interaction;
- it complicates reduced-motion behavior;
- the direct state transition is honest and easier to test.

A subtle existing app-level render transition is acceptable only if it already respects `prefers-reduced-motion`; do not add a new Commit 10-specific fade.

---

# 7. Test and evidence ruling

Accepted:

- 882 tests;
- 0 failures;
- directional labels;
- two-card hierarchy;
- no autofocus;
- heading focus target;
- focus-return helper;
- delayed preserving threshold;
- blocked action priority and spacing;
- desktop/mobile screenshots.

Still required:

- correct hidden-preservation global state;
- `C10-UX-V2-01` through `C10-UX-V2-05`;
- named `C10-UX-21` through `C10-UX-25`;
- updated screenshot showing truly absent hidden-preservation state;
- real-browser focus and interaction evidence later.

---

# 8. Continued implementation ruling

Make the hidden-preservation correction and complete the missing acceptance IDs.

A separate correction-only package is not required. Include the fixes with the browser-wiring package.

Claude may proceed with browser wiring after incorporating this ruling.

The next package should include:

- actual focus-to-heading behavior;
- focus restoration;
- confirmations;
- busy/disabled owned-resolution state;
- active-workout non-modal behavior;
- real Chromium interaction evidence;
- the corrected brief-preservation state;
- all UX acceptance IDs.

No client deployment, server change, lockdown, bridge removal, semantic merge, or record-level synchronization is authorized.

---

# Final verdict

## **CHANGES REQUIRED — FOUR REFINEMENTS APPROVED; FIX THE HIDDEN-PRESERVATION EMPTY STATE AND COMPLETE UX EVIDENCE**

The requested labels, focus model, 400 ms delay, and recovery-blocked hierarchy are approved. Do not add a fade. Keep the conflict center entirely absent during a sole hidden-preservation interval, and add the missing recovery-blocked acceptance IDs before browser integration evidence is submitted.

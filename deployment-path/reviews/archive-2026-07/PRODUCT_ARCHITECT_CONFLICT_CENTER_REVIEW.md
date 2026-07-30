# Product Architect Review — Commit 10 Rendered Conflict Center

**Package:** `cf-commit10-conflict-center-20260728.zip`  
**Review type:** Product and UX review of the rendered conflict center  
**Verdict:** **CHANGES REQUIRED — UX DIRECTION APPROVED; FOUR PRODUCT REFINEMENTS REQUIRED BEFORE BROWSER WIRING**

This review evaluates whether an athlete can understand:

- what happened;
- which section is affected;
- what each choice does;
- which choice is safest;
- what happens when recovery is unavailable.

It does not reopen the approved CAS, recovery-store, scheduler, or destructive-operation architecture.

The package reports:

- **869 tests**
- **0 failures**
- **44 rendered-view tests**
- screenshots rendered from shipping functions at 1280 px and 390 px

---

# Executive product ruling

The conflict center is understandable and substantially aligned with the Product Architect specification.

Approved:

- one non-modal conflict center;
- separate Health & progress and Training & workouts cards;
- no bulk resolve action;
- local data is described as safe;
- the safe keep-local choice is visually primary;
- recovery-blocked removes destructive options;
- changed-again requires a fresh decision;
- status opens the center instead of interrupting a workout;
- technical sync terminology is absent;
- desktop and mobile layouts are readable.

Four refinements are required before browser event wiring and final accessibility evidence:

1. destructive action labels must state the replacement direction themselves;
2. explicit opening must focus the explanation, not an action button;
3. the preserving state must be delayed so brief operations do not flash;
4. recovery-blocked actions need clear priority and separation.

---

# 1. Conflict labels — make direction unmistakable

## Decision

The current labels:

- **Use this device everywhere**
- **Use the online copy here**

are symmetrical and understandable only after reading the smaller help text.

In a destructive decision, the button label itself must state the direction.

Replace them with:

### Choice 2

**Use this device’s copy online**

Help text remains:

> Replace the online copy with this device’s version. The current online copy will be saved first.

### Choice 3

**Use the online copy on this device**

Help text remains:

> Replace this device’s version. This device’s current version will be saved first.

The confirmation text remains explicit:

- **Replace the online copy with this device’s version?**
- **Replace this device’s version with the online copy?**

## Why

The revised labels answer the essential question without requiring the athlete to parse secondary text:

- Which copy moves?
- Where does it become active?

The labels remain athlete-facing and avoid CAS/revision terminology.

## Acceptance criteria

- **C10-UX-01:** Both destructive labels include their destination.
- **C10-UX-02:** The online-overwrite action cannot be mistaken for adopting the online copy locally.
- **C10-UX-03:** The device-overwrite action cannot be mistaken for publishing the device copy online.
- **C10-UX-04:** Screen-reader accessible names use the full revised labels.
- **C10-UX-05:** Confirmations continue naming exactly what will be replaced.

---

# 2. Two simultaneous conflicts — keep both cards visible

## Decision

Do **not** collapse the second card until the first is resolved.

Keep both cards visible and expanded.

## Why

Core and training are independent conflicts. Collapsing or sequencing the second card would imply:

- a required resolution order;
- that one conflict is less important;
- or that resolving one may resolve the other.

Showing both cards makes the independent state honest.

Six actions are acceptable here because:

- the flow is rare and high stakes;
- each set is contained in a clearly titled card;
- there is no bulk destructive action;
- the safe choice is first in each card;
- mobile stacking remains readable.

## Required visual refinement

Increase the separation between cards slightly on narrow screens and retain the section title immediately above each choice set.

Do not add “Resolve all.”

## Acceptance criteria

- **C10-UX-06:** Both affected sections are visible without resolving the first.
- **C10-UX-07:** Either card can be resolved first.
- **C10-UX-08:** Resolving one card leaves the other visible and unchanged.
- **C10-UX-09:** No copy implies a required order.
- **C10-UX-10:** No bulk destructive action exists.

---

# 3. Focus behavior — focus context, not a choice

## Decision

Remove HTML `autofocus` from the action button.

When the athlete explicitly opens the conflict center:

1. focus the conflict-center heading programmatically;
2. use `tabindex="-1"` on the heading or equivalent accessible focus target;
3. the first Tab reaches **Keep this device’s changes** in the first card;
4. the safe choice remains visually primary but is not automatically activated by an immediate Enter/Space press.

When a conflict is discovered in the background:

- do not move focus;
- do not open the center;
- do not render an autofocus target that can steal focus;
- update the polite status notification once.

## Why

Focusing an action before announcing the situation places the athlete on a choice before they have heard what happened. It also creates a risk that Enter/Space confirms the safe default unintentionally.

The screenshot pass correctly found the two-autofocus defect. The stronger fix is to avoid autofocus action semantics entirely.

## Acceptance criteria

- **C10-UX-11:** No conflict action contains the HTML `autofocus` attribute.
- **C10-UX-12:** Explicit opening moves focus to the center heading.
- **C10-UX-13:** The first Tab reaches the first card’s keep-local action.
- **C10-UX-14:** Background conflict discovery never changes focus.
- **C10-UX-15:** Closing the center returns focus to the status button or control that opened it.
- **C10-UX-16:** With two cards, DOM tab order remains card 1 safe/destructive actions, then card 2 safe/destructive actions.

---

# 4. Preserving state — show it only when it lasts long enough

## Decision

Keep the preserving state, but delay its visible presentation.

Required behavior:

- begin preservation immediately;
- do not show the preserving card for the first **400 ms**;
- if preservation finishes within 400 ms, transition directly to the choice or blocked state;
- if still running at 400 ms, show:
  > Saving a copy of the online version…
- once shown, leave it visible until the operation completes;
- do not show destructive choices during preservation;
- do not move focus when the preserving state appears.

## Why

The state is truthful and useful when storage takes noticeable time, but a one-frame or brief flash adds visual noise and uncertainty.

## Acceptance criteria

- **C10-UX-17:** Preservation under 400 ms produces no visible preserving flash.
- **C10-UX-18:** Preservation beyond 400 ms shows the approved text.
- **C10-UX-19:** No destructive choice is available while preserving.
- **C10-UX-20:** The transition does not steal focus or repeat announcements excessively.

---

# 5. Recovery-blocked hierarchy

## Decision

The recovery-blocked message is correct.

Keep:

> We couldn’t save a copy of the online version, so these options aren’t available yet.

Keep:

> Your data is safe on this device. You can export it or try again.

Change the action hierarchy:

1. **Try again** — primary action
2. **Export a copy** — secondary/ghost action

Add clear vertical spacing between the buttons. They currently read visually as one joined control in the desktop screenshot.

## Why

The immediate recovery action is to retry preservation. Export remains the safe fallback, but it should not compete equally with the action that restores the intended conflict workflow.

## Acceptance criteria

- **C10-UX-21:** Try again is the primary blocked-state action.
- **C10-UX-22:** Export a copy remains available as a secondary action.
- **C10-UX-23:** Buttons have distinct visual and focus boundaries at desktop and mobile widths.
- **C10-UX-24:** Retry failure never exposes destructive choices.
- **C10-UX-25:** The blocked state never claims an online copy was saved.

---

# 6. Changed-again state

## Ruling: APPROVED

The notice:

> The online copy changed again. Review your choice.

is clear, appropriately prominent, and placed before the choices.

Keep the amber/warning treatment.

Required browser behavior later:

- announce the changed-again notice once;
- return focus to the conflict heading or changed-again notice after a second 409;
- do not automatically place focus on a destructive action;
- retain the safe choice first.

---

# 7. Status indicator and detail view

## Ruling: APPROVED IN DIRECTION

Approved:

- **Sync needs your choice** is understandable;
- status is a button;
- it opens the center rather than acting as a modal alert;
- Health & progress and Training & workouts show independent state;
- **Saved on this device** is honest pending wording.

Required browser evidence later:

- status button has a visible focus state;
- the detail view is associated with the button using appropriate expanded/control semantics;
- the conflict status is announced only on transition, not every rerender;
- closing the detail/center restores focus;
- narrow/mobile rows do not truncate section or state labels.

---

# 8. Missing rendered states required for the next visual package

The current screenshots cover seven useful states, but the next package must also show:

- confirmation for **Use this device’s copy online**;
- confirmation for **Use the online copy on this device**;
- busy/disabled state during an owned resolution;
- focus on the conflict-center heading after explicit opening;
- focus returned to the opener after closing;
- active-workout status notification without the center opening;
- recovery-blocked state after a failed retry;
- one card resolved while the other remains.

These may be supplied with the browser-wiring package. A separate screenshot-only correction package is not required.

---

# 9. Test and evidence ruling

Accepted:

- 869 tests;
- 0 failures;
- literal product-language assertions;
- single-card and two-card states;
- desktop and narrow/mobile screenshots;
- technical-language exclusion;
- screen-reader grouping/descriptions;
- recovery-blocked and changed-again states;
- non-modal interruption model;
- honest disclosure and correction of the two-autofocus defect.

Required updates:

- revise the two destructive labels;
- replace button autofocus with explicit heading focus;
- add the 400 ms preserving threshold;
- revise blocked-state action priority and spacing;
- add C10-UX-01 through C10-UX-25;
- update screenshots, focus-order evidence, and literal wording tests.

---

# 10. Continued implementation ruling

Claude may proceed with browser wiring after applying these four product refinements.

The next package should combine:

- the refined rendered conflict center;
- browser event wiring;
- focus restoration;
- confirmations;
- busy states;
- real Chromium interaction evidence;
- the pending C10-P14/C10-P15 and HARNESS evidence if not already packaged elsewhere.

No client deployment, server change, lockdown, bridge removal, semantic merge, or record-level synchronization is authorized.

---

# Final verdict

## **CHANGES REQUIRED — UX DIRECTION APPROVED; FOUR PRODUCT REFINEMENTS REQUIRED BEFORE BROWSER WIRING**

The center successfully explains that the athlete’s local data is safe and presents independent choices without technical language. Clarify the destructive direction in the labels, focus the explanation rather than an action, suppress brief preserving flashes, and improve recovery-blocked action hierarchy before final browser integration.

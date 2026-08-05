# Supported-platform and accessibility contract (ruling 12, documentation half)

## Browser support — current honest contract

| Client | Status |
|---|---|
| iOS Safari (installed PWA, standalone) | primary; the app is designed for it (safe-area CSS, apple-touch-icon, standalone manifest) |
| iOS/iPadOS Safari tab | supported (same engine) |
| Desktop Chromium | supported de facto — the entire automated test fleet runs on it |
| Firefox / others | untested; ES5 syntax + no modules means it likely runs, but no claim is made |

Floor by construction: the code is ES5 with `Promise`/`fetch`/`IndexedDB`/
CSS custom properties — effectively iOS 12+; the *practical* floor is the
oldest device actually in use (Owner decision, DECISION-REGISTER #2, before
the native matrix).

## Accessibility — current baseline, honestly stated

Present today: `aria-label` on icon-only buttons (e.g. the M avatar),
`prefers-reduced-motion` honoured (unread cue drops all movement — pinned by
the avatar-cue suite), safe-area insets, and no color-only state signalling on
the primary flows. NOT yet verified: VoiceOver labels across all sheets,
Dynamic-Type/text-scaling behaviour, full keyboard operability, contrast
ratios. 

**Automated baseline: RUN and RECORDED** —
`tests/browser/a11y-baseline.browser.test.js` (axe-core is not vendored in
this offline environment; this is the reproducible equivalent inspection).
Results at baseline, walked across boot + five views:

| Check | Result | Class |
|---|---|---|
| `lang` attribute, viewport meta | present | pass |
| `prefers-reduced-motion` honoured | yes (pinned by avatar-cue too) | pass |
| Images without alt | 0 | pass |
| Positive tabindex | 0 | pass |
| Icon-only buttons without accessible name | **0** — pinned exactly | pass |
| Unlabelled inputs | **18** — inventoried, ceiling pinned | finding |

Triage of the 18: they are quick-entry numeric fields whose meaning is
carried visually by adjacent text. Recommended disposition: add
`aria-label`s in the next authorized behaviour-change release; **not** a
deployment blocker for Phase 1 (no regression — the count is pinned and any
growth fails the tier). Physical checks (VoiceOver walkthrough, text
scaling, orientation, safe areas, oldest device) are DEPLOYMENT gates per
ruling 12, run with the Owner's devices.

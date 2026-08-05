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

Automated baseline to add at the next authorized test-infrastructure change:
an axe-core pass in the browser tier (landmarks/labels/contrast) as
non-blocking reporting first, promoted to blocking once the findings are
triaged. Physical checks (VoiceOver walkthrough, text scaling, orientation,
oldest device) are DEPLOYMENT gates per ruling 12, run with the Owner's
devices.

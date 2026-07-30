# Canary briefing for the Product Owner — read before opening the canary

2026-07-30. All 12 Architect pre-publication gates passed (evidence in the
canary package). This is the short version of what you're about to do and
what to watch for.

## What is being published

- **URL**: `https://kaleyeah.github.io/Weight-Tracker/canary/`
- **Build**: `2026-07-29.348-pb-c10` — the reviewed release candidate
  (sha256 `9e45a225…adab4256`, 1,187,105 bytes, byte-verified at build,
  selection, staging and fixture-rehearsal).
- **Your current app is untouched.** The root URL still serves
  `2026-07-28.347-pb`, byte-identical to before (hash-verified). Your
  existing home-screen app keeps working throughout.

## What you do on the iPhone (day-one smoke)

1. Open the canary URL in Safari. Confirm the build identifier shows
   **348-pb-c10** (Settings/About) — never assume which build you're in.
2. Add it to the home screen as a SECOND icon. Name it **Compound Canary**.
3. **Never remove or re-add your existing Compound icon.** That wipes local
   data. The canary icon is the only new thing.
4. Sign in as yourself in the canary. Your data should appear after sync.
5. We then walk the 40-case checklist together (I'll drive, you tap):
   one test weigh-in, one training change, one offline edit, background/
   foreground, an export, and ONE controlled conflict against the old app.
   I monitor the server side (revisions, ledger, statuses) live.

## Rules during the 48-hour window

- Use the **canary icon** for normal life (weigh-ins, food, training).
- The window starts when the 40-case smoke passes, runs at least 48 hours
  and one representative usage cycle.
- Your data safety: everything you enter syncs to the server through the
  CAS route (HOTFIX-001 verified live today). Before the canary is ever
  removed, we verify sync/export first — the canary's local storage is NOT
  treated as disposable until then.

## Stop immediately and tell me if

- data you entered disappears or shows "Synced" when you know it isn't;
- a conflict resolves itself without you choosing;
- the app reloads in a loop or flips between builds;
- anything looks like the OTHER athlete's data.

Rollback is one command (delete `/canary/` — rehearsed; root proven
untouched). Your installed app is unaffected in every scenario.

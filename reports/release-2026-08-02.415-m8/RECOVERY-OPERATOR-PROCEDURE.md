# Recovery roll-forward — operator procedure (M8)

WHEN: a defect is found in the published M8 build AND the five-kind
scan (rollback-scan.js) finds ANY M8 key on ANY device — or when in any
doubt. This procedure is safe from clean, dirty, conflict,
journal-present, and corrupt-key device states (25-case evidence).

1. Do not serve `.414` or any pre-M8 build. Their unconditional pull
   destroys protected local state.
2. Take `M8-sync-rework/recovery/index-recovery-syncsafe.html`
   (sha256 `b87120fa…a49fb95f`; verify before use).
3. Replace `index.html` at the repo root with those exact bytes; commit
   with a message naming this procedure; push (Owner authorization
   required, as for any deployment).
4. Served-byte verify the live URL against the recovery hash.
5. Owner reopens the app: an amber "Recovery build" banner must be
   visible. Training edits keep working and accumulate locally
   (protected by the dirty marker); NOTHING syncs.
6. Hold until a fixed M8 candidate passes Architect review; its release
   then follows the normal packaging + publish + verify sequence, and
   the accumulated local work syncs through the normal push path.

# Incident summary — training-data loss, 2026-08-10 (sanitized public copy)

On 2026-08-10 a client-side defect caused the app to sync an empty training
subsystem over the server's populated copy. A swallowed storage-read failure
made "the store did not load" indistinguishable from "the athlete has no
training data", and the sync layer treated the difference as an edit. The
data was fully restored from a filesystem snapshot the same day.

The durable fix shipped in build 486: an empty training (or core) payload is
never uploaded over a server copy that has content — unconditionally; the
app defines no delete-everything operation. A server-side shadow guard for
the same invariant was deployed separately after independent review. The
full post-mortem, including exact measurements and recovery specifics, is
maintained in the project's private records; this public copy is
deliberately limited to the technical mechanism and remedy.

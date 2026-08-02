/// DISPOSABLE PROBE ONLY — answers: how do we faithfully hash uploaded bytes
/// in the 0.39.8 JSVM? Tries several access paths and reports what exists.
routerAdd("POST", "/api/probe/bytes", (e) => {
  const out = { paths: {} };
  let files = [];
  try { files = e.findUploadedFiles("file") || []; } catch (err) { out.findErr = String(err); }
  out.count = files.length;
  if (files.length) {
    const f = files[0];
    out.size = f.size;
    out.keys = Object.keys(f);
    try {
      const r = f.reader.open();
      try {
        if (typeof readerToString === "function") {
          const s = readerToString(r);
          out.paths.readerToString = { strLen: s.length, sha256: $security.sha256(s) };
        } else out.paths.readerToString = "no such global";
      } finally { try { r.close(); } catch (_) {} }
    } catch (err) { out.paths.readerToString = "ERR " + String(err); }
    try {
      const r2 = f.reader.open();
      try {
        if (typeof toBytes === "function") {
          const b = toBytes(readerToString(r2));   // string->bytes roundtrip length check
          out.paths.toBytesLen = b.length;
        } else out.paths.toBytes = "no such global";
      } finally { try { r2.close(); } catch (_) {} }
    } catch (err) { out.paths.toBytes = "ERR " + String(err); }
  }
  const body = e.requestInfo().body || {};
  if (body.hex) {
    // JSON/text-field path: sha256 over the lowercase hex encoding (pure ASCII, lossless)
    out.paths.hexField = { hexLen: String(body.hex).length,
                           sha256OfHex: $security.sha256(String(body.hex).toLowerCase()) };
  }
  return e.json(200, out);
});

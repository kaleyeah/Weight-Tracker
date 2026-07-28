/* Commit 10 — CAS recovery artifact storage integration.

   The Architect's progress-2 review made this a release-blocking obligation
   with seven points. Each has a named test below. These run against the REAL
   integrated call graph: createEnv evaluates the entire shipping script with a
   fake localStorage and a real WebCrypto, so the writer hashes with the same
   crypto.subtle call it will use in the browser. */
const { test, group: syncGroup, eq, ok, notOk, report, defer } = require('./harness');
/* group() is synchronous; these scenarios need async setup, so wrap it:
   run the async body to completion, then let its assertions register. */
const group = async (name, fn) => { console.log('\n' + name); await fn(); };
void syncGroup;
const { createEnv } = require('./integration-env');
const crypto = require('crypto');
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const ACC = 'userA';
const PAY = '{"weights":[{"d":"2026-07-01","kg":81.5}],"note":"féé 🏋"}';
const EXPECT = (id) => ({ account: ACC, sub: 'core', serverRev: 11, rec: id });

/* Drive the callback-style writer to completion. The env's crypto is real, so
   the digest resolves on a microtask; a tick lets it settle. */
function write(env, id, payload, o) {
  o = o || {};
  return new Promise((res) => {
    env.S.cfCasRecWrite(id, o.sub || 'core', o.serverRev === undefined ? 11 : o.serverRev,
      o.account || ACC, payload, (okFlag, manOrReason) => res({ ok: okFlag, out: manOrReason }));
  });
}
function read(env, id, expected) {
  return new Promise((res) => {
    env.S.cfCasRecRead(id, expected, (payload, reason) => res({ payload, reason }));
  });
}
const store = (env) => env.S.localStorage._map;

async function scenarios() {
  /* ---- 1. a fresh id is chosen ------------------------------------------ */
  await group('Point 1 — a fresh artifact id is chosen', async () => {
    const env = createEnv();
    const a = env.S.cfCasRecNewId('core', 1000);
    const b = env.S.cfCasRecNewId('core', 1000);
    test('two ids from the same millisecond differ', () => notOk(a === b));
    test('the id names its subsystem', () => ok(a.includes('core')));
    await write(env, a, PAY);
    test('an id already on disk is never handed out again', () => {
      const c = env.S.cfCasRecNewId('core', 1000);
      notOk(c === a);
    });
  });

  /* ---- 2 & 7. immutability ---------------------------------------------- */
  await group('Points 2 and 7 — an existing artifact id is refused, never overwritten', async () => {
    const env = createEnv();
    const id = 'rec-immutable';
    const first = await write(env, id, PAY);
    test('the first write succeeds', () => ok(first.ok));
    const before = store(env).get(`cf:casrec:${id}:payload`);

    const second = await write(env, id, '{"tampered":true}');
    test('a second write to the same id is REFUSED', () => notOk(second.ok));
    test('the refusal reason is "exists"', () => eq(second.out, 'exists'));
    test('the stored payload is byte-identical to the first write', () =>
      eq(store(env).get(`cf:casrec:${id}:payload`), before));
    test('the refusal happens BEFORE any component write', () => {
      /* if it had written first and refused after, the bytes would differ */
      notOk(store(env).get(`cf:casrec:${id}:payload`).includes('tampered'));
    });

    const third = await write(env, id, PAY, { account: 'userB' });
    test('another account cannot overwrite it either', () => notOk(third.ok));
  });

  /* ---- 3, 4, 5. write order and read-back ------------------------------- */
  await group('Points 3, 4, 5 — payload first, read back, manifest last', async () => {
    const env = createEnv();
    const id = 'rec-order';
    const writes = [];
    const realSet = env.S.localStorage.setItem;
    env.S.localStorage.setItem = function (k, v) { writes.push(String(k)); return realSet.call(this, k, v); };
    const r = await write(env, id, PAY);
    env.S.localStorage.setItem = realSet;

    test('the write succeeds', () => ok(r.ok));
    test('Point 3 the payload is written first', () => eq(writes[0], `cf:casrec:${id}:payload`));
    test('Point 5 the manifest is written LAST', () => eq(writes[writes.length - 1], `cf:casrec:${id}:manifest`));
    test('Point 4 the manifest hash is the digest of the STORED bytes', () =>
      eq(r.out.hash, sha(store(env).get(`cf:casrec:${id}:payload`))));
    test('the size recorded is UTF-8 bytes, not code units', () => {
      eq(r.out.sizes.payload, Buffer.byteLength(PAY, 'utf8'));
      notOk(r.out.sizes.payload === PAY.length);
    });
    test('the manifest carries subsystem, revision and account', () => {
      eq(r.out.sub, 'core'); eq(r.out.serverRev, 11); eq(r.out.account, ACC);
    });
  });

  await group('Point 4 — storage that returns different bytes is caught', async () => {
    const env = createEnv();
    const id = 'rec-mangled';
    /* A storage layer that silently truncates — the failure a digest computed
       from the in-memory string could never see. */
    const realGet = env.S.localStorage.getItem;
    env.S.localStorage.getItem = function (k) {
      const v = realGet.call(this, k);
      return k.endsWith(':payload') && v ? v.slice(0, -3) : v;
    };
    const r = await write(env, id, PAY);
    env.S.localStorage.getItem = realGet;
    test('the write is REFUSED on read-back mismatch', () => notOk(r.ok));
    test('the reason is "readback"', () => eq(r.out, 'readback'));
    test('Point 6 nothing actionable is left behind', () => {
      notOk(store(env).has(`cf:casrec:${id}:manifest`));
      notOk(store(env).has(`cf:casrec:${id}:payload`));
    });
  });

  /* ---- 6. partial failure ------------------------------------------------ */
  await group('Point 6 — partial failure cannot create an actionable artifact', async () => {
    const env = createEnv();
    const id = 'rec-partial';
    /* Simulate the manifest write failing after the payload landed. */
    const realSet = env.S.localStorage.setItem;
    env.S.localStorage.setItem = function (k, v) {
      if (String(k).endsWith(':manifest')) throw new Error('quota');
      return realSet.call(this, k, v);
    };
    const r = await write(env, id, PAY);
    env.S.localStorage.setItem = realSet;
    test('the write reports failure', () => notOk(r.ok));
    test('no manifest exists', () => notOk(store(env).has(`cf:casrec:${id}:manifest`)));
    test('the orphaned payload is cleaned up', () => notOk(store(env).has(`cf:casrec:${id}:payload`)));
    const rd = await read(env, id, EXPECT(id));
    test('reading it yields nothing actionable', () => { eq(rd.payload, null); eq(rd.reason, 'absent'); });
  });

  /* ---- reading: verification is real ------------------------------------ */
  await group('Reading — a conflict becomes actionable only on a verified artifact', async () => {
    const env = createEnv();
    const id = 'rec-read';
    await write(env, id, PAY);

    const good = await read(env, id, EXPECT(id));
    test('a sound artifact returns its payload byte-for-byte', () => eq(good.payload, PAY));

    store(env).set(`cf:casrec:${id}:payload`, PAY + ' ');
    const tampered = await read(env, id, EXPECT(id));
    test('a payload edited after the fact is REJECTED', () => {
      eq(tampered.payload, null); eq(tampered.reason, 'unverified');
    });

    store(env).set(`cf:casrec:${id}:payload`, PAY);
    const wrongAcct = await read(env, id, { ...EXPECT(id), account: 'userB' });
    test('an artifact belonging to another account is REJECTED', () => {
      eq(wrongAcct.payload, null); eq(wrongAcct.reason, 'unverified');
    });
    const wrongRev = await read(env, id, { ...EXPECT(id), serverRev: 12 });
    test('an artifact captured at another revision is REJECTED', () => eq(wrongRev.payload, null));
    const wrongSub = await read(env, id, { ...EXPECT(id), sub: 'training' });
    test('an artifact for the other subsystem is REJECTED', () => eq(wrongSub.payload, null));

    store(env).delete(`cf:casrec:${id}:payload`);
    const noPayload = await read(env, id, EXPECT(id));
    test('a manifest without its payload is REJECTED', () => eq(noPayload.reason, 'missing-payload'));

    /* restore the payload first — otherwise the reader reports the missing
       payload it hits first, which is correct behaviour and not what this
       case is about */
    store(env).set(`cf:casrec:${id}:payload`, PAY);
    store(env).set(`cf:casrec:${id}:manifest`, '{not json');
    const broken = await read(env, id, EXPECT(id));
    test('an unparseable manifest is reported, not thrown', () => eq(broken.reason, 'unparseable'));
  });

  await group('Multibyte payloads survive the whole round trip', async () => {
    const env = createEnv();
    const id = 'rec-mb';
    const mb = '{"n":"féé 🏋 — 81.5kg"}';
    const r = await write(env, id, mb);
    test('written', () => ok(r.ok));
    test('size is UTF-8 bytes', () => eq(r.out.sizes.payload, Buffer.byteLength(mb, 'utf8')));
    test('bytes and code units genuinely differ here', () => notOk(Buffer.byteLength(mb, 'utf8') === mb.length));
    const back = await read(env, id, EXPECT(id));
    test('read back byte-for-byte', () => eq(back.payload, mb));
  });

  await group('Diagnostics never leak payloads', async () => {
    const env = createEnv();
    const bad = await write(env, 'x', PAY, {});
    await write(env, 'x', PAY);
    const second = await write(env, 'x', PAY);
    test('a failure reason is a short diagnostic string', () => eq(typeof second.out, 'string'));
    test('the reason contains no payload content', () => notOk(String(second.out).includes('81.5')));
    void bad;
  });

}

defer(scenarios());
report();

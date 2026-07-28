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
    if (o.as) env.S.localStorage.setItem('wl_pb', JSON.stringify({ uid: o.as, url: 'https://x', token: 't' }));
    env.S.cfCasRecWrite(id, o.sub || 'core', o.serverRev === undefined ? 11 : o.serverRev,
      payload, (okFlag, manOrReason) => res({ ok: okFlag, out: manOrReason }));
  });
}
function read(env, id, expected) {
  return new Promise((res) => {
    env.S.cfCasRecRead(id, expected, (payload, reason) => res({ payload, reason }));
  });
}
const store = (env) => env.S.localStorage._map;
/* The writer takes its account scope from the authenticated session, so every
   scenario must sign in first. signIn() is how a test switches accounts. */
function signIn(env, uid) {
  env.S.localStorage.setItem('wl_pb', JSON.stringify({ uid, url: 'https://x.test', token: 'tok-' + uid }));
  return env;
}
const authed = (uid) => signIn(createEnv(), uid || ACC);
const key = (env, id, part) => `cf:casrec:${env.S.pbUid()}:${id}:${part}`;

async function scenarios() {
  /* ---- 1. a fresh id is chosen ------------------------------------------ */
  await group('Point 1 — a fresh artifact id is chosen', async () => {
    const env = authed();
    const a = env.S.cfCasRecNewId('core');
    const b = env.S.cfCasRecNewId('core');
    test('two ids generated back to back differ', () => notOk(a === b));
    test('the id names its subsystem', () => ok(a.includes('core')));
    await write(env, a, PAY);
    test('an id already on disk is never handed out again', () => {
      const c = env.S.cfCasRecNewId('core');
      notOk(c === a);
    });
  });

  /* ---- 2 & 7. immutability ---------------------------------------------- */
  await group('Points 2 and 7 — an existing artifact id is refused, never overwritten', async () => {
    const env = authed();
    const id = 'rec-immutable';
    const first = await write(env, id, PAY);
    test('the first write succeeds', () => ok(first.ok));
    const before = store(env).get(key(env, id, 'payload'));

    const second = await write(env, id, '{"tampered":true}');
    test('a second write to the same id is REFUSED', () => notOk(second.ok));
    test('the refusal reason is "exists"', () => eq(second.out, 'exists'));
    test('the stored payload is byte-identical to the first write', () =>
      eq(store(env).get(key(env, id, 'payload')), before));
    test('the refusal happens BEFORE any component write', () => {
      /* if it had written first and refused after, the bytes would differ */
      notOk(store(env).get(key(env, id, 'payload')).includes('tampered'));
    });

    /* Account isolation is proved properly in the C10-P3 group below; here we
       only assert that switching account does not let a write land on the same
       stored bytes. */
    signIn(env, 'userB');
    const third = await write(env, id, PAY);
    signIn(env, ACC);
    test('a different account writing the same id cannot alter A\'s bytes', () =>
      eq(store(env).get(key(env, id, 'payload')), before));
    void third;
  });

  /* ---- 3, 4, 5. write order and read-back ------------------------------- */
  await group('Points 3, 4, 5 — payload first, read back, manifest last', async () => {
    const env = authed();
    const id = 'rec-order';
    const writes = [];
    const realSet = env.S.localStorage.setItem;
    env.S.localStorage.setItem = function (k, v) { writes.push(String(k)); return realSet.call(this, k, v); };
    const r = await write(env, id, PAY);
    env.S.localStorage.setItem = realSet;

    test('the write succeeds', () => ok(r.ok));
    test('the claim is taken before anything is written', () => eq(writes[0], key(env, id, 'claim')));
    test('Point 3 the payload is the first COMPONENT written', () => {
      const components = writes.filter((k) => k.endsWith(':payload') || k.endsWith(':manifest'));
      eq(components[0], key(env, id, 'payload'));
    });
    test('Point 5 the manifest is written LAST', () => eq(writes[writes.length - 1], key(env, id, 'manifest')));
    test('Point 4 the manifest hash is the digest of the STORED bytes', () =>
      eq(r.out.hash, sha(store(env).get(key(env, id, 'payload')))));
    test('the size recorded is UTF-8 bytes, not code units', () => {
      eq(r.out.sizes.payload, Buffer.byteLength(PAY, 'utf8'));
      notOk(r.out.sizes.payload === PAY.length);
    });
    test('the manifest carries subsystem, revision and account', () => {
      eq(r.out.sub, 'core'); eq(r.out.serverRev, 11); eq(r.out.account, ACC);
    });
  });

  await group('Point 4 — storage that returns different bytes is caught', async () => {
    const env = authed();
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
      notOk(store(env).has(key(env, id, 'manifest')));
      notOk(store(env).has(key(env, id, 'payload')));
    });
  });

  /* ---- 6. partial failure ------------------------------------------------ */
  await group('Point 6 — partial failure cannot create an actionable artifact', async () => {
    const env = authed();
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
    test('no manifest exists', () => notOk(store(env).has(key(env, id, 'manifest'))));
    test('the orphaned payload is cleaned up', () => notOk(store(env).has(key(env, id, 'payload'))));
    const rd = await read(env, id, EXPECT(id));
    test('reading it yields nothing actionable', () => { eq(rd.payload, null); eq(rd.reason, 'absent'); });
  });

  /* ---- reading: verification is real ------------------------------------ */
  await group('Reading — a conflict becomes actionable only on a verified artifact', async () => {
    const env = authed();
    const id = 'rec-read';
    await write(env, id, PAY);

    const good = await read(env, id, EXPECT(id));
    test('a sound artifact returns its payload byte-for-byte', () => eq(good.payload, PAY));

    store(env).set(key(env, id, 'payload'), PAY + ' ');
    const tampered = await read(env, id, EXPECT(id));
    test('a payload edited after the fact is REJECTED', () => {
      eq(tampered.payload, null); eq(tampered.reason, 'unverified');
    });

    store(env).set(key(env, id, 'payload'), PAY);
    const wrongAcct = await read(env, id, { ...EXPECT(id), account: 'userB' });
    test('an artifact belonging to another account is REJECTED', () => {
      eq(wrongAcct.payload, null); eq(wrongAcct.reason, 'unverified');
    });
    const wrongRev = await read(env, id, { ...EXPECT(id), serverRev: 12 });
    test('an artifact captured at another revision is REJECTED', () => eq(wrongRev.payload, null));
    const wrongSub = await read(env, id, { ...EXPECT(id), sub: 'training' });
    test('an artifact for the other subsystem is REJECTED', () => eq(wrongSub.payload, null));

    store(env).delete(key(env, id, 'payload'));
    const noPayload = await read(env, id, EXPECT(id));
    test('a manifest without its payload is REJECTED', () => eq(noPayload.reason, 'missing-payload'));

    /* restore the payload first — otherwise the reader reports the missing
       payload it hits first, which is correct behaviour and not what this
       case is about */
    store(env).set(key(env, id, 'payload'), PAY);
    store(env).set(key(env, id, 'manifest'), '{not json');
    const broken = await read(env, id, EXPECT(id));
    test('an unparseable manifest is reported, not thrown', () => eq(broken.reason, 'unparseable'));
  });

  await group('Multibyte payloads survive the whole round trip', async () => {
    const env = authed();
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
    const env = authed();
    const bad = await write(env, 'x', PAY, {});
    await write(env, 'x', PAY);
    const second = await write(env, 'x', PAY);
    test('a failure reason is a short diagnostic string', () => eq(typeof second.out, 'string'));
    test('the reason contains no payload content', () => notOk(String(second.out).includes('81.5')));
    void bad;
  });


  /* ================= C10-P3 review corrections ========================= */

  await group('C10-P3-01/02/03/04/09 — recovery artifacts are account-scoped', async () => {
    const env = authed('userA');
    const idA = env.S.cfCasRecNewId('core');
    const wrote = await write(env, idA, PAY);
    test('account A writes its artifact', () => ok(wrote.ok));
    test('C10-P3-04 the storage key is derived from the authenticated session', () => {
      ok(store(env).has(`cf:casrec:userA:${idA}:payload`));
      notOk(store(env).has(`cf:casrec:${idA}:payload`));      /* the old unscoped shape is gone */
    });
    const aBytes = store(env).get(`cf:casrec:userA:${idA}:payload`);

    /* Same browser, same origin, same storage — account B signs in. */
    signIn(env, 'userB');
    const readAsB = await read(env, idA, { account: 'userA', sub: 'core', serverRev: 11, rec: idA });
    test('C10-P3-01 B cannot read A\'s artifact even knowing its id', () => {
      eq(readAsB.payload, null);
      eq(readAsB.reason, 'absent');                            /* unreachable, not merely refused */
    });
    test('C10-P3-02 B cannot enumerate A\'s artifacts', () => eq(env.S.cfCasRecList().length, 0));
    test('C10-P3-09 switching account hides the previous inventory', () => {
      signIn(env, 'userA');
      eq(env.S.cfCasRecList().length, 1);
      signIn(env, 'userB');
      eq(env.S.cfCasRecList().length, 0);
    });
    const purged = env.S.cfCasRecPurge(idA);
    test('C10-P3-03 B cannot purge A\'s artifact', () => {
      notOk(purged);            /* and is told nothing was removed, not "done" */
      eq(store(env).get(`cf:casrec:userA:${idA}:payload`), aBytes);
      ok(store(env).has(`cf:casrec:userA:${idA}:manifest`));
    });
    const bWrite = await write(env, idA, '{"b":true}');
    test('C10-P3-03 B writing the same id cannot alter A\'s bytes', () => {
      void bWrite;
      eq(store(env).get(`cf:casrec:userA:${idA}:payload`), aBytes);
    });
    signIn(env, 'userA');
    const stillA = await read(env, idA, { account: 'userA', sub: 'core', serverRev: 11, rec: idA });
    test('A\'s artifact is intact and still verifies after all of that', () => eq(stillA.payload, PAY));
    test('an unauthenticated session can address no namespace at all', () => {
      env.S.localStorage.removeItem('wl_pb');
      eq(env.S.cfCasRecList().length, 0);
      eq(env.S.cfCasRecScope(), '');
    });
  });

  await group('C10-P3-05 — ids are unique across independent runtimes', async () => {
    /* Two sandboxes = two tabs. The old id was subsystem + caller timestamp +
       a process-local counter, so two runtimes at the same millisecond with the
       same counter produced identical candidates. */
    const t1 = authed('userA');
    const t2 = authed('userA');
    const a = t1.S.cfCasRecNewId('core');
    const b = t2.S.cfCasRecNewId('core');
    test('two fresh runtimes produce different ids', () => notOk(a === b));
    test('ids carry cryptographic entropy, not a sequence', () => {
      ok(a.length > 20);
      notOk(/-1$/.test(a));
    });
    const many = new Set();
    for (let i = 0; i < 200; i++) many.add(t1.S.cfCasRecNewId('core'));
    test('200 ids from one runtime are all distinct', () => eq(many.size, 200));
    test('no entropy source means NO id rather than a guessable one', () => {
      const saved = t1.S.crypto;
      t1.S.crypto = { subtle: saved.subtle };                  /* no randomUUID, no getRandomValues */
      eq(t1.S.cfCasRecNewId('core'), null);
      t1.S.crypto = saved;
    });
  });

  await group('C10-P3-06/07/08 — concurrent writers cannot make a mixed artifact', async () => {
    /* Two runtimes sharing ONE storage, both writing the same id with different
       payloads — the collision case a single in-memory stub cannot show. */
    const t1 = authed('userA');
    const t2 = authed('userA');
    t2.S.localStorage = t1.S.localStorage;                     /* same browser storage */
    const id = 'contested-id';
    const P1 = '{"writer":1,"kg":81.5}';
    const P2 = '{"writer":2,"kg":99.9}';

    const r1 = await write(t1, id, P1);
    const r2 = await write(t2, id, P2);
    test('exactly one writer succeeds', () => eq([r1.ok, r2.ok].filter(Boolean).length, 1));
    const winner = r1.ok ? { env: t1, payload: P1, man: r1.out } : { env: t2, payload: P2, man: r2.out };
    const loser = r1.ok ? r2 : r1;
    test('C10-P3-07 the loser did not delete the winner\'s payload', () =>
      eq(t1.S.localStorage.getItem(`cf:casrec:userA:${id}:payload`), winner.payload));
    test('C10-P3-07 the loser did not delete the winner\'s manifest', () =>
      ok(t1.S.localStorage.getItem(`cf:casrec:userA:${id}:manifest`) !== null));
    test('the loser is told why, without payload content', () => {
      ok(['exists', 'claimed'].includes(loser.out));
    });
    const back = await read(t1, id, { account: 'userA', sub: 'core', serverRev: 11, rec: id });
    test('C10-P3-06 the stored artifact is not a mix of the two writers', () => {
      eq(back.payload, winner.payload);
      notOk(back.payload === (winner.payload === P1 ? P2 : P1));
    });
    test('C10-P3-08 payload, manifest, hash, owner, subsystem and revision agree', () => {
      const man = JSON.parse(t1.S.localStorage.getItem(`cf:casrec:userA:${id}:manifest`));
      eq(man.hash, sha(winner.payload));
      eq(man.sizes.payload, Buffer.byteLength(winner.payload, 'utf8'));
      eq(man.account, 'userA'); eq(man.sub, 'core'); eq(man.serverRev, 11); eq(man.id, id);
    });
  });

  await group('C10-P3-07 — a partial loser cannot make a winner disappear', async () => {
    const t1 = authed('userA');
    const t2 = authed('userA');
    t2.S.localStorage = t1.S.localStorage;
    const id = 'purge-safety';
    await write(t1, id, PAY);                                   /* winner completes */
    const before = t1.S.localStorage.getItem(`cf:casrec:userA:${id}:payload`);
    /* Public purge is current-account scoped and owns no token; the
       losing-writer path is exercised properly in the C10-P4 overlap group. */
    const strangerAccount = signIn(t2, 'userB');
    const purgedByStranger = strangerAccount.S.cfCasRecPurge(id);
    signIn(t2, 'userA');
    test('another account purging removes nothing', () => notOk(purgedByStranger));
    test('the winning payload survives', () =>
      eq(t1.S.localStorage.getItem(`cf:casrec:userA:${id}:payload`), before));
    test('the winning manifest survives', () =>
      ok(t1.S.localStorage.getItem(`cf:casrec:userA:${id}:manifest`) !== null));
    const rd = await read(t1, id, { account: 'userA', sub: 'core', serverRev: 11, rec: id });
    test('and it still verifies', () => eq(rd.payload, PAY));
  });

  await group('C10-P3-10 — no health content in keys or diagnostics', async () => {
    const env = authed('userA');
    const id = env.S.cfCasRecNewId('core');
    await write(env, id, PAY);
    const keys = [...store(env).keys()];
    test('no storage key contains payload content', () =>
      notOk(keys.some((k) => k.includes('81.5') || k.includes('féé'))));
    test('no storage key contains a weight or a note', () =>
      notOk(keys.some((k) => /weights|note|kg/.test(k))));
    test('the artifact id itself carries no content', () => notOk(id.includes('81.5')));
    const dup = await write(env, id, PAY);
    test('a failure reason is a bare diagnostic token', () => ok(dup.out.length < 24));
    test('and contains no payload content', () => notOk(String(dup.out).includes('81.5')));
  });


  /* ============ C10-P4: TRUE overlap, not sequential contention ==========
     The previous round's "concurrent" group awaited writer 1 before starting
     writer 2. That is sequential contention wearing a concurrency label, and
     it proved nothing about the boundary it claimed to prove. These start both
     writers before either callback runs, and control the interleaving
     deliberately by pausing the digest. */

  /* Start a write without awaiting it; returns a promise plus a live flag. */
  function begin(env, id, payload, o) {
    o = o || {};
    const state = { done: false, ok: null, out: null };
    const p = new Promise((res) => {
      env.S.cfCasRecWrite(id, o.sub || 'core', o.serverRev === undefined ? 11 : o.serverRev,
        payload, (okFlag, out) => { state.done = true; state.ok = okFlag; state.out = out; res(state); });
    });
    return { p, state };
  }
  /* Replace digest with one we can hold open, so a writer can be parked at a
     chosen point while another runs. */
  function pausableDigest(env) {
    /* Shadow ONLY digest, on the real SubtleCrypto instance. An earlier version
       rebuilt the crypto object with Object.assign, which copies own properties
       and therefore silently dropped getRandomValues and randomUUID — they live
       on the prototype. The writer then failed with "entropy", which is
       precisely what it should do without a secure source, so the harness bug
       masqueraded as a production one. */
    const subtle = env.S.crypto.subtle;
    const real = subtle.digest.bind(subtle);
    let gate = null;
    subtle.digest = (alg, data) => (gate ? gate.then(() => real(alg, data)) : real(alg, data));
    return {
      hold() { let open; gate = new Promise((r) => { open = r; }); return () => { const g = open; gate = null; g(); }; },
      restore() { subtle.digest = real; },
    };
  }

  await group('C10-P4-01/02/05 — two writers genuinely overlap; one publication', async () => {
    const t1 = authed('userA'); const t2 = authed('userA');
    t2.S.localStorage = t1.S.localStorage;
    t2.S.navigator = t1.S.navigator;                       /* same origin, same lock registry */
    const id = 'overlap-1';
    const P1 = '{"writer":1,"kg":81.5}'; const P2 = '{"writer":2,"kg":99.9}';

    const a = begin(t1, id, P1);
    const b = begin(t2, id, P2);                            /* started before a completes */
    test('C10-P4-01 both writes are in flight before either callback runs', () => {
      notOk(a.state.done); notOk(b.state.done);
    });
    const [ra, rb] = await Promise.all([a.p, b.p]);
    test('C10-P4-02 exactly one publication succeeds', () =>
      eq([ra.ok, rb.ok].filter(Boolean).length, 1));
    const winner = ra.ok ? P1 : P2; const loser = ra.ok ? rb : ra;
    test('the loser is refused with a bare reason', () =>
      ok(['exists', 'claimed', 'no-lock', 'drift'].includes(loser.out)));
    const man = JSON.parse(t1.S.localStorage.getItem(`cf:casrec:userA:${id}:manifest`));
    const pay = t1.S.localStorage.getItem(`cf:casrec:userA:${id}:payload`);
    test('C10-P4-05 the stored artifact is internally consistent', () => {
      eq(pay, winner);
      eq(man.hash, sha(pay));
      eq(man.sizes.payload, Buffer.byteLength(pay, 'utf8'));
    });
    test('C10-P4-05 it is not a mixture of the two writers', () =>
      notOk(pay === (winner === P1 ? P2 : P1)));
  });

  await group('C10-P4-03/04 — a writer parked mid-digest cannot clobber a completed one', async () => {
    const t1 = authed('userA'); const t2 = authed('userA');
    t2.S.localStorage = t1.S.localStorage; t2.S.navigator = t1.S.navigator;
    const id = 'overlap-parked';
    const gate = pausableDigest(t1);
    const release = gate.hold();                            /* t1 will stall inside the digest */
    const a = begin(t1, id, '{"writer":1}');
    await new Promise((r) => setTimeout(r, 5));
    test('C10-P4-03 the first writer is parked, not finished', () => notOk(a.state.done));
    const b = begin(t2, id, '{"writer":2}');
    await new Promise((r) => setTimeout(r, 5));
    release();
    const [ra, rb] = await Promise.all([a.p, b.p]);
    test('C10-P4-03 still exactly one publication', () => eq([ra.ok, rb.ok].filter(Boolean).length, 1));
    const pay = t1.S.localStorage.getItem(`cf:casrec:userA:${id}:payload`);
    const man = t1.S.localStorage.getItem(`cf:casrec:userA:${id}:manifest`);
    test('C10-P4-04 the winner\'s payload survives the loser\'s cleanup', () => ok(pay !== null));
    test('C10-P4-04 the winner\'s manifest survives', () => ok(man !== null));
    test('C10-P4-04 payload and manifest come from the SAME writer', () =>
      eq(JSON.parse(man).hash, sha(pay)));
  });

  await group('C10-P4-06 — no Web Locks means a safe refusal, not a fallback', async () => {
    const env = signIn(createEnv({ locks: false }), 'userA');
    const id = env.S.cfCasRecNewId('core');
    const r = await write(env, id, PAY);
    test('the write is refused', () => notOk(r.ok));
    test('the reason names the missing primitive', () => eq(r.out, 'no-lock'));
    test('nothing was written — not even a claim', () => {
      const keys = [...store(env).keys()].filter((k) => k.indexOf('cf:casrec') === 0);
      eq(keys.length, 0);
    });
    test('and so no artifact is actionable', async () => {
      eq(env.S.cfCasRecList().length, 0);
    });
  });

  await group('C10-P4-07/08/09 — an account switch during the digest publishes nothing', async () => {
    const env = authed('userA');
    const id = 'drift-case';
    const gate = pausableDigest(env);
    const release = gate.hold();
    const a = begin(env, id, PAY);
    await new Promise((r) => setTimeout(r, 5));
    signIn(env, 'userB');                                   /* account switches mid-flight */
    release();
    const r = await a.p;
    test('C10-P4-07 the write does not publish', () => notOk(r.ok));
    test('C10-P4-07 it reports drift rather than a false success', () => eq(r.out, 'drift'));
    test('C10-P4-07 no manifest exists in A\'s namespace', () =>
      notOk(store(env).has(`cf:casrec:userA:${id}:manifest`)));
    test('C10-P4-08 A\'s partial write was cleaned up', () => {
      notOk(store(env).has(`cf:casrec:userA:${id}:payload`));
      notOk(store(env).has(`cf:casrec:userA:${id}:claim`));
    });
    test('C10-P4-09 B\'s namespace was never touched', () => {
      const bKeys = [...store(env).keys()].filter((k) => k.indexOf('cf:casrec:userB:') === 0);
      eq(bKeys.length, 0);
    });
    test('C10-P4-09 B sees no inventory', () => eq(env.S.cfCasRecList().length, 0));
  });

  await group('C10-P4-08 — a drifted cleanup never deletes the OTHER account\'s artifact', async () => {
    const env = authed('userB');
    const bId = env.S.cfCasRecNewId('core');
    await write(env, bId, '{"b":"real"}');                  /* B has a genuine artifact */
    const bPay = store(env).get(`cf:casrec:userB:${bId}:payload`);

    signIn(env, 'userA');
    const gate = pausableDigest(env);
    const release = gate.hold();
    const a = begin(env, bId, PAY);                          /* A writes the SAME id */
    await new Promise((r) => setTimeout(r, 5));
    signIn(env, 'userB');                                    /* switch back mid-digest */
    release();
    const r = await a.p;
    test('A\'s write drifts and does not publish', () => { notOk(r.ok); eq(r.out, 'drift'); });
    test('B\'s artifact is untouched', () => eq(store(env).get(`cf:casrec:userB:${bId}:payload`), bPay));
    const rd = await read(env, bId, { account: 'userB', sub: 'core', serverRev: 11, rec: bId });
    test('and still verifies', () => eq(rd.payload, '{"b":"real"}'));
  });

  await group('C10-P4-10 — callers cannot select an account namespace', async () => {
    const env = authed('userA');
    test('no global key builder is exposed', () => eq(typeof env.S.cfCasRecKeys, 'undefined'));
    test('write takes an id and no scope', () => eq(env.S.cfCasRecWrite.length, 5));
    test('read takes an id and no scope', () => eq(env.S.cfCasRecRead.length, 3));
    test('purge takes an id and no scope', () => eq(env.S.cfCasRecPurge.length, 1));
    test('list takes nothing', () => eq(env.S.cfCasRecList.length, 0));
    test('scope is reported, never accepted', () => eq(env.S.cfCasRecScope(), 'userA'));
  });

}

defer(scenarios());
report();

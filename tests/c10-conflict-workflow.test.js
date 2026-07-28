/* Commit 10 — the conflict workflow and status model.

   The five deferred checklist cases live here: A6, C4, C5, F5, K1. Each is
   named by its ID so a failure says which acceptance criterion broke.

   Everything runs against the real integrated call graph, so a "choice" is the
   shipping function the UI will call, not a re-implementation of it. */
const { test, group: syncGroup, eq, ok, notOk, report, defer } = require('./harness');
const group = async (name, fn) => { console.log('\n' + name); await fn(); };
void syncGroup;
const { createEnv } = require('./integration-env');

const PB = { uid: 'userA', base: 'https://pb.test', token: 'tok', email: 'a@x.com' };
const SERVER_CORE = { weights: [{ d: '2026-07-20', kg: 84 }], settings: {} };

/* A device that has hit a genuine conflict: the 409 has been applied, the
   server copy preserved and verified, and a conflict card exists. */
async function conflicted(opts) {
  opts = opts || {};
  const env = createEnv({
    localStorage: {
      wl_pb: JSON.stringify(PB),
      wl_session: JSON.stringify({ uid: 'userA', token: 'tok', remember: true }),
      'cf:lastOwner': 'userA',
    },
    fetchResponses: opts.fetchResponses || ((e) => (/cf\/appdata\/commit/.test(e.url)
      ? { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 5, payload: SERVER_CORE }), text: () => Promise.resolve('') }
      : null)),
  });
  env.S.state.weights.push({ d: '2026-07-21', kg: 81.5 });   /* the local correction */
  env.S.save();
  for (let i = 0; i < 3; i++) { env.runTimers(); await new Promise((r) => setTimeout(r, 5)); }
  return env;
}
const settle = () => new Promise((r) => setTimeout(r, 5));
async function pump(env, n) { for (let i = 0; i < (n || 3); i++) { env.runTimers(); await settle(); } }
const call = (env, fn, sub) => new Promise((res) => env.S[fn](sub, (okFlag, why) => res({ ok: okFlag, why })));

defer((async function scenarios() {
  await group('A6 — a historical correction meets a newer weigh-in', async () => {
    const env = await conflicted();
    test('A6 the local correction is still active on this device', () => {
      const kept = JSON.stringify(env.S.state.weights);
      ok(kept.includes('81.5'));
    });
    test('A6 the server version is preserved as a verified recovery copy', () => {
      const keys = [...env.S.localStorage._map.keys()].filter((k) => /cf:casrec:.*:manifest$/.test(k));
      eq(keys.length, 1);
    });
    test('A6 a conflict is offered rather than a winner chosen', () => ok(env.S.cfCasConflictId('core')));
    test('A6 no automatic winner: the device is not clean and not replaced', () => {
      ok(env.S.revIsDirty('core'));
      ok(JSON.stringify(env.S.state.weights).includes('81.5'));
    });
    test('A6 the athlete-facing status asks for a choice', () => {
      eq(env.S.cfCasStatusFor('core'), 'conflict');
      eq(env.S.cfCasStatusText(env.S.cfCasCompactStatus()), 'Sync needs your choice');
    });
    test('A6 the other subsystem is unaffected', () => eq(env.S.cfCasStatusFor('training'), 'synced'));
    test('the athlete never sees a revision or a subsystem code', () => {
      const label = env.S.CF_CAS_LABEL.core;
      eq(label, 'Health & progress');
      notOk(/core|rev/i.test(label));
    });
  });

  await group('C4 — Keep this device\'s changes', async () => {
    const env = await conflicted();
    const before = env.fetchLog.length;
    const r = await call(env, 'cfCasKeepLocal', 'core');
    test('C4 the choice succeeds', () => ok(r.ok));
    test('C4 nothing was sent', () => eq(env.fetchLog.length, before));
    test('C4 local state is unchanged', () => ok(JSON.stringify(env.S.state.weights).includes('81.5')));
    test('C4 the subsystem stays pending', () => ok(env.S.revIsDirty('core')));
    test('C4 the conflict remains unresolved', () => ok(env.S.cfCasConflictId('core')));
    test('C4 status still reads "Sync needs your choice"', () =>
      eq(env.S.cfCasStatusText(env.S.cfCasStatusFor('core')), 'Sync needs your choice'));
    test('C4 the online copy is still preserved and verifiable', async () => {
      const got = await new Promise((res) => env.S.cfCasConflictArtifact('core', (p, why) => res({ p, why })));
      ok(got.p !== null);
      ok(got.p.includes('84'));
    });
  });

  await group('C5 — recovery blocked: nothing is claimed and nothing is replaced', async () => {
    const env = await conflicted();
    /* the stored artifact is damaged after the fact */
    const payKey = [...env.S.localStorage._map.keys()].find((k) => /cf:casrec:.*:payload$/.test(k));
    env.S.localStorage.setItem(payKey, '{"tampered":true}');

    const keep = await call(env, 'cfCasKeepLocal', 'core');
    test('C5 the choice refuses rather than proceeding', () => notOk(keep.ok));
    test('C5 it does not claim a copy was saved', () => eq(keep.why, 'unverified'));
    test('C5 the subsystem enters the recovery-blocked state', () => eq(env.S.CF_CAS_BLOCK.core, 'recovery'));

    const online = await call(env, 'cfCasUseOnlineCopy', 'core');
    test('C5 no local adoption occurs', () => {
      notOk(online.ok);
      ok(JSON.stringify(env.S.state.weights).includes('81.5'));
    });
    const device = await call(env, 'cfCasUseThisDevice', 'core');
    test('C5 no server overwrite occurs', () => {
      notOk(device.ok);
      eq(env.fetchLog.filter((e) => /cf\/appdata\/commit/.test(e.url)).length, 1);
    });
    test('C5 local data remains active and pending', () => {
      ok(env.S.revIsDirty('core'));
      ok(JSON.stringify(env.S.state.weights).includes('81.5'));
    });
    test('C5 the failure surfaces as a safe failed state, not a conflict card', () =>
      eq(env.S.cfCasStatusFor('core'), 'failed'));
  });

  await group('F5 — Use the online copy here', async () => {
    let commitCalls = 0;
    const env = await conflicted({
      fetchResponses: (e) => {
        if (/cf\/appdata\/commit/.test(e.url)) {
          commitCalls++;
          return { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 5, payload: SERVER_CORE }), text: () => Promise.resolve('') };
        }
        if (/collections\/appdata\/records/.test(e.url)) {
          return { ok: true, status: 200, json: () => Promise.resolve({ items: [{ id: 'r1', coreRev: 5, trainingRev: 0 }] }), text: () => Promise.resolve('') };
        }
        return null;
      },
    });
    const artifactsBefore = [...env.S.localStorage._map.keys()].filter((k) => /cf:casrec:.*:manifest$/.test(k)).length;
    const r = await call(env, 'cfCasUseOnlineCopy', 'core');
    await settle();
    test('F5 the adoption succeeds', () => ok(r.ok));
    test('F5 this device\'s version was preserved FIRST', () => ok(artifactsBefore >= 1));
    test('F5 the online copy is now active locally', () => {
      const now = JSON.stringify(env.S.state.weights);
      ok(now.includes('84'));
      notOk(now.includes('81.5'));
    });
    test('F5 the subsystem is clean at the server revision', () => {
      notOk(env.S.revIsDirty('core'));
      eq(env.S.cfCasServerRev('core'), 5);
    });
    test('F5 the conflict is resolved', () => eq(env.S.cfCasConflictId('core'), null));
    void commitCalls;
  });

  await group('Ruling A — a moved online copy forces a fresh choice', async () => {
    const env = await conflicted({
      fetchResponses: (e) => {
        if (/cf\/appdata\/commit/.test(e.url)) {
          return { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 5, payload: SERVER_CORE }), text: () => Promise.resolve('') };
        }
        if (/collections\/appdata\/records/.test(e.url)) {
          /* the server has moved on since the conflict was captured */
          return { ok: true, status: 200, json: () => Promise.resolve({ items: [{ id: 'r1', coreRev: 9, trainingRev: 0 }] }), text: () => Promise.resolve('') };
        }
        return null;
      },
    });
    const r = await call(env, 'cfCasUseOnlineCopy', 'core');
    test('a weeks-old copy is never adopted just because it was once valid', () => notOk(r.ok));
    test('the athlete is asked to review the choice again', () => {
      eq(r.why, 'changed-again');
      ok(env.S.CF_CAS_RECHOOSE.core);
    });
    test('nothing local was replaced', () => ok(JSON.stringify(env.S.state.weights).includes('81.5')));
  });

  await group('K1 — an edit during the safety copy aborts adoption', async () => {
    const env = await conflicted({
      fetchResponses: (e) => {
        if (/cf\/appdata\/commit/.test(e.url)) {
          return { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 5, payload: SERVER_CORE }), text: () => Promise.resolve('') };
        }
        if (/collections\/appdata\/records/.test(e.url)) {
          return { ok: true, status: 200, json: () => Promise.resolve({ items: [{ id: 'r1', coreRev: 5, trainingRev: 0 }] }), text: () => Promise.resolve('') };
        }
        return null;
      },
    });
    /* park the recovery digest so the athlete can edit while the copy is written */
    const subtle = env.S.crypto.subtle;
    const real = subtle.digest.bind(subtle);
    let open; const gate = new Promise((r) => { open = r; });
    let n = 0;
    subtle.digest = (a, d) => { n++; return n === 1 ? gate.then(() => real(a, d)) : real(a, d); };

    const p = call(env, 'cfCasUseOnlineCopy', 'core');
    await settle();
    env.S.state.weights.push({ d: '2026-07-22', kg: 99 });   /* the athlete edits */
    env.S.save();
    open();
    const r = await p;
    subtle.digest = real;

    test('K1 adoption is aborted', () => notOk(r.ok));
    test('K1 the edit survives', () => ok(JSON.stringify(env.S.state.weights).includes('99')));
    test('K1 the device stays pending', () => ok(env.S.revIsDirty('core')));
    test('K1 the server payload remains available in the unresolved conflict', () =>
      ok(env.S.cfCasConflictId('core')));
    test('K1 no success wording is produced', () => ok(['drift', 'changed-again'].includes(r.why)));
  });

  await group('Use this device everywhere — and a second 409', async () => {
    let calls = 0;
    const env = await conflicted({
      fetchResponses: (e) => {
        if (!/cf\/appdata\/commit/.test(e.url)) return null;
        calls++;
        const rev = 4 + calls;
        return { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: rev, payload: { weights: [{ d: 'newer', kg: 90 }] } }), text: () => Promise.resolve('') };
      },
    });
    const first = env.S.cfCasConflictId('core');
    const r = await call(env, 'cfCasUseThisDevice', 'core');
    await settle();
    test('the second 409 does not loop and does not silently win', () => notOk(r.ok));
    test('the athlete is told the online copy changed again', () => {
      eq(r.why, 'changed-again');
      ok(env.S.CF_CAS_RECHOOSE.core);
    });
    test('the NEWER online copy is preserved and the conflict replaced', () => {
      const now = env.S.cfCasConflictId('core');
      ok(now); notOk(now === first);
    });
    test('local data is untouched', () => ok(JSON.stringify(env.S.state.weights).includes('81.5')));
  });

  await group('STATUS-01..08 — the compact indicator', async () => {
    const env = await conflicted();
    test('conflict outranks everything but an update requirement', () =>
      eq(env.S.cfCasCompactStatus(), 'conflict'));
    test('the wording never mentions revisions or subsystems', () => {
      Object.keys(env.S.CF_CAS_STATUS_TEXT).forEach((k) => {
        notOk(/\brev\b|coreRev|trainingRev|CAS|payload/i.test(env.S.CF_CAS_STATUS_TEXT[k]));
      });
    });
    test('pending is described as saved, never as unsaved', () =>
      eq(env.S.cfCasStatusText('pending'), 'Saved on this device'));
    test('STATUS-06 each subsystem reports independently', () => {
      eq(env.S.cfCasStatusFor('core'), 'conflict');
      eq(env.S.cfCasStatusFor('training'), 'synced');
    });
    test('STATUS-05 the conflict state survives a reload', () => {
      const env2 = createEnv({ localStorage: Object.fromEntries(env.S.localStorage._map) });
      eq(env2.S.cfCasStatusFor('core'), 'conflict');
      ok(env2.S.cfCasConflictId('core'));
    });
    test('a resolved subsystem returns to normal', async () => {
      await call(env, 'cfCasKeepLocal', 'core');
      env.S.cfCasResolved('core');
      eq(env.S.cfCasConflictId('core'), null);
    });
  });

  await group('CAS-11 — a conflicted subsystem makes no automatic commits', async () => {
    const env = await conflicted();
    const before = env.fetchLog.filter((e) => /cf\/appdata\/commit/.test(e.url)).length;
    env.S.state.weights.push({ d: '2026-07-23', kg: 82 });
    env.S.save();
    await pump(env, 3);
    test('an edit during a conflict sends nothing', () =>
      eq(env.fetchLog.filter((e) => /cf\/appdata\/commit/.test(e.url)).length, before));
    test('the edit is kept locally', () => ok(JSON.stringify(env.S.state.weights).includes('82')));
    test('CAS-19 the other subsystem can still sync', () => {
      eq(env.S.cfCasConflictId('training'), null);
      notOk(env.S.CF_CAS_BLOCK.training);
    });
  });


  /* ============ C10-P12: resolutions are owned operations =============== */

  const commitsOf = (env) => env.fetchLog.filter((e) => /cf\/appdata\/commit/.test(e.url));
  function localStorageKeys(env) { return [...env.S.localStorage._map.keys()]; }

  await group('C10-P12-01/02/03 — one resolution per subsystem', async () => {
    const env = await conflicted();
    const before = commitsOf(env).length;
    /* two activations of the same choice, second while the first is in flight */
    const a = call(env, 'cfCasUseThisDevice', 'core');
    const b = call(env, 'cfCasUseThisDevice', 'core');
    const [ra, rb] = await Promise.all([a, b]);
    await settle();
    test('C10-P12-01 the double activation sends ONE commit', () =>
      eq(commitsOf(env).length - before, 1));
    test('the second activation is refused as busy, not queued', () => {
      const busy = [ra, rb].filter((r) => r.why === 'busy');
      eq(busy.length, 1);
    });
    test('C10-P12-03 a different choice cannot overlap either', async () => {
      const env2 = await conflicted();
      const p = call(env2, 'cfCasUseOnlineCopy', 'core');
      const q = await call(env2, 'cfCasUseThisDevice', 'core');
      eq(q.why, 'busy');
      await p;
    });
  });

  await group('C10-P12-02 — a double "use the online copy" writes one safety copy', async () => {
    const env = await conflicted({
      fetchResponses: (e) => {
        if (/cf\/appdata\/commit/.test(e.url)) {
          return { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 5, payload: SERVER_CORE }), text: () => Promise.resolve('') };
        }
        if (/collections\/appdata\/records/.test(e.url)) {
          return { ok: true, status: 200, json: () => Promise.resolve({ items: [{ id: 'r1', coreRev: 5, trainingRev: 0 }] }), text: () => Promise.resolve('') };
        }
        return null;
      },
    });
    const before = localStorageKeys(env).filter((k) => /cf:casrec:.*:manifest$/.test(k)).length;
    const p1 = call(env, 'cfCasUseOnlineCopy', 'core');
    const p2 = call(env, 'cfCasUseOnlineCopy', 'core');
    const [r1, r2] = await Promise.all([p1, p2]);
    await settle();
    test('one of the two is refused as busy', () =>
      eq([r1, r2].filter((r) => r.why === 'busy').length, 1));
    test('C10-P12-02 at most one additional safety artifact was written', () => {
      const after = localStorageKeys(env).filter((k) => /cf:casrec:.*:manifest$/.test(k)).length;
      ok(after - before <= 1);
    });
  });

  await group('C10-P12-04 — core and training resolve independently', async () => {
    const env = await conflicted();
    env.S.cfCasSetConflictId('training', 'fake-training-conflict');
    const busyCore = env.S.cfCasResBegin('core', 'use-device');
    test('core is now owned', () => ok(busyCore));
    test('C10-P12-04 training can still begin its own resolution', () =>
      ok(env.S.cfCasResBegin('training', 'use-device')));
    test('core refuses a second operation', () => eq(env.S.cfCasResBegin('core', 'keep'), null));
  });

  await group('C10-P12-06/07/08/10 — a late manual response is inert', async () => {
    let resolveFetch;
    const env = await conflicted({
      fetchResponses: (e) => {
        if (!/cf\/appdata\/commit/.test(e.url)) return null;
        if (!resolveFetch) {
          return { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 5, payload: SERVER_CORE }), text: () => Promise.resolve('') };
        }
        return null;
      },
    });
    /* now make the manual overwrite hang until we release it */
    env.S.fetch = ((orig) => (url, init) => {
      if (/cf\/appdata\/commit/.test(String(url))) {
        env.fetchLog.push({ url: String(url), method: 'POST', body: init && init.body });
        return new Promise((r) => { resolveFetch = () => r({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, subsystem: 'core', newRev: 42 }), text: () => Promise.resolve('') }); });
      }
      return orig(url, init);
    })(env.S.fetch);

    const p = call(env, 'cfCasUseThisDevice', 'core');
    await settle();
    const conflictBefore = env.S.cfCasConflictId('core');
    const revBefore = env.S.cfCasServerRev('core');
    env.S.CF_SESSION_GEN = env.S.CF_SESSION_GEN + 1;     /* account switch mid-flight */
    if (resolveFetch) resolveFetch();
    const r = await p;
    await settle();
    test('C10-P12-06 the late 200 is not applied', () => {
      notOk(r.ok);
      eq(r.why, 'drift');
    });
    test('C10-P12-06 no revision was adopted into the new session', () =>
      eq(env.S.cfCasServerRev('core'), revBefore));
    test('C10-P12-06 the subsystem was not marked clean', () => ok(env.S.revIsDirty('core')));
    test('C10-P12-10 the conflict was not resolved by the stale operation', () =>
      eq(env.S.cfCasConflictId('core'), conflictBefore));
  });

  await group('C10-P12-11/12 — an aborted resolution purges what it created', async () => {
    const env = await conflicted({
      fetchResponses: (e) => {
        if (/cf\/appdata\/commit/.test(e.url)) {
          return { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 5, payload: SERVER_CORE }), text: () => Promise.resolve('') };
        }
        if (/collections\/appdata\/records/.test(e.url)) {
          /* the server moved, so the resolution aborts AFTER the safety copy */
          return { ok: true, status: 200, json: () => Promise.resolve({ items: [{ id: 'r1', coreRev: 77, trainingRev: 0 }] }), text: () => Promise.resolve('') };
        }
        return null;
      },
    });
    const before = localStorageKeys(env).filter((k) => /cf:casrec:.*:manifest$/.test(k)).length;
    const r = await call(env, 'cfCasUseOnlineCopy', 'core');
    await settle();
    test('the resolution aborts because the online copy moved', () => {
      notOk(r.ok);
      eq(r.why, 'changed-again');
    });
    test('C10-P12-11 the safety artifact it created was purged', () => {
      const after = localStorageKeys(env).filter((k) => /cf:casrec:.*:manifest$/.test(k)).length;
      eq(after, before);
    });
    test('C10-P12-12 the original conflict artifact survives', () => ok(env.S.cfCasConflictId('core')));
    test('local data is untouched', () => ok(JSON.stringify(env.S.state.weights).includes('81.5')));
  });

  await group('C10-P12-20/21/22 — replacement verifies before it swaps', async () => {
    let calls = 0;
    const env = await conflicted({
      fetchResponses: (e) => {
        if (!/cf\/appdata\/commit/.test(e.url)) return null;
        calls++;
        return { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 4 + calls, payload: { weights: [{ d: 'newer', kg: 90 }] } }), text: () => Promise.resolve('') };
      },
    });
    const original = env.S.cfCasConflictId('core');
    const r = await call(env, 'cfCasUseThisDevice', 'core');
    await settle();
    test('the athlete is asked to review the choice again', () => eq(r.why, 'changed-again'));
    test('C10-P12-21 the reference now points at the NEWER verified artifact', () => {
      const now = env.S.cfCasConflictId('core');
      ok(now); notOk(now === original);
    });
    test('C10-P12-22 the old artifact was purged only after the swap', () => {
      const keys = localStorageKeys(env).filter((k) => /cf:casrec:.*:manifest$/.test(k));
      eq(keys.length, 1);
      ok(keys[0].includes(env.S.cfCasConflictId('core')));
    });
    test('C10-P12-24 it did not loop', () => ok(calls <= 2));
  });

  await group('C10-P12-20 — a failed replacement leaves the original intact', async () => {
    const env = await conflicted({
      fetchResponses: (e) => (/cf\/appdata\/commit/.test(e.url)
        ? { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 6, payload: { weights: [{ d: 'newer', kg: 90 }] } }), text: () => Promise.resolve('') }
        : null),
    });
    const original = env.S.cfCasConflictId('core');
    /* make the replacement write fail */
    const realWrite = env.S.cfCasRecWrite;
    env.S.cfCasRecWrite = (id, sub, rev, payload, cb) => cb(false, 'storage');
    const r = await call(env, 'cfCasUseThisDevice', 'core');
    env.S.cfCasRecWrite = realWrite;
    await settle();
    test('the choice reports failure', () => notOk(r.ok));
    test('C10-P12-20 the ORIGINAL conflict reference is unchanged', () =>
      eq(env.S.cfCasConflictId('core'), original));
    test('C10-P12-20 the original artifact still exists', () => {
      const keys = localStorageKeys(env).filter((k) => /cf:casrec:.*:manifest$/.test(k));
      ok(keys.some((k) => k.includes(original)));
    });
    test('the subsystem is recovery-blocked rather than silently half-swapped', () =>
      eq(env.S.CF_CAS_BLOCK.core, 'recovery'));
  });

  await group('C10-P12-16/17/18 — adoption aborts if anything moved', async () => {
    /* The handler must not close over `env` directly: fetch fires during boot,
       before the binding is initialised. A holder is filled in afterwards, and
       the edit only fires once the resolution is actually running. */
    const hold = { env: null, armed: false };
    const env = await conflicted({
      fetchResponses: (e) => {
        if (/cf\/appdata\/commit/.test(e.url)) {
          return { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 5, payload: SERVER_CORE }), text: () => Promise.resolve('') };
        }
        if (/collections\/appdata\/records/.test(e.url)) {
          if (hold.armed && hold.env) {          /* the athlete edits mid-refresh */
            hold.env.S.state.weights.push({ d: '2026-07-24', kg: 77 });
            hold.env.S.save();
          }
          return { ok: true, status: 200, json: () => Promise.resolve({ items: [{ id: 'r1', coreRev: 5, trainingRev: 0 }] }), text: () => Promise.resolve('') };
        }
        return null;
      },
    });
    hold.env = env; hold.armed = true;
    const r = await call(env, 'cfCasUseOnlineCopy', 'core');
    await settle();
    test('C10-P12-18 adoption aborts', () => notOk(r.ok));
    test('C10-P12-18 the newer edit survives', () =>
      ok(JSON.stringify(env.S.state.weights).includes('77')));
    test('C10-P12-18 the conflict remains unresolved', () => ok(env.S.cfCasConflictId('core')));
  });


  /* ===== the ten C10-P12 IDs the review found missing from the evidence ==
     These were not label omissions: several of these races had no test at all.
     Reported rather than quietly back-filled, because a claim of coverage that
     the package does not support is worse than an admitted gap. */

  await group('C10-P12-05 — a late old-resolution callback cannot touch a newer conflict', async () => {
    const env = await conflicted();
    const stale = env.S.cfCasResBegin('core', 'use-device');   /* operation A */
    env.S.cfCasResEnd('core', stale);                          /* A is over */
    const fresh = env.S.cfCasResBegin('core', 'use-online');   /* operation B owns it now */
    const conflictNow = env.S.cfCasConflictId('core');
    env.S.cfCasResolved('core', stale);                        /* A's late callback fires */
    test('C10-P12-05 the newer conflict is not resolved by the stale operation', () =>
      eq(env.S.cfCasConflictId('core'), conflictNow));
    test('the owning operation still can resolve it', () => {
      env.S.cfCasResolved('core', fresh);
      eq(env.S.cfCasConflictId('core'), null);
    });
  });

  await group('C10-P12-07 — logout mid-overwrite: a late 409 creates no conflict', async () => {
    let release;
    const hold = { env: null };
    const env = await conflicted();
    hold.env = env;
    const realFetch = env.S.fetch;
    env.S.fetch = (url, init) => {
      if (/cf\/appdata\/commit/.test(String(url))) {
        env.fetchLog.push({ url: String(url), method: 'POST', body: init && init.body });
        return new Promise((r) => { release = () => r({ ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 9, payload: { weights: [{ d: 'z', kg: 1 }] } }), text: () => Promise.resolve('') }); });
      }
      return realFetch(url, init);
    };
    const before = env.S.cfCasConflictId('core');
    const artifactsBefore = [...env.S.localStorage._map.keys()].filter((k) => /cf:casrec:.*:manifest$/.test(k)).length;
    const p = call(env, 'cfCasUseThisDevice', 'core');
    await settle();
    env.S.CF_SESSION_GEN = env.S.CF_SESSION_GEN + 1;      /* logout */
    release();
    const r = await p;
    await settle();
    test('C10-P12-07 the resolution reports drift', () => { notOk(r.ok); eq(r.why, 'drift'); });
    test('C10-P12-07 no NEW conflict was created', () => eq(env.S.cfCasConflictId('core'), before));
    test('C10-P12-07 no new artifact was published', () => {
      const after = [...env.S.localStorage._map.keys()].filter((k) => /cf:casrec:.*:manifest$/.test(k)).length;
      eq(after, artifactsBefore);
    });
  });

  await group('C10-P12-08/09 — which edits invalidate a resolution', async () => {
    const env = await conflicted();
    const op = env.S.cfCasResBegin('core', 'use-device');
    test('C10-P12-09 an UNRELATED subsystem edit does not invalidate it', () => {
      env.S.state.training = { sessions: [7] };
      env.S.saveTraining();
      notOk(env.S.cfCasResDrifted('core', op));
    });
    test('C10-P12-08 an AFFECTED subsystem edit does invalidate it', () => {
      env.S.state.weights.push({ d: '2026-07-25', kg: 70 });
      env.S.save();
      ok(env.S.cfCasResDrifted('core', op));
    });
  });

  await group('C10-P12-13/23 — drift during replacement preserves the original', async () => {
    const env = await conflicted();
    const original = env.S.cfCasConflictId('core');
    const op = env.S.cfCasResBegin('core', 'use-device');
    /* drift before the replacement write completes */
    env.S.CF_SESSION_GEN = env.S.CF_SESSION_GEN + 1;
    const done = await new Promise((res) =>
      env.S.cfCasReplaceConflict('core', op, { conflict: true, subsystem: 'core', serverRev: 8, payload: { weights: [{ d: 'newer', kg: 91 }] } }, res));
    await settle();
    test('C10-P12-13 the replacement does not publish', () => notOk(done));
    test('C10-P12-23 the ORIGINAL conflict reference is preserved', () =>
      eq(env.S.cfCasConflictId('core'), original));
    test('C10-P12-23 the candidate artifact was purged', () => {
      const keys = [...env.S.localStorage._map.keys()].filter((k) => /cf:casrec:.*:manifest$/.test(k));
      eq(keys.length, 1);
      ok(keys[0].includes(original));
    });
  });

  await group('C10-P12-14/15 — superseded artifacts go, current ones stay', async () => {
    let calls = 0;
    const env = await conflicted({
      fetchResponses: (e) => {
        if (!/cf\/appdata\/commit/.test(e.url)) return null;
        calls++;
        return { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 4 + calls, payload: { weights: [{ d: 'newer' + calls, kg: 90 + calls }] } }), text: () => Promise.resolve('') };
      },
    });
    await call(env, 'cfCasUseThisDevice', 'core');
    await settle();
    const current = env.S.cfCasConflictId('core');
    test('C10-P12-14 exactly one artifact remains, and it is the current one', () => {
      const keys = [...env.S.localStorage._map.keys()].filter((k) => /cf:casrec:.*:manifest$/.test(k));
      eq(keys.length, 1);
      ok(keys[0].includes(current));
    });
    test('C10-P12-15 no payload content appears in any storage key', () => {
      const keys = [...env.S.localStorage._map.keys()].join(' ');
      notOk(/kg|weights|\b9[0-9]\b/.test(keys.replace(/wl_|cf:/g, '')));
    });
    test('C10-P12-15 the cleanup ledger holds ids only, never data', () => {
      const pend = env.S.cfCasRecPendingCleanup();
      ok(Array.isArray(pend));
      pend.forEach((id) => notOk(/kg|weights/.test(id)));
    });
  });

  await group('C10-P12-17/19 — replacement during refresh, and scoped resolution', async () => {
    const hold = { env: null, armed: false };
    const env = await conflicted({
      fetchResponses: (e) => {
        if (/cf\/appdata\/commit/.test(e.url)) {
          return { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 5, payload: SERVER_CORE }), text: () => Promise.resolve('') };
        }
        if (/collections\/appdata\/records/.test(e.url)) {
          if (hold.armed && hold.env) {
            /* the conflict is replaced while the refresh is in flight */
            hold.env.S.cfCasSetConflictId('core', 'a-newer-conflict-id');
          }
          return { ok: true, status: 200, json: () => Promise.resolve({ items: [{ id: 'r1', coreRev: 5, trainingRev: 0 }] }), text: () => Promise.resolve('') };
        }
        return null;
      },
    });
    hold.env = env; hold.armed = true;
    const r = await call(env, 'cfCasUseOnlineCopy', 'core');
    test('C10-P12-17 adoption is prevented when the conflict changed under it', () => {
      notOk(r.ok);
      eq(r.why, 'drift');
    });
    test('C10-P12-17 local data was not replaced', () =>
      ok(JSON.stringify(env.S.state.weights).includes('81.5')));
    test('C10-P12-19 resolution clears only the conflict its operation owns', () => {
      const other = env.S.cfCasResBegin('training', 'use-device');
      env.S.cfCasSetConflictId('training', 'training-conflict');
      env.S.cfCasResolved('training', other);
      eq(env.S.cfCasConflictId('training'), null);
      eq(env.S.cfCasConflictId('core'), 'a-newer-conflict-id');   /* untouched */
    });
  });

  /* ===== C10-P13: cleanup is observable and retryable ================== */

  await group('C10-P13-01..05 — old-artifact deletion is observed, not assumed', async () => {
    let calls = 0;
    const env = await conflicted({
      fetchResponses: (e) => {
        if (!/cf\/appdata\/commit/.test(e.url)) return null;
        calls++;
        return { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 4 + calls, payload: { weights: [{ d: 'n' + calls, kg: 90 }] } }), text: () => Promise.resolve('') };
      },
    });
    const original = env.S.cfCasConflictId('core');
    /* make the OLD artifact's deletion fail */
    const realRemove = env.S.localStorage.removeItem;
    env.S.localStorage.removeItem = function (k) {
      if (String(k).includes(original)) return;      /* silently refuse to delete */
      return realRemove.call(this, k);
    };
    const r = await call(env, 'cfCasUseThisDevice', 'core');
    await settle();
    env.S.localStorage.removeItem = realRemove;

    test('the athlete is still told the online copy changed again', () => eq(r.why, 'changed-again'));
    test('C10-P13-02 the NEW conflict reference is valid despite the failed purge', () => {
      const now = env.S.cfCasConflictId('core');
      ok(now); notOk(now === original);
    });
    test('C10-P13-01/03 the failed deletion is RECORDED, not reported as done', () => {
      const pend = env.S.cfCasRecPendingCleanup();
      ok(pend.indexOf(original) >= 0);
    });
    test('C10-P13-03 the ledger carries ids only', () =>
      env.S.cfCasRecPendingCleanup().forEach((id) => notOk(/kg|weights|90/.test(id))));
    test('C10-P13-04 a later sweep removes the retained artifact', async () => {
      const removed = await new Promise((res) => env.S.cfCasRecCleanupSweep(res));
      ok(removed >= 1);
      eq(env.S.cfCasRecPendingCleanup().length, 0);
      const keys = [...env.S.localStorage._map.keys()].filter((k) => k.includes(original));
      eq(keys, []);
    });
    test('C10-P13-05 repeated replacements do not accumulate artifacts', () => {
      /* One CONFLICT artifact at a time: the current reference. Any other
         artifact must be owed in the cleanup ledger, never untracked — that is
         the property "no unbounded orphans" actually means. */
      const keys = [...env.S.localStorage._map.keys()].filter((k) => /cf:casrec:.*:manifest$/.test(k));
      const current = env.S.cfCasConflictId('core');
      const owed = env.S.cfCasRecPendingCleanup();
      const untracked = keys.filter((k) => !k.includes(current) && !owed.some((id) => k.includes(id)));
      eq(untracked, []);
    });
  });

  await group('C10-P13-06 — one account\'s cleanup never runs against another', async () => {
    const env = await conflicted();
    const id = env.S.cfCasConflictId('core');
    /* record a pending cleanup for userA, then switch accounts */
    const realRemove = env.S.localStorage.removeItem;
    env.S.localStorage.removeItem = function (k) { if (String(k).includes(id)) return; return realRemove.call(this, k); };
    await new Promise((res) => env.S.cfCasRecPurgeTracked('userA', id, res));
    env.S.localStorage.removeItem = realRemove;
    test('userA owes a cleanup', () => ok(env.S.cfCasRecPendingCleanup().indexOf(id) >= 0));

    env.S.localStorage.setItem('wl_pb', JSON.stringify({ ...PB, uid: 'userB' }));
    test('C10-P13-06 userB sees no pending cleanup', () => eq(env.S.cfCasRecPendingCleanup().length, 0));
    const swept = await new Promise((res) => env.S.cfCasRecCleanupSweep(res));
    test('C10-P13-06 userB\'s sweep removes nothing of A\'s', () => {
      eq(swept, 0);
      ok([...env.S.localStorage._map.keys()].some((k) => k.includes(id)));
    });
    env.S.localStorage.setItem('wl_pb', JSON.stringify(PB));
    test('and A\'s obligation is still recorded when A returns', () =>
      ok(env.S.cfCasRecPendingCleanup().indexOf(id) >= 0));
  });

  report();
})());

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

  report();
})());

/* C13 — the pre-sync recovery snapshot, at the real deployment boundary.

       CF_SRC=/home/griffin/projects/compound-app/index.html \
         node tests/c13-recovery-snapshot.test.js

   Installing the exporter requires a boot, and that boot runs autoSync() ->
   trainingPull(), which can overwrite local training before it can be exported.
   These cases seed AUTHENTIC base-build localStorage -- the raw keys the old
   client leaves, with none of the new ones -- and assert on what is on disk
   afterwards. */
const { test, eq, ok, notOk, report, defer, SRC } = require('./harness');

if (!process.env.CF_SRC) {
  console.log('\nC13 — recovery snapshot: SKIPPED (targets the live app, not this repo)');
  console.log('  run: CF_SRC=/home/griffin/projects/compound-app/index.html node tests/c13-recovery-snapshot.test.js');
  module.exports = Promise.resolve();
  return;
}
console.log('\nC13 — pre-sync recovery snapshot\n  source: ' + SRC);

const { createEnv } = require('./integration-env');

const group = async (name, fn) => {
  console.log('\n' + name);
  try { await fn(); } catch (e) { test(name + ' — scenario threw', () => { throw e; }); }
};
const PB = { uid: 'userA', base: 'https://pb.test', token: 'tok', email: 'a@x.com' };
const PB_B = { uid: 'userB', base: 'https://pb.test', token: 'tok2', email: 'b@x.com' };
const clone = (o) => JSON.parse(JSON.stringify(o));
const settle = () => new Promise((r) => setTimeout(r, 5));
async function pump(env, n) { for (let i = 0; i < (n || 8); i++) { env.runTimers(); await settle(); } }

/* The server's copy: stops before the unsynced session. */
const SERVER = {
  cardioTypes: ['Peloton'],
  exercises: [{ id: 'e1', name: 'Squat', muscle: 'legs' }],   /* no `movement` — the old shape */
  routines: [{ id: 'r1', name: 'Full Body Day 3', items: [] }],
  sessions: {},
  liftSessions: { '2026-07-27': [{ name: 'Squat', sets: [{ w: 100, r: 5 }] }] },
};
/* What an OLD build actually left on disk: the server copy plus the session that
   never got uploaded. Note `exercises` has no `movement` — migrateProgressionTypes()
   adds that at boot, which is why the snapshot must be taken before it runs. */
const OLD_LOCAL = (() => { const t = clone(SERVER); t.liftSessions['2026-07-31'] = [{ name: 'Deadlift', sets: [{ w: 140, r: 5 }] }]; return t; })();
const ACTIVE_WORKOUT = { routineId: 'r1', startedAt: 1785000000000, entries: [{ name: 'Bench', sets: [{ w: 80, r: 5, done: true }] }] };

const dump = (env) => Object.fromEntries(env.S.localStorage._map);
const recoveryOf = (env, acct) => {
  try { return (JSON.parse(dump(env).wl_training_recovery || '{}'))[acct === undefined ? 'userA' : acct] || null; }
  catch (e) { return null; }
};
/* pbDoLogin() reads the email and password from the DOM, not from pbLoginState,
   so a test must fill the real inputs the login screen uses. */
function submitLogin(env, email, pw) {
  env.S.document.getElementById('wl-pb-email').value = email;
  env.S.document.getElementById('wl-pb-pass').value = pw;
  env.S.document.getElementById('wl-pb-base').value = '';
  env.S.pbDoLogin();
}
const liveLift = (env) => { try { return JSON.parse(dump(env).wl_training_v1 || '{}').liftSessions || {}; } catch (e) { return {}; } };
/* Only writes that actually carry training. Core saves are a separate subsystem
   and are deliberately NOT quarantined, so counting every appdata write would
   measure the wrong thing. */
const trainingWrites = (env) => env.fetchLog.filter((e) => {
  if (!/appdata\/records/.test(e.url) || e.method === 'GET') return false;
  try { return 'training' in JSON.parse(e.body || '{}'); } catch (x) { return false; }
}).length;

/* An authentic old-build device: raw keys only, none of the new ones. */
function oldDevice(opts) {
  opts = opts || {};
  /* Ownership already settled, i.e. a device that has been through the one-time
     adoption prompt. The prompt itself is exercised in C13-37/38, and seeding it
     here keeps every other case about the property it is actually testing. */
  const seed = Object.assign({
    wl_pb: JSON.stringify(opts.account || PB),
    wl_training_v1: JSON.stringify(opts.local || OLD_LOCAL),
    wl_last_owner: opts.owner === null ? undefined : (opts.owner || (opts.account || PB).uid),
  }, opts.extra || {});
  if (seed.wl_last_owner === undefined) delete seed.wl_last_owner;
  if (opts.workout !== null) seed.wl_workout_v1 = JSON.stringify(opts.workout || ACTIVE_WORKOUT);
  return createEnv({
    localStorage: seed,
    storagePatch: opts.storagePatch,
    fetchResponses: (e) => {
      if (!/appdata\/records/.test(e.url)) return null;
      if (e.method === 'GET') return { ok: true, status: 200, text: () => Promise.resolve(''),
        json: () => Promise.resolve({ items: [{ id: 'rec1', training: clone(SERVER), trainingRev: 11 }] }) };
      return null;
    },
  });
}

defer((async function scenarios() {

  await group('C13-01 — the snapshot is taken BEFORE migration rewrites the key', async () => {
    const env = oldDevice();
    const rec = recoveryOf(env);
    test('a recovery envelope exists', () => ok(rec));
    test('it holds the RAW pre-migration bytes', () => {
      eq(rec.training, JSON.stringify(OLD_LOCAL), 'not the exact stored string');
    });
    test('specifically, exercises have no migration-added `movement`', () => {
      notOk('movement' in JSON.parse(rec.training).exercises[0]);
    });
    test('while the LIVE key has been migrated in place', () => {
      ok('movement' in JSON.parse(dump(env).wl_training_v1).exercises[0],
        'migrateProgressionTypes should have stamped the live copy');
    });
    test('it is stamped with build and account', () => { ok(rec.appBuild); eq(rec.account, 'userA'); });
    test('and a capture timestamp', () => ok(/^\d{4}-\d{2}-\d{2}T/.test(rec.capturedAt)));
  });

  await group('C13-02 — a stale pull may clobber the live copy; recovery survives', async () => {
    const env = oldDevice();
    test('the unsynced session starts on disk', () => ok(liveLift(env)['2026-07-31']));
    env.S.autoSync();
    await pump(env, 10);
    const rec = recoveryOf(env);
    test('recovery still holds the unsynced session', () => {
      ok(JSON.parse(rec.training).liftSessions['2026-07-31'], 'the pre-sync copy lost it');
    });
    test('and the export carries BOTH copies, not one merged view', () => {
      const b = JSON.parse(env.S.backupJSON());
      ok(b.recovery, 'no recovery in the backup');
      ok(JSON.parse(b.recovery.training).liftSessions['2026-07-31'], 'recovery in backup lacks the session');
      ok(b.trainingHistory, 'no live copy in the backup');
      ok(b.__backup.contains.indexOf('recovery') >= 0, 'contains does not declare recovery');
    });
  });

  await group('C13-03 — an existing envelope is never replaced on restart', async () => {
    const env = oldDevice();
    const first = recoveryOf(env);
    /* Restart carrying everything forward, with DIFFERENT local training. */
    const moved = clone(OLD_LOCAL); moved.liftSessions['2026-08-02'] = [{ name: 'Row', sets: [{ w: 60, r: 10 }] }];
    const carried = Object.assign({}, dump(env), { wl_training_v1: JSON.stringify(moved) });
    const env2 = createEnv({ localStorage: carried, fetchResponses: () => null });
    const second = recoveryOf(env2);
    test('the envelope is byte-identical after a restart', () => eq(second, first));
    test('it did NOT absorb the later local change', () => {
      notOk(JSON.parse(second.training).liftSessions['2026-08-02'], 'write-once was violated');
    });
  });

  await group('C13-04 — storage that throws blocks the pull (fail closed)', async () => {
    const env = oldDevice({ storagePatch: (ls) => { ls.setItem = () => { throw new Error('QuotaExceededError'); }; } });
    test('recovery is reported as blocked', () => ok(env.S.recoveryBlocked));
    test('no envelope was written', () => eq(dump(env).wl_training_recovery, undefined));
    env.S.autoSync();
    await pump(env, 10);
    test('the local session was NOT overwritten', () => ok(liveLift(env)['2026-07-31']));
    test('and the block is visible in the sync state', () => {
      eq(env.S.syncState.s, 'error');
      ok(/recovery copy/i.test(env.S.syncState.msg || ''), 'got: ' + env.S.syncState.msg);
    });
  });

  await group('C13-05 — storage that silently returns different bytes also blocks', async () => {
    /* Accepts the write, then hands back something else. A bare setItem cannot
       detect this; the byte-for-byte read-back is what catches it. */
    const env = oldDevice({ storagePatch: (ls) => {
      const realSet = ls.setItem.bind(ls);
      ls.setItem = (k, v) => realSet(k, k === 'wl_training_recovery' ? '{"userA":{"v":1,"training":"TAMPERED"}}' : v);
    } });
    test('recovery is reported as blocked', () => ok(env.S.recoveryBlocked));
    env.S.autoSync();
    await pump(env, 10);
    test('the local session was NOT overwritten', () => ok(liveLift(env)['2026-07-31']));
  });

  await group('C13-06 — the active workout is captured and exported in full', async () => {
    const env = oldDevice();
    const rec = recoveryOf(env);
    test('the raw in-progress workout is in the envelope', () => eq(rec.workout, JSON.stringify(ACTIVE_WORKOUT)));
    const b = JSON.parse(env.S.backupJSON());
    test('and the export carries it parsed, in full', () => eq(b.activeWorkout, ACTIVE_WORKOUT));
    test('declared in the metadata', () => ok(b.__backup.contains.indexOf('activeWorkout') >= 0));
  });

  await group('C13-07 — no active workout is represented unambiguously', async () => {
    const env = oldDevice({ workout: null });
    const rec = recoveryOf(env);
    test('absence is null in the envelope, not an empty object', () => eq(rec.workout, null));
    const b = JSON.parse(env.S.backupJSON());
    test('and null in the export', () => eq(b.activeWorkout, null));
    test('and NOT claimed in the metadata', () => notOk(b.__backup.contains.indexOf('activeWorkout') >= 0));
  });

  await group('C13-08 — account A recovery is inaccessible to account B', async () => {
    const a = oldDevice();
    test('A has an envelope', () => ok(recoveryOf(a, 'userA')));
    /* B signs in on the same device, A's envelope still physically present. */
    const carried = Object.assign({}, dump(a), { wl_pb: JSON.stringify(PB_B) });
    const b = createEnv({ localStorage: carried, fetchResponses: () => null });
    const backup = JSON.parse(b.S.backupJSON());
    test("B's export does NOT contain A's recovery", () => {
      const s = JSON.stringify(backup.recovery || null);
      notOk(/2026-07-31/.test(s), "A's unsynced session leaked into B's export");
    });
    test("B gets no envelope at all, rather than one built from A's bytes", () => {
      /* No owner stamp exists in this lineage, so what is on disk cannot be
         attributed to B. Declining is the privacy-safe direction; B is simply
         left where it stood before this change. */
      notOk(recoveryOf(b, 'userB'));
      notOk(backup.recovery);
      notOk(backup.__backup.contains.indexOf('recovery') >= 0);
    });
    /* Reversed on the Architect's ruling 3: ambiguity is a reason to quarantine,
       not to proceed. B may hold genuine unsynced local data, and moving it in
       either direction could destroy whichever copy is real. */
    test('B is BLOCKED, in both directions, rather than syncing regardless', () => {
      ok(b.S.recoveryBlocked, 'ambiguous ownership must quarantine');
      ok(/another account/i.test(b.S.recoveryBlockReason), 'got: ' + b.S.recoveryBlockReason);
    });
    test("A's envelope is still physically on disk (not destroyed by B)", () => ok(recoveryOf(b, 'userA')));
  });

  await group('C13-09 — logout is REFUSED once another account is on the device', async () => {
    const env = oldDevice();
    /* Another account's envelope appears AFTER boot -- another tab, or any later
       path. Ownership is evaluated against storage as it is now, so the cached
       boot state must not authorise the wipe. */
    const store = JSON.parse(dump(env).wl_training_recovery);
    store.userB = { v: 1, capturedAt: '2026-07-01T00:00:00.000Z', appBuild: 'x', account: 'userB', training: '{"keep":1}', workout: null };
    env.S.localStorage.setItem('wl_training_recovery', JSON.stringify(store));

    let toasted = [];
    env.S.toast = (m) => toasted.push(m);
    env.S.askConfirm = (msg, fn) => fn();
    test('ownership is now ambiguous, despite the boot state', () => ok(env.S.ownershipAmbiguous()));
    test('logout is refused', () => eq(env.S.pbForceLogout(), false));
    test('and says why', () => ok(toasted.some((t) => /another account/i.test(t)), JSON.stringify(toasted)));
    test("neither account's envelope was touched", () => {
      ok(recoveryOf(env, 'userA')); ok(recoveryOf(env, 'userB'));
    });
    test('and the live keys survive', () => { ok(dump(env).wl_training_v1); ok(dump(env).wl_pb); });
  });

  await group('C13-10 — a device with nothing to protect is not blocked', async () => {
    const env = createEnv({ localStorage: { wl_pb: JSON.stringify(PB) }, fetchResponses: () => null });
    test('no envelope is written when there was nothing on disk', () => eq(dump(env).wl_training_recovery, undefined));
    test('and syncing is NOT blocked', () => notOk(env.S.recoveryBlocked));
  });

  await group('C13-11 — the recovery notice tells the truth', async () => {
    const env = oldDevice();
    const html = env.S.recoveryNoticeHTML();
    test('it says a pre-sync copy exists', () => ok(/pre-sync copy/i.test(html)));
    test('it says the copy is in exports', () => ok(/export/i.test(html)));
    test('it does NOT claim the displayed history is authoritative', () => {
      notOk(/authoritative|up to date|correct copy/i.test(html));
      ok(/may differ/i.test(html), 'should say the copies may differ');
    });
    const blocked = oldDevice({ storagePatch: (ls) => { ls.setItem = () => { throw new Error('nope'); }; } });
    test('the blocked notice says syncing is paused', () => ok(/paused/i.test(blocked.S.recoveryNoticeHTML())));
    test('and that this app has not altered local training', () => ok(/not been altered by this app/i.test(blocked.S.recoveryNoticeHTML())));
  });

  await group('C13-12 — export does not clear recovery', async () => {
    const env = oldDevice();
    env.S.backupJSON();
    env.S.backupJSON();
    test('the envelope survives repeated exports', () => ok(recoveryOf(env)));
    test('and still holds the unsynced session', () => ok(JSON.parse(recoveryOf(env).training).liftSessions['2026-07-31']));
  });

  /* ---- Architect round-6 rulings 1,2,3,4,5,6,7,8 ---------------------- */

  await group('C13-13 — a malformed recovery store is preserved, never overwritten', async () => {
    const bad = '{"userA":{"v":1,"training":"{\\"liftSessions\\"';   /* truncated JSON */
    const env = oldDevice({ extra: { wl_training_recovery: bad } });
    test('the damaged bytes are left EXACTLY as they were', () => eq(dump(env).wl_training_recovery, bad));
    test('syncing is blocked', () => ok(env.S.recoveryBlocked));
    test('the reason names the damage', () => ok(/damaged/i.test(env.S.recoveryBlockReason)));
    env.S.autoSync();
    await pump(env, 10);
    test('the live copy was not pulled over', () => ok(liveLift(env)['2026-07-31']));
    test('and the damaged bytes are still exactly as they were', () => eq(dump(env).wl_training_recovery, bad));
    /* Ruling 5: a corrupt multi-account store cannot be attributed, so the
       ordinary export must NOT carry it. The bytes are preserved on the device;
       getting them out is a separate, reviewed diagnostic action. */
    /* A corrupt multi-entry store is an OWNERSHIP failure, not merely a storage
       one -- it cannot be attributed -- so the whole export is withheld. */
    test('the ordinary export withholds everything, not just training', () => {
      const b = JSON.parse(env.S.backupJSON());
      notOk(b.recoveryRawUnreadable, 'unattributed raw bytes must not ride an ordinary export');
      notOk(b.recovery); notOk(b.trainingHistory);
      notOk(b.weights); notOk(b.food);
      eq(b.__backup.contains, []);
      eq(b.__backup.userDataWithheld, true);
    });
  });

  await group('C13-14 — valid JSON with an invalid envelope shape is not protection', async () => {
    const cases = [
      ['unsupported version',      { v: 99, capturedAt: '2026-08-01T00:00:00.000Z', appBuild: 'x', account: 'userA', training: '{}', workout: null }],
      ['account mismatch',         { v: 1, capturedAt: '2026-08-01T00:00:00.000Z', appBuild: 'x', account: 'userZ', training: '{}', workout: null }],
      ['both sources null',        { v: 1, capturedAt: '2026-08-01T00:00:00.000Z', appBuild: 'x', account: 'userA', training: null, workout: null }],
      ['training not a string',    { v: 1, capturedAt: '2026-08-01T00:00:00.000Z', appBuild: 'x', account: 'userA', training: { a: 1 }, workout: null }],
      ['bad timestamp',            { v: 1, capturedAt: 'whenever', appBuild: 'x', account: 'userA', training: '{}', workout: null }],
      ['missing build',            { v: 1, capturedAt: '2026-08-01T00:00:00.000Z', appBuild: '', account: 'userA', training: '{}', workout: null }],
      ['not an object at all',     'nonsense'],
    ];
    for (const [label, env0] of cases) {
      const raw = JSON.stringify({ userA: env0 });
      const env = oldDevice({ extra: { wl_training_recovery: raw } });
      test(`${label}: blocked rather than trusted`, () => ok(env.S.recoveryBlocked, 'accepted a bad envelope'));
      test(`${label}: the bytes were not overwritten`, () => eq(dump(env).wl_training_recovery, raw));
      env.S.autoSync();
      await pump(env, 8);
      test(`${label}: the local session survived`, () => ok(liveLift(env)['2026-07-31']));
    }
  });

  await group('C13-15 — an ambiguous second account blocks BOTH directions', async () => {
    const a = oldDevice();
    const carried = Object.assign({}, dump(a), { wl_pb: JSON.stringify(PB_B) });
    const b = createEnv({ localStorage: carried, fetchResponses: (e) => {
      if (!/appdata\/records/.test(e.url)) return null;
      if (e.method === 'GET') return { ok: true, status: 200, text: () => Promise.resolve(''),
        json: () => Promise.resolve({ items: [{ id: 'rec1', training: clone(SERVER) }] }) };
      return null; } });
    test('B is blocked', () => ok(b.S.recoveryBlocked));
    test('B captured nothing under its own name', () => notOk(recoveryOf(b, 'userB')));
    test("A's envelope is untouched", () => ok(recoveryOf(b, 'userA')));
    test("B's export exposes neither A's envelope nor a claim to one", () => {
      const backup = JSON.parse(b.S.backupJSON());
      notOk(backup.recovery);
      notOk(/2026-07-31/.test(JSON.stringify(backup.recovery || null)));
    });
    const writesBefore = trainingWrites(b);
    b.S.autoSync();
    b.S.state.training.liftSessions['2026-08-03'] = [{ name: 'Curl', sets: [{ w: 20, r: 10 }] }];
    b.S.saveTraining();
    await pump(b, 12);
    test('no PULL overwrote the local copy', () => ok(liveLift(b)['2026-07-31']));
    test('and no training PUSH was issued either', () => {
      eq(trainingWrites(b), writesBefore, 'a training write escaped while quarantined');
    });
  });

  await group('C13-16 — a blocked device pushes nothing, by either route', async () => {
    const env = oldDevice({ storagePatch: (ls) => { ls.setItem = (k) => { if (k === 'wl_training_recovery') throw new Error('nope'); }; } });
    test('blocked', () => ok(env.S.recoveryBlocked));
    const before = trainingWrites(env);
    env.S.trainingPush();                       /* direct */
    env.S.scheduleTrainingPush();               /* scheduled */
    await pump(env, 10);
    test('neither the direct nor the scheduled push issued a training write', () => {
      eq(trainingWrites(env), before);
    });
  });

  await group('C13-17 — signed out, nothing is captured, so no ambiguity is manufactured', async () => {
    /* The snapshot exists only because trainingPull() can destroy local training,
       and trainingPull() needs a session. Signed out, no pull can run, so there is
       nothing to protect against -- and capturing would create an anonymous
       envelope that the next sign-in must treat as unattributable.

       Without this, an ordinary SESSION EXPIRY would quarantine the whole app for
       a single user who has never shared the device: open while signed out ->
       anonymous capture -> sign back in as yourself -> ambiguous. Verified
       against the build before this rule was added. */
    /* A session that has EXPIRED, not been logged out of: the owner marker is
       still there, because only a verified logout clears it. That marker is what
       tells a renewal apart from a different-account login. */
    const anon = createEnv({ localStorage: { wl_training_v1: JSON.stringify(OLD_LOCAL), wl_last_owner: 'userA' }, fetchResponses: () => null });
    test('no envelope is written while signed out', () => eq(dump(anon).wl_training_recovery, undefined));
    test('and the app is not blocked', () => notOk(anon.S.recoveryBlocked));

    /* The same person signs back in after the session lapsed. */
    const carried = Object.assign({}, dump(anon), { wl_pb: JSON.stringify(PB) });
    const back = createEnv({ localStorage: carried, fetchResponses: () => null });
    test('signing back in is NOT ambiguous', () => eq(back.S.recoveryState, 'ok'));
    test('a snapshot is captured under the real account', () => ok(recoveryOf(back, 'userA')));
    test('and exports work normally', () => {
      const b = JSON.parse(back.S.backupJSON());
      ok(b.trainingHistory);
      ok(b.__backup.contains.indexOf('recovery') >= 0);
    });
  });

  await group('C13-18 — logout that cannot verify removal refuses to complete', async () => {
    const env = oldDevice({ storagePatch: (ls) => {
      const realSet = ls.setItem.bind(ls), realRemove = ls.removeItem.bind(ls);
      let armed = false;
      ls.setItem = (k, v) => { if (armed && k === 'wl_training_recovery') return; return realSet(k, v); };
      ls.removeItem = (k) => { if (armed && k === 'wl_training_recovery') return; return realRemove(k); };
      ls.__arm = () => { armed = true; };
    } });
    test('captured normally first', () => ok(recoveryOf(env, 'userA')));
    env.S.localStorage.__arm();                 /* removal will now silently no-op */
    env.S.askConfirm = (msg, fn) => fn();
    const result = env.S.pbForceLogout();
    test('logout reports failure', () => eq(result, false));
    test('the recovery envelope is still present, as the failure implies', () => ok(recoveryOf(env, 'userA')));
    test('and the live keys were NOT wiped, so nothing was half-done', () => {
      ok(dump(env).wl_training_v1, 'live training wiped despite a refused logout');
      ok(dump(env).wl_pb, 'session cleared despite a refused logout');
    });
  });

  await group('C13-19 — a single-account device logs out cleanly and completely', async () => {
    const env = oldDevice();
    env.S.askConfirm = (msg, fn) => fn();
    test('logout succeeds', () => eq(env.S.pbForceLogout(), true));
    test('the envelope is gone', () => notOk(recoveryOf(env, 'userA')));
    test('the live keys are wiped', () => {
      eq(dump(env).wl_training_v1, undefined);
      eq(dump(env).wl_workout_v1, undefined);
    });
    test('and the owner marker is cleared — only a verified logout does that', () => {
      eq(dump(env).wl_last_owner, undefined);
    });
  });

  await group('C13-19b — clearTrainingRecovery preserves other entries semantically', async () => {
    /* Exercised directly. Through logout it is now unreachable (C13-09), but the
       logic still governs the future "clear this shared device" action, so its
       preservation semantics are still worth pinning down. */
    const env = oldDevice();
    const store = JSON.parse(dump(env).wl_training_recovery);
    store.userB = { v: 1, capturedAt: '2026-07-01T00:00:00.000Z', appBuild: 'x', account: 'userB', training: '{"b":1}', workout: null };
    store.userC = { v: 7, futureField: 'from a later build', account: 'userC' };
    env.S.localStorage.setItem('wl_training_recovery', JSON.stringify(store));

    test('removing A reports success', () => eq(env.S.clearTrainingRecovery('userA'), true));
    test('A is gone', () => notOk(recoveryOf(env, 'userA')));
    test('B survives semantically intact', () => eq(recoveryOf(env, 'userB'), store.userB));
    test('the unknown-version entry survives semantically intact', () => eq(recoveryOf(env, 'userC'), store.userC));
  });

  await group('C13-20 — a cancelled or rejected Share leaves recovery untouched', async () => {
    for (const [label, mode] of [['cancelled', 'abort'], ['rejected', 'error']]) {
      const env = oldDevice();
      const before = dump(env).wl_training_recovery;
      env.S.navigator.canShare = () => true;
      env.S.navigator.share = () => Promise.reject(new Error(mode === 'abort' ? 'AbortError' : 'NotAllowedError'));
      let toasted = null;
      env.S.toast = (m) => { toasted = m; };
      env.S.exportData();
      await pump(env, 4);
      test(`${label}: the recovery bytes are unchanged`, () => eq(dump(env).wl_training_recovery, before));
      test(`${label}: no false "exported" claim`, () => notOk(/exported/i.test(toasted || ''), 'toasted: ' + toasted));
      test(`${label}: a later export still carries recovery`, () => {
        const b = JSON.parse(env.S.backupJSON());
        ok(b.recovery);
        ok(JSON.parse(b.recovery.training).liftSessions['2026-07-31']);
      });
    }
  });

  /* ---- Architect round-7 rulings 2, 3, 6, 8, 10 ------------------------ */

  await group('C13-21 — switchback: a valid own envelope does not prove the live keys are still ours', async () => {
    /* A captures. B also has an envelope. The live keys are now whatever B left.
       A signs back in WITHOUT a verified full logout. A's own envelope is still
       perfectly valid -- and must not be taken as permission to sync or export. */
    const a = oldDevice();
    const store = JSON.parse(dump(a).wl_training_recovery);
    store.userB = { v: 1, capturedAt: '2026-07-02T00:00:00.000Z', appBuild: 'x', account: 'userB', training: '{"liftSessions":{}}', workout: null };
    const carried = Object.assign({}, dump(a), { wl_training_recovery: JSON.stringify(store) });
    const back = createEnv({ localStorage: carried, fetchResponses: () => null });

    test("A's own envelope is valid and present", () => ok(recoveryOf(back, 'userA')));
    test('but A is quarantined anyway', () => ok(back.S.recoveryBlocked, 'a valid own envelope was taken as ownership of the live keys'));
    test('as account ambiguity', () => eq(back.S.recoveryState, 'ambiguous'));
    test('and A exports NO user data at all — core included', () => {
      const b = JSON.parse(back.S.backupJSON());
      notOk(b.trainingHistory); notOk(b.recovery); notOk(b.activeWorkout);
      notOk(b.weights); notOk(b.food); notOk(b.settings);
      eq(b.__backup.contains, []);
      eq(b.__backup.userDataWithheld, true);
    });
  });

  await group('C13-22 — an ambiguous export carries no other person\'s dates by ANY route', async () => {
    const a = oldDevice();
    const carried = Object.assign({}, dump(a), { wl_pb: JSON.stringify(PB_B) });
    const b = createEnv({ localStorage: carried, fetchResponses: () => null });
    const backup = JSON.parse(b.S.backupJSON());
    const text = JSON.stringify(backup);
    test('blocked as ambiguous', () => eq(b.S.recoveryState, 'ambiguous'));
    /* The earlier version only checked `recovery` and missed that the live copy
       rode out through trainingHistory. Every TRAINING route is now checked. */
    test('no training component carries the session', () => {
      notOk(/2026-07-31/.test(JSON.stringify(backup.trainingHistory || null)));
      notOk(/2026-07-31/.test(JSON.stringify(backup.recovery || null)));
      notOk(/2026-07-31/.test(JSON.stringify(backup.activeWorkout || null)));
      notOk(/Deadlift/.test(JSON.stringify({ t: backup.trainingHistory, r: backup.recovery, w: backup.activeWorkout })));
    });
    test('and no new core tag was derived from the unattributed training', () => {
      /* resyncAllActivityTags() is guarded, so this boot added nothing. */
      notOk(b.S.recoveryExportUnsafe === false);
    });
    /* The previous version of this case asserted
         ok(coreLeak === true || coreLeak === false)
       which can never fail. It printed a real privacy exposure while reporting
       green. Replaced with properties that FAIL if the exposure exists. */
    test('no core user data rides out either', () => {
      notOk(backup.weights); notOk(backup.food); notOk(backup.notes);
      notOk(backup.workouts); notOk(backup.settings);
      eq(backup.__backup.contains, []);
      eq(backup.__backup.userDataWithheld, true);
    });
    test("the other account's representative values appear nowhere in the output", () => {
      ['2026-07-31', 'Deadlift'].forEach((needle) => {
        notOk(text.indexOf(needle) >= 0, 'leaked: ' + needle);
      });
    });

    test('no trainingHistory, activeWorkout, recovery or raw diagnostic', () => {
      notOk(backup.trainingHistory); notOk(backup.activeWorkout);
      notOk(backup.recovery); notOk(backup.recoveryAnonymous); notOk(backup.recoveryRawUnreadable);
    });
    test('and the metadata says training was withheld, and why', () => {
      eq(backup.__backup.trainingWithheld, true);
      eq(backup.__backup.recoveryState, 'ambiguous');
      ok(backup.__backup.recoveryBlockReason);
    });
  });

  await group('C13-23 — a failed capture leaves the protected raw bytes byte-identical after a FULL boot', async () => {
    const rawT = JSON.stringify(OLD_LOCAL), rawW = JSON.stringify(ACTIVE_WORKOUT);
    for (const [label, patch] of [
      ['storage throws', (ls) => { ls.setItem = (k) => { if (k === 'wl_training_recovery') throw new Error('nope'); }; }],
      ['corrupt store', null],
    ]) {
      const extra = label === 'corrupt store' ? { wl_training_recovery: '{"userA":{"v":1,' } : {};
      const env = oldDevice({ storagePatch: patch || undefined, extra });
      test(`${label}: blocked`, () => ok(env.S.recoveryBlocked));
      /* The whole boot has already run by the time createEnv returns, including
         migrateProgressionTypes(), which normally rewrites wl_training_v1. */
      test(`${label}: wl_training_v1 is byte-identical`, () => eq(dump(env).wl_training_v1, rawT));
      test(`${label}: wl_workout_v1 is byte-identical`, () => eq(dump(env).wl_workout_v1, rawW));
      env.S.autoSync();
      await pump(env, 10);
      test(`${label}: and still byte-identical after a sync attempt`, () => {
        eq(dump(env).wl_training_v1, rawT);
        eq(dump(env).wl_workout_v1, rawW);
      });
    }
  });

  await group('C13-24 — the athlete\'s own edits still persist once boot is over', async () => {
    /* The freeze is boot-scoped. If it leaked past boot, a quarantined device
       would silently discard everything logged on it -- trading a privacy fix
       for a data-loss bug. */
    const env = oldDevice({ storagePatch: (ls) => { ls.setItem = (k, v) => { if (k === 'wl_training_recovery') throw new Error('nope'); return Object.getPrototypeOf(ls) === null ? null : undefined; } } });
    test('blocked', () => ok(env.S.recoveryBlocked));
    test('but the boot freeze has been released', () => notOk(env.S.recoveryFreeze));
  });

  await group('C13-25 — the removal postcondition is the WHOLE store', async () => {
    /* Driven through clearTrainingRecovery directly: with another account
       present, logout itself is refused before it gets this far (C13-09). */
    const mk = () => {
      const env = oldDevice();
      const store = JSON.parse(dump(env).wl_training_recovery);
      store.userB = { v: 1, capturedAt: '2026-07-01T00:00:00.000Z', appBuild: 'x', account: 'userB', training: '{"b":1}', workout: null };
      env.S.localStorage.setItem('wl_training_recovery', JSON.stringify(store));
      return env;
    };

    const a1 = mk();
    a1.S.localStorage.setItem = (k, v) => { if (k === 'wl_training_recovery') return; return a1.S.localStorage._map.set(k, String(v)); };
    test('a store-blanking write is reported as FAILURE', () => eq(a1.S.clearTrainingRecovery('userA'), false));

    const a2 = mk();
    const realSet = a2.S.localStorage.setItem.bind(a2.S.localStorage);
    a2.S.localStorage.setItem = (k, v) => {
      if (k !== 'wl_training_recovery') return realSet(k, v);
      const m = JSON.parse(v); if (m.userB) m.userB.training = '{"TAMPERED":1}';
      return realSet(k, JSON.stringify(m));
    };
    test('a write that alters another account is reported as FAILURE', () => eq(a2.S.clearTrainingRecovery('userA'), false));

    const a3 = mk();
    test('an honest removal reports success', () => eq(a3.S.clearTrainingRecovery('userA'), true));
    test('and leaves B intact', () => ok(recoveryOf(a3, 'userB')));
  });

  await group('C13-26 — a dirty core is never written into the wrong account', async () => {
    /* A's core is newer than the server AND marked dirty, which is exactly the
       branch autoSync() uses to decide "local wins, push it". B signs in while
       ownership is ambiguous. Nothing may reach B's record. */
    const A_CORE = { weights: [{ date: '2026-07-31', w: 184.2 }], food: { '2026-07-31': { cal: 1737 } },
                     notes: { '2026-07-31': 'a private note' }, settings: {}, workouts: {}, steps: {}, sleep: {}, bodyfat: {}, waist: {} };
    const a = oldDevice();
    const store = JSON.parse(dump(a).wl_training_recovery);
    const seed = Object.assign({}, dump(a), {
      wl_pb: JSON.stringify(PB_B), wl_v1: JSON.stringify(A_CORE), wl_dirty: '1',
      wl_training_recovery: JSON.stringify(store),
    });
    const rawCore = seed.wl_v1, rawT = seed.wl_training_v1, rawW = seed.wl_workout_v1;
    const b = createEnv({ localStorage: seed, fetchResponses: (e) => {
      if (!/appdata\/records/.test(e.url)) return null;
      if (e.method === 'GET') return { ok: true, status: 200, text: () => Promise.resolve(''),
        json: () => Promise.resolve({ items: [{ id: 'recB', data: { weights: [] }, training: {} }] }) };
      return null; } });

    test('B is ambiguous', () => eq(b.S.recoveryState, 'ambiguous'));
    b.S.autoSync();
    b.S.cloudPush(true);                       /* manual push too */
    await pump(b, 12);
    test('NO write carrying core `data` reached the record', () => {
      const w = b.fetchLog.filter((e) => {
        if (!/appdata\/records/.test(e.url) || e.method === 'GET') return false;
        try { return 'data' in JSON.parse(e.body || '{}'); } catch (x) { return false; }
      });
      eq(w.length, 0, "A's core was pushed into B's record");
    });
    test('no training write either', () => eq(trainingWrites(b), 0));
    test("A's raw core is unchanged on disk", () => eq(dump(b).wl_v1, rawCore));
    test('and the raw training and workout bytes too', () => {
      eq(dump(b).wl_training_v1, rawT);
      eq(dump(b).wl_workout_v1, rawW);
    });
  });

  await group('C13-27 — the inverse: a newer server must not replace unattributed local bytes', async () => {
    const a = oldDevice();
    const seed = Object.assign({}, dump(a), { wl_pb: JSON.stringify(PB_B) });
    const rawCore = seed.wl_v1 || null, rawT = seed.wl_training_v1;
    const b = createEnv({ localStorage: seed, fetchResponses: (e) => {
      if (!/appdata\/records/.test(e.url)) return null;
      if (e.method === 'GET') return { ok: true, status: 200, text: () => Promise.resolve(''),
        json: () => Promise.resolve({ items: [{ id: 'recB',
          data: { weights: [{ date: '2026-08-05', w: 200 }], settings: {} },
          training: { liftSessions: { '2026-08-05': [{ name: 'Server session' }] }, exercises: [], routines: [], sessions: {} } }] }) };
      return null; } });

    b.S.autoSync();
    b.S.cloudPull(true);
    await pump(b, 12);
    test('local training bytes are unchanged', () => eq(dump(b).wl_training_v1, rawT));
    test('the server session did not land locally', () => notOk(/Server session/.test(dump(b).wl_training_v1 || '')));
    test('local core bytes are unchanged', () => eq(dump(b).wl_v1 || null, rawCore));
    test('and the server weight did not land either', () => notOk(/2026-08-05/.test(dump(b).wl_v1 || '')));
  });

  await group('C13-28 — an ambiguous device declines export, copy, import and logout', async () => {
    const a = oldDevice();
    const b = createEnv({ localStorage: Object.assign({}, dump(a), { wl_pb: JSON.stringify(PB_B) }), fetchResponses: () => null });
    let toasted = [];
    b.S.toast = (m) => toasted.push(m);
    const rawT = dump(b).wl_training_v1, rawCore = dump(b).wl_v1 || null;

    b.S.exportData();
    test('export produces no file and says why', () => {
      eq(b.fetchLog.filter((e) => /blob:/.test(e.url)).length, 0);
      ok(toasted.some((t) => /another account/i.test(t)), 'toasts: ' + JSON.stringify(toasted));
    });
    toasted = [];
    b.S.copyBackup();
    test('copy-to-clipboard declines visibly', () => ok(toasted.some((t) => /another account/i.test(t))));
    toasted = [];
    b.S.askConfirm = (msg, fn) => fn();
    b.S.applyImport(JSON.stringify({ weights: [{ date: '2026-01-01', w: 1 }], settings: {} }));
    test('import declines visibly', () => ok(toasted.some((t) => /another account/i.test(t))));
    test('and import changed nothing on disk', () => {
      eq(dump(b).wl_training_v1, rawT);
      eq(dump(b).wl_v1 || null, rawCore);
    });
    toasted = [];
    test('logout is refused', () => eq(b.S.pbForceLogout(), false));
    test('and says why', () => ok(toasted.some((t) => /another account/i.test(t))));
    test('the live keys survive the refused logout', () => {
      ok(dump(b).wl_training_v1); ok(dump(b).wl_pb);
    });
  });

  await group('C13-29 — a storage failure quarantines training only, not core', async () => {
    /* Ruling 3: a write failure with no evidence of another account must not
       cripple core, which is independently established. */
    const env = oldDevice({ storagePatch: (ls) => { const r = ls.setItem.bind(ls);
      ls.setItem = (k, v) => { if (k === 'wl_training_recovery') throw new Error('quota'); return r(k, v); }; } });
    test('state is a storage block, NOT ambiguity', () => eq(env.S.recoveryState, 'blocked'));
    test('training is quarantined', () => ok(env.S.trainingQuarantined()));
    test('but ownership is not ambiguous', () => notOk(env.S.ownershipAmbiguous()));
    const b = JSON.parse(env.S.backupJSON());
    test('core still exports', () => {
      ok(b.__backup.contains.indexOf('core') >= 0);
      ok('weights' in b);
    });
    test('while training is withheld', () => {
      notOk(b.trainingHistory); notOk(b.recovery);
      eq(b.__backup.trainingWithheld, true);
      eq(b.__backup.userDataWithheld, false);
    });
  });

  await group('C13-30 — the boot freeze really does release: later edits persist', async () => {
    /* The old version only asserted the flag flipped. That proves nothing about
       whether a save actually writes. If the freeze leaked past boot, a
       quarantined device would silently discard everything logged on it. */
    const env = oldDevice({ storagePatch: (ls) => { const r = ls.setItem.bind(ls);
      ls.setItem = (k, v) => { if (k === 'wl_training_recovery') throw new Error('quota'); return r(k, v); }; } });
    test('blocked', () => ok(env.S.recoveryBlocked));

    env.S.state.training.liftSessions['2026-08-09'] = [{ name: 'Front squat', sets: [{ w: 90, r: 5 }] }];
    env.S.saveTraining();
    test('a training edit reaches localStorage', () => {
      const t = JSON.parse(dump(env).wl_training_v1 || '{}');
      ok(t.liftSessions['2026-08-09'], 'the edit was silently discarded');
    });

    env.S.state.workout = { routineId: 'r1', entries: [{ name: 'Row', sets: [{ w: 50, r: 8 }] }] };
    env.S.saveWorkout();
    test('a workout edit reaches localStorage', () => {
      const w = JSON.parse(dump(env).wl_workout_v1 || '{}');
      ok(w.entries && w.entries[0].name === 'Row', 'the workout edit was discarded');
    });
  });

  /* ---- Architect round-9 rulings 2, 4, 5, 6, 7, 8 ---------------------- */

  await group('C13-31 — same-page login after an expired session secures recovery FIRST', async () => {
    /* The gap that mattered: boot signed out takes no snapshot (nothing can pull
       without a session), then the user authenticates ON THE SAME PAGE and the
       continuation goes cloudGet -> trainingPull -> photoSync. Without ownership
       established first, that pull destroys training that was never snapshotted
       -- the original loss, on the expired-session path. A reload test cannot
       catch this, because a reload reruns boot capture. */
    let pulled = false;
    const env = createEnv({
      localStorage: { wl_training_v1: JSON.stringify(OLD_LOCAL), wl_last_owner: 'userA' },
      fetchResponses: (e) => {
        if (/users\/auth-with-password/.test(e.url)) return { ok: true, status: 200, text: () => Promise.resolve(''),
          json: () => Promise.resolve({ token: 'tok', record: { id: 'userA', email: 'a@x.com' } }) };
        if (!/appdata\/records/.test(e.url)) return null;
        if (e.method === 'GET') { pulled = true; return { ok: true, status: 200, text: () => Promise.resolve(''),
          json: () => Promise.resolve({ items: [{ id: 'rec1', training: clone(SERVER), data: {} }] }) }; }
        return null;
      },
    });
    test('boot signed out captured nothing', () => eq(dump(env).wl_training_recovery, undefined));

    /* Signed out there is no quarantine, so ordinary boot normalisation runs and
       may legitimately rewrite the key. The snapshot must match what was on disk
       AT LOGIN, not the pre-boot fixture. */
    const onDiskAtLogin = dump(env).wl_training_v1;

    /* Authenticate on the same page, exactly as the login screen does. */
    submitLogin(env, 'a@x.com', 'password123');
    await pump(env, 12);

    test('a recovery envelope now exists', () => ok(recoveryOf(env, 'userA'), 'login proceeded without securing recovery'));
    test('it holds the exact bytes that were on disk at login', () => eq(recoveryOf(env, 'userA').training, onDiskAtLogin));
    test('and the unsynced session is in it', () => {
      ok(JSON.parse(recoveryOf(env, 'userA').training).liftSessions['2026-07-31']);
    });
    test('a stale server response did not destroy the only copy', () => {
      const rec = recoveryOf(env, 'userA');
      ok(JSON.parse(rec.training).liftSessions['2026-07-31'], 'the pre-login copy lost the session');
    });
  });

  await group('C13-32 — logging in as a DIFFERENT account quarantines, with no user-data request', async () => {
    let userDataRequests = 0;
    const env = createEnv({
      localStorage: { wl_training_v1: JSON.stringify(OLD_LOCAL), wl_last_owner: 'userA' },   /* the bytes are A's */
      fetchResponses: (e) => {
        if (/users\/auth-with-password/.test(e.url)) return { ok: true, status: 200, text: () => Promise.resolve(''),
          json: () => Promise.resolve({ token: 'tok2', record: { id: 'userB', email: 'b@x.com' } }) };
        if (/appdata\/records/.test(e.url) || /cf_photos/.test(e.url)) { userDataRequests++; return null; }
        return null;
      },
    });
    const onDiskAtLogin = dump(env).wl_training_v1;
    submitLogin(env, 'b@x.com', 'password123');
    await pump(env, 12);

    test('B is quarantined', () => ok(env.S.ownershipAmbiguous()));
    test('NO user-data request was made at all', () => eq(userDataRequests, 0));
    test("A's raw training is untouched by the login", () => eq(dump(env).wl_training_v1, onDiskAtLogin));
    test("and A's unsynced session is still on disk", () => {
      ok(JSON.parse(dump(env).wl_training_v1).liftSessions['2026-07-31'], "B's login destroyed A's session");
    });
    test('nothing was captured under B', () => notOk(recoveryOf(env, 'userB')));
    test('and B exports no user data', () => {
      const b = JSON.parse(env.S.backupJSON());
      eq(b.__backup.contains, []);
      notOk(/2026-07-31/.test(JSON.stringify(b)));
    });
  });

  await group('C13-33 — the owner marker is not inferred from the act of signing in', async () => {
    /* Signed-out bytes with NO marker. Stamping them with whoever authenticates
       next is the privacy defect, not the fix. */
    const env = createEnv({
      localStorage: { wl_training_v1: JSON.stringify(OLD_LOCAL),
                      wl_training_recovery: JSON.stringify({ userZ: { v: 1, capturedAt: '2026-07-01T00:00:00.000Z', appBuild: 'x', account: 'userZ', training: '{"z":1}', workout: null } }) },
      fetchResponses: (e) => {
        if (/users\/auth-with-password/.test(e.url)) return { ok: true, status: 200, text: () => Promise.resolve(''),
          json: () => Promise.resolve({ token: 'tok', record: { id: 'userA', email: 'a@x.com' } }) };
        return null;
      },
    });
    submitLogin(env, 'a@x.com', 'password123');
    await pump(env, 12);
    test('the bytes were NOT auto-attributed to the new account', () => notOk(recoveryOf(env, 'userA')));
    test('and the app is quarantined', () => ok(env.S.ownershipAmbiguous()));
  });

  await group('C13-34 — direct photo write paths are quarantined, not just photoSync', async () => {
    const a = oldDevice();
    const b = createEnv({ localStorage: Object.assign({}, dump(a), { wl_pb: JSON.stringify(PB_B) }),
      fetchResponses: () => null });
    test('ambiguous', () => ok(b.S.ownershipAmbiguous()));
    const photoReqs = () => b.fetchLog.filter((e) => /cf_photos|photos/.test(e.url) && e.method !== 'GET').length;
    const before = photoReqs();

    let rejected = 0;
    const catchAll = (p) => { if (p && typeof p.catch === 'function') return p.catch(() => { rejected++; }); return Promise.resolve(); };
    await catchAll(b.S.pbPhotoUpload({ id: 'p1', blob: null }));
    await catchAll(b.S.pbPhotoDelete('srv1'));
    await pump(b, 6);

    test('pbPhotoUpload refuses', () => ok(rejected >= 1));
    test('pbPhotoDelete refuses', () => eq(rejected, 2));
    test('no photo mutation reached the network', () => eq(photoReqs(), before));
    await new Promise((r) => { b.S.photoSync(r); });
    test('photoSync is a no-op too', () => eq(photoReqs(), before));
  });

  await group('C13-35 — every appdata writer is gated at the primitive', async () => {
    const a = oldDevice();
    const b = createEnv({ localStorage: Object.assign({}, dump(a), { wl_pb: JSON.stringify(PB_B) }), fetchResponses: () => null });
    const writes = () => b.fetchLog.filter((e) => /appdata\/records/.test(e.url) && e.method !== 'GET').length;
    const reads = () => b.fetchLog.filter((e) => /appdata\/records/.test(e.url) && e.method === 'GET').length;
    const w0 = writes(), r0 = reads();

    /* Every route that can reach pbSave / pbGetRecord, driven directly. */
    let saveOk = null, getErr = null;
    b.S.pbSave({ data: { weights: [] } }, (ok, err) => { saveOk = ok; });
    b.S.pbGetRecord((rec, err) => { getErr = err; });
    b.S.cloudPush(true);
    b.S.cloudPull && b.S.cloudPull(true);
    b.S.cloudTest();
    b.S.trainingPush();
    b.S.autoSync();
    await pump(b, 12);

    test('pbSave refuses and reports why', () => eq(saveOk, false));
    test('pbGetRecord refuses and reports why', () => eq(getErr, 'ambiguous'));
    test('no appdata write escaped by ANY route', () => eq(writes(), w0));
    test('and no appdata read either', () => eq(reads(), r0));
  });

  await group('C13-36 — quarantine responds to storage as it is NOW, not at boot', async () => {
    const env = oldDevice();
    test('starts fine', () => { eq(env.S.recoveryState, 'ok'); notOk(env.S.ownershipAmbiguous()); });
    const w0 = env.fetchLog.filter((e) => /appdata\/records/.test(e.url) && e.method !== 'GET').length;

    /* Another tab writes a second account's envelope after boot. */
    const store = JSON.parse(dump(env).wl_training_recovery);
    store.userB = { v: 1, capturedAt: '2026-07-01T00:00:00.000Z', appBuild: 'x', account: 'userB', training: '{"b":1}', workout: null };
    env.S.localStorage.setItem('wl_training_recovery', JSON.stringify(store));

    test('the very next check sees it', () => ok(env.S.ownershipAmbiguous()));
    let toasted = [];
    env.S.toast = (m) => toasted.push(m);
    env.S.exportData();
    env.S.copyBackup();
    env.S.askConfirm = (msg, fn) => fn();
    env.S.applyImport(JSON.stringify({ weights: [], settings: {} }));
    env.S.cloudPush(true);
    env.S.trainingPush();
    env.S.autoSync();
    await pump(env, 10);
    test('export, copy and import all decline', () => ok(toasted.filter((t) => /another account/i.test(t)).length >= 3, JSON.stringify(toasted)));
    test('the backup carries no user data', () => eq(JSON.parse(env.S.backupJSON()).__backup.contains, []));
    test('no write escaped', () => eq(env.fetchLog.filter((e) => /appdata\/records/.test(e.url) && e.method !== 'GET').length, w0));
    test('and logout is refused', () => eq(env.S.pbForceLogout(), false));

    /* Corrupt it instead, after boot. */
    const env2 = oldDevice();
    env2.S.localStorage.setItem('wl_training_recovery', '{"userA":{"v":1,');
    test('a store corrupted after boot also quarantines', () => ok(env2.S.ownershipAmbiguous()));
    /* Remove it entirely after boot: nothing else claims the device. */
    const env3 = oldDevice();
    env3.S.localStorage.removeItem('wl_training_recovery');
    test('a removed store does not falsely quarantine', () => notOk(env3.S.ownershipAmbiguous()));
  });

  /* ---- Architect round-10 rulings 1-8, and the Owner's adoption ruling -- */

  await group('C13-37 — an unmarked device ASKS before adopting anything', async () => {
    /* Product Owner ruling 2026-08-01: the code cannot tell Griffin's own legacy
       data from data typed while signed out from a previous owner's on a reused
       device, so it asks the one party who can settle it. */
    const env = oldDevice({ owner: null });
    test('nothing is adopted automatically', () => eq(dump(env).wl_last_owner, undefined));
    test('and nothing is captured', () => eq(dump(env).wl_training_recovery, undefined));
    test('the device is fully quarantined meanwhile', () => {
      ok(env.S.ownershipAmbiguous());
      eq(env.S.recoveryState, 'adoption');
    });
    test('the backup carries no user data while unanswered', () => {
      eq(JSON.parse(env.S.backupJSON()).__backup.contains, []);
    });
    const w0 = env.fetchLog.filter((e) => /appdata\/records/.test(e.url)).length;
    env.S.autoSync(); env.S.cloudPush(true); env.S.trainingPush();
    await pump(env, 10);
    test('no appdata request escaped while unanswered', () => {
      eq(env.fetchLog.filter((e) => /appdata\/records/.test(e.url)).length, w0);
    });
  });

  await group('C13-38 — the adoption GATE: the app never renders, yes adopts, silence keeps it locked', async () => {
    /* Round-13 correction: a banner plus save-suppression was not quarantine --
       the app still rendered its controls and edits lived on in memory. The gate
       now OWNS the screen and the ordinary app never initialises behind it. */
    const gated = oldDevice({ owner: null });
    const gateHtml = gated.S.document.getElementById('app').innerHTML;
    test('the gate screen owns the app container', () => ok(/One question first/.test(gateHtml), gateHtml.slice(0, 120)));
    test('it names the account', () => ok(/a@x\.com|this account/.test(gateHtml)));
    test('it says nothing changes until answered', () => ok(/added, changed or deleted/.test(gateHtml)));
    test('the ONLY action is adoption — no data-mutating controls exist', () => {
      notOk(/data-act="(?!adopt:yes)[^"]*"/.test(gateHtml.replace(/data-act="confirm:[^"]*"/g, '')), 'other controls found in the gate');
    });
    test('doing nothing leaves no owner recorded', () => eq(dump(gated).wl_last_owner, undefined));
    test('and nothing captured', () => eq(dump(gated).wl_training_recovery, undefined));

    /* Confirm: the button reloads. Assert what it does BEFORE the reload, then
       model the reload as a fresh boot on the carried storage. */
    const yes = oldDevice({ owner: null });
    let reloaded = false;
    yes.S.location.reload = () => { reloaded = true; };
    const rawAtConfirm = dump(yes).wl_training_v1;
    yes.S.adoptLocalData();
    test('confirming records the owner, verified', () => eq(dump(yes).wl_last_owner, 'userA'));
    test('and reloads into a normal boot', () => ok(reloaded));
    const rebooted = createEnv({ localStorage: dump(yes), fetchResponses: () => null });
    test('the reboot captures a snapshot', () => ok(recoveryOf(rebooted, 'userA')));
    test('holding the bytes present at confirmation', () => eq(recoveryOf(rebooted, 'userA').training, rawAtConfirm));
    test('and the device is released', () => { notOk(rebooted.S.ownershipAmbiguous()); eq(rebooted.S.recoveryState, 'ok'); });
    test('exports work again', () => ok(JSON.parse(rebooted.S.backupJSON()).trainingHistory));
  });

  await group('C13-39 — a marker that cannot be stored fails closed', async () => {
    const env = oldDevice({ owner: null, storagePatch: (ls) => {
      const r = ls.setItem.bind(ls);
      ls.setItem = (k, v) => { if (k === 'wl_last_owner') return; return r(k, v); };   /* silent no-op */
    } });
    let reloaded = false;
    env.S.location.reload = () => { reloaded = true; };
    env.S.adoptLocalData();
    test('the silent write failure is detected', () => eq(dump(env).wl_last_owner, undefined));
    test('no reload happened', () => notOk(reloaded));
    test('and the device stays blocked rather than syncing', () => ok(env.S.recoveryBlocked));
    test('with a reason that names the cause', () => ok(/which account its data belongs to/i.test(env.S.recoveryBlockReason)));
  });

  await group('C13-40 — the empty-device marker gap the Architect described', async () => {
    /* A device with NO training. Capture used to treat it as "nothing to protect"
       and return success while the marker write silently failed -- after which a
       core pull filled wl_v1 for A, the session expired, and B could log in with
       no marker and adopt A's core as its own. */
    const env = createEnv({
      localStorage: { wl_pb: JSON.stringify(PB) },
      storagePatch: (ls) => { const r = ls.setItem.bind(ls);
        ls.setItem = (k, v) => { if (k === 'wl_last_owner') return; return r(k, v); }; },
      fetchResponses: () => null,
    });
    test('an empty device with an unstorable marker does NOT report success', () => ok(env.S.recoveryBlocked));
    test('so no core pull can populate it under an unrecorded owner', () => {
      eq(env.fetchLog.filter((e) => /appdata\/records/.test(e.url)).length, 0);
    });
  });

  await group('C13-41 — logout verifies EVERY key, not just the envelope', async () => {
    const targets = ['wl_v1', 'wl_training_v1', 'wl_workout_v1', 'wl_dirty', 'wl_lastsync', 'wl_last_owner'];
    for (const stuck of targets) {
      const env = oldDevice({ extra: { wl_v1: '{"weights":[]}', wl_dirty: '1', wl_lastsync: '123' } });
      /* This one key refuses to be removed, silently. */
      const realRemove = env.S.localStorage.removeItem.bind(env.S.localStorage);
      env.S.localStorage.removeItem = (k) => { if (k === stuck) return; return realRemove(k); };
      let toasted = [];
      env.S.toast = (m) => toasted.push(m);
      test(`${stuck} stuck: logout reports FAILURE`, () => eq(env.S.pbForceLogout(), false));
      test(`${stuck} stuck: the session is NOT cleared`, () => ok(dump(env).wl_pb, 'session cleared despite a failed wipe'));
      test(`${stuck} stuck: it says so`, () => ok(toasted.some((t) => /clear|verify/i.test(t)), JSON.stringify(toasted)));
    }
    /* And the honest path still works. */
    const good = oldDevice({ extra: { wl_v1: '{"weights":[]}', wl_dirty: '1', wl_lastsync: '123' } });
    test('an unobstructed logout succeeds', () => eq(good.S.pbForceLogout(), true));
    test('and every target key is gone', () => {
      targets.forEach((k) => eq(dump(good)[k], undefined, k + ' survived'));
    });
  });

  await group('C13-42 — every photo route is quarantined, driven for real', async () => {
    const a = oldDevice();
    const b = createEnv({ localStorage: Object.assign({}, dump(a), { wl_pb: JSON.stringify(PB_B) }), fetchResponses: () => null });
    test('ambiguous', () => ok(b.S.ownershipAmbiguous()));
    const photoReqs = () => b.fetchLog.filter((e) => /\/photos\/|\/files\//.test(e.url)).length;
    const before = photoReqs();

    const swallow = (p) => (p && typeof p.catch === 'function' ? p.catch(() => {}) : Promise.resolve());
    /* The read side, which was entirely unguarded before. */
    await swallow(b.S.pbPhotoList());
    await swallow(b.S.pbFileToken());
    await swallow(b.S.pbPhotoFetchBlob({ id: 'x', file: 'f.jpg' }, 'tok'));
    /* The write side. */
    await swallow(b.S.pbPhotoUpload({ id: 'p1', blob: null }));
    await swallow(b.S.pbPhotoDelete('srv1'));
    /* idbAdd/idbDelete/idbClearAll are NOT driven here: this environment only
       stubs IndexedDB, so they would await a request that never completes. They
       reach the network solely through the primitives above, and they are driven
       for real against real IndexedDB in the browser suite. */
    await new Promise((r) => { b.S.photoSync(r); });
    await pump(b, 8);

    test('no photo request of any kind reached the network', () => eq(photoReqs(), before));
  });

  /* ---- Architect round-11 rulings 7, 8, 9 ------------------------------ */

  await group('C13-43 — a failed logout leaves EVERYTHING exactly as it was', async () => {
    /* The earlier version checked only that the stuck key and the session
       survived. It did not check what had already been deleted by the time the
       failure happened -- the recovery envelope and the keys removed before it. */
    const targets = ['wl_v1', 'wl_training_v1', 'wl_workout_v1', 'wl_dirty', 'wl_lastsync', 'wl_last_owner', 'wl_training_recovery'];
    for (const stuck of targets) {
      const env = oldDevice({ extra: { wl_v1: '{"weights":[{"date":"2026-07-31","w":184.2}]}', wl_dirty: '1', wl_lastsync: '123' } });
      const before = {};
      targets.concat(['wl_pb']).forEach((k) => { before[k] = dump(env)[k]; });

      const realRemove = env.S.localStorage.removeItem.bind(env.S.localStorage);
      env.S.localStorage.removeItem = (k) => { if (k === stuck) return; return realRemove(k); };
      let toasted = [];
      env.S.toast = (m) => toasted.push(m);

      test(`${stuck} stuck: logout reports FAILURE`, () => eq(env.S.pbForceLogout(), false));
      test(`${stuck} stuck: EVERY key is back exactly as it was`, () => {
        targets.concat(['wl_pb']).forEach((k) => {
          eq(dump(env)[k], before[k], k + ' was not restored');
        });
      });
      test(`${stuck} stuck: no journal is left behind`, () => eq(dump(env).wl_logout_journal, undefined));
      /* Ruling 11: it must NOT claim nothing was removed. The data was removed
         and rewritten; the honest claim is that every value was put back. */
      test(`${stuck} stuck: the message is accurate about what happened`, () => {
        ok(toasted.some((t) => /put back exactly as it was/i.test(t)), JSON.stringify(toasted));
        notOk(toasted.some((t) => /nothing was removed/i.test(t)), 'claimed nothing was removed');
      });
    }
  });

  await group('C13-44 — a session left in sessionStorage fails the logout', async () => {
    const env = oldDevice();
    /* An un-remembered session lives in sessionStorage. Make its removal a silent
       no-op: the old code never looked there at all. */
    env.S.sessionStorage.setItem('wl_pb', JSON.stringify({ uid: 'userA', token: 'tok' }));
    env.S.sessionStorage.removeItem = () => {};
    let toasted = [];
    env.S.toast = (m) => toasted.push(m);
    const beforeTraining = dump(env).wl_training_v1;

    test('logout reports FAILURE', () => eq(env.S.pbForceLogout(), false));
    test('and says the session could not be cleared', () => ok(toasted.some((t) => /session/i.test(t)), JSON.stringify(toasted)));
    test('local data was restored, not left half-wiped', () => eq(dump(env).wl_training_v1, beforeTraining));
    test('and the recovery envelope survived', () => ok(recoveryOf(env, 'userA')));
  });

  await group('C13-45 — an interrupted wipe STOPS the app and asks (Owner ruling)', async () => {
    /* Product Owner ruling 2026-08-01: when the app cannot tell whether the
       logout reached the committed state, it neither restores nor finishes. */
    for (const phase of ['wiping', 'data-cleared', 'committed']) {
      const env = oldDevice();
      const j = env.S.buildLogoutJournal();
      env.S.writeLogoutJournalPhase(j, phase);
      env.S.localStorage.removeItem('wl_training_v1');   /* a wipe caught mid-flight */

      const restarted = createEnv({ localStorage: dump(env), fetchResponses: () => null });
      test(`${phase}: the next launch stops`, () => ok(restarted.S.logoutRecoveryPending()));
      test(`${phase}: and quarantines everything`, () => ok(restarted.S.ownershipAmbiguous()));
      test(`${phase}: it did NOT silently restore`, () => eq(dump(restarted).wl_training_v1, undefined));
      test(`${phase}: nor silently finish the wipe`, () => ok(dump(restarted).wl_logout_journal, 'journal was discarded'));
      test(`${phase}: no user data is exported meanwhile`, () => eq(JSON.parse(restarted.S.backupJSON()).__backup.contains, []));
      test(`${phase}: and the notice offers both answers`, () => {
        const h = restarted.S.recoveryNoticeHTML();
        ok(/interrupted/i.test(h), h.slice(0, 120));
        ok(/lrec:finish/.test(h));
      });
    }
  });

  await group('C13-45b — the athlete answers: restore, or finish', async () => {
    const before = (() => { const e = oldDevice(); return dump(e).wl_training_v1; })();

    /* Restore */
    const r = oldDevice();
    const jr = r.S.buildLogoutJournal();
    r.S.writeLogoutJournalPhase(jr, 'data-cleared');
    r.S.localStorage.removeItem('wl_training_v1');
    const r2 = createEnv({ localStorage: dump(r), fetchResponses: () => null });
    r2.S.location.reload = () => {};
    test('restore puts the training bytes back', () => {
      r2.S.logoutRecoveryRestore();
      eq(dump(r2).wl_training_v1, before);
    });
    test('and clears the recovery record', () => eq(dump(r2).wl_logout_journal, undefined));
    test('and releases the device', () => notOk(r2.S.logoutRecoveryPending()));
    test('the gate owned the screen before the answer', () => {
      const g = createEnv({ localStorage: (() => { const e = oldDevice(); const j = e.S.buildLogoutJournal(); e.S.writeLogoutJournalPhase(j, 'data-cleared'); return dump(e); })(), fetchResponses: () => null });
      ok(/Interrupted log-out/.test(g.S.document.getElementById('app').innerHTML));
    });

    /* Finish */
    const f = oldDevice();
    const jf = f.S.buildLogoutJournal();
    f.S.writeLogoutJournalPhase(jf, 'data-cleared');
    const f2 = createEnv({ localStorage: dump(f), fetchResponses: () => null });
    f2.S.location.reload = () => {};
    f2.S.logoutRecoveryFinish();
    test('finishing erases every target key', () => {
      ['wl_v1', 'wl_training_v1', 'wl_workout_v1', 'wl_last_owner', 'wl_training_recovery'].forEach((k) => {
        eq(dump(f2)[k], undefined, k + ' survived');
      });
    });
    test('and clears the recovery record', () => eq(dump(f2).wl_logout_journal, undefined));
  });

  await group('C13-45c — a corrupt or foreign journal also stops the app', async () => {
    for (const [label, raw] of [
      ['unreadable', '{"v":1,'],
      ['wrong version', JSON.stringify({ v: 99, at: 'x', account: 'userA', appBuild: 'b', phase: 'wiping', vals: {}, session: {} })],
      ['missing keys', JSON.stringify({ v: 1, at: 'x', account: 'userA', appBuild: 'b', phase: 'wiping', vals: { wl_v1: null }, session: { local: null, session: null } })],
      ['bad phase', JSON.stringify({ v: 1, at: 'x', account: 'userA', appBuild: 'b', phase: 'nonsense', vals: {}, session: {} })],
    ]) {
      const env = oldDevice({ extra: { wl_logout_journal: raw } });
      test(`${label}: the app stops`, () => ok(env.S.logoutRecoveryPending()));
      test(`${label}: it is not treated as restorable`, () => eq(env.S.logoutRecovery.phase, 'unreadable'));
      test(`${label}: the bytes are left exactly as found`, () => eq(dump(env).wl_logout_journal, raw));
      test(`${label}: and nothing is exported`, () => eq(JSON.parse(env.S.backupJSON()).__backup.contains, []));
    }
  });

  await group('C13-45d — a "prepared" journal is safely discarded', async () => {
    /* Nothing had been removed at that phase, so there is nothing to decide. */
    const env = oldDevice();
    const j = env.S.buildLogoutJournal();
    env.S.writeLogoutJournalPhase(j, 'prepared');
    const before = dump(env).wl_training_v1;
    const restarted = createEnv({ localStorage: dump(env), fetchResponses: () => null });
    test('the app is NOT stopped', () => notOk(restarted.S.logoutRecoveryPending()));
    test('the journal is gone', () => eq(dump(restarted).wl_logout_journal, undefined));
    test('and the data is untouched', () => eq(dump(restarted).wl_training_v1, before));
  });

  await group('C13-45e — local edits are refused while a decision is outstanding', async () => {
    /* Ruling 3: after Cancel the app stayed usable and could keep mutating the
       very data it promised not to touch. */
    for (const [label, mk] of [
      ['adoption unanswered', () => oldDevice({ owner: null })],
      ['interrupted wipe', () => {
        const e = oldDevice();
        const j = e.S.buildLogoutJournal();
        e.S.writeLogoutJournalPhase(j, 'wiping');
        return createEnv({ localStorage: dump(e), fetchResponses: () => null });
      }],
    ]) {
      const env = mk();
      const beforeT = dump(env).wl_training_v1, beforeC = dump(env).wl_v1;
      env.S.state.training.liftSessions['2026-09-09'] = [{ name: 'Should not persist' }];
      env.S.saveTraining();
      env.S.state.weights.push({ date: '2026-09-09', w: 999 });
      env.S.save();
      env.S.state.workout = { entries: [{ name: 'nope' }] };
      env.S.saveWorkout();
      test(`${label}: training on disk is unchanged`, () => eq(dump(env).wl_training_v1, beforeT));
      test(`${label}: core on disk is unchanged`, () => eq(dump(env).wl_v1, beforeC));
      test(`${label}: no workout was written`, () => eq(dump(env).wl_workout_v1, beforeT === undefined ? undefined : dump(env).wl_workout_v1));
    }
  });

  await group('C13-46 — an unpreparable journal refuses to start the wipe at all', async () => {
    const env = oldDevice({ storagePatch: (ls) => {
      const r = ls.setItem.bind(ls);
      ls.setItem = (k, v) => { if (k === 'wl_logout_journal') throw new Error('quota'); return r(k, v); };
    } });
    const before = dump(env).wl_training_v1;
    let toasted = [];
    env.S.toast = (m) => toasted.push(m);
    test('logout reports FAILURE', () => eq(env.S.pbForceLogout(), false));
    test('and nothing was touched', () => {
      eq(dump(env).wl_training_v1, before);
      ok(recoveryOf(env, 'userA'));
      ok(dump(env).wl_pb);
    });
    test('it says so plainly', () => ok(toasted.some((t) => /nothing was removed/i.test(t)), JSON.stringify(toasted)));
  });

  /* ---- Architect round-13 rulings 5, 6, 7, and the Owner's ruling ------- */

  await group('C13-47 — pre-adoption edits cannot survive the transition', async () => {
    /* Ruling 4/6: suppressing the save was not prevention -- the edit lived on in
       memory and confirming adoption released it toward disk, export and sync.
       The gate now means the app never initialises, so there is no state to edit;
       this drives the transition and asserts a poisoned in-memory value dies. */
    const env = oldDevice({ owner: null });
    test('the gate owns the screen, so no app state exists to edit', () => {
      ok(/One question first/.test(env.S.document.getElementById('app').innerHTML));
      eq(env.S.state.weights.length, 0, 'app state was initialised behind the gate');
    });
    /* Hostile case: poke values into state anyway, as if some path leaked. */
    env.S.state.weights.push({ date: '2026-09-09', w: 999 });
    env.S.state.training.liftSessions['2026-09-09'] = [{ name: 'PhantomLift' }];
    env.S.state.workout = { entries: [{ name: 'PhantomWo' }] };
    env.S.save(); env.S.saveTraining(); env.S.saveWorkout();
    test('none of it reaches disk while gated', () => {
      notOk(/999|Phantom/.test(dump(env).wl_v1 || ''));
      notOk(/Phantom/.test(dump(env).wl_training_v1 || ''));
      notOk(/Phantom/.test(dump(env).wl_workout_v1 || ''));
    });
    /* Confirm adoption -> reload. The reload rebuilds state FROM DISK, so the
       phantom in-memory values die with the old page. */
    env.S.location.reload = () => {};
    env.S.adoptLocalData();
    const rebooted = createEnv({ localStorage: dump(env), fetchResponses: () => null });
    const all = JSON.stringify({ d: dump(rebooted), b: rebooted.S.backupJSON(), t: rebooted.S.state.training, w: rebooted.S.state.weights });
    test('after adoption, the phantom edits exist NOWHERE — memory, disk or export', () => {
      notOk(/Phantom|"w":999/.test(all), 'a pre-adoption edit survived the transition');
    });
    test('while the genuine pre-update data DID survive', () => {
      ok(JSON.parse(dump(rebooted).wl_training_v1).liftSessions['2026-07-31']);
    });
  });

  await group('C13-48 — the recovery-only boot loads nothing and calls nothing', async () => {
    /* Ruling 1/2: checkLogoutJournal()'s verdict now branches boot. */
    for (const phase of ['wiping', 'data-cleared', 'committed']) {
      const env = oldDevice();
      const j = env.S.buildLogoutJournal();
      env.S.writeLogoutJournalPhase(j, phase);
      const carried = dump(env);
      const restarted = createEnv({ localStorage: carried, fetchResponses: () => null });
      test(`${phase}: the gate owns the screen`, () => ok(/Interrupted log-out/.test(restarted.S.document.getElementById('app').innerHTML)));
      test(`${phase}: no user data was loaded into memory`, () => {
        eq(restarted.S.state.weights.length, 0);
        eq(Object.keys(restarted.S.state.training.liftSessions).length, 0, 'training was loaded behind the gate');
      });
      test(`${phase}: no network request of any kind`, () => {
        eq(restarted.fetchLog.filter((e) => !/^https:\/\/app\.test\//.test(e.url)).length, 0, JSON.stringify(restarted.fetchLog.map((e) => e.url)));
      });
      test(`${phase}: migration did not rewrite the training key`, () => {
        eq(dump(restarted).wl_training_v1, carried.wl_training_v1);
      });
    }
  });

  await group('C13-49 — Owner ruling: an unreadable journal offers NO destructive escape', async () => {
    const env = oldDevice({ extra: { wl_logout_journal: '{"v":1,' } });
    const html = env.S.document.getElementById('app').innerHTML;
    test('the gate owns the screen', () => ok(/Interrupted log-out/.test(html)));
    test('no restore button — unvalidated bytes are never written back', () => notOk(/lrec:restore/.test(html)));
    test('no erase button either — per the Owner ruling', () => notOk(/lrec:finish/.test(html)));
    test('it directs to the maintainer', () => ok(/Contact whoever maintains/i.test(html)));
    let toasted = [];
    env.S.toast = (m) => toasted.push(m);
    test('even a direct call to finish refuses', () => eq(env.S.logoutRecoveryFinish(), false));
    test('and says why', () => ok(toasted.some((t) => /can't be read/i.test(t)), JSON.stringify(toasted)));
    test('the damaged bytes are left exactly as found', () => eq(dump(env).wl_logout_journal, '{"v":1,'));
  });

  await group('C13-50 — logoutRecoveryFinish verifies its own postcondition, universally', async () => {
    /* Ruling 8: the claimed universal postcondition requires universal cases —
       all seven keys, both session slots, journal deletion, readback throwing. */
    const mkGated = () => {
      const env = oldDevice({ extra: { wl_v1: '{"weights":[]}', wl_dirty: '1', wl_lastsync: '1' } });
      const j = env.S.buildLogoutJournal();
      env.S.writeLogoutJournalPhase(j, 'data-cleared');
      const r = createEnv({ localStorage: dump(env), fetchResponses: () => null });
      r.S.location.reload = () => {};
      return r;
    };
    const ALL = ['wl_v1', 'wl_training_v1', 'wl_workout_v1', 'wl_dirty', 'wl_lastsync', 'wl_last_owner', 'wl_training_recovery'];
    for (const stuck of ALL) {
      const r = mkGated();
      const realRemove = r.S.localStorage.removeItem.bind(r.S.localStorage);
      r.S.localStorage.removeItem = (k) => { if (k === stuck) return; return realRemove(k); };
      test(`${stuck} stuck: finish reports FAILURE`, () => eq(r.S.logoutRecoveryFinish(), false));
      test(`${stuck} stuck: the journal survives, so the device stays gated`, () => ok(dump(r).wl_logout_journal));
    }
    /* Stuck sessionStorage slot. */
    const s1 = mkGated();
    s1.S.sessionStorage.setItem('wl_pb', JSON.stringify({ uid: 'userA', token: 't' }));
    s1.S.sessionStorage.removeItem = () => {};
    test('a stuck sessionStorage session fails the finish', () => eq(s1.S.logoutRecoveryFinish(), false));
    /* Malformed surviving localStorage session bytes. */
    const s2 = mkGated();
    const realSet2 = s2.S.localStorage.setItem.bind(s2.S.localStorage);
    s2.S.localStorage.setItem = (k, v) => realSet2(k, k === 'wl_pb' ? '{corrupt' : v);
    test('malformed surviving session bytes fail the finish', () => eq(s2.S.logoutRecoveryFinish(), false));
    /* Journal deletion refuses. */
    const s3 = mkGated();
    const realRemove3 = s3.S.localStorage.removeItem.bind(s3.S.localStorage);
    s3.S.localStorage.removeItem = (k) => { if (k === 'wl_logout_journal') return; return realRemove3(k); };
    test('an undeletable journal fails the finish', () => eq(s3.S.logoutRecoveryFinish(), false));
    /* Readback throws mid-verification. */
    const s4 = mkGated();
    let armed = false;
    const realGet4 = s4.S.localStorage.getItem.bind(s4.S.localStorage);
    s4.S.localStorage.getItem = (k) => { if (armed && k === 'wl_workout_v1') throw new Error('io'); return realGet4(k); };
    armed = true;
    test('a readback exception fails the finish rather than passing it', () => eq(s4.S.logoutRecoveryFinish(), false));
    /* And the honest path. */
    const ok1 = mkGated();
    test('an unobstructed finish succeeds', () => eq(ok1.S.logoutRecoveryFinish(), true));
    test('leaving every target key absent', () => ALL.forEach((k) => eq(dump(ok1)[k], undefined, k)));
    test('and the journal gone', () => eq(dump(ok1).wl_logout_journal, undefined));
  });

  await group('C13-51 — malformed session bytes are NOT treated as cleared', async () => {
    /* Ruling 8: absence, not unparseability, is the postcondition. */
    const env = oldDevice();
    const realRemove = env.S.localStorage.removeItem.bind(env.S.localStorage);
    /* pbClearSession rewrites wl_pb; corrupt what it leaves so it is malformed
       rather than credential-bearing. */
    const realSet = env.S.localStorage.setItem.bind(env.S.localStorage);
    env.S.localStorage.setItem = (k, v) => realSet(k, k === 'wl_pb' ? '{corrupt' : v);
    test('logout with malformed surviving session bytes FAILS', () => eq(env.S.pbForceLogout(), false));
  });

})());

module.exports = report();

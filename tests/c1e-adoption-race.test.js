/* Commit 1e — executable probes for the four Commit 1d findings.
   Each mirrors the Architect's reproduction. */
const { loadTestable, test, group, eq, ok, notOk, report, defer } = require('./harness');
const { createEnv } = require('./integration-env');
const SESSION = JSON.stringify({ uid: 'userA', token: 'tokA', email: 'a@x.com', remember: true });
const C = loadTestable(['C1E']);

group('E0 — pure guards', () => {
  test('adoption stale on revision drift', () =>
    ok(C.cfAdoptionStale({ owner: 'a', gen: 1, rev: 5 }, { owner: 'a', gen: 1, rev: 6 })));
  test('adoption stale on session generation drift', () =>
    ok(C.cfAdoptionStale({ owner: 'a', gen: 1, rev: 5 }, { owner: 'a', gen: 2, rev: 5 })));
  test('coach ctx invalid on token drift even with same uid (A→B→A)', () =>
    notOk(C.cfCoachCtxValid({ owner: 'a', gen: 1, tok: 't1' }, { owner: 'a', gen: 3, tok: 't1' })));
  test('startDate: flag true always compares', () => ok(C.cfStartDateIncluded(true, false, '2026-01-01')));
  test('startDate: unflagged + engaged (non-weights meaning) compares', () =>
    ok(C.cfStartDateIncluded(undefined, true, '2026-01-01')));
  test('startDate: unflagged + otherwise empty is generated noise', () =>
    notOk(C.cfStartDateIncluded(undefined, false, '2026-01-01')));
});

group('E1 — REPRODUCED PROBE: edit during adoption recovery wait (finding 1)', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' } });
  const S = env.S;
  S.revClean('core'); S.cfBaselineSet(S.cfCanon(S.cfNormalize(S.payload())));
  S.state.notes['2026-07-01'] = 'seed'; S.saveLocal();          // make local meaningful, still "clean"
  S.revClean('core');
  let heldCb = null;
  S.cfSnapshotOf = (o, cb) => { heldCb = cb; };                  // hold the recovery open
  let outcomes = [];
  S.cfReconcile({ notes: { '2026-07-01': 'SERVER VERSION' } }, 'probe', (d, o) => outcomes.push(o));
  ok(!!heldCb, 'recovery is pending');
  S.state.notes['2026-07-02'] = 'edit during wait'; S.save();    // the racing edit
  ok(S.isDirty(), 'edit made the device dirty');
  heldCb(true);                                                  // recovery completes AFTER the edit
  test('adoption was ABORTED — the racing edit survives', () =>
    eq(S.state.notes['2026-07-02'], 'edit during wait'));
  test('local copy not replaced by server version', () =>
    eq(S.state.notes['2026-07-01'], 'seed'));
  test('device stays dirty — never marked clean over a newer edit', () => ok(S.isDirty()));
  test('re-reconcile routed to a safe outcome (conflict/pending), not adopt-completed', () => {
    const last = outcomes[outcomes.length - 1];
    ok(last && !last.adopted, JSON.stringify(outcomes));
  });
});

group('E2 — REPRODUCED PROBE: coach preflight failure blocks the request (finding 2)', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' },
    fetchResponses: (e) => {
      if (e.method === 'GET' && /collections\/appdata\/records\?/.test(e.url)) {
        return { ok: true, status: 200, text: () => Promise.resolve(''), json: () => Promise.resolve({ items: [{ id: 'row1', data: { notes: { s: 'SERVER DIFFERENT' } } }] }) };
      }
      return null;
    } });
  const S = env.S;
  S.state.notes['l'] = 'LOCAL'; S.saveLocal(); S.revClean('core');
  S.cfBaselineSet('some-old-baseline');                          // server moved vs baseline… but local clean → adopt path
  S.cfSnapshotOf = (o, cb) => cb(false);                         // recovery FAILS
  S.state.selDate = '2026-07-25'; S.dayMissing = () => [];
  S.genNightly();
  return defer(new Promise(r => setTimeout(r, 20)).then(() => {
    env.runTimers();
    return new Promise(r => setTimeout(r, 20));
  }).then(() => {
    test('NO coachreq write after failed preflight adoption', () =>
      eq(env.appdataWrites().filter(w => /coachreq/.test(String(w.body))).length, 0));
    test('busy state cleared', () => notOk(S.state.nightBusy));
  }));
});

group('E3 — REPRODUCED PROBE: A→B→A during the coach poll (finding 3)', () => {
  const recapDay = '2026-07-25';
  // B's recap exists on the server only AFTER the account switch — A's own
  // preflight sees an empty row, so nothing can arrive via legitimate adoption.
  const sw = { switched: false };
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' },
    fetchResponses: (e) => {
      if (e.method === 'GET' && /collections\/appdata\/records\?/.test(e.url)) {
        const data = sw.switched ? { nightlyLog: { [recapDay]: { text: 'B PRIVATE RECAP', generated: 7 } } } : {};
        return { ok: true, status: 200, text: () => Promise.resolve(''), json: () => Promise.resolve({ items: [{ id: 'rB', data }] }) };
      }
      return null;
    } });
  const S = env.S;
  S.state.selDate = recapDay; S.dayMissing = () => [];
  S.revClean('core'); S.cfBaselineSet(S.cfCanon(S.cfNormalize(S.payload())));
  S.genNightly();
  return defer(new Promise(r => setTimeout(r, 20)).then(() => {
    // A → B → A: two auth boundaries; uid ends up back at userA but gen moved
    sw.switched = true;
    S.pbClearSession(true);
    S.localStorage.setItem('wl_pb', JSON.stringify({ uid: 'userB', token: 'tokB' }));
    S.pbClearSession(true);
    S.localStorage.setItem('wl_pb', SESSION);                   // back to A, same uid AND same token
    env.runTimers();                                             // polls fire now
    return new Promise(r => setTimeout(r, 20));
  }).then(() => {
    env.runTimers();
    test('B-owned recap was NOT merged into A state', () =>
      notOk(!!(S.state.nightlyLog && S.state.nightlyLog[recapDay] && /B PRIVATE/.test(S.state.nightlyLog[recapDay].text || ''))));
    test('busy state cleared after silent abort', () => notOk(S.state.nightBusy));
  }));
});

group('E4 — REPRODUCED PROBE: deletion exception cannot destroy the recovery set (finding 4)', () => {
  const blob = JSON.stringify({ notes: { d: 'z'.repeat(300) } });
  const env = createEnv({ localStorage: { wl_pb: SESSION, wl_v1: blob, wl_training_v1: '' } });
  const S = env.S;
  const TKEY = S.TKEY;
  const realRemove = S.localStorage.removeItem.bind(S.localStorage);
  S.localStorage.removeItem = (k) => { if (k === TKEY) throw new Error('simulated failure'); return realRemove(k); };
  S.location.reload = () => {};
  S.cfDisownLocal();
  const stamp = S.localStorage.getItem('cf:quarantined');
  test('quarantine committed', () => ok(!!stamp));
  test('recovery copy of core still exists despite the exception', () =>
    eq(S.localStorage.getItem('cf:quarantine:' + stamp + ':core'), blob));
  test('manifest still exists', () => ok(!!S.localStorage.getItem('cf:quarantine:' + stamp + ':manifest')));
  test('failed removal recorded as cleanupPending', () => {
    const p = JSON.parse(S.localStorage.getItem('cf:quarantine:' + stamp + ':cleanupPending') || '[]');
    ok(p.includes('training'));
  });
  test('boot repair completes the cleanup idempotently', () => {
    S.localStorage.removeItem = realRemove;                      // failure condition clears
    // simulate next boot's repair pass
    const env2 = createEnv({ localStorage: Object.fromEntries(S.localStorage._map) });
    notOk(!!env2.S.localStorage.getItem('cf:quarantine:' + stamp + ':cleanupPending'));
  });
});

group('E5 — legacy startDate: engaged WITHOUT weigh-ins now compares (judgment B)', () => {
  const env = createEnv({});
  const S = env.S;
  const N = (d) => S.cfCanon(S.cfNormalize(d));
  test('goal-setting user, differing unflagged dates => NOT equal', () =>
    notOk(N({ settings: { startDate: '2026-01-01', goalWeight: '180' } }) ===
          N({ settings: { startDate: '2026-02-02', goalWeight: '180' } })));
  test('GLP-configured user, differing unflagged dates => NOT equal', () =>
    notOk(N({ settings: { startDate: '2026-01-01' }, glp: { compound: { name: 'X' } } }) ===
          N({ settings: { startDate: '2026-02-02' }, glp: { compound: { name: 'X' } } })));
  test('both otherwise empty, differing unflagged dates => equal (fresh installs)', () =>
    ok(N({ settings: { startDate: '2026-01-01' } }) === N({ settings: { startDate: '2026-02-02' } })));
});

group('E6 — export guardrails', () => {
  const stamp = '1753490000001';
  const env = createEnv({ localStorage: {
    ['cf:quarantine:' + stamp + ':manifest']: JSON.stringify({ stamp, createdAt: 1, keys: ['core', 'training', 'workout'], sizes: {} }),
    ['cf:quarantine:' + stamp + ':core']: '{}',
    // training + workout components MISSING → incomplete
  } });
  const S = env.S;
  let confirmed = false; S.askConfirm = (m, fn) => { confirmed = true; fn(); };
  let toasts = []; S.toast = (m) => toasts.push(m);
  S.cfQuarExport(stamp);
  test('incomplete manifest cannot be exported', () => ok(toasts.some(t => /incomplete/.test(t))));
  test('no confirmation dialog was even shown for the incomplete set', () => notOk(confirmed));
});

report();

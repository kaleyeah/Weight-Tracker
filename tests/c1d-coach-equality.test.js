/* Commit 1d — executable tests for the four required changes:
   Coach Max non-destructive results, complete set-aside, corrected equality,
   and no unclaimed export (covered in the amended c1c suite). */
const { loadTestable, test, group, eq, ok, notOk, report } = require('./harness');
const { createEnv } = require('./integration-env');

const SESSION = JSON.stringify({ uid: 'userA', token: 'tokA', email: 'a@x.com', remember: true });
const C = loadTestable(['C1', 'C1D']);
const canon = C.cfCanon;
const DEFS = { theme: 'dark', startDate: '2026-07-25', units: 'lbs' };
const N = (d) => C.cfNormalizeWith(d, DEFS, [], canon);
const NEQ = (a, b) => canon(N(a)) === canon(N(b));

group('D1 — user-editable settings participate in equality (Blocker 3)', () => {
  test('macroAuto true vs false is NOT equal', () =>
    notOk(NEQ({ settings: { macroAuto: true } }, { settings: { macroAuto: false } })));
  test('calTargetAuto true vs false is NOT equal', () =>
    notOk(NEQ({ settings: { calTargetAuto: true } }, { settings: { calTargetAuto: false } })));
  test('startDate differs + user-set flag => NOT equal', () =>
    notOk(NEQ({ settings: { startDate: '2026-01-01', startDateSet: true } },
              { settings: { startDate: '2026-02-02', startDateSet: true } })));
  test('generated startDate on different days, fresh installs => equal (no false conflict)', () =>
    ok(NEQ({ settings: { startDate: '2026-07-01' } }, { settings: { startDate: '2026-07-25' } })));
  test('legacy rule: weights present makes an unflagged startDate REAL intent', () =>
    notOk(NEQ({ settings: { startDate: '2026-01-01' }, weights: [{ date: 'x', v: 1 }] },
              { settings: { startDate: '2026-02-02' }, weights: [{ date: 'x', v: 1 }] })));
  test('onboarded is device state — excluded by documented policy', () =>
    ok(NEQ({ settings: { onboarded: true } }, { settings: { onboarded: false } })));
});

group('D2 — coach fields extractor takes ONLY server-owned recap fields', () => {
  const d = { nightlyLog: { '2026-07-25': { text: 'recap', generated: 9 } },
              nightlySummary: { s: 1 }, weights: [{ date: 'x', v: 999 }], notes: { a: 'server' } };
  const f = C.cfCoachFieldsOf(d, '2026-07-25');
  test('recap entry extracted', () => eq(f.nightly.text, 'recap'));
  test('summaries extracted', () => ok(!!f.nightlySummary));
  test('athlete data fields are NOT extracted', () =>
    notOk('weights' in f || 'notes' in f));
});

group('D3 — INTEGRATED: edit during Coach Max polling survives (Blocker 1)', () => {
  const recapDay = '2026-07-25';
  // The recap appears on the server ONLY after the local edit is made, so the
  // full snapshot (which lacks that edit) can arrive solely via the coach
  // result path — boot/preflight legitimately see an empty server before it.
  const flag = { recapReady: false };
  const env = createEnv({
    localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' },
    fetchResponses: (e) => {
      if (e.method === 'GET' && /collections\/appdata\/records\?/.test(e.url)) {
        const rec = { id: 'row1', data: flag.recapReady
          ? { nightlyLog: { [recapDay]: { text: 'server recap', generated: 999 } },
              notes: { '2026-07-20': 'SERVER ONLY' } }   // full server snapshot WITHOUT the local edit
          : {} };
        return { ok: true, status: 200, text: () => Promise.resolve(''), json: () => Promise.resolve({ items: [rec] }) };
      }
      return null;
    },
  });
  const S = env.S;
  S.state.selDate = recapDay;
  S.dayMissing = () => [];                       // day complete
  S.revClean('core'); S.cfBaselineSet(S.cfCanon(S.cfNormalize(S.payload())));
  S.genNightly();
  return Promise.resolve().then(() => new Promise(r => setTimeout(r, 5))).then(() => {
    // the poll is now scheduled; make a LOCAL EDIT mid-flight, then the recap lands server-side
    S.state.notes['2026-07-25'] = 'edit made during polling';
    S.save();
    flag.recapReady = true;
    ok(S.isDirty(), 'precondition: dirty mid-poll');
    env.runTimers();                              // run the poll ticks
    return new Promise(r => setTimeout(r, 5)).then(() => { env.runTimers(); return new Promise(r2 => setTimeout(r2, 5)); });
  }).then(() => {
    test('local edit made during polling SURVIVES', () =>
      eq(S.state.notes['2026-07-25'], 'edit made during polling'));
    test('core stays dirty — recap did not mark clean', () => ok(S.isDirty()));
    test('recap itself was merged (server-owned field)', () =>
      eq((S.state.nightlyLog[recapDay] || {}).text, 'server recap'));
    test('server-only athlete data was NOT adopted', () =>
      notOk(!!S.state.notes['2026-07-20']));
    test('no appdata snapshot write occurred', () => eq(env.appdataWrites().filter(w => /"data"|"training"/.test(String(w.body))).length, 0));
  });
});

group('D4 — set-aside preserves the COMPLETE set incl. workout (Blocker 2)', () => {
  const woDraft = JSON.stringify({ entries: [{ ex: 'bench', sets: [1, 2, 3] }], padpadpadpad: 'x'.repeat(60) });
  const env = createEnv({ localStorage: {
    wl_pb: SESSION, wl_v1: JSON.stringify({ notes: { d: 'mine'.repeat(60) } }), wl_workout_v1: woDraft } });
  const S = env.S;
  // find the real WOKEY name from the evaluated script
  const WOKEY = S.WOKEY;
  S.localStorage.setItem(WOKEY, woDraft);
  test('workout draft alone counts as meaningful (gate)', () => ok(S.cfAnyUnownedMeaningful()));
  S.location.reload = () => {};                  // keep the sandbox alive
  S.cfDisownLocal();
  const stamp = S.localStorage.getItem('cf:quarantined');
  test('quarantine happened', () => ok(!!stamp));
  test('workout draft preserved byte-for-byte', () =>
    eq(S.localStorage.getItem('cf:quarantine:' + stamp + ':workout'), woDraft));
  test('manifest written with sizes', () => {
    const m = JSON.parse(S.localStorage.getItem('cf:quarantine:' + stamp + ':manifest'));
    ok(m.keys.includes('workout') && m.sizes.workout === woDraft.length);
  });
  test('sources removed only after verification', () =>
    notOk(!!S.localStorage.getItem(WOKEY)));
});

group('D5 — set-aside fails CLOSED when a quarantine write fails', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION, wl_v1: JSON.stringify({ notes: { d: 'y'.repeat(300) } }) } });
  const S = env.S;
  const realSet = S.localStorage.setItem.bind(S.localStorage);
  S.localStorage.setItem = (k, v) => { if (/^cf:quarantine:.*:training$/.test(k)) return; realSet(k, v); }; // simulate a dropped write
  S.location.reload = () => {};
  S.cfDisownLocal();
  test('no source key was deleted', () => ok(!!S.localStorage.getItem('wl_v1')));
  test('no manifest exists (partial copies cleaned)', () => {
    let found = false;
    for (const k of S.localStorage._map.keys()) if (/manifest/.test(k)) found = true;
    notOk(found);
  });
});

group('D6 — signed-out recovery flow exposes quarantined sets; auth screens do not', () => {
  const stamp = '1753490000000';
  const env = createEnv({ localStorage: {
    ['cf:quarantine:' + stamp + ':core']: '{}',
    ['cf:quarantine:' + stamp + ':training']: '',
    ['cf:quarantine:' + stamp + ':workout']: '',
    ['cf:quarantine:' + stamp + ':manifest']: JSON.stringify({ stamp, createdAt: 1, keys: ['core','training','workout'], sizes: {} }),
  } });
  const S = env.S;
  const html = S.pbLoginHTML();
  test('login (signed-out) screen lists the set-aside data', () => ok(/set aside on this device/i.test(html)));
  test('offers export + delete per set', () => ok(html.includes('cf:qexport:' + stamp) && html.includes('cf:qdelete:' + stamp)));
});

report();

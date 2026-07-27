/* Commit 1h — the Architect's .341 merge-review correction:
   reopening a completed day must invalidate any in-flight Coach recap
   request for that day, so a late poll result can never restore the
   recap the athlete explicitly deleted.
   Required tests 1-3 from the review, plus unit coverage of the
   generation mechanism itself. */
const { loadTestable, test, group, eq, ok, notOk, report, defer } = require('./harness');
const { createEnv } = require('./integration-env');

const SESSION = JSON.stringify({ uid: 'userA', token: 'tokA', email: 'a@x.com', remember: true });

group('H0 — unit: per-day recap generation', () => {
  const C = loadTestable(['C1H']);
  test('generation starts at 0 for any day', () => eq(C.cfRecapGen('2026-07-25'), 0));
  test('invalidate bumps only that day', () => {
    C.cfRecapInvalidate('2026-07-25');
    eq(C.cfRecapGen('2026-07-25'), 1);
    eq(C.cfRecapGen('2026-07-26'), 0);
  });
  test('ctx with stale generation is invalid; matching generation is valid', () => {
    const now = { owner: 'u', gen: 1, tok: 't' };
    const ctx = { owner: 'u', gen: 1, tok: 't', day: '2026-07-27', recapGen: C.cfRecapGen('2026-07-27') };
    ok(C.cfCoachCtxOk(ctx, now));
    C.cfRecapInvalidate('2026-07-27');
    notOk(C.cfCoachCtxOk(ctx, now));
  });
  test('generation of a DIFFERENT day does not invalidate the ctx', () => {
    const now = { owner: 'u', gen: 1, tok: 't' };
    const ctx = { owner: 'u', gen: 1, tok: 't', day: '2026-07-20', recapGen: C.cfRecapGen('2026-07-20') };
    C.cfRecapInvalidate('2026-07-21');
    ok(C.cfCoachCtxOk(ctx, now));
  });
});

group('H1 — REQUIRED 1: reopen during polling — late Coach result is ignored', () => defer((() => {
  const recapDay = '2026-07-25';
  const flag = { recapReady: false };
  const env = createEnv({
    localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' },
    fetchResponses: (e) => {
      if (e.method === 'GET' && /collections\/appdata\/records\?/.test(e.url)) {
        const rec = { id: 'row1', data: flag.recapReady
          ? { nightlyLog: { [recapDay]: { text: 'LATE SERVER RECAP', generated: 999 } } }
          : { nightlyLog: { [recapDay]: { text: 'old recap', generated: 1 } } } };
        return { ok: true, status: 200, text: () => Promise.resolve(''), json: () => Promise.resolve({ items: [rec] }) };
      }
      return null;
    },
  });
  const S = env.S;
  S.state.selDate = recapDay;
  S.dayMissing = () => [];
  // the day is COMPLETED: a recap exists locally
  S.state.nightlyLog = { [recapDay]: { text: 'old recap', generated: 1 } };
  S.revClean('core'); S.cfBaselineSet(S.cfCanon(S.cfNormalize(S.payload())));
  S.genNightly();                                     // athlete taps Regenerate
  return Promise.resolve().then(() => new Promise(r => setTimeout(r, 5))).then(() => {
    ok(S.state.nightBusy, 'precondition: request is in flight');
    S.reopenDay(recapDay);                            // athlete confirms Reopen mid-flight
    notOk(!!S.dayRecap(recapDay), 'precondition: recap deleted by reopen');
    flag.recapReady = true;                           // the late Coach result lands server-side
    env.runTimers();
    return new Promise(r => setTimeout(r, 5)).then(() => { env.runTimers(); return new Promise(r2 => setTimeout(r2, 5)); });
  }).then(() => {
    test('recap remains ABSENT — late result did not restore it', () =>
      notOk(!!S.dayRecap(recapDay)));
    test('day remains reopened (no completed state)', () =>
      notOk(!!(S.state.nightlyLog || {})[recapDay]));
    test('core remains dirty/pending after the reopen edit', () => ok(S.isDirty()));
    test('seenNightly was not restored for the day', () =>
      notOk(S.state.settings.seenNightly === recapDay));
    test('no appdata snapshot write occurred', () =>
      eq(env.appdataWrites().filter(w => /"data"|"training"/.test(String(w.body))).length, 0));
  });
})()));

group('H2 — REQUIRED 2: reopen while core is already dirty', () => {
  const day = '2026-07-24';
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' } });
  const S = env.S;
  S.state.nightlyLog = { [day]: { text: 'recap to clear', generated: 5 } };
  S.state.notes = { [day]: 'dirty edit that must survive' };
  S.save();                                           // core dirty before the reopen
  ok(S.isDirty(), 'precondition: dirty before reopen');
  S.reopenDay(day);
  test('recap cleared', () => notOk(!!S.dayRecap(day)));
  test('other dirty edits survive', () => eq(S.state.notes[day], 'dirty edit that must survive'));
  test('core remains dirty', () => ok(S.isDirty()));
  test('zero data/training POST/PATCH from the reopen', () =>
    eq(env.appdataWrites().filter(w => /"data"|"training"/.test(String(w.body))).length, 0));
});

group('H3 — REQUIRED 3: reopen an older day — other days\' recaps intact', () => {
  const oldDay = '2026-07-20', latestDay = '2026-07-25';
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' } });
  const S = env.S;
  // older recap lives ONLY in nightlyLog; the latest recap also occupies nightlySummary
  S.state.nightlyLog = {
    [oldDay]: { text: 'old day recap', generated: 2 },
    [latestDay]: { text: 'latest recap', generated: 7 },
  };
  S.state.nightlySummary = { date: latestDay, text: 'latest recap' };
  S.reopenDay(oldDay);
  test('older day recap cleared', () => notOk(!!S.dayRecap(oldDay)));
  test('latest day recap in nightlyLog intact', () =>
    eq((S.state.nightlyLog[latestDay] || {}).text, 'latest recap'));
  test('latest recap slot (nightlySummary) untouched', () =>
    eq((S.state.nightlySummary || {}).text, 'latest recap'));
  test('reopening the LATEST day clears its summary slot too', () => {
    S.reopenDay(latestDay);
    notOk(!!S.dayRecap(latestDay));
    notOk(!!S.state.nightlySummary);
  });
});

group('H4 — ordinary edits during polling still merge (1d behavior preserved)', () => defer((() => {
  // Guard against over-fixing: the Architect explicitly forbade blocking all
  // narrow recap merges whenever core is dirty. An ordinary edit (not a
  // reopen) during the poll must still let the recap merge.
  const recapDay = '2026-07-25';
  const flag = { recapReady: false };
  const env = createEnv({
    localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' },
    fetchResponses: (e) => {
      if (e.method === 'GET' && /collections\/appdata\/records\?/.test(e.url)) {
        const rec = { id: 'row1', data: flag.recapReady
          ? { nightlyLog: { [recapDay]: { text: 'server recap', generated: 999 } } }
          : {} };
        return { ok: true, status: 200, text: () => Promise.resolve(''), json: () => Promise.resolve({ items: [rec] }) };
      }
      return null;
    },
  });
  const S = env.S;
  S.state.selDate = recapDay;
  S.dayMissing = () => [];
  S.revClean('core'); S.cfBaselineSet(S.cfCanon(S.cfNormalize(S.payload())));
  S.genNightly();
  return Promise.resolve().then(() => new Promise(r => setTimeout(r, 5))).then(() => {
    S.state.notes[recapDay] = 'ordinary mid-poll edit';
    S.save();                                          // dirty, but NOT a reopen
    flag.recapReady = true;
    env.runTimers();
    return new Promise(r => setTimeout(r, 5)).then(() => { env.runTimers(); return new Promise(r2 => setTimeout(r2, 5)); });
  }).then(() => {
    test('recap merged despite ordinary dirty edit', () =>
      eq((S.state.nightlyLog[recapDay] || {}).text, 'server recap'));
    test('the ordinary edit survives', () => eq(S.state.notes[recapDay], 'ordinary mid-poll edit'));
    test('core stays dirty', () => ok(S.isDirty()));
  });
})()));

report('c1h-reopen-recap.test.js');

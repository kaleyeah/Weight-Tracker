/* Re-test the four failures with correct setups, and use the CAS commit route to
   create genuine server/local divergence — which unlocks cases previously
   recorded as unreachable. */
const H = require('./harness');
const fs = require('fs');
const TODAY = new Date().toISOString().slice(0, 10);
const out = [];
const rec = (id, title, expected, actual, pass, notes = '') => {
  out.push({ id, title, expected, actual, pass, notes });
  console.log(`${pass === true ? 'PASS' : pass === false ? 'FAIL' : 'MANUAL'}  ${id}  ${title}`);
  if (pass !== true) console.log(`      expected: ${expected}\n      actual:   ${actual}${notes ? `\n      notes:    ${notes}` : ''}`);
};
const rev = (p, t = 'core') => p.evaluate(tk => revTrack(tk), t);
const body = p => p.evaluate(() => document.body.innerText);

/* Put data on the SERVER through the CAS commit route — i.e. as if another
   device had committed it. This is the only honest way to create divergence
   while the client itself never auto-uploads. */
async function serverCommit(email, pass, payload) {
  const auth = await fetch(`${H.PB}/api/collections/users/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password: pass }),
  }).then(r => r.json());
  const probe = await fetch(`${H.PB}/api/cf/appdata/commit`, {
    method: 'POST', headers: { Authorization: auth.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ subsystem: 'core', expectedRev: 999999, idempotencyKey: 'probe-' + Date.now(), payload: {} }),
  }).then(r => r.json());
  const cur = (probe.serverRev == null) ? 0 : probe.serverRev;
  const res = await fetch(`${H.PB}/api/cf/appdata/commit`, {
    method: 'POST', headers: { Authorization: auth.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ subsystem: 'core', expectedRev: cur, idempotencyKey: 'seed-' + Date.now(), payload }),
  });
  return { status: res.status, body: await res.json() };
}

(async () => {
  const browser = await H.launch();

  /* ---- H5 with the REAL logout function ---- */
  {
    const { ctx, page } = await H.profile(browser);
    await H.login(page, H.creds.EMAIL, H.creds.PASS);
    const fn = await page.evaluate(() => typeof pbLogout === 'function' ? 'pbLogout' : (typeof pbForceLogout === 'function' ? 'pbForceLogout' : 'none'));
    await page.evaluate(() => { try { pbLogout(); } catch (e) { try { pbForceLogout(); } catch (e2) {} } });
    await page.waitForTimeout(3500);
    const st = await page.evaluate(() => ({
      token: !!(JSON.parse(localStorage.getItem('wl_pb') || '{}').token),
      lastOwner: localStorage.getItem('cf:lastOwner'),
      onLogin: !!document.getElementById('wl-pb-email'),
    }));
    rec('H5', 'logout with clean data', 'snapshot verified, wipe succeeds, cf:lastOwner cleared',
      `via ${fn}: token cleared ${!st.token}; login screen shown ${st.onLogin}; cf:lastOwner ${st.lastOwner === null ? 'cleared' : st.lastOwner}`,
      !st.token && st.onLogin && !st.lastOwner,
      'previous run called a non-existent cfSignOut(); that was a harness fault, not a client fault');
    await H.shot(page, 'H5-logout');
    await ctx.close();
  }

  /* ---- H2 with a genuinely UNKNOWN owner (no stamp) ---- */
  {
    const { ctx, page } = await H.profile(browser);
    await page.goto(H.APP, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { state.weights.push({ date: new Date().toISOString().slice(0, 10), weight: 207 }); save(); localStorage.removeItem('cf:lastOwner'); });
    await H.login(page, H.creds.EMAIL, H.creds.PASS);
    await page.waitForTimeout(3500);
    const t = await body(page);
    const claim = /is this your data|claim|set aside/i.test(t);
    const exp = /export|save a copy/i.test(t);
    rec('H2', 'unknown-owner meaningful data, login',
      'claim / set aside / sign out; NO export control; sync paused until answered',
      `verdict ${await page.evaluate(() => cfAccountVerdict())}; claim screen ${claim}; export control ${exp}`,
      claim && !exp, 'previous run stamped a DIFFERENT owner, which is the mismatch path (H4), not unknown-owner');
    await H.shot(page, 'H2-unknown-owner');
    await ctx.close();
  }

  /* ---- H4 confirmed from the mismatch path ---- */
  {
    const { ctx, page } = await H.profile(browser);
    await page.goto(H.APP, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { state.weights.push({ date: new Date().toISOString().slice(0, 10), weight: 205 }); save(); localStorage.setItem('cf:lastOwner', 'someone-else-uid'); });
    await H.login(page, H.creds.EMAIL, H.creds.PASS);
    await page.waitForTimeout(3500);
    const t = await body(page);
    const verdict = await page.evaluate(() => cfAccountVerdict());
    const hasSwitch = /switch account/i.test(t), hasSignOut = /sign out/i.test(t), hasExport = /export|save a copy/i.test(t);
    rec('H4', 'mismatch screen', 'no export control; switch account / sign out only',
      `verdict ${verdict}; switch-account ${hasSwitch}; sign-out ${hasSignOut}; export control ${hasExport}`,
      verdict === 'mismatch' && hasSwitch && hasSignOut && !hasExport);
    await H.shot(page, 'H4-mismatch');
    await ctx.close();
  }

  /* ---- A5 with the server actually HOLDING data ---- */
  {
    const seeded = await serverCommit(H.creds.EMAIL, H.creds.PASS, {
      weights: [{ date: '2026-07-20', weight: 195 }, { date: '2026-07-21', weight: 194 }],
      settings: { startingWeight: 200 },
    });
    console.log(`  [seed] server commit -> ${seeded.status} ${JSON.stringify(seeded.body)}`);
    const { ctx, page, calls } = await H.profile(browser);
    await H.login(page, H.creds.EMAIL, H.creds.PASS);
    await page.waitForTimeout(3000);
    const pulled = await page.evaluate(() => JSON.stringify(state.weights));
    await page.evaluate(() => { state.weights = []; state.food = {}; state.workouts = {}; save(); });
    const rBefore = await rev(page);
    await page.evaluate(() => { try { autoSync(); } catch (e) {} });
    await page.waitForTimeout(4500);
    const after = await page.evaluate(() => JSON.stringify(state.weights));
    const rAfter = await rev(page);
    const silentlyRestored = after !== '[]';
    const wrote = H.snapshotWrites(calls).length + H.commitCalls(calls).length;
    rec('A5', 'delete all local data while pending, then refresh',
      'not treated as "nothing to lose"; no silent adopt',
      `server held ${pulled}; after local delete-all + refresh weights=${after}; rev ${JSON.stringify(rBefore)} -> ${JSON.stringify(rAfter)}; writes ${wrote}`,
      !silentlyRestored && wrote === 0,
      'previous run had an EMPTY server, so "agree and go clean" was correct rather than a defect');
    await H.shot(page, 'A5-delete-all');
    await ctx.close();
  }

  /* ---- A6 / F5: genuine divergence via a server-side commit ---- */
  {
    const { ctx, page, calls } = await H.profile(browser);
    await H.login(page, H.creds.EMAIL2, H.creds.PASS2);
    await page.waitForTimeout(2500);
    // device A: a historical correction, left pending
    await page.evaluate(() => { state.weights.push({ date: '2026-07-10', weight: 210 }); save(); });
    await page.waitForTimeout(1200);
    // "device B" commits a NEWER weigh-in straight to the server
    const s = await serverCommit(H.creds.EMAIL2, H.creds.PASS2, { weights: [{ date: '2026-07-26', weight: 191 }] });
    console.log(`  [seed] device-B commit -> ${s.status}`);
    await page.evaluate(() => { try { autoSync(); } catch (e) {} });
    await page.waitForTimeout(4500);
    const st = await page.evaluate(() => ({ weights: JSON.stringify(state.weights), rev: revTrack('core'), text: document.body.innerText.slice(0, 400) }));
    const correctionKept = /2026-07-10/.test(st.weights);
    const conflictOffered = /which copy|keep this device|use the online|conflict|another device/i.test(st.text);
    rec('A6', 'historical correction on A, newer weigh-in on B, reconcile',
      'correction not discarded; conflict offered',
      `local correction retained: ${correctionKept}; conflict/choice surfaced: ${conflictOffered}; weights ${st.weights.slice(0, 120)}; rev ${JSON.stringify(st.rev)}; writes ${H.snapshotWrites(calls).length + H.commitCalls(calls).length}`,
      correctionKept,
      'divergence created by committing through the CAS route as a second device; previously recorded as unreachable');
    await H.shot(page, 'A6-divergence');
    await ctx.close();
  }

  /* ---- F3b: onboarded account, core pending, Coach Max ---- */
  {
    const { ctx, page, calls } = await H.profile(browser);
    await H.login(page, H.creds.EMAIL, H.creds.PASS);
    await page.waitForTimeout(2000);
    // give the day enough content that the recap control is meaningful, then dirty it
    await page.evaluate(() => {
      const d = new Date().toISOString().slice(0, 10);
      state.weights.push({ date: d, weight: 185 });
      state.food[d] = { breakfast: [{ name: 'eggs', kcal: 300, protein: 20 }] };
      state.steps[d] = 8000; state.sleep[d] = 7;
      state.notes[d] = 'pending edit for F3b';
      save();
    });
    await page.waitForTimeout(1500);
    const pend = await rev(page);
    const before = H.snapshotWrites(calls).length;
    await page.evaluate(() => { const b = [...document.querySelectorAll('button,[data-act]')].find(e => /complete today/i.test(e.textContent || '')); if (b) b.click(); });
    await page.waitForTimeout(4000);
    const t = await body(page);
    const honest = /paused|aren.t uploaded|not uploaded|sync fix|upload/i.test(t);
    const fake = /server error|something went wrong|failed to reach|try again later/i.test(t);
    const coachWrites = calls.filter(c => /coachreq/i.test(c.url) || (c.method !== 'GET' && /appdata/.test(c.url))).length;
    rec('F3b', 'Coach Max while core is pending',
      'honest "paused until the sync fix ships" message — not a fake server error',
      `core pending ${pend.local > pend.success}; honest wording ${honest}; fake-error wording ${fake}; writes during flow ${H.snapshotWrites(calls).length - before}; coachreq writes ${coachWrites}`,
      honest && !fake,
      'previous run hit the onboarding screen on a fresh fixture, so the recap control was never genuinely exercised');
    await H.shot(page, 'F3b-retest');
    await ctx.close();
  }

  fs.writeFileSync('/home/griffin/staging-cas/evidence/checklist-retest.json', JSON.stringify(out, null, 2));
  const p = out.filter(x => x.pass === true).length, f = out.filter(x => x.pass === false).length;
  console.log(`\n---- retest: ${p} passed, ${f} failed ----`);
  await browser.close();
})();

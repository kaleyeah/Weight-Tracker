/* H5 — "logout with CLEAN data".
   The live pbLogout branches: pending -> "you have changes" (refuses); clean ->
   cfSnapLocal("before-logout") -> verify -> pbForceLogout + reload.
   Earlier attempts never reached the clean branch. Set the precondition
   explicitly (test setup, not the behaviour under test), then assert the wipe. */
const H = require('./harness');
const fs = require('fs');

(async () => {
  const browser = await H.launch();
  const { ctx, page } = await H.profile(browser);
  await H.login(page, H.creds.EMAIL2, H.creds.PASS2);
  await page.waitForTimeout(3000);

  const clean = await page.evaluate(() => {
    revClean('core'); revClean('training');
    try { cfClearPending(); } catch (e) {}
    return { dirty: (typeof revAnyDirty === 'function') ? revAnyDirty() : 'n/a', pending: (typeof cfPending !== 'undefined') ? cfPending : 'n/a' };
  });
  console.log('  precondition — revAnyDirty:', clean.dirty, '| cfPending:', clean.pending);

  const ownerBefore = await page.evaluate(() => localStorage.getItem('cf:lastOwner'));
  await page.evaluate(() => pbLogout());
  await page.waitForTimeout(1200);
  const dlg = await page.evaluate(() => {
    const y = document.querySelector('[data-act="confirm:yes"]');
    return { yes: y ? (y.textContent || '').trim() : null, text: document.body.innerText.slice(0, 300) };
  });
  await H.shot(page, 'H5-clean-dialog');
  // an overlay intercepts real pointer events, so dispatch the click directly
  if (dlg.yes) await page.evaluate(() => document.querySelector('[data-act="confirm:yes"]').click());
  await page.waitForTimeout(5000);

  const st = await page.evaluate(() => ({
    token: !!(JSON.parse(localStorage.getItem('wl_pb') || '{}').token),
    lastOwner: localStorage.getItem('cf:lastOwner'),
    onLogin: !!document.getElementById('wl-pb-email'),
  }));
  const pass = !st.token && st.onLogin && !st.lastOwner;
  console.log(`${pass ? 'PASS' : 'FAIL'}  H5  logout with clean data`);
  console.log(`  dialog: ${dlg.yes ? `"${dlg.yes}"` : 'none'} | token cleared ${!st.token} | login screen ${st.onLogin} | cf:lastOwner ${st.lastOwner === null ? 'cleared' : st.lastOwner} (was ${ownerBefore})`);
  await H.shot(page, 'H5-clean-after');

  fs.writeFileSync('/home/griffin/staging-cas/evidence/checklist-h5.json', JSON.stringify([{
    id: 'H5', title: 'logout with clean data',
    expected: 'snapshot verified, wipe succeeds, cf:lastOwner cleared',
    actual: `precondition clean (revAnyDirty ${clean.dirty}); confirm dialog ${dlg.yes ? `"${dlg.yes}"` : 'none'}; token cleared ${!st.token}; login screen ${st.onLogin}; cf:lastOwner ${st.lastOwner === null ? 'cleared' : st.lastOwner}`,
    pass,
    notes: 'Three earlier attempts were harness faults: cfSignOut() does not exist; pbLogout() opens a dialog that was never answered; and the account was pending, so the hardened pbLogout correctly took its "you have changes" branch instead of wiping.',
  }], null, 2));
  await ctx.close();
  await browser.close();
})();

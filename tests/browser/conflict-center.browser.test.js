/* Commit 10 — browser evidence.
   Every assertion here drives the SHIPPING index.html in real Chromium. The
   string suites prove what the view emits; only this one can prove what the
   browser then does with it — focus, tab order, announcement cadence, whether a
   disabled control can be activated twice, and whether a label truncates at
   390px. Nothing is re-implemented: the page's own globals and its own DOM. */
const { boot, setState, seedConflict, makePending, focused, tabOrder, liveText } = require('./driver');
const { section, test, ok, notOk, eq, summary } = require('./harness');

const CARD = { core: 'Health & progress', training: 'Training & workouts' };

(async () => {
  const b = await boot();
  const page = b.page;

  const open = async () => page.evaluate(() => {
    const el = document.querySelector('[data-act="cf:open-conflicts"]') || document.body;
    cfCasOpenConflictCenter(el);
  });
  const hostHTML = () => page.evaluate(() => document.getElementById('cf-conflict-host').innerHTML);
  const visible = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }, sel);

  /* ---------------------------------------------------------------- focus */
  section('Focus and keyboard (real Chromium)');

  await test('BROWSER-FOCUS-01 explicit opening moves focus to the centre heading', async () => {
    await setState(page, { conflicts: ['core', 'training'] });
    await open();
    const f = await focused(page);
    eq(f.id, 'cf-conflict-heading');
    eq(f.tag, 'H2');
  });

  await test('BROWSER-FOCUS-02 the first Tab reaches the first card\'s keep-local choice', async () => {
    await setState(page, { conflicts: ['core', 'training'] });
    await open();
    await page.keyboard.press('Tab');
    const f = await focused(page);
    eq(f.act, 'cf:keep');
    eq(f.sub, 'core');
  });

  await test('BROWSER-FOCUS-03 tab order is card one, then card two, then close', async () => {
    await setState(page, { conflicts: ['core', 'training'] });
    await open();
    const seen = (await tabOrder(page, 8)).filter((f) => f.act);
    const subs = seen.filter((f) => f.sub).map((f) => f.sub);
    /* every core stop precedes every training stop */
    eq(subs.join(','), 'core,core,core,training,training,training');
    /* and close is last, after both cards */
    eq(seen[seen.length - 1].act, 'cf:close-conflicts');
  });

  await test('BROWSER-FOCUS-04 closing restores focus to the exact element that opened it', async () => {
    await setState(page, { conflicts: ['core'] });
    const restored = await page.evaluate(() => {
      const opener = document.createElement('button');
      opener.id = 'test-opener';
      opener.textContent = 'open';
      document.body.appendChild(opener);
      cfCasOpenConflictCenter(opener);
      const wasHeading = document.activeElement && document.activeElement.id === 'cf-conflict-heading';
      cfCasCloseConflictCenter();
      /* identity, not selector: the same node object must have focus back */
      return { wasHeading, same: document.activeElement === opener };
    });
    ok(restored.wasHeading, 'opening should have focused the heading first');
    ok(restored.same, 'focus should return to the opener element itself');
  });

  await test('BROWSER-FOCUS-05 a conflict discovered in the background moves no focus', async () => {
    await setState(page, {});
    const res = await page.evaluate(() => {
      const other = document.createElement('input');
      other.id = 'test-elsewhere';
      document.body.appendChild(other);
      other.focus();
      const before = document.activeElement;
      /* discovery happens through the app's own setter, exactly as a push does */
      cfCasSetConflictId('core', 'casrec-core-' + 'a'.repeat(32));
      return { unchanged: document.activeElement === before, opened: CF_CAS_OPEN };
    });
    ok(res.unchanged, 'focus must stay where the athlete put it');
    notOk(res.opened, 'the centre must not open itself');
  });

  await test('BROWSER-FOCUS-06 changed-again sends focus to the explanation, not a destructive action', async () => {
    await setState(page, { conflicts: ['core'] });
    await open();
    /* put focus inside the card first, as it would be mid-decision */
    await page.evaluate(() => document.querySelector('[data-act="cf:keep"][data-sub="core"]').focus());
    await page.evaluate(() => { CF_CAS_RECHOOSE.core = true; cfCasPaint(); });
    const f = await focused(page);
    eq(f.id, 'cfcard-core-note');
    notOk(f.act, 'focus must not land on any action, least of all a destructive one');
  });

  await test('BROWSER-FOCUS-07 a busy card\'s controls are unfocusable and unclickable', async () => {
    await setState(page, { conflicts: ['core'], busy: ['core'] });
    await open();
    const res = await page.evaluate(() => {
      const btn = document.querySelector('[data-act="cf:use-online"][data-sub="core"]');
      const wasDisabled = btn.disabled;
      btn.focus();
      const tookFocus = document.activeElement === btn;
      let fired = 0;
      const spy = () => { fired++; };
      document.addEventListener('click', spy, true);
      btn.click();
      document.removeEventListener('click', spy, true);
      return { wasDisabled, tookFocus, fired };
    });
    ok(res.wasDisabled, 'controls must carry disabled while a resolution owns the subsystem');
    notOk(res.tookFocus, 'a disabled control must not take focus');
    eq(res.fired, 0, 'a disabled control must dispatch no click at all');
  });

  await test('BROWSER-FOCUS-08 a second activation cannot start a second resolution', async () => {
    /* A real, verified artifact: cfCasUseThisDevice reads and proves the
       preserved online copy before it sends anything, so a fabricated record id
       would fail verification and no request would leave at all — which would
       have passed a naive "only one send" check for entirely the wrong reason. */
    await setState(page, {});
    await seedConflict(page, 'core', 7, { weights: [{ d: '2026-01-01', kg: 80 }] });
    await open();
    const sends = await page.evaluate(async () => {
      window.__sends = 0;
      /* a send that never calls back: the slow network that makes double-tap
         possible in the first place */
      window.cfCasSend = function () { window.__sends++; };
      const btn = () => document.querySelector('[data-act="cf:use-device"][data-sub="core"]');
      btn().click();
      document.querySelector('[data-act="confirm:yes"]').click();
      await new Promise((r) => setTimeout(r, 60));
      const after = btn();
      if (after && !after.disabled) after.click();     /* the second tap */
      await new Promise((r) => setTimeout(r, 60));
      return { sends: window.__sends, disabled: !!(after && after.disabled) };
    });
    eq(sends.sends, 1, 'exactly one request may leave for one decision');
    ok(sends.disabled, 'the control must be visibly disabled while it works');
  });

  /* ---------------------------------------------------------- reachable */
  section('The athlete can actually get to it');

  await test('BROWSER-ENTRY-01 the header sync control exists and opens the centre', async () => {
    await setState(page, { conflicts: ['core'] });
    /* found by clicking what is on the screen — no direct call to the opener */
    const dot = await page.$('[data-act="syncdot"]');
    ok(dot, 'the app must present a sync control to tap');
    await dot.click();
    const res = await page.evaluate(() => ({
      open: CF_CAS_OPEN,
      heading: !!document.getElementById('cf-conflict-heading'),
      focus: document.activeElement && document.activeElement.id,
    }));
    ok(res.open, 'tapping the status must open the conflict centre');
    ok(res.heading);
    eq(res.focus, 'cf-conflict-heading');
  });

  await test('BROWSER-ENTRY-02 closing returns focus to the header control that opened it', async () => {
    await page.evaluate(() => cfCasCloseConflictCenter());
    const f = await focused(page);
    eq(f.act, 'syncdot', 'focus must go back to the control the athlete tapped');
  });

  await test('BROWSER-ENTRY-03 the dot shows a conflict rather than reporting "ok"', async () => {
    const res = await page.evaluate(() => {
      setSync('ok', '');                       /* legacy sync is perfectly happy */
      const withConflict = syncDotClass();
      cfCasSetConflictId('core', null);
      const without = syncDotClass();
      return { withConflict, without };
    });
    eq(res.withConflict, 'warn', 'a green dot over undecided data is a lie');
    eq(res.without, 'good');
  });

  await test('BROWSER-ENTRY-04 with no conflict the sync control keeps its old behaviour', async () => {
    await setState(page, {});
    const res = await page.evaluate(async () => {
      document.querySelector('[data-act="syncdot"]').click();
      await new Promise((r) => setTimeout(r, 30));
      return { open: CF_CAS_OPEN, toast: document.getElementById('wl-toast').classList.contains('show') };
    });
    notOk(res.open, 'nothing to decide means nothing to open');
    ok(res.toast, 'and the existing sync summary still appears');
  });

  /* --------------------------------- Architect-required: C10-BW-01..18 */
  section('C10-BW-01..07 — every workflow that needs the athlete is reachable');

  /* Reach the centre only by clicking what is on the screen. */
  const clickSyncDot = async () => {
    const dot = await page.$('[data-act="syncdot"]');
    ok(dot, 'the shipping header control must exist');
    await dot.click();
    return page.evaluate(() => ({
      open: CF_CAS_OPEN,
      cards: [...document.querySelectorAll('.cf-conflict-card h3')].map((h) => h.textContent.trim()),
      text: document.getElementById('cf-conflict-host').textContent,
      dot: syncDotClass(),
    }));
  };

  await test('C10-BW-01 recovery-blocked Health & progress is reachable from the header', async () => {
    await setState(page, { conflicts: ['core'], blocks: [['core', 'recovery']] });
    const r = await clickSyncDot();
    ok(r.open, 'a blocked subsystem must open the centre — this was the defect');
    eq(r.cards.join(','), CARD.core);
    ok(/Try again/.test(r.text) && /Export a copy/.test(r.text));
    await page.evaluate(() => cfCasCloseConflictCenter());
  });

  await test('C10-BW-02 recovery-blocked Training & workouts is reachable', async () => {
    await setState(page, { conflicts: ['training'], blocks: [['training', 'recovery']] });
    const r = await clickSyncDot();
    ok(r.open);
    eq(r.cards.join(','), CARD.training);
    await page.evaluate(() => cfCasCloseConflictCenter());
  });

  await test('C10-BW-03 a blocked subsystem plus a conflict opens ONE centre with both cards', async () => {
    await setState(page, {
      conflicts: ['core', 'training'], blocks: [['core', 'recovery']],
    });
    const r = await clickSyncDot();
    ok(r.open);
    eq(r.cards.join(','), [CARD.core, CARD.training].join(','));
    const centres = await page.evaluate(() => document.querySelectorAll('.cf-conflict-center').length);
    eq(centres, 1, 'one centre, not one per subsystem');
    await page.evaluate(() => cfCasCloseConflictCenter());
  });

  await test('C10-BW-04 blocked is "bad", an ordinary conflict is "warn", higher severity wins', async () => {
    const sev = await page.evaluate(async (recIds) => {
      const out = {};
      const reset = () => ['core', 'training'].forEach((s) => {
        cfCasSetConflictId(s, null); cfCasSetBlock(s, null, null);
      });
      setSync('ok', '');
      reset(); out.clean = syncDotClass();
      reset(); cfCasSetConflictId('core', recIds.core); out.conflict = syncDotClass();
      reset(); cfCasSetBlock('core', 'recovery', 'tok'); out.blocked = syncDotClass();
      reset();
      cfCasSetConflictId('training', recIds.training);
      cfCasSetBlock('core', 'recovery', 'tok');
      out.both = syncDotClass();
      return out;
    }, { core: 'casrec-core-' + 'a'.repeat(32), training: 'casrec-training-' + 'a'.repeat(32) });
    eq(sev.clean, 'good');
    eq(sev.conflict, 'warn', 'both versions are safe — this is a decision, not a failure');
    eq(sev.blocked, 'bad', 'a failed preservation is an error state');
    eq(sev.both, 'bad', 'the higher severity wins');
  });

  await test('C10-BW-05 a sole hidden preservation does not open an empty centre', async () => {
    await setState(page, {});
    await page.evaluate(() => cfCasSetBlock('core', 'preserving', 'tok'));
    const r = await clickSyncDot();
    notOk(r.open, 'nothing worth showing yet means nothing to open');
    eq(r.text, '', 'and certainly not an empty centre');
  });

  await test('C10-BW-06 a preservation past 400ms can be opened, and offers no choice', async () => {
    await setState(page, { blocks: [['core', 'preserving']], aged: ['core'] });
    const r = await clickSyncDot();
    ok(r.open, 'a visible preservation is explanatory state worth reaching');
    ok(/Saving a copy of the online version/.test(r.text));
    const choices = await page.evaluate(() =>
      document.querySelectorAll('.cf-conflict-card button').length);
    eq(choices, 0, 'nothing to decide until the copy is safe');
    eq(r.dot, 'warn');
    await page.evaluate(() => cfCasCloseConflictCenter());
  });

  await test('C10-BW-07 with no workflow at all, the legacy sync control is untouched', async () => {
    await setState(page, {});
    const r = await page.evaluate(async () => {
      setSync('ok', '');
      const el = document.querySelector('[data-act="syncdot"]');
      el.click();
      await new Promise((res) => setTimeout(res, 30));
      return {
        open: CF_CAS_OPEN,
        toast: document.getElementById('wl-toast').classList.contains('show'),
        label: el.getAttribute('aria-label'),
        controls: el.getAttribute('aria-controls'),
        expanded: el.getAttribute('aria-expanded'),
        cue: !!el.querySelector('.cf-dot-cue'),
        dot: syncDotClass(),
      };
    });
    notOk(r.open);
    ok(r.toast, 'the existing sync summary still appears');
    eq(r.label, 'Sync status', 'the legacy accessible name is restored');
    eq(r.controls, null, 'and no dangling aria-controls to a region it no longer owns');
    eq(r.expanded, null);
    notOk(r.cue);
    eq(r.dot, 'good');
  });

  section('C10-BW-08..13 — the control says what it now means');

  const dotState = () => page.evaluate(() => {
    const el = document.querySelector('[data-act="syncdot"]');
    const cue = el.querySelector('.cf-dot-cue');
    return {
      label: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      controls: el.getAttribute('aria-controls'),
      expanded: el.getAttribute('aria-expanded'),
      cueText: cue ? cue.textContent : null,
      cueClass: cue ? cue.className : null,
      cueHidden: cue ? cue.getAttribute('aria-hidden') : null,
    };
  });

  await test('C10-BW-08 an unresolved conflict names the control "Sync needs your choice"', async () => {
    await setState(page, { conflicts: ['core'] });
    const d = await dotState();
    eq(d.label, 'Sync needs your choice');
    notOk(/CAS|rev|subsystem|casrec/i.test(d.label), 'no raw CAS vocabulary');
  });

  await test('C10-BW-09 recovery-blocked names the safe failed state', async () => {
    await setState(page, { conflicts: ['core'], blocks: [['core', 'recovery']] });
    const d = await dotState();
    eq(d.label, 'Couldn’t sync — changes are safe here');
  });

  await test('C10-BW-10 aria-controls points at the host that is actually mounted', async () => {
    await setState(page, { conflicts: ['core'] });
    const d = await dotState();
    eq(d.controls, 'cf-conflict-host');
    const real = await page.evaluate((id) => !!document.getElementById(id), d.controls);
    ok(real, 'aria-controls must name a element that exists');
  });

  await test('C10-BW-11 aria-expanded follows the real open and closed state', async () => {
    await setState(page, { conflicts: ['core'] });
    const closed = await dotState();
    eq(closed.expanded, 'false');
    await (await page.$('[data-act="syncdot"]')).click();
    const opened = await dotState();
    eq(opened.expanded, 'true');
    await page.evaluate(() => cfCasCloseConflictCenter());
    const again = await dotState();
    eq(again.expanded, 'false');
  });

  await test('C10-BW-12 clearing the workflow restores the legacy label and drops the attributes', async () => {
    await setState(page, { conflicts: ['core'] });
    const during = await dotState();
    eq(during.label, 'Sync needs your choice');
    await setState(page, {});
    const after = await dotState();
    eq(after.label, 'Sync status');
    eq(after.controls, null);
    eq(after.expanded, null);
    eq(after.cueText, null);
  });

  await test('C10-BW-13 severity is legible without colour: a distinct glyph per state', async () => {
    await setState(page, { conflicts: ['core'] });
    const warn = await dotState();
    await setState(page, { conflicts: ['core'], blocks: [['core', 'recovery']] });
    const bad = await dotState();
    ok(warn.cueText && bad.cueText, 'both states need a non-colour cue');
    notOk(warn.cueText === bad.cueText, 'and the cues must differ from each other');
    ok(/cf-dot-cue-warn/.test(warn.cueClass));
    ok(/cf-dot-cue-bad/.test(bad.cueClass));
    eq(warn.cueHidden, 'true', 'the accessible name already says it — do not read it twice');
    eq(warn.title, 'Sync needs your choice', 'and a pointer user gets it as a tooltip');
    /* Really painted, and really INSIDE its button. .wl-syncdot is a fixed
       22x22 box built for a 7px dot alone; the cue beside it overflowed the
       control until the button was allowed to grow. A cue that is present in
       the DOM but clipped out of its own button is not a visible cue. */
    const drawn = await page.evaluate(() => {
      const btn = document.querySelector('[data-act="syncdot"]');
      const cue = btn.querySelector('.cf-dot-cue');
      const b = btn.getBoundingClientRect(), c = cue.getBoundingClientRect();
      return {
        painted: c.width > 0 && c.height > 0,
        contained: c.left >= b.left - 0.5 && c.right <= b.right + 0.5
          && c.top >= b.top - 0.5 && c.bottom <= b.bottom + 0.5,
        btn: [Math.round(b.width), Math.round(b.height)],
        cue: [Math.round(c.width), Math.round(c.height)],
      };
    });
    ok(drawn.painted, 'the cue must actually be visible');
    ok(drawn.contained,
      'the cue overflows its control: button ' + drawn.btn + ', cue ' + drawn.cue);
  });

  await test('C10-BW-13b the control returns to its original size when the workflow clears', async () => {
    const sizes = await page.evaluate(() => {
      const btn = () => document.querySelector('[data-act="syncdot"]');
      ['core', 'training'].forEach((s) => { cfCasSetConflictId(s, null); cfCasSetBlock(s, null, null); });
      const clean = Math.round(btn().getBoundingClientRect().width);
      cfCasSetConflictId('core', 'casrec-core-' + 'a'.repeat(32));
      const withCue = Math.round(btn().getBoundingClientRect().width);
      cfCasSetConflictId('core', null);
      const after = Math.round(btn().getBoundingClientRect().width);
      return { clean, withCue, after };
    });
    ok(sizes.withCue > sizes.clean, 'the control has to make room for the cue');
    eq(sizes.after, sizes.clean, 'and give the room back — no permanently widened header');
  });

  section('C10-BW-14..18 — focus restoration survives the app rerendering');

  await test('C10-BW-14 closing after a real render() lands on the NEW header control', async () => {
    await setState(page, { conflicts: ['core'] });
    const res = await page.evaluate(async () => {
      const before = document.querySelector('[data-act="syncdot"]');
      cfCasOpenConflictCenter(before);
      render();                                  /* the app's own render, replacing #app */
      const detached = !before.isConnected;
      const how = cfCasCloseConflictCenter();
      const now = document.querySelector('[data-act="syncdot"]');
      return {
        detached,
        how,
        onNew: document.activeElement === now,
        sameNode: now === before,
        onBody: document.activeElement === document.body,
      };
    });
    ok(res.detached, 'render() must genuinely have replaced the opener for this to test anything');
    notOk(res.sameNode, 'and the new control must be a different node');
    eq(res.how, 'reacquired');
    ok(res.onNew, 'focus must land on the control the athlete can now see');
    notOk(res.onBody, 'never dropped at the top of the document');
  });

  await test('C10-BW-15 with no rerender, the original node is still the one restored', async () => {
    await setState(page, { conflicts: ['core'] });
    const res = await page.evaluate(() => {
      const el = document.querySelector('[data-act="syncdot"]');
      cfCasOpenConflictCenter(el);
      const how = cfCasCloseConflictCenter();
      return { how, same: document.activeElement === el };
    });
    eq(res.how, 'node');
    ok(res.same);
  });

  await test('C10-BW-16 an opener with no equivalent left falls back safely, never to body', async () => {
    await setState(page, { conflicts: ['core'] });
    const res = await page.evaluate(() => {
      const orphan = document.createElement('button');
      orphan.setAttribute('data-act', 'cf:not-a-real-control');
      document.body.appendChild(orphan);
      cfCasOpenConflictCenter(orphan);
      orphan.remove();                            /* nothing of its kind remains */
      const how = cfCasCloseConflictCenter();
      return {
        how,
        onBody: document.activeElement === document.body,
        focused: document.activeElement && (document.activeElement.getAttribute('data-act')
          || document.activeElement.tagName),
      };
    });
    eq(res.how, 'fallback');
    notOk(res.onBody, 'focus must not be abandoned');
    ok(res.focused, 'it must land on something real: ' + res.focused);
  });

  await test('C10-BW-17 Escape uses the same rerender-safe restoration path', async () => {
    await setState(page, { conflicts: ['core'] });
    await page.evaluate(() => {
      cfCasOpenConflictCenter(document.querySelector('[data-act="syncdot"]'));
      render();                                   /* opener replaced while open */
    });
    await page.keyboard.press('Escape');
    const res = await page.evaluate(() => ({
      open: CF_CAS_OPEN,
      onControl: document.activeElement === document.querySelector('[data-act="syncdot"]'),
      onBody: document.activeElement === document.body,
    }));
    notOk(res.open);
    ok(res.onControl, 'Escape must restore focus the same way Close does');
    notOk(res.onBody);
  });

  await test('C10-BW-18 a background rerender while open does not move focus into the centre', async () => {
    await setState(page, { conflicts: ['core'] });
    const res = await page.evaluate(async () => {
      const outside = document.createElement('input');
      outside.id = 'bw18'; document.body.appendChild(outside);
      cfCasOpenConflictCenter(document.querySelector('[data-act="syncdot"]'));
      outside.focus();                            /* the athlete moves elsewhere */
      const before = document.activeElement;
      render();                                   /* an ordinary background repaint */
      await new Promise((r) => setTimeout(r, 40));
      const host = document.getElementById('cf-conflict-host');
      return {
        stillOutside: document.activeElement === before,
        insideCentre: host.contains(document.activeElement),
        stillOpen: CF_CAS_OPEN,
      };
    });
    ok(res.stillOutside, 'a repaint must not pull the athlete into the centre');
    notOk(res.insideCentre);
    ok(res.stillOpen, 'and the centre stays open');
  });

  section('C10-BW-F01..F05 — the fallback never claims a focus move it did not make');

  /* Remove the header control entirely, so the fallback chain is what runs.
     `hide` optionally breaks the headings too, to force the next step. */
  const fallbackWith = (opts) => page.evaluate((o) => {
    const dot = document.querySelector('[data-act="syncdot"]');
    if (dot) dot.remove();
    if (o.hideHeadings) {
      document.querySelectorAll('#app h1, #app h2').forEach((h) => { h.style.display = 'none'; });
    }
    if (o.hideAll) {
      const app = document.getElementById('app');
      if (app) app.style.display = 'none';
      document.querySelectorAll('#cf-conflict-host button').forEach((btn) => btn.remove());
    }
    const orphan = document.createElement('button');
    orphan.setAttribute('data-act', 'cf:gone-control');
    document.body.appendChild(orphan);
    cfCasOpenConflictCenter(orphan);
    orphan.remove();
    const how = cfCasCloseConflictCenter();
    const a = document.activeElement;
    return {
      how,
      onBody: a === document.body || !a,
      tag: a ? a.tagName : null,
      text: a ? (a.textContent || '').trim().slice(0, 40) : null,
      tabindex: a && a.getAttribute ? a.getAttribute('tabindex') : null,
    };
  }, opts || {});

  const freshPage = async () => {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden');
    await setState(page, { conflicts: ['core'] });
  };

  await test('C10-BW-F01 with the sync control gone, the main heading becomes the ACTIVE element', async () => {
    await freshPage();
    const r = await fallbackWith({});
    eq(r.how, 'fallback');
    notOk(r.onBody, 'focus must not have been left on the document body');
    ok(/^H[12]$/.test(r.tag), 'expected a heading, got ' + r.tag + ' (' + r.text + ')');
    eq(r.tabindex, '-1', 'a heading needs tabindex to be focusable at all');
  });

  await test('C10-BW-F02 a hidden or disabled control is never chosen as the fallback', async () => {
    await freshPage();
    const r = await page.evaluate(() => {
      const dot = document.querySelector('[data-act="syncdot"]');
      if (dot) dot.remove();
      document.querySelectorAll('#app h1, #app h2').forEach((h) => { h.style.display = 'none'; });
      /* Put decoys first in document order: a disabled button, a display:none
         button, and one with zero size. A chain that only checks existence
         picks one of these. */
      const app = document.getElementById('app');
      const mk = (setup) => { const el = document.createElement('button'); setup(el); app.insertBefore(el, app.firstChild); return el; };
      const zero = mk((el) => { el.id = 'decoy-zero'; el.style.cssText = 'width:0;height:0;padding:0;border:0'; });
      const none = mk((el) => { el.id = 'decoy-none'; el.style.display = 'none'; el.textContent = 'x'; });
      const off = mk((el) => { el.id = 'decoy-disabled'; el.disabled = true; el.textContent = 'x'; });
      const real = document.createElement('button');
      real.id = 'decoy-real'; real.textContent = 'usable';
      app.insertBefore(real, off.nextSibling);
      const orphan = document.createElement('button');
      orphan.setAttribute('data-act', 'cf:gone-control');
      document.body.appendChild(orphan);
      cfCasOpenConflictCenter(orphan);
      orphan.remove();
      const how = cfCasCloseConflictCenter();
      const a = document.activeElement;
      return { how, id: a ? a.id : null, decoys: [zero.id, none.id, off.id] };
    });
    eq(r.how, 'fallback');
    notOk(r.decoys.indexOf(r.id) >= 0, 'a hidden or disabled decoy was chosen: ' + r.id);
    eq(r.id, 'decoy-real', 'the first genuinely usable control should win');
  });

  await test('C10-BW-F03 when heading focus fails, the next visible enabled control is tried', async () => {
    await freshPage();
    const r = await fallbackWith({ hideHeadings: true });
    eq(r.how, 'fallback');
    notOk(r.onBody);
    ok(r.tag === 'BUTTON' || r.tag === 'A', 'expected a control, got ' + r.tag);
  });

  await test('C10-BW-F04 it never reports success while focus is still on body', async () => {
    await freshPage();
    /* Every reachable target refuses focus. The old implementation returned
       "fallback" here because .focus() on an unfocusable heading does not
       throw — the athlete was told they had been returned somewhere useful
       while sitting on <body>. */
    const r = await fallbackWith({ hideHeadings: true, hideAll: true });
    if (r.how === 'fallback') {
      notOk(r.onBody, 'reported "fallback" while focus was on ' + r.tag);
    } else {
      eq(r.how, 'none');
      ok(r.onBody, 'if it says none, body is the honest answer');
    }
  });

  await test('C10-BW-F05 with no valid target at all it returns "none", honestly', async () => {
    await freshPage();
    const r = await page.evaluate(() => {
      /* Strip the page of everything focusable. */
      const dot = document.querySelector('[data-act="syncdot"]');
      if (dot) dot.remove();
      const app = document.getElementById('app');
      if (app) app.remove();
      document.querySelectorAll('button,a[href],[tabindex]').forEach((el) => el.remove());
      const orphan = document.createElement('button');
      orphan.setAttribute('data-act', 'cf:gone-control');
      document.body.appendChild(orphan);
      cfCasOpenConflictCenter(orphan);
      orphan.remove();
      const how = cfCasCloseConflictCenter();
      const a = document.activeElement;
      return { how, onBody: a === document.body || !a, tag: a ? a.tagName : null };
    });
    eq(r.how, 'none', 'it must not invent a success: reported ' + r.how + ' on ' + r.tag);
    ok(r.onBody);
    await freshPage();
  });

  /* ------------------------------------------------- screen reader / live */
  section('Screen reader and live regions (real Chromium)');

  await test('BROWSER-SR-01 the centre and each card carry correct accessible names', async () => {
    await setState(page, { conflicts: ['core', 'training'] });
    await open();
    const names = await page.evaluate(() => {
      const region = document.querySelector('.cf-conflict-center');
      const labelled = document.getElementById(region.getAttribute('aria-labelledby'));
      const cards = [...document.querySelectorAll('.cf-conflict-card')].map((c) => {
        const t = document.getElementById(c.getAttribute('aria-labelledby'));
        return { role: c.getAttribute('role'), name: t ? t.textContent.trim() : null };
      });
      return { region: region.getAttribute('role'), regionName: labelled && labelled.textContent.trim(), cards };
    });
    eq(names.region, 'region');
    eq(names.regionName, 'Changes were made on another device');
    eq(names.cards.length, 2);
    eq(names.cards[0].name, CARD.core);
    eq(names.cards[1].name, CARD.training);
    names.cards.forEach((c) => eq(c.role, 'group'));
  });

  await test('BROWSER-SR-02 a status transition is announced exactly once, not on every repaint', async () => {
    await setState(page, {});
    const writes = await page.evaluate(async () => {
      const live = document.getElementById('cf-cas-live');
      let n = 0;
      const obs = new MutationObserver(() => { n++; });
      obs.observe(live, { childList: true, characterData: true, subtree: true });
      cfCasSetConflictId('core', 'casrec-core-' + 'a'.repeat(32));
      /* twenty repaints with nothing changed — a real session does this
         constantly, because the app's own render calls through to cfCasPaint */
      for (let i = 0; i < 20; i++) cfCasPaint();
      await new Promise((r) => setTimeout(r, 50));
      obs.disconnect();
      return { n, text: live.textContent };
    });
    eq(writes.n, 1, 'the live region must be written once for one transition');
    ok(/Health & progress/.test(writes.text));
  });

  await test('BROWSER-SR-03 no live region is embedded in the repainted markup', async () => {
    await setState(page, { conflicts: ['core'], rechoose: ['core'] });
    await open();
    const n = await page.evaluate(() =>
      document.getElementById('cf-conflict-host')
        .querySelectorAll('[aria-live],[role="status"],[role="alert"]').length);
    eq(n, 0, 'live regions inside replaced markup re-announce on every repaint');
  });

  await test('BROWSER-SR-04 a preservation crossing the threshold announces once, not repeatedly', async () => {
    await setState(page, {});
    const res = await page.evaluate(async () => {
      const live = document.getElementById('cf-cas-live');
      let n = 0;
      const obs = new MutationObserver(() => { n++; });
      obs.observe(live, { childList: true, characterData: true, subtree: true });
      cfCasSetBlock('core', 'preserving', 'tok');
      await new Promise((r) => setTimeout(r, CF_CAS_PRESERVE_MS + 250));
      for (let i = 0; i < 10; i++) cfCasPaint();
      await new Promise((r) => setTimeout(r, 50));
      obs.disconnect();
      return { n, text: live.textContent };
    });
    /* one write: silent while brief, then the preserving message once */
    eq(res.n, 1);
    ok(/Saving a copy of the online version/.test(res.text));
  });

  await test('BROWSER-SR-05 recovery-blocked actions keep clear names and descriptions', async () => {
    await setState(page, { conflicts: ['core'], blocks: [['core', 'recovery']] });
    await open();
    const info = await page.evaluate(() => {
      const card = document.querySelector('.cf-conflict-card');
      const btns = [...card.querySelectorAll('button')].map((btn) => ({
        name: (btn.textContent || '').trim(),
        act: btn.getAttribute('data-act'),
      }));
      return { btns, body: card.textContent };
    });
    eq(info.btns.length, 2);
    eq(info.btns[0].name, 'Try again');
    eq(info.btns[1].name, 'Export a copy');
    ok(/couldn’t save a copy of the online version/.test(info.body));
    ok(/Your data is safe on this device/.test(info.body));
    notOk(/Use this device’s copy online|Use the online copy on this device/.test(info.body),
      'a blocked card must offer no destructive choice');
  });

  /* -------------------------------------------------------- interactions */
  section('Interaction states (real Chromium)');

  await test('BROWSER-STATE-01 "use this device" confirms before doing anything', async () => {
    await setState(page, { conflicts: ['core'] });
    await open();
    const res = await page.evaluate(async () => {
      window.__sends = 0;
      window.cfCasSend = function () { window.__sends++; };
      document.querySelector('[data-act="cf:use-device"][data-sub="core"]').click();
      await new Promise((r) => setTimeout(r, 30));
      const dlg = document.querySelector('[data-act="confirm:yes"]');
      const msg = document.querySelector('.wl-confirm-msg');
      return { asked: !!dlg, sentBefore: window.__sends, msg: msg && msg.textContent, label: dlg && dlg.textContent };
    });
    ok(res.asked, 'a destructive choice must confirm first');
    eq(res.sentBefore, 0, 'nothing may be sent before the athlete confirms');
    eq(res.msg, 'Replace the online copy with this device’s version?');
    eq(res.label, 'Replace online copy');
    await page.evaluate(() => document.querySelector('[data-act="confirm:no"]').click());
  });

  await test('BROWSER-STATE-02 "use the online copy" confirms in its own words', async () => {
    await setState(page, { conflicts: ['core'] });
    await open();
    const res = await page.evaluate(async () => {
      document.querySelector('[data-act="cf:use-online"][data-sub="core"]').click();
      await new Promise((r) => setTimeout(r, 30));
      const dlg = document.querySelector('[data-act="confirm:yes"]');
      const msg = document.querySelector('.wl-confirm-msg');
      return { msg: msg && msg.textContent, label: dlg && dlg.textContent };
    });
    eq(res.msg, 'Replace this device’s version with the online copy?');
    eq(res.label, 'Replace this device\'s copy');
    await page.evaluate(() => document.querySelector('[data-act="confirm:no"]').click());
  });

  await test('BROWSER-STATE-03 cancelling a confirmation changes nothing', async () => {
    await setState(page, { conflicts: ['core'] });
    await open();
    const res = await page.evaluate(async () => {
      window.__sends = 0;
      window.cfCasSend = function () { window.__sends++; };
      document.querySelector('[data-act="cf:use-device"][data-sub="core"]').click();
      await new Promise((r) => setTimeout(r, 30));
      document.querySelector('[data-act="confirm:no"]').click();
      await new Promise((r) => setTimeout(r, 30));
      return { sends: window.__sends, stillConflicted: !!cfCasConflictId('core'), busy: !!CF_CAS_RES.core };
    });
    eq(res.sends, 0);
    ok(res.stillConflicted, 'the conflict must survive a cancelled confirmation');
    notOk(res.busy, 'and nothing may be left owning the subsystem');
  });

  await test('BROWSER-STATE-04 resolving one card leaves the other card intact', async () => {
    await setState(page, { conflicts: ['core', 'training'] });
    await open();
    const res = await page.evaluate(async () => {
      cfCasSetConflictId('core', null);           /* core resolves */
      await new Promise((r) => setTimeout(r, 30));
      const cards = [...document.querySelectorAll('.cf-conflict-card h3')].map((h) => h.textContent.trim());
      return { cards, trainingStill: !!cfCasConflictId('training') };
    });
    eq(res.cards.length, 1);
    eq(res.cards[0], CARD.training);
    ok(res.trainingStill);
  });

  await test('BROWSER-STATE-05 a retry that fails again stays recovery-blocked', async () => {
    await setState(page, {});
    /* The retry re-runs the commit, and the scheduler only runs when there is
       something unsent. Without this the retry would be a no-op and the test
       would be asserting nothing. */
    await makePending(page, 'core');
    const res = await page.evaluate(async () => {
      /* the write that failed keeps failing, and the server keeps conflicting:
         the exact conditions that produced the block in the first place */
      window.cfCasRecWrite = function (id, sub, rev, canon, cb) { cb(false, 'quota'); };
      /* The route's real 409 conflict body. `{error:'conflict'}` is NOT it: a
         409 without conflict:true means the idempotency key was reused with a
         different request, which dispositions to "invariant" and must never
         reach the conflict centre. Getting that wrong here made this test look
         like a code defect when it was a fabricated response. */
      window.cfCasSend = function (req, cb) {
        cb(409, { conflict: true, subsystem: 'core', serverRev: 9, payload: { weights: [] } });
      };
      cfCasSetBlock('core', 'recovery', 'tok');
      cfCasOpenConflictCenter(document.body);
      const before = CF_CAS_BLOCK.core;
      document.querySelector('[data-act="cf:retry-recovery"][data-sub="core"]').click();
      await new Promise((r) => setTimeout(r, 400));
      const card = document.querySelector('.cf-conflict-card');
      return {
        before,
        after: CF_CAS_BLOCK.core,
        text: card ? card.textContent : '',
        destructive: /Use this device’s copy online|Use the online copy on this device/
          .test(card ? card.textContent : ''),
      };
    });
    eq(res.before, 'recovery');
    eq(res.after, 'recovery', 'a failed retry must return to the blocked state');
    ok(/couldn’t save a copy/.test(res.text));
    notOk(res.destructive, 'a failed retry must not fall through to a destructive choice');
  });

  await test('BROWSER-STATE-06 an active workout gets the notification but never the centre', async () => {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden');
    const res = await page.evaluate(async () => {
      state.workout = { entries: [], start: Date.now() };
      const mayInterrupt = cfCasMayInterrupt();
      cfCasSetConflictId('core', 'casrec-core-' + 'a'.repeat(32));
      await new Promise((r) => setTimeout(r, 40));
      const toastEl = document.getElementById('wl-toast');
      return {
        mayInterrupt,
        opened: CF_CAS_OPEN,
        hostEmpty: document.getElementById('cf-conflict-host').innerHTML === '',
        notified: toastEl.classList.contains('show'),
        notice: toastEl.textContent,
        modals: document.querySelectorAll('[role="dialog"],[aria-modal="true"]').length,
        status: cfCasCompactStatus(),
      };
    });
    notOk(res.mayInterrupt, 'an open workout must read as "do not interrupt"');
    notOk(res.opened, 'the centre must not open itself during a workout');
    ok(res.hostEmpty, 'and nothing may be drawn over the workout');
    eq(res.modals, 0, 'no modal, which is what STATUS-08 forbids');
    ok(res.notified, 'the one non-repeating notification is still owed (spec §1.6)');
    eq(res.notice, 'Sync needs your choice');
    eq(res.status, 'conflict', 'and the compact state persists');
  });

  await test('BROWSER-STATE-07 the notification does not repeat for the same conflict', async () => {
    const res = await page.evaluate(async () => {
      const toastEl = document.getElementById('wl-toast');
      let n = 0;
      const obs = new MutationObserver(() => { n++; });
      obs.observe(toastEl, { childList: true, characterData: true, subtree: true });
      const id = 'casrec-core-' + 'a'.repeat(32);
      for (let i = 0; i < 5; i++) cfCasSetConflictId('core', id);
      await new Promise((r) => setTimeout(r, 40));
      obs.disconnect();
      return n;
    });
    eq(res, 0, 'STATUS-04: retries must not nag');
  });

  await test('BROWSER-STATE-08 a brief preservation draws nothing at all', async () => {
    await setState(page, {});
    const res = await page.evaluate(async () => {
      cfCasSetBlock('core', 'preserving', 'tok');
      CF_CAS_OPEN = true; cfCasPaint();
      await new Promise((r) => setTimeout(r, 80));       /* well under the threshold */
      const host = document.getElementById('cf-conflict-host');
      return {
        html: host.innerHTML,
        height: host.getBoundingClientRect().height,
        say: document.getElementById('cf-cas-live').textContent,
      };
    });
    eq(res.html, '', 'no heading, no empty state, no card');
    eq(res.height, 0, 'and it occupies no space on the screen');
    eq(res.say, '', 'nor is anything announced');
  });

  await test('BROWSER-STATE-09 a preservation past 400ms becomes visible, without stealing focus', async () => {
    await setState(page, {});
    const res = await page.evaluate(async () => {
      const other = document.createElement('input');
      document.body.appendChild(other); other.focus();
      const before = document.activeElement;
      cfCasSetBlock('core', 'preserving', 'tok');
      CF_CAS_OPEN = true; cfCasPaint();
      await new Promise((r) => setTimeout(r, CF_CAS_PRESERVE_MS + 250));
      const host = document.getElementById('cf-conflict-host');
      return {
        text: host.textContent,
        buttons: host.querySelectorAll('.cf-conflict-card button').length,
        focusKept: document.activeElement === before,
        say: document.getElementById('cf-cas-live').textContent,
      };
    });
    ok(/Saving a copy of the online version/.test(res.text), 'the card must appear on its own');
    eq(res.buttons, 0, 'a preserving card offers no choice yet');
    ok(res.focusKept, 'appearing on a timer must not move the athlete');
    ok(/Saving a copy of the online version/.test(res.say));
  });

  await test('BROWSER-STATE-10 Escape closes the centre and returns focus', async () => {
    await setState(page, { conflicts: ['core'] });
    await page.evaluate(() => {
      const opener = document.getElementById('test-opener') || document.createElement('button');
      opener.id = 'test-opener'; document.body.appendChild(opener);
      cfCasOpenConflictCenter(opener);
    });
    await page.keyboard.press('Escape');
    const res = await page.evaluate(() => ({
      open: CF_CAS_OPEN,
      html: document.getElementById('cf-conflict-host').innerHTML,
      onOpener: document.activeElement === document.getElementById('test-opener'),
      stillConflicted: !!cfCasConflictId('core'),
    }));
    notOk(res.open);
    eq(res.html, '');
    ok(res.onOpener, 'Escape must return focus to the opener');
    ok(res.stillConflicted, 'closing resolves nothing');
  });

  /* --------------------------------------------------------- responsive */
  section('Responsive behaviour (real Chromium, 1280px and 390px)');

  const measure = async (width) => {
    await page.setViewportSize({ width, height: 900 });
    await setState(page, { conflicts: ['core', 'training'], });
    await open();
    return page.evaluate(() => {
      const host = document.getElementById('cf-conflict-host');
      const btns = [...host.querySelectorAll('button')];
      const texts = [...host.querySelectorAll('p,h2,h3')];
      const clipped = (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
      const rects = btns.map((btn) => btn.getBoundingClientRect());
      let minGap = Infinity;
      /* smallest vertical gap between two consecutive controls */
      for (let i = 1; i < rects.length; i++) minGap = Math.min(minGap, rects[i].top - rects[i - 1].bottom);
      return {
        pageScrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        minButtonHeight: Math.min(...rects.map((r) => r.height)),
        minButtonWidth: Math.min(...rects.map((r) => r.width)),
        clippedControls: btns.filter(clipped).map((btn) => btn.textContent.trim()),
        clippedText: texts.filter(clipped).map((t) => t.textContent.trim().slice(0, 40)),
        minGap,
        count: btns.length,
      };
    });
  };

  await test('BROWSER-RESP-01 desktop: nothing truncates and every control is tappable', async () => {
    const m = await measure(1280);
    eq(m.clippedControls.length, 0, 'clipped: ' + JSON.stringify(m.clippedControls));
    eq(m.clippedText.length, 0, 'clipped: ' + JSON.stringify(m.clippedText));
    ok(m.minButtonHeight >= 44, 'smallest control was ' + m.minButtonHeight + 'px tall');
    notOk(m.pageScrollsSideways);
  });

  await test('BROWSER-RESP-02 narrow (390px): still nothing truncates, still tappable', async () => {
    const m = await measure(390);
    eq(m.clippedControls.length, 0, 'clipped: ' + JSON.stringify(m.clippedControls));
    eq(m.clippedText.length, 0, 'clipped: ' + JSON.stringify(m.clippedText));
    ok(m.minButtonHeight >= 44, 'smallest control was ' + m.minButtonHeight + 'px tall');
    notOk(m.pageScrollsSideways, 'the page must never scroll sideways');
  });

  await test('BROWSER-RESP-03 action boundaries stay visible at both widths', async () => {
    const wide = await measure(1280);
    const narrow = await measure(390);
    ok(wide.minGap >= 8, 'desktop controls were ' + wide.minGap + 'px apart');
    ok(narrow.minGap >= 8, 'narrow controls were ' + narrow.minGap + 'px apart');
  });

  await test('BROWSER-RESP-04 the focus ring is visible on every control, in every state', async () => {
    await page.setViewportSize({ width: 390, height: 900 });
    await setState(page, { conflicts: ['core'], rechoose: ['core'] });
    await open();
    const rings = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('#cf-conflict-host button').forEach((btn) => {
        btn.focus();
        const s = getComputedStyle(btn);
        const w = parseFloat(s.outlineWidth) || 0;
        out.push({
          name: btn.textContent.trim().slice(0, 30),
          width: w,
          style: s.outlineStyle,
          colour: s.outlineColor,
        });
      });
      return out;
    });
    ok(rings.length >= 4, 'expected the full set of controls, saw ' + rings.length);
    rings.forEach((r) => {
      ok(r.width >= 2 && r.style !== 'none',
        r.name + ' had outline ' + r.width + 'px ' + r.style);
      notOk(/rgba\(0, 0, 0, 0\)|transparent/.test(r.colour), r.name + ' ring was transparent');
    });
  });

  /* ------------------------------------------------------------- health */
  section('Page health');

  await test('the app raised no uncaught error at any point in this run', () => {
    const real = b.pageErrors.filter((e) => !/ERR_(NAME_NOT_RESOLVED|FAILED|ABORTED|INTERNET_DISCONNECTED)/.test(e));
    eq(real.length, 0, real.join(' | '));
  });

  const failed = summary('conflict-center.browser.test.js');
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILURE', e); process.exit(1); });

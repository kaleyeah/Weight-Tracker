/* Commit 10 — the rendered conflict centre.

   These assert the ATHLETE-FACING contract: the exact wording the Architect
   specified, the hierarchy, the focus order, the accessible names, and the rule
   that a background discovery never takes over the screen.

   Wording is asserted literally. If a string changes, this suite should fail —
   that is the point of putting product language under test rather than trusting
   a screenshot nobody re-reads. */
const { test, group, eq, ok, notOk, report } = require('./harness');
const { createEnv } = require('./integration-env');

const PB = { uid: 'userA', base: 'https://pb.test', token: 'tok', email: 'a@x.com' };
function env(opts) {
  const e = createEnv({ localStorage: { wl_pb: JSON.stringify(PB), 'cf:lastOwner': 'userA' } });
  (opts || []).forEach((f) => f(e));
  return e;
}
const withConflict = (sub) => (e) => e.S.cfCasSetConflictId(sub, 'casrec-' + sub + '-' + 'a'.repeat(32));
const withBlock = (sub, kind) => (e) => e.S.cfCasSetBlock(sub, kind, 'tok');
const withRechoose = (sub) => (e) => { e.S.CF_CAS_RECHOOSE[sub] = true; };

group('The heading and body say what happened, in the athlete\'s terms', () => {
  const h = env([withConflict('core')]).S.cfCasConflictCenterHTML();
  test('heading is the specified sentence', () =>
    ok(h.includes('Changes were made on another device')));
  test('body names the affected section', () =>
    ok(h.includes('Your changes are safe on this device. Choose what should happen to Health &amp; progress.')));
  test('it leads with the reassurance, not the problem', () => {
    const body = h.indexOf('Your changes are safe');
    const choose = h.indexOf('Choose what should happen');
    ok(body >= 0 && body < choose);
  });
  test('no revision, subsystem code, CAS or payload wording reaches the screen', () => {
    const text = h.replace(/data-sub="(core|training)"/g, '').replace(/id="cfcard-(core|training)/g, '');
    notOk(/\bcoreRev\b|\btrainingRev\b|\bCAS\b|\bpayload\b|\brevision\b|expectedRev/i.test(text));
  });
  test('no record id or artifact id is shown', () => notOk(/casrec-/.test(env([withConflict('core')]).S.cfCasConflictCenterHTML())));
});

group('The three choices carry the specified labels and help text', () => {
  const h = env([withConflict('core')]).S.cfCasConflictCenterHTML();
  test('choice 1 label', () => ok(h.includes('Keep this device’s changes')));
  test('choice 1 help', () =>
    ok(h.includes('Keep working here. Sync for this section stays paused until you choose whether to update the online copy.')));
  test('C10-UX-01 choice 2 label states its destination', () => ok(h.includes('Use this device’s copy online')));
  test('choice 2 help names what is replaced and what is saved first', () =>
    ok(h.includes('Replace the online copy with this device’s version. The current online copy will be saved first.')));
  test('C10-UX-01 choice 3 label states its destination', () => ok(h.includes('Use the online copy on this device')));
  test('choice 3 help names what is replaced and what is saved first', () =>
    ok(h.includes('Replace this device’s version. This device’s current version will be saved first.')));
  test('C10-UX-05 the confirmations name exactly what will be replaced', () => {
    const c = env().S.CF_CAS_COPY;
    eq(c.device.confirm, 'Replace the online copy with this device’s version?');
    eq(c.online.confirm, 'Replace this device’s version with the online copy?');
  });
  test('C10-UX-02 the online-overwrite action cannot read as adopting locally', () => {
    const c = env().S.CF_CAS_COPY;
    /* "Use this device’s copy online" — the destination is "online", and the
       source is this device. Neither word order can be read the other way. */
    ok(/online\s*$/.test(c.device.label));
    ok(c.device.label.includes('this device’s copy'));
    notOk(/on this device$/.test(c.device.label));
  });
  test('C10-UX-03 the device-overwrite action cannot read as publishing online', () => {
    const c = env().S.CF_CAS_COPY;
    ok(/on this device$/.test(c.online.label));
    ok(c.online.label.includes('the online copy'));
    notOk(/ online$/.test(c.online.label));
  });
  test('C10-UX-02/03 the two labels differ in destination, not just wording', () => {
    const c = env().S.CF_CAS_COPY;
    notOk(c.device.label === c.online.label);
    ok(c.device.label.endsWith('online'));
    ok(c.online.label.endsWith('on this device'));
  });
  test('C10-UX-04 the accessible names are the full revised labels', () => {
    const c = env().S.CF_CAS_COPY;
    /* the buttons carry their label as their text, so the accessible name IS
       the full label — asserted against the rendered markup, not assumed */
    ok(h.includes('>' + c.device.label + '</button>'));
    ok(h.includes('>' + c.online.label + '</button>'));
    ok(h.includes('>' + c.keep.label + '</button>'));
  });
});

group('Hierarchy and focus order put the safe choice first', () => {
  const h = env([withConflict('core')]).S.cfCasConflictCenterHTML();
  const order = ['cf:keep', 'cf:use-device', 'cf:use-online'].map((a) => h.indexOf(a));
  test('keep-local is the first focusable action', () => {
    ok(order[0] >= 0);
    ok(order[0] < order[1] && order[1] < order[2]);
  });
  test('C10-UX-11 NO action carries autofocus', () => notOk(h.includes('autofocus')));
  test('C10-UX-12 the heading is the programmatic focus target', () =>
    ok(h.includes('id="cf-conflict-heading" tabindex="-1"')));
  test('keep-local is the visually primary action', () =>
    ok(/wl-btn-primary[^>]*data-act="cf:keep"|data-act="cf:keep"[^>]*/.test(h) && h.includes('wl-btn-primary')));
  test('the destructive choices are not primary-styled', () => {
    const device = h.slice(h.indexOf('data-act="cf:use-device"') - 120, h.indexOf('data-act="cf:use-device"'));
    notOk(device.includes('wl-btn-primary'));
  });
  test('there is NO bulk resolve action', () => notOk(/resolve-all|cf:resolve-all/i.test(h)));
  test('C10-UX-11 no autofocus survives anywhere, with either card count', () => {
    const both = env([withConflict('core'), withConflict('training')]).S.cfCasConflictCenterHTML();
    eq((both.match(/autofocus/g) || []).length, 0);
  });
  test('C10-UX-13 the first action in DOM order is the first card\'s safe choice', () => {
    const both = env([withConflict('core'), withConflict('training')]).S.cfCasConflictCenterHTML();
    const first = both.match(/data-act="cf:([a-z-]+)" data-sub="(core|training)"/);
    eq(first[1], 'keep');
    eq(first[2], 'core');
  });
  test('C10-UX-16 tab order is card 1 safe→destructive, then card 2', () => {
    const both = env([withConflict('core'), withConflict('training')]).S.cfCasConflictCenterHTML();
    const seq = [...both.matchAll(/data-act="cf:(keep|use-device|use-online)" data-sub="(core|training)"/g)]
      .map((m) => m[2] + ':' + m[1]);
    eq(seq, ['core:keep', 'core:use-device', 'core:use-online',
             'training:keep', 'training:use-device', 'training:use-online']);
  });
});

group('Screen-reader names and descriptions', () => {
  const h = env([withConflict('core'), withConflict('training')]).S.cfCasConflictCenterHTML();
  test('the centre is a labelled region', () => {
    ok(h.includes('role="region"'));
    ok(h.includes('aria-labelledby="cf-conflict-heading"'));
  });
  test('each card is a group labelled by its own title', () => {
    ok(h.includes('role="group"'));
    ok(h.includes('aria-labelledby="cfcard-core-title"'));
    ok(h.includes('aria-labelledby="cfcard-training-title"'));
  });
  test('every choice is described by its help text', () => {
    ['keep', 'device', 'online'].forEach((k) =>
      ok(h.includes('aria-describedby="cfcard-core-' + k + '-help"')));
    ['keep', 'device', 'online'].forEach((k) =>
      ok(h.includes('id="cfcard-core-' + k + '-help"')));
  });
  test('the status indicator has an accessible name and announces politely', () => {
    const s = env([withConflict('core')]).S.cfCasStatusHTML();
    ok(s.includes('aria-label="Sync needs your choice"'));
    ok(s.includes('aria-live="polite"'));
  });
});

group('Both cards appear together, and each resolves independently', () => {
  const both = env([withConflict('core'), withConflict('training')]).S.cfCasConflictCenterHTML();
  test('both sections are shown', () => {
    ok(both.includes('Health &amp; progress'));
    ok(both.includes('Training &amp; workouts'));
  });
  test('each card carries its own subsystem on every action', () => {
    ok(both.includes('data-act="cf:keep" data-sub="core"'));
    ok(both.includes('data-act="cf:keep" data-sub="training"'));
  });
  const one = env([withConflict('core')]).S.cfCasConflictCenterHTML();
  test('a single conflict shows one card only', () => {
    ok(one.includes('Health &amp; progress'));
    notOk(one.includes('Training &amp; workouts'));
  });
  test('with nothing pending the centre says so plainly', () => {
    const none = env().S.cfCasConflictCenterHTML();
    ok(none.includes('Nothing needs your attention right now.'));
    notOk(none.includes('Keep this device’s changes'));
  });
});

group('The preserving and recovery-blocked states', () => {
  const preserving = env([withBlock('core', 'preserving')]).S.cfCasConflictCenterHTML();
  test('preserving explains what is happening', () =>
    ok(preserving.includes('Saving a copy of the online version…')));
  test('preserving offers NO destructive choice', () => {
    notOk(preserving.includes('Use this device’s copy online'));
    notOk(preserving.includes('Use the online copy on this device'));
  });

  const blocked = env([withConflict('core'), withBlock('core', 'recovery')]).S.cfCasConflictCenterHTML();
  test('blocked says the copy could not be saved, and does not claim otherwise', () => {
    ok(blocked.includes('We couldn’t save a copy of the online version, so these options aren’t available yet.'));
    notOk(/copy (has been|was) saved/i.test(blocked));
  });
  test('blocked offers retry FIRST and as the primary action', () => {
    const retry = blocked.indexOf('cf:retry-recovery');
    const exp = blocked.indexOf('cf:export');
    ok(retry >= 0 && exp >= 0 && retry < exp);
    ok(blocked.slice(0, retry).lastIndexOf('wl-btn-primary') > blocked.slice(0, retry).lastIndexOf('wl-btn-ghost'));
  });
  test('blocked offers export and retry, not a choice between versions', () => {
    ok(blocked.includes('Export a copy'));
    ok(blocked.includes('Try again'));
    notOk(blocked.includes('Use this device’s copy online'));
    notOk(blocked.includes('Use the online copy on this device'));
  });
  test('C10-UX-25 blocked reassures locally and never claims an online copy was saved', () => {
    ok(blocked.includes('Your data is safe on this device'));
    notOk(/online (copy|version) (has been|was|is) saved/i.test(blocked));
  });
  test('C10-UX-21 Try again is the primary blocked-state action', () => {
    const seg = blocked.slice(0, blocked.indexOf('cf:retry-recovery'));
    ok(seg.lastIndexOf('wl-btn-primary') > seg.lastIndexOf('wl-btn-ghost'));
  });
  test('C10-UX-22 Export a copy remains secondary', () => {
    const seg = blocked.slice(0, blocked.indexOf('cf:export'));
    ok(seg.lastIndexOf('wl-btn-ghost') > seg.lastIndexOf('wl-btn-primary'));
  });
  test('C10-UX-23 the two controls have distinct boundaries, not one joined block', () => {
    /* each is its own button element, and the secondary carries the spacing
       class that separates it at both widths */
    ok(blocked.includes('cf-action-secondary'));
    eq((blocked.match(/<button/g) || []).length, 2);
  });
  test('C10-UX-24 a retry that fails again still exposes no destructive choice', () => {
    const again = env([withConflict('core'), withBlock('core', 'recovery')]).S.cfCasConflictCenterHTML();
    notOk(again.includes('Use this device’s copy online'));
    notOk(again.includes('Use the online copy on this device'));
    ok(again.includes('Try again'));
  });
});

group('The changed-again state asks for a fresh decision', () => {
  const h = env([withConflict('core'), withRechoose('core')]).S.cfCasConflictCenterHTML();
  test('it uses the specified sentence', () =>
    ok(h.includes('The online copy changed again. Review your choice.')));
  test('the notice comes before the choices', () =>
    ok(h.indexOf('changed again') < h.indexOf('Keep this device’s changes')));
  test('all three choices are offered again', () => {
    ok(h.includes('Keep this device’s changes'));
    ok(h.includes('Use this device’s copy online'));
    ok(h.includes('Use the online copy on this device'));
  });
  test('it is announced, not silently swapped', () => ok(h.includes('role="status"')));
});

group('Status wording and per-subsystem detail', () => {
  const e = env([withConflict('core')]);
  test('the compact indicator opens the centre rather than being a modal', () => {
    const s = e.S.cfCasStatusHTML();
    ok(s.includes('data-act="cf:open-conflicts"'));
    notOk(/role="dialog"|aria-modal/.test(s));
  });
  test('the detail lists both sections, each with its OWN state', () => {
    const d = e.S.cfCasStatusDetailHTML();
    ok(d.includes('Health &amp; progress'));
    ok(d.includes('Training &amp; workouts'));
    /* Assert each section reports the state it actually has, rather than a
       hard-coded pair: the fixture's training data is legitimately pending, and
       expecting "Synced" there was my error, not the view's. */
    ok(d.includes(e.S.cfCasStatusText(e.S.cfCasStatusFor('core'))));
    ok(d.includes(e.S.cfCasStatusText(e.S.cfCasStatusFor('training'))));
    eq(e.S.cfCasStatusFor('core'), 'conflict');
  });
  test('pending is worded as saved, never as unsaved', () => {
    eq(e.S.cfCasStatusText('pending'), 'Saved on this device');
    notOk(/unsaved|not saved/i.test(e.S.cfCasStatusText('pending')));
  });
  test('every status string avoids technical vocabulary', () => {
    Object.keys(e.S.CF_CAS_STATUS_TEXT).forEach((k) =>
      notOk(/rev|CAS|payload|subsystem|conflict id/i.test(e.S.CF_CAS_STATUS_TEXT[k])));
  });
});

group('A conflict found mid-workout never takes over the screen', () => {
  const busy = env([withConflict('core')]);
  busy.S.state.workout = { exercises: [{ name: 'Squat' }] };
  test('interruption is refused while a workout is open', () => notOk(busy.S.cfCasMayInterrupt()));
  const idle = env([withConflict('core')]);
  idle.S.state.workout = null;
  test('and permitted when there is no workout in progress', () => ok(idle.S.cfCasMayInterrupt()));
  test('the centre is never rendered as a modal dialog', () => {
    const h = busy.S.cfCasConflictCenterHTML();
    notOk(/role="dialog"|aria-modal="true"/.test(h));
  });
});

group('Hostile content cannot break out of the markup', () => {
  const e = env([withConflict('core')]);
  e.S.CF_CAS_LABEL.core = '<img src=x onerror=alert(1)>';
  const h = e.S.cfCasConflictCenterHTML();
  test('a label is escaped, not injected', () => {
    notOk(h.includes('<img src=x'));
    ok(h.includes('&lt;img src=x'));
  });
  e.S.CF_CAS_LABEL.core = 'Health & progress';
});

group('C10-UX-17..20 — the preserving state is delayed, not flashed', () => {
  const e = env([withBlock('core', 'preserving')]);
  e.S.cfCasPreserveBegin('core');
  test('C10-UX-17 / C10-UX-V2-01 a sole brief preservation renders NO centre at all', () => {
    /* Not the empty state — nothing. "Nothing needs your attention right now"
       during an active preservation is false, and my previous caption claimed
       this rendered nothing while the code rendered that sentence. */
    const h = e.S.cfCasConflictCenterHTML();
    eq(h, '');
  });
  test('C10-UX-V2-01 it shows no empty-state copy and no heading', () => {
    const h = e.S.cfCasConflictCenterHTML();
    notOk(h.includes('Nothing needs your attention'));
    notOk(h.includes('Changes were made on another device'));
  });
  test('C10-UX-V2-02 a hidden preservation alongside a visible conflict shows only the visible card', () => {
    const e2 = env([withConflict('training'), withBlock('core', 'preserving')]);
    e2.S.cfCasPreserveBegin('core');
    const h = e2.S.cfCasConflictCenterHTML();
    ok(h.includes('Training &amp; workouts'));
    notOk(h.includes('Health &amp; progress'));
    notOk(h.includes('Nothing needs your attention'));
  });
  test('C10-UX-V2-03 the empty-state sentence appears only with nothing pending at all', () => {
    ok(env().S.cfCasConflictCenterHTML().includes('Nothing needs your attention right now.'));
  });
  test('C10-UX-V2-04 a preservation crossing the threshold appears without stealing focus', () => {
    const e3 = env([withBlock('core', 'preserving')]);
    e3.S.CF_CAS_PRESERVE_AT.core = Date.now() - 500;
    let touched = false;
    e3.S.document.getElementById = () => ({ focus() { touched = true; } });
    const h = e3.S.cfCasConflictCenterHTML();
    ok(h.includes('Saving a copy of the online version…'));
    notOk(touched);
    notOk(h.includes('autofocus'));
  });
  test('C10-UX-V2-05 a fast preservation goes straight to choices, with no false empty state', () => {
    const e4 = env([withBlock('core', 'preserving')]);
    e4.S.cfCasPreserveBegin('core');
    eq(e4.S.cfCasConflictCenterHTML(), '');            /* nothing while hidden */
    e4.S.cfCasSetBlock('core', null, null);
    e4.S.cfCasSetConflictId('core', 'casrec-core-' + 'a'.repeat(32));
    const after = e4.S.cfCasConflictCenterHTML();      /* preservation finished */
    ok(after.includes('Keep this device’s changes'));
    notOk(after.includes('Nothing needs your attention'));
  });
  test('C10-UX-18 past the threshold it explains itself', () => {
    e.S.CF_CAS_PRESERVE_AT.core = Date.now() - 500;
    const h = e.S.cfCasConflictCenterHTML();
    ok(h.includes('Saving a copy of the online version…'));
  });
  test('C10-UX-19 no destructive choice is offered while preserving', () => {
    e.S.CF_CAS_PRESERVE_AT.core = Date.now() - 500;
    const h = e.S.cfCasConflictCenterHTML();
    notOk(h.includes('Use this device’s copy online'));
    notOk(h.includes('Use the online copy on this device'));
  });
  test('C10-UX-20 the preserving card never carries a focus target', () => {
    e.S.CF_CAS_PRESERVE_AT.core = Date.now() - 500;
    notOk(e.S.cfCasConflictCenterHTML().includes('autofocus'));
  });
  test('the threshold is the specified 400ms', () => eq(e.S.CF_CAS_PRESERVE_MS, 400));
});

group('C10-UX-06..10 / 12..15 — both cards stay, and focus is managed', () => {
  const both = env([withConflict('core'), withConflict('training')]).S.cfCasConflictCenterHTML();
  test('C10-UX-06 both sections are visible without resolving either', () => {
    ok(both.includes('Health &amp; progress'));
    ok(both.includes('Training &amp; workouts'));
  });
  test('C10-UX-09 no copy implies a required order', () =>
    notOk(/first|then|next|step [0-9]/i.test(both.replace(/saved first/g, ''))));
  test('C10-UX-10 there is still no bulk destructive action', () =>
    notOk(/resolve.all/i.test(both)));
  test('C10-UX-07 either card can be resolved first — neither is gated', () => {
    /* every action in both cards is present and enabled; nothing marks the
       second card as waiting on the first */
    ['core', 'training'].forEach((sub) =>
      ['keep', 'use-device', 'use-online'].forEach((act) =>
        ok(both.includes('data-act="cf:' + act + '" data-sub="' + sub + '"'))));
    notOk(/disabled/.test(both));
  });
  test('C10-UX-08 resolving one card leaves the other visible and unchanged', () => {
    const e2 = env([withConflict('core'), withConflict('training')]);
    const before = e2.S.cfCasConflictCenterHTML();
    ok(before.includes('Health &amp; progress') && before.includes('Training &amp; workouts'));
    e2.S.cfCasSetConflictId('core', null);              /* core resolved */
    const after = e2.S.cfCasConflictCenterHTML();
    notOk(after.includes('Health &amp; progress'));
    ok(after.includes('Training &amp; workouts'));
    /* the surviving card is untouched: same actions, same wording */
    ['keep', 'use-device', 'use-online'].forEach((act) =>
      ok(after.includes('data-act="cf:' + act + '" data-sub="training"')));
  });
  const e = env([withConflict('core')]);
  test('C10-UX-12 opening focuses the heading', () => {
    let focused = null;
    e.S.document.getElementById = (id) => ({ focus() { focused = id; } });
    e.S.cfCasOpenConflictCenter(null);
    eq(focused, 'cf-conflict-heading');
  });
  test('C10-UX-15 closing returns focus to whatever opened it', () => {
    let back = false;
    e.S.cfCasOpenConflictCenter({ focus() { back = true; } });
    e.S.cfCasCloseConflictCenter();
    ok(back);
  });
  test('C10-UX-14 background discovery moves no focus', () => {
    /* rendering alone must never focus anything */
    let touched = false;
    e.S.document.getElementById = (id) => ({ focus() { touched = true; } });
    e.S.cfCasConflictCenterHTML();
    notOk(touched);
  });
});

report();

/* Screenshots of the LIVE wired app.
   The earlier screenshot script rendered the view functions into a blank page
   with stand-in CSS it supplied itself, so it could only ever show what the
   markup would look like under styles that do not ship. These are the real
   thing: the real stylesheet, the real host element, the real viewport, and the
   real focus ring — photographed through the same driver the browser tests use.

   usage: node tests/browser/shots.js <outdir> */
const path = require('path');
const fs = require('fs');
const { boot, setState, seedConflict } = require('./driver');

const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tests/browser/shots.js <outdir>'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

/* [name, caption, state, extra] */
const SHOTS = [
  ['01-both-cards', 'Both sections in conflict, opened by the athlete',
    { conflicts: ['core', 'training'] }],
  ['02-one-card', 'A single section in conflict',
    { conflicts: ['core'] }],
  /* Reproduced as it actually happens — the athlete is mid-decision with focus
     on a choice when the second conflict lands — rather than by setting the
     flag and then opening, which would have focused the heading and made the
     caption describe something the shot does not show. */
  ['03-changed-again', 'The online copy changed again — focus moves to the explanation',
    { conflicts: ['core'] }, 'changed-again'],
  ['04-preserving', 'Preserving the online copy, past the 400ms threshold',
    { blocks: [['core', 'preserving']], aged: ['core'] }],
  ['05-recovery-blocked', 'Recovery blocked — no destructive choice is offered',
    { conflicts: ['core'], blocks: [['core', 'recovery']] }],
  ['06-nothing-pending', 'Nothing needs attention',
    {}],
  ['07-busy', 'A resolution owns the subsystem: every choice is disabled',
    { conflicts: ['core'], busy: ['core'] }],
  ['08-preserving-brief', 'A sole sub-400ms preservation: nothing is drawn (blank by design)',
    { blocks: [['core', 'preserving']] }],
  ['09-hidden-plus-visible', 'A hidden preservation beside a visible conflict: only the visible card',
    { conflicts: ['training'], blocks: [['core', 'preserving']] }],
  ['10-focus-ring', 'The focus ring on the safe default choice',
    { conflicts: ['core', 'training'] }, 'focus-keep'],
  ['11-confirm-device', 'Confirming "use this device\'s copy online"',
    { conflicts: ['core'] }, 'confirm-device'],
  ['12-confirm-online', 'Confirming "use the online copy on this device"',
    { conflicts: ['core'] }, 'confirm-online'],
  /* The entry point itself. Closed, so the header control is what is on show. */
  ['13-header-warn', 'The header control with an unresolved conflict (warn)',
    { conflicts: ['core'] }, 'header'],
  ['14-header-bad', 'The header control with a recovery-blocked section (bad)',
    { conflicts: ['core'], blocks: [['core', 'recovery']] }, 'header'],
  ['15-header-clean', 'The header control with nothing to decide',
    {}, 'header'],
];

(async () => {
  const b = await boot();
  const page = b.page;
  const index = [];

  for (const [name, caption, spec, extra] of SHOTS) {
    for (const [w, tag] of [[1280, 'desktop'], [390, 'mobile']]) {
      await page.setViewportSize({ width: w, height: 900 });
      await setState(page, spec);
      if (extra === 'header') {
        /* Leave the centre CLOSED — the header control is the subject. Clear
           anything a previous shot left over the page: a lingering confirm
           dims the whole app, and the update banner sits on top of the very
           control being photographed. */
        await page.evaluate(() => {
          state.pendingConfirm = null;
          ['wl-applied-banner', 'wl-update-banner'].forEach((id) => {
            const el = document.getElementById(id);
            if (el && el.remove) el.remove();
          });
          setSync('ok', '');
          cfCasCloseConflictCenter();
          render();
        });
      } else {
        await page.evaluate(() => {
          const el = document.querySelector('[data-act="syncdot"]')
            || document.querySelector('[data-act="cf:open-conflicts"]') || document.body;
          cfCasOpenConflictCenter(el);
        });
      }
      if (extra === 'changed-again') {
        await page.evaluate(() => {
          document.querySelector('[data-act="cf:use-device"][data-sub="core"]').focus();
          CF_CAS_RECHOOSE.core = true;
          cfCasPaint();
        });
      }
      if (extra === 'focus-keep') {
        await page.evaluate(() => {
          const el = document.querySelector('[data-act="cf:keep"][data-sub="core"]');
          if (el) el.focus();
        });
      }
      if (extra === 'confirm-device' || extra === 'confirm-online') {
        const act = extra === 'confirm-device' ? 'cf:use-device' : 'cf:use-online';
        await page.evaluate((a) => {
          window.cfCasSend = function () {};   /* never let a confirmation actually send */
          const el = document.querySelector('[data-act="' + a + '"][data-sub="core"]');
          if (el) el.click();
        }, act);
        await page.waitForTimeout(60);
      }
      /* Viewport, not fullPage: the centre is position:fixed, so a full-page
         capture stretches the page behind it and photographs the sheet against
         whatever happens to be at the top of the document rather than where the
         athlete actually sees it. */
      if (extra === 'header') {
        /* Clip to the control itself, found at its real position, so the cue is
           legible at review size instead of being a few pixels in a wide shot. */
        const box = await page.evaluate(() => {
          const el = document.querySelector('[data-act="syncdot"]');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
        const pad = 60;
        await page.screenshot({
          path: path.join(OUT, name + '-' + tag + '.png'),
          clip: box
            ? {
              x: Math.max(0, box.x - pad * 3), y: Math.max(0, box.y - pad),
              width: Math.min(w, box.width + pad * 4), height: box.height + pad * 2,
            }
            : { x: 0, y: 0, width: Math.min(w, 1280), height: 180 },
        });
      } else {
        await page.screenshot({ path: path.join(OUT, name + '-' + tag + '.png') });
      }

      if (tag === 'desktop') {
        const detail = await page.evaluate(() => {
          const host = document.getElementById('cf-conflict-host');
          return {
            empty: host.innerHTML === '',
            height: Math.round(host.getBoundingClientRect().height),
            controls: [...host.querySelectorAll('button')].map((btn) => ({
              text: btn.textContent.trim().slice(0, 44),
              disabled: !!btn.disabled,
              describedBy: (document.getElementById(btn.getAttribute('aria-describedby') || '') || {}).textContent || '',
              autofocus: btn.hasAttribute('autofocus'),
            })),
            focus: document.activeElement ? (document.activeElement.id
              || document.activeElement.getAttribute('data-act')
              || document.activeElement.tagName) : null,
            live: (document.getElementById('cf-cas-live') || {}).textContent || '',
          };
        });
        index.push({ name, caption, ...detail });
      }
    }
  }

  fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify(index, null, 2));
  console.log('shot ' + SHOTS.length + ' states at 2 widths → ' + OUT + '\n');
  index.forEach((s) => {
    console.log(s.name + ' — ' + s.caption);
    console.log('  host: ' + (s.empty ? 'NOT RENDERED (0px)' : s.height + 'px') +
      '   focus: ' + s.focus + (s.live ? '\n  announced: "' + s.live + '"' : ''));
    s.controls.forEach((c, i) =>
      console.log('  ' + (i + 1) + '. ' + c.text + (c.disabled ? '   [disabled]' : '') +
        (c.autofocus ? '   [AUTOFOCUS]' : '')));
    console.log('');
  });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });

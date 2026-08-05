/* A suite that HANGS, on purpose, with a grandchild — the fixture for
   tests/runner-timeout-self.test.js. Deliberately named so the *.browser.test.js
   glob never picks it up; only the self-test runs it, by explicit path.

   It reproduces both mechanisms that defeated the old spawnSync timeout:
   - traps SIGTERM (as Playwright does) so a polite kill cannot end it;
   - spawns a grandchild holding inherited stdio open (as Chromium does), so a
     runner waiting for pipe EOF waits forever unless the process GROUP dies. */
const { spawn } = require('child_process');
const fs = require('fs');

process.on('SIGTERM', () => { /* trapped: refuse to die politely */ });
process.on('SIGINT', () => {});

const pidFile = process.env.CF_HANG_PIDFILE;
const grandchild = spawn(process.execPath, ['-e',
  'process.on("SIGTERM",()=>{});setInterval(()=>{},60000);'],
  { stdio: ['ignore', 'inherit', 'inherit'] });
if (pidFile) fs.writeFileSync(pidFile, String(grandchild.pid));

console.log('hang fixture: up (grandchild ' + grandchild.pid + '); hanging now');
setInterval(() => {}, 60000);

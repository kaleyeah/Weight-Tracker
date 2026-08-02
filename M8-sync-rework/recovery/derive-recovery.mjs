/* Deterministic recovery derivation (round-22 item 2).
     node derive-recovery.mjs <candidate.html> <out.html>
   Inserts recovery-block.js at the M8-END-OF-ALL-BLOCKS marker and stamps
   the RECOVERY build id. Prints input/output sha256. Read-only inputs. */
import fs from "node:fs";import crypto from "node:crypto";import path from "node:path";import url from "node:url";
const here=path.dirname(url.fileURLToPath(import.meta.url));
const [cand,out]=process.argv.slice(2);
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const src=fs.readFileSync(cand,"utf8");
const block=fs.readFileSync(path.join(here,"recovery-block.js"),"utf8");
const marker="/* =============== M8-END-OF-ALL-BLOCKS =============== */";
if(src.split(marker).length!==2)throw new Error("marker count != 1");
let outS=src.replace(marker,marker+"\n"+block);
const stampRe=/var APP_BUILD="[^"]+";/;
if(!stampRe.test(outS))throw new Error("no APP_BUILD");
outS=outS.replace(stampRe,'var APP_BUILD="2026-08-02.414-RECOVERY-syncsafe";');
fs.writeFileSync(out,outS);
console.log(JSON.stringify({input:sha(fs.readFileSync(cand)),output:sha(fs.readFileSync(out)),block:sha(block)},null,1));

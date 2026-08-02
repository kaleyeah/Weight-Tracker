/* Deterministic recovery derivation (round-22 item 2).
     node derive-recovery.mjs <candidate.html> <out.html>
   Inserts recovery-block.js at the M8-END-OF-ALL-BLOCKS marker and stamps
   the RECOVERY build id. Prints input/output sha256. Read-only inputs. */
import fs from "node:fs";import crypto from "node:crypto";import path from "node:path";import url from "node:url";
const here=path.dirname(url.fileURLToPath(import.meta.url));
const [cand,out]=process.argv.slice(2);
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const EXPECT={
  input:"5bda0da514c512ce1674aaff5cd78eb81f7fd0519388d78875a5f1bc1ba35ee3",
  block:"34a3b92bef3470875658471a5defa3b3e9b59c9ae25b46fb647e795e7431cfc9",
  output:"b87120faa8b113c07c6f1810930cd4779e2f420c7574b6887c88a552a49fb95f"};
const src=fs.readFileSync(cand,"utf8");
const block=fs.readFileSync(path.join(here,"recovery-block.js"),"utf8");
if(sha(fs.readFileSync(cand))!==EXPECT.input)throw new Error("REFUSED: candidate hash is not the frozen release identity");
if(sha(block)!==EXPECT.block)throw new Error("REFUSED: recovery block hash mismatch");
const marker="/* =============== M8-END-OF-ALL-BLOCKS =============== */";
if(src.split(marker).length!==2)throw new Error("marker count != 1");
let outS=src.replace(marker,marker+"\n"+block);
const stampRe=/var APP_BUILD="[^"]+";/;
if(!stampRe.test(outS))throw new Error("no APP_BUILD");
outS=outS.replace(stampRe,'var APP_BUILD="2026-08-02.414-RECOVERY-syncsafe";');
if(sha(Buffer.from(outS))!==EXPECT.output)throw new Error("REFUSED: derived output does not match the packaged recovery identity");
fs.writeFileSync(out,outS);
console.log(JSON.stringify({input:sha(fs.readFileSync(cand)),output:sha(fs.readFileSync(out)),block:sha(block),enforced:true},null,1));

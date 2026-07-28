/* No browser, no client. Two byte-identical HTTP requests with the same
   idempotency key. A correct idempotency layer must replay the first result. */
const pb=require('/home/griffin/projects/Weight-Tracker/tests/browser/pbserver');
(async()=>{
 const s=await pb.start(8096);
 const BODY=JSON.stringify({subsystem:'core',expectedRev:0,idempotencyKey:'c10-'+'f'.repeat(20),
   payload:{weights:[{date:'2026-02-02',weight:79,note:'x',steps:1000}]},clientBuild:'t',deviceId:'d'});
 const post=async()=>{const r=await fetch(s.base+'/api/cf/appdata/commit',
   {method:'POST',headers:{'content-type':'application/json',Authorization:s.user.token},body:BODY});
   return {status:r.status, body:await r.json()};};
 const first=await post();
 let refused=0, replayed=0;
 for(let i=0;i<12;i++){const r=await post();
   if(r.status===200) replayed++; else {refused++; if(refused===1) console.log('  refusal body:',JSON.stringify(r.body));}}
 console.log('identical request bytes:',BODY.length,'bytes, same idempotency key');
 console.log('first:',first.status,JSON.stringify(first.body));
 console.log('12 identical replays ->',replayed,'replayed correctly,',refused,'REFUSED');
 const led=await s.api('GET','/api/collections/cf_commit_log/records',s.adminToken);
 console.log('ledger rows:',(led.body.items||[]).length);
 await s.stop();
})().catch(e=>{console.error(String(e).slice(0,600));process.exit(1);});

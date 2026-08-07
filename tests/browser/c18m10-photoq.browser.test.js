/* C18-M10 (browser) — increment 4: the photo operation queue, real Chromium.

       CF_SRC=<file> node tests/browser/c18m10-photoq.browser.test.js

   The photo-route mock implements the REAL reviewed contract: the server
   hashes the RECEIVED bytes and returns {ok, recordId, identity}; an
   idempotency ledger answers replays; typed 409 fenceStale; typed 404.
   Round-22 list: every phase of upload/update/delete, lost responses,
   reload at each phase, quota failures, A→B→A, stale fences, malformed
   bodies, cleanup-removal failures, real deadline expiry AND same-account
   fence replacement, and the destructive export/identity gate. */
const path=require('path'),http=require('http'),fs=require('fs'),crypto=require('crypto');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
/* ---- artifact self-verification (Architect Stage 2A preflight item 7,
   2026-08-07): every M10 suite must PROVE which artifact it loaded. Prints
   the resolved path, build id and sha256; when the runner supplies
   CF_EXPECT_BUILD, a mismatch is a hard exit — this is the guard that would
   have caught the parked-artifact defect on 2026-08-04. */
const _SRCBUF=require('fs').readFileSync(SRC);
const SRC_SHA=require('crypto').createHash('sha256').update(_SRCBUF).digest('hex');
const SRC_BUILD=((_SRCBUF.toString('utf8').match(/APP_BUILD="([^"]+)"/)||[])[1])||'UNKNOWN';
console.log('ARTIFACT '+SRC+'\n         build='+SRC_BUILD+' sha256='+SRC_SHA.slice(0,16));
if(process.env.CF_EXPECT_BUILD&&SRC_BUILD!==process.env.CF_EXPECT_BUILD){
  console.error('ARTIFACT MISMATCH: runner expected '+process.env.CF_EXPECT_BUILD+', suite loaded '+SRC_BUILD);
  process.exit(3);
}

let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const eq=(a,b,m)=>{if(a!==b)throw new Error((m||'eq')+': '+JSON.stringify(a)+' !== '+JSON.stringify(b));};
const EMPTY={settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}};

function part(buf,name){
  const i=buf.indexOf(Buffer.from('name="'+name+'"'));
  if(i<0)return null;
  const s=buf.indexOf(Buffer.from('\r\n\r\n'),i)+4;
  const e=buf.indexOf(Buffer.from('\r\n---'),s);
  return buf.slice(s,e>s?e:buf.length).toString();
}
function filePart(buf){
  const i=buf.indexOf(Buffer.from('name="file"'));
  if(i<0)return null;
  const s=buf.indexOf(Buffer.from('\r\n\r\n'),i)+4;
  const e=buf.lastIndexOf(Buffer.from('\r\n------'));
  return buf.slice(s,e>s?e:buf.length);
}

function photoMock(st){
  return async(route)=>{
    const url=route.request().url();
    const reply=(s2,b)=>route.fulfill({status:s2,contentType:'application/json',body:JSON.stringify(b)});
    if(/cf\/photos\/upload/.test(url)){
      if(st.uploadDelay)await new Promise(r=>setTimeout(r,st.uploadDelay));
      if(st.forceUpload){const f=st.forceUpload;st.forceUpload=null;return reply(f.status,f.body);}
      const buf=route.request().postDataBuffer();
      const key=part(buf,'idempotencyKey'),localId=part(buf,'localId');
      const declared=+part(buf,'byteLength');
      const bytes=filePart(buf);
      const sha=crypto.createHash('sha256').update(bytes).digest('hex');
      st.uploads=(st.uploads||0)+1;
      if(st.ledger[key])return reply(200,st.ledger[key]);
      if(st.fenceRequired){const f=+part(buf,'fence');
        if(f!==st.fence)return reply(409,{ok:false,fenceStale:true,fence:st.fence});}
      if(bytes.length!==declared)return reply(400,{ok:false,error:'byteLength mismatch'});
      const id='pid'+String(st.nextId=(st.nextId||0)+1).padStart(12,'x');
      const res={ok:true,recordId:id,identity:{localId,byteLength:declared,sha256:sha,meta:{}}};
      st.ledger[key]=res;st.photos[id]={id,localId,sha,file:'p.jpg',date:'2026-08-02',kind:'food',meal:'lunch',ts:'1'};
      if(st.dropUpload){st.dropUpload=false;return route.abort();}   // landed, response lost
      return reply(200,res);}
    if(/cf\/photos\/delete/.test(url)){
      if(st.deleteDelay)await new Promise(r=>setTimeout(r,st.deleteDelay));
      if(st.forceDelete){const f=st.forceDelete;st.forceDelete=null;return reply(f.status,f.body);}
      const b=JSON.parse(route.request().postData());
      st.deletes=(st.deletes||0)+1;
      if(st.fenceRequired&&b.fence!==st.fence)return reply(409,{ok:false,fenceStale:true,fence:st.fence});
      if(st.ledger[b.idempotencyKey])return reply(200,st.ledger[b.idempotencyKey]);
      const gone=!st.photos[b.serverId];
      delete st.photos[b.serverId];
      const res={ok:true,recordId:b.serverId,deleted:!gone,alreadyGone:gone};
      st.ledger[b.idempotencyKey]=res;
      return reply(200,res);}
    if(/cf\/photos\/update/.test(url)){
      if(st.updateDelay)await new Promise(r=>setTimeout(r,st.updateDelay));
      if(st.forceUpdate){const f=st.forceUpdate;st.forceUpdate=null;return reply(f.status,f.body);}
      const b=JSON.parse(route.request().postData());
      st.updates=(st.updates||0)+1;
      if(st.fenceRequired&&b.fence!==st.fence)return reply(409,{ok:false,fenceStale:true,fence:st.fence});
      if(!st.photos[b.serverId])return reply(404,{ok:false,notFound:true});
      if(st.ledger[b.idempotencyKey])return reply(200,st.ledger[b.idempotencyKey]);
      const res={ok:true,recordId:b.serverId,applied:true,newMeta:b.newMeta};
      st.ledger[b.idempotencyKey]=res;
      return reply(200,res);}
    if(/collections\/appdata\/records/.test(url))
      return reply(200,{items:[{id:'rec1',user:'userA',data:EMPTY,coreRev:1,training:null,trainingRev:0}]});
    if(/cf\/appdata\/commit/.test(url)){st.rev=(st.rev||1)+1;return reply(200,{ok:true,newRev:st.rev});}
    if(/cf\/writer\/lease/.test(url)){
      const b=JSON.parse(route.request().postData());
      if(st.leaseHeld)return reply(b.op==='status'?200:409,{ok:b.op==='status',held:true,exists:true,
        fence:st.fence||3,holderDeviceId:'other',deviceName:'iPad',active:true,serverNow:Date.now(),ttlMs:86400000});
      if(b.op==='acquire'||b.op==='steal'){st.fence=st.fence||1;st.holderDev=b.deviceId;
        return reply(200,{ok:true,exists:true,granted:true,fence:st.fence,holderDeviceId:b.deviceId,deviceName:b.deviceName,active:true,serverNow:Date.now(),ttlMs:86400000});}
      return reply(200,{ok:true,exists:true,fence:st.fence||1,holderDeviceId:st.holderDev||null,deviceName:'x',active:true,serverNow:Date.now(),ttlMs:86400000});}
    if(/collections\/photos\/records/.test(url))return reply(200,{items:Object.values(st.photos)});
    return reply(200,{items:[],token:'tok',record:{id:'userA'}});};}

async function boot(browser,srv,st,seed,uid){
  const ctx=await browser.newContext();
  await ctx.exposeFunction('__set',(k,v)=>{st[k]=v;});
  await ctx.exposeFunction('__get',(k)=>st[k]);
  await ctx.route('**/api/**',photoMock(st));
  if(seed)await ctx.addInitScript((sd)=>{
    if(localStorage.getItem('c18_seeded'))return;
    localStorage.setItem('c18_seeded','1');
    const z=JSON.parse(sd);
    if(z.queue)localStorage.setItem('wl_photo_ops__userA',JSON.stringify(z.queue));
    if(z.map)localStorage.setItem('wl_photomap__userA',JSON.stringify(z.map));
  },JSON.stringify(seed));
  await ctx.addInitScript((u)=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:u,base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner',u);
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
  },uid||'userA');
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+srv.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);
  return {ctx,page,errs};}

const ADD=`async function(id){
  const bytes=new Uint8Array(512);for(let i=0;i<512;i++)bytes[i]=(i*7)%256;
  const blob=new Blob([bytes],{type:'image/jpeg'});
  return idbAdd({id:id,date:'2026-08-02',blob:blob,ts:Date.now(),meal:'lunch',kind:'food'});
}`;

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();
  const mkSt=(o)=>Object.assign({rev:1,ledger:{},photos:{},nextId:0},o||{});

  /* T1 upload happy path: ordered, byte-bound, identity-validated, queue cleared */
  {
    const st=mkSt();
    const {ctx,page,errs}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      await eval('('+addSrc+')')('l-1');
      await new Promise(r=>setTimeout(r,800));
      return {ops:m10pOps().length,mapped:pbPhotoMap()['l-1']||null,
        blobStillLocal:!!(await idbGetLocal('l-1'))};
    },ADD);
    test('T1 upload: queue drains, server id mapped, local blob intact',()=>{
      eq(s.ops,0);ok(s.mapped,'mapped');ok(s.blobStillLocal);eq(st.uploads,1);});
    test('T1 no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* T2 upload ordering: the queue entry exists BEFORE the network attempt */
  {
    const st=mkSt({uploadDelay:600});
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      const p=eval('('+addSrc+')')('l-2');
      await new Promise(r=>setTimeout(r,250));
      const mid=m10pOps();
      await p;await new Promise(r=>setTimeout(r,900));
      return {midLen:mid.length,midOp:mid[0]&&mid[0].op,midState:mid[0]&&mid[0].state,
        midHasIdentity:!!(mid[0]&&mid[0].blobSha256&&mid[0].blobByteLength),after:m10pOps().length};
    },ADD);
    test('T2 add ordering: entry written+identified before dispatch, cleared on ack',()=>{
      eq(s.midLen,1);eq(s.midOp,'add');ok(s.midHasIdentity,'blob identity captured');
      eq(s.after,0);});
    await ctx.close();
  }

  /* T3 lost upload response → reload replays with the SAME requestId */
  {
    const st=mkSt({dropUpload:true});
    const {ctx,page}=await boot(browser,server,st);
    const rid=await page.evaluate(async(addSrc)=>{
      await eval('('+addSrc+')')('l-3');
      await new Promise(r=>setTimeout(r,800));
      const ops=m10pOps();
      return ops.length?ops[0].requestId:null;
    },ADD);
    ok(rid,'entry survived the lost response');
    await page.reload({waitUntil:'load'});
    await page.waitForTimeout(1400);
    const s=await page.evaluate(()=>({ops:m10pOps().length,mapped:pbPhotoMap()['l-3']||null}));
    test('T3 lost upload response: reload replays the SAME key, single server record',()=>{
      eq(s.ops,0);ok(s.mapped);eq(Object.keys(st.photos).length,1,'exactly one server photo');
      ok(st.ledger[rid],'same requestId replayed');});
    await ctx.close();
  }

  /* T4 delete ordering: local blob survives until the server acks */
  {
    const st=mkSt({deleteDelay:600});
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      await eval('('+addSrc+')')('l-4');
      await new Promise(r=>setTimeout(r,800));
      const p=idbDelete('l-4');
      await new Promise(r=>setTimeout(r,250));
      const midBlob=!!(await idbGetLocal('l-4'));
      const midOps=m10pOps();
      await p;await new Promise(r=>setTimeout(r,900));
      return {midBlob,midOp:midOps[0]&&midOps[0].op,midCaptured:!!(midOps[0]&&midOps[0].capturedLocalMeta),
        afterBlob:!!(await idbGetLocal('l-4')),afterOps:m10pOps().length,mapped:pbPhotoMap()['l-4']||null};
    },ADD);
    test('T4 delete ordering: tombstone first, blob recoverable until ack, then removed',()=>{
      ok(s.midBlob,'blob still present mid-flight');eq(s.midOp,'delete');ok(s.midCaptured);
      ok(!s.afterBlob,'blob removed after ack');eq(s.afterOps,0);ok(!s.mapped,'map entry cleared');});
    await ctx.close();
  }

  /* T5 metadata update through its phases */
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      await eval('('+addSrc+')')('l-5');
      await new Promise(r=>setTimeout(r,800));
      const sid=pbPhotoMap()['l-5'];
      const okq=m10pQueueMeta(sid,'l-5',{kind:'food',date:'2026-08-02',week:'',pose:'',meal:'lunch',ts:'1'},
                                       {kind:'food',date:'2026-08-02',week:'',pose:'',meal:'dinner',ts:'1'});
      await new Promise(r=>setTimeout(r,800));
      return {queued:okq,ops:m10pOps().length};
    },ADD);
    test('T5 metadata update: queued, dispatched, acked, cleared',()=>{
      ok(s.queued);eq(s.ops,0);eq(st.updates,1);});
    await ctx.close();
  }

  /* T6 stale fence on each op → DISPLACED, nothing lost */
  {
    for(const kind of ['add','delete','meta']){
      const st=mkSt({fenceRequired:true,fence:1});
      const {ctx,page}=await boot(browser,server,st);
      const s=await page.evaluate(async(args)=>{
        const [addSrc,kind]=args;
        await eval('('+addSrc+')')('l-6');
        await new Promise(r=>setTimeout(r,800));
        const sid=pbPhotoMap()['l-6'];
        await window.__set('fence',5);            // another device took over
        if(kind==='add')await eval('('+addSrc+')')('l-6b');
        else if(kind==='delete')await idbDelete('l-6');
        else m10pQueueMeta(sid,'l-6',{kind:'food',date:'2026-08-02',week:'',pose:'',meal:'lunch',ts:'1'},
                                     {kind:'food',date:'2026-08-02',week:'',pose:'',meal:'dinner',ts:'1'});
        await new Promise(r=>setTimeout(r,900));
        const d=m10pDisplaced();
        return {displaced:d.length,op:d[0]&&d[0].op,
          blobIntact:!!(await idbGetLocal(kind==='add'?'l-6b':'l-6')),
          banner:/need your review/.test(m10pBannerHTML())};
      },[ADD,kind]);
      test(`T6 ${kind} under a stale fence: DISPLACED for review, local bytes intact, banner shown`,()=>{
        eq(s.displaced,1);eq(s.op,kind);ok(s.blobIntact);ok(s.banner);});
      await ctx.close();
    }
  }

  /* T7 malformed success/conflict bodies → entry survives, no local change */
  {
    for(const [name,resp] of [
      ['upload identity mismatch',{status:200,body:{ok:true,recordId:'pidxxxxxxxxxxx',identity:{sha256:'0'.repeat(64),byteLength:1}}}],
      ['upload missing recordId',{status:200,body:{ok:true,identity:{sha256:'a'.repeat(64),byteLength:512}}}],
      ['fenceStale without fence',{status:409,body:{ok:false,fenceStale:true}}]]){
      const st=mkSt();
      const {ctx,page}=await boot(browser,server,st);
      const s=await page.evaluate(async(args)=>{
        const [addSrc,resp]=args;
        await window.__set('forceUpload',resp);
        await eval('('+addSrc+')')('l-7');
        await new Promise(r=>setTimeout(r,900));
        const ops=m10pOps();
        return {len:ops.length,state:ops[0]&&ops[0].state,mapped:pbPhotoMap()['l-7']||null,
          blob:!!(await idbGetLocal('l-7'))};
      },[ADD,resp]);
      test(`T7 ${name}: entry SURVIVES (not displaced, not cleared), no map entry, blob intact`,()=>{
        eq(s.len,1);ok(s.state==='blob-ok',(s.state||'')+' state');ok(!s.mapped);ok(s.blob);});
      await ctx.close();
    }
  }

  /* T8 reload at each pending state resumes the queue */
  {
    for(const kind of ['add','delete']){
      const st=mkSt({[kind==='add'?'uploadDelay':'deleteDelay']:5000});
      const {ctx,page}=await boot(browser,server,st);
      await page.evaluate(async(args)=>{
        const [addSrc,kind]=args;
        if(kind==='delete'){
          await window.__set('deleteDelay',0);
          await eval('('+addSrc+')')('l-8');
          await new Promise(r=>setTimeout(r,800));
          await window.__set('deleteDelay',5000);
          idbDelete('l-8');
        }else{eval('('+addSrc+')')('l-8');}
        await new Promise(r=>setTimeout(r,400));
      },[ADD,kind]);
      const pending=await page.evaluate(()=>m10pOps().length);
      eq(pending,1,'entry pending before reload');
      await page.evaluate(async()=>{await window.__set(  'uploadDelay',0);await window.__set('deleteDelay',0);});
      await page.reload({waitUntil:'load'});
      await page.waitForTimeout(1500);
      const s=await page.evaluate(async()=>({ops:m10pOps().length,blob:!!(await idbGetLocal('l-8'))}));
      test(`T8 reload with a pending ${kind}: the queue resumes and completes`,()=>{
        eq(s.ops,0);eq(s.blob,kind==='add');});
      await ctx.close();
    }
  }

  /* T9 queue-write (quota) failure blocks BOTH the local and server mutation */
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      const orig=localStorage.setItem.bind(localStorage);
      localStorage.setItem=function(k,v){if(/wl_photo_ops__/.test(k))throw new Error('quota');return orig(k,v);};
      let rejected=false;
      try{await eval('('+addSrc+')')('l-9');}catch(e){rejected=true;}
      localStorage.setItem=orig;
      await new Promise(r=>setTimeout(r,400));
      return {rejected,blob:!!(await idbGetLocal('l-9')),ops:m10pOps().length};
    },ADD);
    test('T9 queue-write failure: add refused, no local blob, no upload',()=>{
      ok(s.rejected);ok(!s.blob,'no local write');eq(s.ops,0);eq(st.uploads||0,0);});
    await ctx.close();
  }

  /* T10 blob write failure → intent VOIDED, never uploadable */
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const bytes=new Uint8Array(64);
      const blob=new Blob([bytes],{type:'image/jpeg'});
      const origLocal=idbAddLocal;
      idbAddLocal=function(rec){return origLocal(rec).then(function(){
        return idbDeleteLocal(rec.id);});};        // the blob does not survive the write
      await idbAdd({id:'l-10',date:'2026-08-02',blob:blob,ts:1,meal:'lunch',kind:'food'});
      idbAddLocal=origLocal;
      await new Promise(r=>setTimeout(r,800));
      const ops=m10pOps();
      return {state:ops[0]&&ops[0].state,uploads:0};
    });
    test('T10 blob-write failure: intent terminalized as void, never uploaded',()=>{
      eq(s.state,'void');eq(st.uploads||0,0);});
    await ctx.close();
  }

  /* T11 A→B→A during an upload: no B writes, A entry replayable */
  {
    const st=mkSt({uploadDelay:600});
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      eval('('+addSrc+')')('l-11');
      await new Promise(r=>setTimeout(r,250));
      const aBytes=localStorage.getItem('wl_photo_ops__userA');
      pbClearSession(true);
      localStorage.setItem('wl_pb',JSON.stringify({uid:'userB',base:'https://pb.test',token:'tok',email:'b@x.com'}));
      await new Promise(r=>setTimeout(r,200));
      localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok2',email:'a@x.com'}));
      await new Promise(r=>setTimeout(r,700));
      return {aSame:localStorage.getItem('wl_photo_ops__userA')===aBytes,
        bKeys:Object.keys(localStorage).filter(k=>/wl_photo_ops__userB/.test(k)).length,
        mapped:pbPhotoMap()['l-11']||null};
    },ADD);
    test('T11 A→B→A mid-upload: A queue byte-identical (replayable), zero B keys, no map write',()=>{
      ok(s.aSame,'A queue untouched');eq(s.bKeys,0);ok(!s.mapped);});
    await ctx.close();
  }

  /* T12 pen boundaries: real deadline expiry AND same-account fence replacement */
  {
    for(const mode of ['expiry','fence-replaced']){
      const st=mkSt({uploadDelay:600});
      const {ctx,page}=await boot(browser,server,st);
      const s=await page.evaluate(async(args)=>{
        const [addSrc,mode]=args;
        eval('('+addSrc+')')('l-12');
        await new Promise(r=>setTimeout(r,250));
        if(mode==='expiry')M10.deadline=performance.now()-1;   // the grant actually expires
        else M10.fence=M10.fence+1;                            // same account, new fence
        await new Promise(r=>setTimeout(r,900));
        const ops=m10pOps();
        return {len:ops.length,state:ops[0]&&ops[0].state,mapped:pbPhotoMap()['l-12']||null,
          blob:!!(await idbGetLocal('l-12'))};
      },[ADD,mode]);
      test(`T12 ${mode} during dispatch: outcome NOT applied, entry preserved, blob intact`,()=>{
        eq(s.len,1);ok(!s.mapped,'no map write under a changed pen');ok(s.blob);});
      await ctx.close();
    }
  }

  /* T13 displaced review: Apply revalidates; Discard is explicit */
  {
    const st=mkSt({fenceRequired:true,fence:1});
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      await eval('('+addSrc+')')('l-13');
      await new Promise(r=>setTimeout(r,700));
      await window.__set('fence',5);
      await eval('('+addSrc+')')('l-13b');
      await new Promise(r=>setTimeout(r,900));
      const d1=m10pDisplaced();
      // takeover restores the pen at the server's fence
      M10.fence=5;
      m10pReviewApply(d1[0].id);
      await new Promise(r=>setTimeout(r,900));
      return {before:d1.length,after:m10pDisplaced().length,ops:m10pOps().length,
        mapped:pbPhotoMap()['l-13b']||null};
    },ADD);
    test('T13 Apply after takeover: re-dispatched with the current fence and completes',()=>{
      eq(s.before,1);eq(s.after,0);eq(s.ops,0);ok(s.mapped);});
    await ctx.close();
  }
  {
    const st=mkSt({fenceRequired:true,fence:1});
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      await window.__set('fence',5);
      await eval('('+addSrc+')')('l-14');
      await new Promise(r=>setTimeout(r,900));
      const d=m10pDisplaced();
      m10pReviewDiscard(d[0].id);
      await new Promise(r=>setTimeout(r,100));
      const asked=!!state.pendingConfirm;
      if(state.pendingConfirm){const fn=state.pendingConfirm.fn;state.pendingConfirm=null;fn();}
      await new Promise(r=>setTimeout(r,300));
      return {asked,displaced:m10pDisplaced().length,ops:m10pOps().length,
        blob:!!(await idbGetLocal('l-14'))};
    },ADD);
    test('T14 Discard: explicit confirmation, entry removed, the local photo STAYS',()=>{
      ok(s.asked,'confirmation required');eq(s.displaced,0);eq(s.ops,0);ok(s.blob,'photo kept');});
    await ctx.close();
  }

  /* T15 destructive Apply needs the export gate + identity confirmation */
  {
    const st=mkSt({fenceRequired:true,fence:1});
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      await eval('('+addSrc+')')('l-15');
      await new Promise(r=>setTimeout(r,700));
      await window.__set('fence',5);
      idbDelete('l-15');
      await new Promise(r=>setTimeout(r,900));
      const d=m10pDisplaced();
      M10.fence=5;
      // Apply WITHOUT an export: refused, nothing deleted
      m10pReviewApply(d[0].id);
      await new Promise(r=>setTimeout(r,400));
      const refused={displaced:m10pDisplaced().length,blob:!!(await idbGetLocal('l-15'))};
      // export (download fallback + confirm), then Apply → identity confirmation
      m10pExport(d[0].id);
      await new Promise(r=>setTimeout(r,300));
      if(state.pendingConfirm){const fn=state.pendingConfirm.fn;state.pendingConfirm=null;fn();}
      await new Promise(r=>setTimeout(r,300));
      const exported=!!(m10pOps().find(x=>x.id===d[0].id)||{}).exports;
      m10pReviewApply(d[0].id);
      await new Promise(r=>setTimeout(r,400));
      const confirmMsg=state.pendingConfirm?state.pendingConfirm.message:'';
      if(state.pendingConfirm){const fn=state.pendingConfirm.fn;state.pendingConfirm=null;fn();}
      await new Promise(r=>setTimeout(r,1400));
      return {refused,exported,confirmMsg,
        after:{displaced:m10pDisplaced().length,ops:m10pOps().length,blob:!!(await idbGetLocal('l-15'))}};
    },ADD);
    test('T15 destructive Apply: refused without an export; export is identity-bound',()=>{
      eq(s.refused.displaced,1);ok(s.refused.blob,'nothing deleted without an export');
      ok(s.exported,'export evidence recorded');
      ok(/Identity/.test(s.confirmMsg)&&/bytes/.test(s.confirmMsg),'identity-bound confirmation: '+s.confirmMsg);});
    test('T15 after export + confirmation: the delete completes and the photo is gone',()=>{
      eq(s.after.displaced,0);eq(s.after.ops,0);ok(!s.after.blob);});
    await ctx.close();
  }

  /* T16 non-holder: photoSync performs zero local and zero server mutations */
  {
    const st=mkSt({leaseHeld:true});
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const before=JSON.stringify(await idbAll());
      await new Promise(r=>{photoSync(r);setTimeout(r,600);});
      return {holder:M10.holder,same:JSON.stringify(await idbAll())===before};
    });
    test('T16 non-holder photoSync: zero local and zero server photo mutations',()=>{
      ok(!s.holder);ok(s.same);eq(st.uploads||0,0);eq(st.deletes||0,0);eq(st.updates||0,0);});
    await ctx.close();
  }

  /* T17 cleanup-removal failure at the end of a delete → fail closed */
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      await eval('('+addSrc+')')('l-17');
      await new Promise(r=>setTimeout(r,700));
      const orig=localStorage.setItem.bind(localStorage);
      localStorage.setItem=function(k,v){if(/wl_photo_ops__/.test(k))throw new Error('quota');return orig(k,v);};
      idbDelete('l-17').catch(function(){});
      await new Promise(r=>setTimeout(r,700));
      localStorage.setItem=orig;
      return {blocked:m10cHardBlocked||m10cUnprovenBlocked,blob:!!(await idbGetLocal('l-17')),
        ops:m10pOps().length};
    },ADD);
    test('T17 queue-write failure during delete: fail closed, photo NOT removed',()=>{
      ok(s.blob,'photo still present');eq(st.deletes||0,0,'no server delete');});
    await ctx.close();
  }

  /* T18 (ruling 1): map-write failure after the ack — entry survives at
     `acked`, replays on reload, and the mapping becomes durable */
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      const orig=localStorage.setItem.bind(localStorage);
      localStorage.setItem=function(k,v){if(/^wl_photomap$/.test(k))throw new Error('quota');return orig(k,v);};
      await eval('('+addSrc+')')('l-18');
      await new Promise(r=>setTimeout(r,900));
      localStorage.setItem=orig;
      const ops=m10pOps();
      return {len:ops.length,state:ops[0]&&ops[0].state,hasId:!!(ops[0]&&ops[0].resultRecordId),
        blocked:m10cHardBlocked,mapped:pbPhotoMap()['l-18']||null};
    },ADD);
    test('T18 map-write failure: entry held at `acked` with the server id, blocked, no silent loss',()=>{
      eq(s.len,1);eq(s.state,'acked');ok(s.hasId,'server id durable in the entry');
      ok(s.blocked);ok(!s.mapped);});
    await page.reload({waitUntil:'load'});
    await page.waitForTimeout(1400);
    const s2=await page.evaluate(()=>({ops:m10pOps().length,mapped:pbPhotoMap()['l-18']||null}));
    test('T18 reload: the acked entry replays the map write and clears (one upload only)',()=>{
      eq(s2.ops,0);ok(s2.mapped);eq(st.uploads,1,'no second upload');});
    await ctx.close();
  }

  /* T19 (ruling 2): pen lost between the delete ack and the local deletion */
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      await eval('('+addSrc+')')('l-19');
      await new Promise(r=>setTimeout(r,800));
      const sid=pbPhotoMap()['l-19'];
      /* a crash left the delete at `acked` (server confirmed, local not yet
         applied); the device no longer holds the pen */
      m10pMutate(m8Uid(),function(ops){ops.push({id:'pop-ack000001',op:'delete',localId:'l-19',
        serverId:sid,capturedLocalMeta:{kind:'food',date:'2026-08-02',week:'',pose:'',meal:'lunch',ts:'1'},
        requestId:'m10c-seeddel0000000000000000',state:'acked'});});
      M10.holder=false;                      /* pen lost before the local mutation */
      m10pDispatch();
      await new Promise(r=>setTimeout(r,700));
      const ops=m10pOps();
      const held={state:ops[0]&&ops[0].state,len:ops.length,blob:!!(await idbGetLocal('l-19'))};
      /* with the pen back, the parked phase completes */
      M10.holder=true;
      m10pDispatch();
      await new Promise(r=>setTimeout(r,700));
      return {held,after:{ops:m10pOps().length,blob:!!(await idbGetLocal('l-19'))}};
    },ADD);
    test('T19 pen lost at the `acked` boundary: nothing deleted, entry parked',()=>{
      eq(s.held.len,1);eq(s.held.state,'acked');ok(s.held.blob,'local blob not removed without authority');});
    test('T19 pen restored: the parked phase completes and the photo is removed',()=>{
      eq(s.after.ops,0);ok(!s.after.blob);});
    await ctx.close();
  }

  /* T20 (ruling 3): an `intent` add is never dispatched — identity first */
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      /* seed a bare intent (crash between the queue write and the blob write)
         with the blob actually present: recovery must PROMOTE, not void */
      const bytes=new Uint8Array(256);for(let i=0;i<256;i++)bytes[i]=i;
      await idbAddLocal({id:'l-20',date:'2026-08-02',blob:new Blob([bytes]),ts:1,meal:'lunch',kind:'food'});
      const uid=m8Uid();
      m10pMutate(uid,function(ops){ops.push({id:'pop-seed000001',op:'add',localId:'l-20',
        meta:{kind:'food',date:'2026-08-02',week:'',pose:'',meal:'lunch',ts:'1'},
        requestId:'m10c-seedadd0000000000000000',state:'intent'});});
      m10pDispatch();
      await new Promise(r=>setTimeout(r,1200));
      return {ops:m10pOps().length,mapped:pbPhotoMap()['l-20']||null};
    });
    test('T20 bare `intent` with the blob present: promoted to blob-ok and uploaded (never voided)',()=>{
      eq(s.ops,0);ok(s.mapped);});
    await ctx.close();
  }
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const uid=m8Uid();
      m10pMutate(uid,function(ops){ops.push({id:'pop-seed000002',op:'add',localId:'l-20b',
        meta:{kind:'food',date:'2026-08-02',week:'',pose:'',meal:'lunch',ts:'1'},
        requestId:'m10c-seedadd0000000000000001',state:'intent'});});
      m10pDispatch();
      await new Promise(r=>setTimeout(r,900));
      const ops=m10pOps();
      return {state:ops[0]&&ops[0].state,reason:ops[0]&&ops[0].voidReason};
    });
    test('T20 bare `intent` with the blob absent: voided, never uploaded',()=>{
      eq(s.state,'void');eq(s.reason,'blob-absent');eq(st.uploads||0,0);});
    await ctx.close();
  }

  /* T21 (ruling 4): destructive Apply refuses when the server identity moved */
  {
    const st=mkSt({fenceRequired:true,fence:1});
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      await eval('('+addSrc+')')('l-21');
      await new Promise(r=>setTimeout(r,700));
      const sid=pbPhotoMap()['l-21'];
      await window.__set('fence',5);
      idbDelete('l-21');
      await new Promise(r=>setTimeout(r,900));
      const d=m10pDisplaced();
      M10.fence=5;
      m10pExport(d[0].id);
      await new Promise(r=>setTimeout(r,300));
      if(state.pendingConfirm){const fn=state.pendingConfirm.fn;state.pendingConfirm=null;fn();}
      await new Promise(r=>setTimeout(r,300));
      /* the server record now belongs to a DIFFERENT localId */
      await window.__set('photos',{[sid]:{id:sid,localId:'someone-else',file:'p.jpg',date:'2026-08-02',kind:'food',ts:'1'}});
      m10pReviewApply(d[0].id);
      await new Promise(r=>setTimeout(r,400));
      if(state.pendingConfirm){const fn=state.pendingConfirm.fn;state.pendingConfirm=null;fn();}
      await new Promise(r=>setTimeout(r,900));
      const ops=m10pOps();
      return {state:ops[0]&&ops[0].state,reason:ops[0]&&ops[0].unverifiedReason,
        blob:!!(await idbGetLocal('l-21')),deletes:0};
    },ADD);
    test('T21 destructive Apply with a changed server identity: refused as unverified, photo kept',()=>{
      eq(s.state,'unverified');eq(s.reason,'server-identity-changed');ok(s.blob);});
    await ctx.close();
  }

  /* T22 (ruling 7): a bare 404 on delete is NOT authority to delete locally */
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      await eval('('+addSrc+')')('l-22');
      await new Promise(r=>setTimeout(r,700));
      await window.__set('forceDelete',{status:404,body:{ok:false,notFound:true}});
      idbDelete('l-22');
      await new Promise(r=>setTimeout(r,900));
      const ops=m10pOps();
      return {state:ops[0]&&ops[0].state,reason:ops[0]&&ops[0].unverifiedReason,
        blob:!!(await idbGetLocal('l-22'))};
    },ADD);
    test('T22 indistinguishable 404: entry becomes unverified, the local photo is KEPT',()=>{
      eq(s.state,'unverified');eq(s.reason,'delete-unproven');ok(s.blob);});
    await ctx.close();
  }

  /* T23 (rulings 5/6): the adopt sweep is journaled and fence-bound */
  {
    const st=mkSt();
    st.photos={'pidxxxxxxxxxx1':{id:'pidxxxxxxxxxx1',localId:'srv-1',file:'p.jpg',date:'2026-08-02',kind:'food',meal:'lunch',ts:'1'}};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      await new Promise(r=>{photoSync(r);setTimeout(r,1500);});
      return {ops:m10pOps().length,adopted:!!(await idbGetLocal('srv-1')),
        mapped:pbPhotoMap()['srv-1']||null};
    });
    test('T23 adopt sweep: server-only photo journaled, downloaded, mapped, entry cleared',()=>{
      eq(s.ops,0);ok(s.adopted,'blob adopted');ok(s.mapped,'mapping durable');});
    await ctx.close();
  }
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    st.photos={'pidxxxxxxxxxx2':{id:'pidxxxxxxxxxx2',localId:'srv-2',file:'p.jpg',date:'2026-08-02',kind:'food',meal:'lunch',ts:'1'}};
    const s=await page.evaluate(async()=>{
      const origList=pbPhotoList;
      pbPhotoList=function(){return origList().then(function(v){M10.fence=M10.fence+1;return v;});};
      await new Promise(r=>{photoSync(r);setTimeout(r,1200);});
      pbPhotoList=origList;
      return {adopted:!!(await idbGetLocal('srv-2')),ops:m10pOps().length};
    });
    test('T23 fence replaced during the sweep: no adoption, no queue entries',()=>{
      ok(!s.adopted);eq(s.ops,0);});
    await ctx.close();
  }

  /* T24 (ruling 7/2): the REAL lightbox relabel path — journal before the
     local mutation, transactional route, ZERO raw collection PATCHes */
  {
    const st=mkSt({updateDelay:500});
    const {ctx,page}=await boot(browser,server,st);
    let rawPatches=0;
    page.on('request',(r)=>{if(/collections\/photos\/records\//.test(r.url())&&r.method()==='PATCH')rawPatches++;});
    const s=await page.evaluate(async(addSrc)=>{
      await eval('('+addSrc+')')('l-24');
      await new Promise(r=>setTimeout(r,800));
      /* drive the production lightbox: open it and click the meal chip */
      state.view='photos';
      openLightbox('l-24');
      await new Promise(r=>setTimeout(r,500));
      const edit=document.querySelector('[data-lb="mealedit"]');
      if(edit)edit.click();
      await new Promise(r=>setTimeout(r,250));
      const chips=Array.from(document.querySelectorAll('[data-lb="meal"]'));
      const chip=chips.find(c=>c.getAttribute('data-meal')&&c.getAttribute('data-meal')!=='lunch');
      const before=m10pOps().length;
      /* prove the ordering: capture the queue depth at the instant the local
         store is written */
      window.__opsAtLocalWrite=null;
      const origAddLocal=idbAddLocal;
      idbAddLocal=function(rec){if(window.__opsAtLocalWrite===null)window.__opsAtLocalWrite=m10pOps().length;return origAddLocal(rec);};
      if(chip)chip.click();
      await new Promise(r=>setTimeout(r,250));
      const during=m10pOps();
      await new Promise(r=>setTimeout(r,900));
      idbAddLocal=origAddLocal;
      const rec=await idbGetLocal('l-24');
      return {chipFound:!!chip,before,opsAtLocalWrite:window.__opsAtLocalWrite,
        queuedOp:during[0]&&during[0].op,
        hadOldNew:!!(during[0]&&during[0].oldMeta&&during[0].newMeta),
        after:m10pOps().length,localMeal:rec&&rec.meal};
    },ADD);
    test('T24 lightbox relabel: a real UI click journals a meta op (old+new) BEFORE the local write',()=>{
      ok(s.chipFound,'meal chip present');eq(s.before,0);eq(s.queuedOp,'meta');ok(s.hadOldNew);
      eq(s.opsAtLocalWrite,1,'the verified queue entry existed when the local store was written');});
    test('T24 relabel completes through the transactional route with ZERO raw PATCHes',()=>{
      eq(s.after,0);eq(st.updates,1,'one transactional update');eq(rawPatches,0,'no raw collection PATCH');
      ok(s.localMeal&&s.localMeal!=='lunch','local label changed');});
    await ctx.close();
  }

  /* T25 (round-25 ruling 1): adoption identity phases */
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const bytes=new Uint8Array(128);for(let i=0;i<128;i++)bytes[i]=i;
      const blob=new Blob([bytes]);
      await idbAddLocal({id:'srv-3',date:'2026-08-02',blob:blob,ts:1,kind:'food'});
      const buf=await blob.arrayBuffer();
      const h=await crypto.subtle.digest('SHA-256',buf);
      const hex=Array.from(new Uint8Array(h)).map(b=>('0'+b.toString(16)).slice(-2)).join('');
      /* crash AFTER the durable identity phase, before the mapping */
      m10pMutate(m8Uid(),function(ops){ops.push({id:'pop-adopt00001',op:'adopt',localId:'srv-3',
        serverId:'pidxxxxxxxxxx3',file:'p.jpg',requestId:'m10c-seedado0000000000000000',
        state:'fetched',blobSha256:hex,blobByteLength:buf.byteLength,
        meta:{kind:'food',date:'2026-08-02',week:'',pose:'',meal:'lunch',ts:'1'}});});
      m10pDispatch();
      await new Promise(r=>setTimeout(r,1000));
      return {ops:m10pOps().length,mapped:pbPhotoMap()['srv-3']||null,blob:!!(await idbGetLocal('srv-3'))};
    });
    test('T25a adopt crash at `fetched` with MATCHING bytes: mapping completed',()=>{
      eq(s.ops,0);eq(s.mapped,'pidxxxxxxxxxx3');ok(s.blob);});
    await ctx.close();
  }
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const bytes=new Uint8Array(64);for(let i=0;i<64;i++)bytes[i]=255-i;
      await idbAddLocal({id:'srv-4',date:'2026-08-02',blob:new Blob([bytes]),ts:1,kind:'food'});
      m10pMutate(m8Uid(),function(ops){ops.push({id:'pop-adopt00002',op:'adopt',localId:'srv-4',
        serverId:'pidxxxxxxxxxx4',file:'p.jpg',requestId:'m10c-seedado0000000000000001',
        state:'fetched',blobSha256:'b'.repeat(64),blobByteLength:999,
        meta:{kind:'food',date:'2026-08-02',week:'',pose:'',meal:'lunch',ts:'1'}});});
      m10pDispatch();
      await new Promise(r=>setTimeout(r,900));
      const ops=m10pOps();
      return {state:ops[0]&&ops[0].state,reason:ops[0]&&ops[0].unverifiedReason,
        mapped:pbPhotoMap()['srv-4']||null,blob:!!(await idbGetLocal('srv-4'))};
    });
    test('T25b adopt `fetched` vs DIFFERENT local bytes: unverified, no mapping, local kept',()=>{
      eq(s.state,'unverified');eq(s.reason,'adopt-local-differs');ok(!s.mapped);ok(s.blob);});
    await ctx.close();
  }
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const bytes=new Uint8Array(32);
      await idbAddLocal({id:'srv-5',date:'2026-08-02',blob:new Blob([bytes]),ts:1,kind:'food'});
      /* an `intent` has NO recorded identity — an existing blob can never be
         proven to be this adoption's bytes */
      m10pMutate(m8Uid(),function(ops){ops.push({id:'pop-adopt00003',op:'adopt',localId:'srv-5',
        serverId:'pidxxxxxxxxxx5',file:'p.jpg',requestId:'m10c-seedado0000000000000002',
        state:'intent',meta:{kind:'food',date:'2026-08-02',week:'',pose:'',meal:'lunch',ts:'1'}});});
      m10pDispatch();
      await new Promise(r=>setTimeout(r,900));
      const ops=m10pOps();
      return {state:ops[0]&&ops[0].state,reason:ops[0]&&ops[0].unverifiedReason,
        mapped:pbPhotoMap()['srv-5']||null};
    });
    test('T25c adopt `intent` with an existing local record: never guessed — unverified',()=>{
      eq(s.state,'unverified');eq(s.reason,'adopt-local-exists');ok(!s.mapped);});
    await ctx.close();
  }

  /* T30 (round-26 rulings 2/3/5): `fetched` with NO local record refetches */
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    /* a real server photo whose bytes the fetch mock will serve */
    st.photos={'pidxxxxxxxxxx7':{id:'pidxxxxxxxxxx7',localId:'srv-7',file:'p.jpg',date:'2026-08-02',kind:'food',meal:'lunch',ts:'1'}};
    const s=await page.evaluate(async()=>{
      /* learn the identity the fetch mock will serve, then delete the blob to
         simulate a crash after the durable `fetched` phase */
      const tok=await pbFileToken();
      const b=await pbPhotoFetchBlob({id:'pidxxxxxxxxxx7',file:'p.jpg'},tok);
      const buf=await b.arrayBuffer();
      const h=await crypto.subtle.digest('SHA-256',buf);
      const hex=Array.from(new Uint8Array(h)).map(x=>('0'+x.toString(16)).slice(-2)).join('');
      m10pMutate(m8Uid(),function(ops){ops.push({id:'pop-fetch00001',op:'adopt',localId:'srv-7',
        serverId:'pidxxxxxxxxxx7',file:'p.jpg',requestId:'m10c-seedfet0000000000000000',
        state:'fetched',blobSha256:hex,blobByteLength:buf.byteLength,
        meta:{kind:'food',date:'2026-08-02',week:'',pose:'',meal:'lunch',ts:'1'}});});
      m10pDispatch();
      await new Promise(r=>setTimeout(r,1200));
      return {ops:m10pOps().length,mapped:pbPhotoMap()['srv-7']||null,blob:!!(await idbGetLocal('srv-7'))};
    });
    test('T30 `fetched` with no local blob: refetched, validated, written, mapped (no infinite park)',()=>{
      eq(s.ops,0);eq(s.mapped,'pidxxxxxxxxxx7');ok(s.blob);});
    await ctx.close();
  }
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    st.photos={'pidxxxxxxxxxx8':{id:'pidxxxxxxxxxx8',localId:'srv-8',file:'p.jpg',date:'2026-08-02',kind:'food',meal:'lunch',ts:'1'}};
    const s=await page.evaluate(async()=>{
      /* the durable identity does NOT match what the server now serves */
      m10pMutate(m8Uid(),function(ops){ops.push({id:'pop-fetch00002',op:'adopt',localId:'srv-8',
        serverId:'pidxxxxxxxxxx8',file:'p.jpg',requestId:'m10c-seedfet0000000000000001',
        state:'fetched',blobSha256:'c'.repeat(64),blobByteLength:12345,
        meta:{kind:'food',date:'2026-08-02',week:'',pose:'',meal:'lunch',ts:'1'}});});
      m10pDispatch();
      await new Promise(r=>setTimeout(r,1200));
      const ops=m10pOps();
      return {state:ops[0]&&ops[0].state,reason:ops[0]&&ops[0].unverifiedReason,
        mapped:pbPhotoMap()['srv-8']||null,blob:!!(await idbGetLocal('srv-8'))};
    });
    test('T30 refetched bytes differ from the durable identity: unverified, nothing written or mapped',()=>{
      eq(s.state,'unverified');eq(s.reason,'adopt-server-differs');ok(!s.mapped);ok(!s.blob);});
    await ctx.close();
  }
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    st.photos={'pidxxxxxxxxxx9':{id:'pidxxxxxxxxxx9',localId:'srv-9',file:'p.jpg',date:'2026-08-02',kind:'food',meal:'lunch',ts:'1'}};
    const s=await page.evaluate(async()=>{
      const tok=await pbFileToken();
      const b=await pbPhotoFetchBlob({id:'pidxxxxxxxxxx9',file:'p.jpg'},tok);
      const buf=await b.arrayBuffer();
      const h=await crypto.subtle.digest('SHA-256',buf);
      const hex=Array.from(new Uint8Array(h)).map(x=>('0'+x.toString(16)).slice(-2)).join('');
      m10pMutate(m8Uid(),function(ops){ops.push({id:'pop-fetch00003',op:'adopt',localId:'srv-9',
        serverId:'pidxxxxxxxxxx9',file:'p.jpg',requestId:'m10c-seedfet0000000000000002',
        state:'fetched',blobSha256:hex,blobByteLength:buf.byteLength,
        meta:{kind:'food',date:'2026-08-02',week:'',pose:'',meal:'lunch',ts:'1'}});});
      /* a TEMPORARY refetch failure must preserve the obligation */
      const origFetch=pbPhotoFetchBlob;
      pbPhotoFetchBlob=function(){return Promise.reject(new Error('offline'));};
      m10pDispatch();
      await new Promise(r=>setTimeout(r,700));
      const held=m10pOps();
      pbPhotoFetchBlob=origFetch;
      m10pDispatch();
      await new Promise(r=>setTimeout(r,1200));
      return {heldState:held[0]&&held[0].state,heldLen:held.length,
        ops:m10pOps().length,mapped:pbPhotoMap()['srv-9']||null,blob:!!(await idbGetLocal('srv-9'))};
    });
    test('T30 temporary refetch failure: obligation preserved at `fetched`, retry succeeds',()=>{
      eq(s.heldLen,1);eq(s.heldState,'fetched');eq(s.ops,0);ok(s.mapped);ok(s.blob);});
    await ctx.close();
  }

  /* T32 (round-27 rulings 3/5): a corrupt IndexedDB read-back after the
     ordinary intent-path write must block the mapping */
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    st.photos={'pidxxxxxxxxx10':{id:'pidxxxxxxxxx10',localId:'srv-10',file:'p.jpg',date:'2026-08-02',kind:'food',meal:'lunch',ts:'1'}};
    const s=await page.evaluate(async()=>{
      /* the read-back returns DIFFERENT bytes than were written */
      const origGet=idbGetLocal;
      let calls=0;
      window.idbGetLocal=function(id){
        return origGet(id).then(function(rec){
          if(id==='srv-10'&&rec&&rec.blob&&++calls>=1){
            const bad=new Uint8Array(8);
            return Object.assign({},rec,{blob:new Blob([bad])});}
          return rec;});};
      await new Promise(r=>{photoSync(r);setTimeout(r,1800);});
      window.idbGetLocal=origGet;
      const ops=m10pOps();
      return {mapped:pbPhotoMap()['srv-10']||null,len:ops.length,
        state:ops[0]&&ops[0].state};
    });
    test('T32 corrupt read-back: NO map write, obligation not cleared',()=>{
      ok(!s.mapped,'map untouched');eq(s.len,1,'entry retained');
      ok(s.state==='fetched'||s.state==='intent','still owed: '+s.state);});
    await ctx.close();
  }

  /* T33 (round-27 rulings 4/5): a failed `blob-ok` phase write blocks the map */
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    st.photos={'pidxxxxxxxxx11':{id:'pidxxxxxxxxx11',localId:'srv-11',file:'p.jpg',date:'2026-08-02',kind:'food',meal:'lunch',ts:'1'}};
    const s=await page.evaluate(async()=>{
      /* let the queue entry reach `fetched`, then fail every later queue write
         (the blob-ok phase advance) while the read-back is CORRECT */
      let seenFetched=false;
      const orig=localStorage.setItem.bind(localStorage);
      localStorage.setItem=function(k,v){
        if(/wl_photo_ops__/.test(k)){
          if(seenFetched)throw new Error('quota');
          try{if(/"state":"fetched"/.test(v))seenFetched=true;}catch(e){}}
        return orig(k,v);};
      await new Promise(r=>{photoSync(r);setTimeout(r,1800);});
      localStorage.setItem=orig;
      const ops=m10pOps();
      return {mapped:pbPhotoMap()['srv-11']||null,len:ops.length,state:ops[0]&&ops[0].state};
    });
    test('T33 failed blob-ok phase write: NO map write, entry not cleared',()=>{
      ok(!s.mapped,'map untouched');eq(s.len,1);eq(s.state,'fetched','held at the durable phase');});
    await ctx.close();
  }

  /* T31 (ruling 6): the lightbox reports success ONLY on the real outcome */
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      await eval('('+addSrc+')')('l-31');
      await new Promise(r=>setTimeout(r,800));
      const toasts=[];const t0=window.toast;window.toast=function(m){toasts.push(m);return t0(m);};
      const origAdd=idbAddLocal;
      idbAddLocal=function(){return Promise.reject(new Error('idb down'));};
      state.view='photos';
      openLightbox('l-31');
      await new Promise(r=>setTimeout(r,500));
      const edit=document.querySelector('[data-lb="mealedit"]');if(edit)edit.click();
      await new Promise(r=>setTimeout(r,250));
      const chips=Array.from(document.querySelectorAll('[data-lb="meal"]'));
      const chip=chips.find(c=>c.getAttribute('data-meal')&&c.getAttribute('data-meal')!=='lunch');
      if(chip)chip.click();
      await new Promise(r=>setTimeout(r,2600));
      idbAddLocal=origAdd;window.toast=t0;
      const rec=await idbGetLocal('l-31');
      return {saidMoved:toasts.some(x=>/^Moved to/.test(x)),
        saidFailed:toasts.some(x=>/Couldn’t move the photo/.test(x)),
        meal:rec&&rec.meal,updates:0};
    },ADD);
    test('T31 local-write failure through the UI: NO false success, honest failure, label unchanged',()=>{
      ok(!s.saidMoved,'never claims Moved');ok(s.saidFailed,'reports the failure');
      eq(s.meal,'lunch');eq(st.updates||0,0,'server untouched');});
    await ctx.close();
  }

  /* T27 (rulings 2/7): metadata crash arms on BOTH sides */
  {
    const st=mkSt({updateDelay:600});
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      await eval('('+addSrc+')')('l-27');
      await new Promise(r=>setTimeout(r,800));
      const sid=pbPhotoMap()['l-27'];
      m10pQueueMeta(sid,'l-27',{kind:'food',date:'2026-08-02',week:'',pose:'',meal:'lunch',ts:'1'},
                               {kind:'food',date:'2026-08-02',week:'',pose:'',meal:'dinner',ts:'1'});
      m10pDispatch();
      await new Promise(r=>setTimeout(r,350));
      const mid=m10pOps();
      const rec=await idbGetLocal('l-27');
      return {midState:mid[0]&&mid[0].state,localApplied:rec&&rec.meal};
    },ADD);
    test('T27 metadata: the LOCAL side lands in its own phase before the server ack',()=>{
      eq(s.midState,'local-applied');eq(s.localApplied,'dinner','local metadata already applied');});
    /* crash here: reload must complete the server side */
    await page.reload({waitUntil:'load'});
    await page.waitForTimeout(1600);
    const s2=await page.evaluate(async()=>({ops:m10pOps().length,
      meal:(await idbGetLocal('l-27')||{}).meal}));
    test('T27 reload at `local-applied`: the server side completes, entry clears',()=>{
      eq(s2.ops,0);eq(s2.meal,'dinner');eq(st.updates,2,'the interrupted update was replayed');});
    await ctx.close();
  }
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      await eval('('+addSrc+')')('l-28');
      await new Promise(r=>setTimeout(r,800));
      const sid=pbPhotoMap()['l-28'];
      const origAdd=idbAddLocal;
      idbAddLocal=function(){return Promise.reject(new Error('idb down'));};
      m10pQueueMeta(sid,'l-28',{kind:'food',date:'2026-08-02',week:'',pose:'',meal:'lunch',ts:'1'},
                               {kind:'food',date:'2026-08-02',week:'',pose:'',meal:'dinner',ts:'1'});
      m10pDispatch();
      await new Promise(r=>setTimeout(r,700));
      idbAddLocal=origAdd;
      const ops=m10pOps();
      return {state:ops[0]&&ops[0].state,meal:(await idbGetLocal('l-28')||{}).meal,updates:0};
    },ADD);
    test('T28 metadata local-write failure: entry parked at intent, NO server update',()=>{
      eq(s.state,'intent');eq(s.meal,'lunch','local unchanged');eq(st.updates||0,0,'server untouched');});
    await ctx.close();
  }

  /* T29 (ruling 3/4): no pre-displacement identity ⇒ no destructive dispatch */
  {
    const st=mkSt({fenceRequired:true,fence:1});
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      await eval('('+addSrc+')')('l-29');
      await new Promise(r=>setTimeout(r,700));
      await window.__set('fence',5);
      /* the listing fails exactly at displacement, so no pre-image exists */
      const origList=pbPhotoList;
      pbPhotoList=function(){return Promise.reject(new Error('offline'));};
      idbDelete('l-29');
      await new Promise(r=>setTimeout(r,900));
      pbPhotoList=origList;
      const ops=m10pOps();
      const d=m10pDisplaced();
      M10.fence=5;
      m10pExport(d[0].id);
      await new Promise(r=>setTimeout(r,300));
      if(state.pendingConfirm){const fn=state.pendingConfirm.fn;state.pendingConfirm=null;fn();}
      await new Promise(r=>setTimeout(r,300));
      m10pReviewApply(d[0].id);
      await new Promise(r=>setTimeout(r,400));
      const msg=state.pendingConfirm?state.pendingConfirm.message:'';
      if(state.pendingConfirm){const fn=state.pendingConfirm.fn;state.pendingConfirm=null;fn();}
      await new Promise(r=>setTimeout(r,900));
      const after=m10pOps();
      return {state:ops[0]&&ops[0].state,reason:ops[0]&&ops[0].unverifiedReason,
        afterState:after[0]&&after[0].state,blob:!!(await idbGetLocal('l-29')),deletes:0};
    },ADD);
    test('T29 identity uncaptured at displacement: unverified, destructive Apply refuses, photo kept',()=>{
      eq(s.state,'unverified');eq(s.reason,'identity-uncaptured');
      ok(s.blob,'photo not deleted');eq(st.deletes||0,1,'only the original displaced attempt');});
    await ctx.close();
  }

  /* T26 (ruling 6): the destructive requeue is ONE verified transition */
  {
    const st=mkSt({fenceRequired:true,fence:1});
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      await eval('('+addSrc+')')('l-26');
      await new Promise(r=>setTimeout(r,700));
      await window.__set('fence',5);
      idbDelete('l-26');
      await new Promise(r=>setTimeout(r,900));
      const d=m10pDisplaced();
      const captured=!!(d[0]&&d[0].capturedServerIdentity&&d[0].capturedServerIdentity.file);
      M10.fence=5;
      m10pExport(d[0].id);
      await new Promise(r=>setTimeout(r,300));
      if(state.pendingConfirm){const fn=state.pendingConfirm.fn;state.pendingConfirm=null;fn();}
      await new Promise(r=>setTimeout(r,300));
      /* the identity+state write fails: the entry must NOT dispatch */
      const orig=localStorage.setItem.bind(localStorage);
      localStorage.setItem=function(k,v){if(/wl_photo_ops__/.test(k))throw new Error('quota');return orig(k,v);};
      m10pReviewApply(d[0].id);
      await new Promise(r=>setTimeout(r,500));
      if(state.pendingConfirm){const fn=state.pendingConfirm.fn;state.pendingConfirm=null;fn();}
      await new Promise(r=>setTimeout(r,700));
      localStorage.setItem=orig;
      const ops=m10pOps();
      return {captured,state:ops[0]&&ops[0].state,blob:!!(await idbGetLocal('l-26')),
        deletes:0};
    },ADD);
    test('T26 displacement captures the authoritative server identity (incl. file)',()=>ok(s.captured));
    test('T26 failed identity+state write: no dispatch, photo intact',()=>{
      ok(s.state==='displaced'||s.state==='unverified','still awaiting review: '+s.state);
      ok(s.blob,'photo not deleted');});
    await ctx.close();
  }

  /* ================= round-33 item 1, reworked for round-34 ruling 5 ==========
     T34: the PROGRESS-PHOTO RETAKE interrupted DURING retirement.

     The flow stages new bytes (idbAdd → queue → upload → map) and then retires
     the earlier photo through the asynchronous queue. The interesting failure
     is authority loss AFTER staging but DURING retirement, and it cannot be hit
     honestly with a timer.

     Round 33 did this with a product-side hook (`window.__m10pFault`). That
     hook is GONE from index.html. The interruption is now driven entirely from
     the harness: this suite wraps the public global `m10pDispatch` inside the
     page and, when the entry the dispatcher is about to process (computed with
     the product's own `m10pFindEntry(m10pOps())`) is THIS retirement at the
     chosen phase, drops the pen and restores the original wrapper. The
     dispatcher's internal recursion resolves `m10pDispatch` through the global
     object, so the wrapper sees every pass — the same phase-exactness the seam
     gave, with no seam in the release artifact.

     Two arms: before the server delete (`intent`) and after the server acked
     it but before the local removal (`acked`).

     Five properties per arm, each asserted concretely:
       P1 the original bytes or their durable recovery obligation remain
       P2 the staged photo is represented honestly
       P3 no unauthorized delete completes
       P4 the queue and map remain recoverable (proved by RESUMING them)
       P5 the UI does not falsely report a fully completed replacement    */
  const ADDPROG=`async function(id,wk,pose,seed){
    const bytes=new Uint8Array(512);for(let i=0;i<512;i++)bytes[i]=(i*seed)%256;
    const blob=new Blob([bytes],{type:'image/jpeg'});
    return idbAdd({id:id,date:wk,week:wk,pose:pose,kind:'progress',blob:blob,ts:1});
  }`;
  const RETAKE=`async function(pose){
    /* the REAL production entry point. Since the guided-camera package
       (2026-08-06) a slot tap opens the SOURCE CHOOSER first — camera or
       upload — and it is the upload branch that stages
       pendingPose/pendingProgWeek and opens the picker (where the
       delayed-boundary gate captures authority). Driving pphoto:add alone
       no longer stages anything; this suite was blind to the change while
       it defaulted to the parked artifact (found 2026-08-07). */
    const b=document.createElement('button');
    b.setAttribute('data-act','pphoto:add');b.setAttribute('data-pose',pose);
    document.body.appendChild(b);
    b.click();
    await new Promise(r=>setTimeout(r,60));
    const up=document.querySelector('[data-act="pfsrc:upload"]');
    if(!up)throw new Error('the source chooser did not open for pphoto:add');
    up.click();
    const staged={pose:state.pendingPose,week:state.pendingProgWeek};
    /* the picker now DECODES the file and routes it through the
       standardization review (M2, 2026-08-06) — synthetic bytes fail
       img.onload, and nothing saves until the review is ACCEPTED. Feed a
       real JPEG and drive the accept, which is what runs the X2
       add-then-retire chain this case is about. */
    const cv=document.createElement('canvas');cv.width=600;cv.height=800;
    const g=cv.getContext('2d');g.fillStyle='#3a5f8a';g.fillRect(0,0,600,800);
    const real=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.9));
    const inp=document.getElementById('wl-photo-input');
    const dt=new DataTransfer();dt.items.add(new File([real],'new.jpg',{type:'image/jpeg'}));
    inp.files=dt.files;
    inp.dispatchEvent(new Event('change',{bubbles:true}));
    for(let i=0;i<60;i++){
      const use=document.querySelector('[data-act="pf:use"]:not([disabled])');
      if(use){use.click();break;}
      await new Promise(r=>setTimeout(r,50));
    }
    return staged;
  }`;
  for(const arm of [
    {faultAt:'intent',name:'before the server delete',expectServerDeletes:0},
    {faultAt:'acked', name:'after the server ack, before the local removal',expectServerDeletes:1}]){
    const st=mkSt();
    const {ctx,page,errs}=await boot(browser,server,st);
    const s=await page.evaluate(async(args)=>{
      const [addProgSrc,retakeSrc,faultAt]=args;
      const wk=toISO(weekStartFor(0));
      const oldId='prog-'+wk+'-front-000000000001';
      await eval('('+addProgSrc+')')(oldId,wk,'front',7);
      await new Promise(r=>setTimeout(r,900));
      const preOldMapped=pbPhotoMap()[oldId]||null;
      const preOldServerRec=!!(await window.__get('photos'))[preOldMapped];
      const toasts=[];const t0=window.toast;window.toast=function(m){toasts.push(m);return t0(m);};
      /* HARNESS-SIDE interruption (round-34 ruling 5): wrap the public global
         m10pDispatch and drop the pen at EXACTLY this retirement phase. One
         shot — the original is restored the moment it fires — so nothing else
         in the episode is affected. `fired` proves the wrapper actually ran;
         if the phase were never reached the arm would be vacuous. */
      const origDispatch=window.m10pDispatch;
      let fired=0;
      window.m10pDispatch=function(){
        try{
          const nx=m10pFindEntry(m10pOps());
          if(nx&&nx.op==='delete'&&nx.localId===oldId&&nx.state===faultAt){
            window.m10pDispatch=origDispatch;fired++;M10.holder=false;}
        }catch(e){}
        return origDispatch.apply(this,arguments);};
      const staged=await eval('('+retakeSrc+')')('front');
      await new Promise(r=>setTimeout(r,3200));   /* past the honest-report poll */
      window.toast=t0;
      const all=await idbAll();
      const ops=m10pOps();
      const del=ops.find(x=>x.op==='delete'&&x.localId===oldId)||null;
      const newRec=all.find(p=>p.kind==='progress'&&p.week===wk&&p.pose==='front'&&p.id!==oldId)||null;
      const held={
        holder:M10.holder,
        stagedPose:staged.pose,stagedWeek:staged.week,
        /* P1 */
        oldBlob:!!all.find(p=>p.id===oldId),
        delState:del&&del.state,delLen:ops.filter(x=>x.op==='delete').length,
        delHasIdentity:!!(del&&del.requestId&&del.serverId&&del.capturedLocalMeta),
        /* P2 */
        newBlob:!!newRec,newMapped:newRec?(pbPhotoMap()[newRec.id]||null):null,
        addLeft:ops.filter(x=>x.op==='add').length,
        /* P3 */
        oldStillMapped:pbPhotoMap()[oldId]||null,
        serverDeletes:(await window.__get('deletes'))||0,
        /* P4 */
        queueReadable:m10pRead(m8Uid()).st,
        /* P5 */
        toasts:toasts.slice(),
        /* the interruption itself actually happened */
        fired:fired};
      /* P4, proved by RESUMING: with the pen back the parked obligation
         completes — nothing was stranded and nothing was silently dropped */
      window.m10pDispatch=origDispatch;M10.holder=true;
      m10pDispatch();
      await new Promise(r=>setTimeout(r,1400));
      const all2=await idbAll();
      return {held,preOldMapped,preOldServerRec,
        after:{oldBlob:!!all2.find(p=>p.id===oldId),ops:m10pOps().length,
          serverDeletes:(await window.__get('deletes'))||0,
          oldMapped:pbPhotoMap()[oldId]||null,
          newBlob:!!all2.find(p=>p.kind==='progress'&&p.week===toISO(weekStartFor(0))&&p.pose==='front')}};
    },[ADDPROG,RETAKE,arm.faultAt]);
    test(`T34 [${arm.faultAt}] setup is real: the earlier photo was uploaded and mapped, the retake used the production entry point`,()=>{
      ok(s.preOldMapped,'earlier photo mapped to a server record');
      ok(s.preOldServerRec,'the server actually holds it');
      eq(s.held.stagedPose,'front','pphoto:add set the pose');
      ok(s.held.stagedWeek,'pphoto:add set the week');
      eq(s.held.fired,1,'the harness interruption fired exactly once, at the chosen phase');});
    test(`T34 [${arm.faultAt}] P1 the original bytes AND a durable retirement obligation both survive`,()=>{
      ok(!s.held.holder,'authority was actually lost');
      ok(s.held.oldBlob,'the earlier photo is still on the device');
      eq(s.held.delLen,1,'exactly one retirement obligation');
      eq(s.held.delState,arm.faultAt,'parked at the phase authority was lost');
      ok(s.held.delHasIdentity,'the obligation carries requestId + serverId + captured meta');});
    test(`T34 [${arm.faultAt}] P2 the staged photo is represented honestly`,()=>{
      ok(s.held.newBlob,'the new bytes are on the device');
      ok(s.held.newMapped,'and mapped to the server record they were uploaded to');
      eq(s.held.addLeft,0,'no half-finished add left behind');});
    test(`T34 [${arm.faultAt}] P3 no unauthorized delete completes (${arm.name})`,()=>{
      eq(s.held.serverDeletes,arm.expectServerDeletes,
        'server deletes issued while unauthorized (measured AT the interruption, not after recovery)');
      ok(s.held.oldBlob,'no local deletion without the pen');
      eq(s.held.oldStillMapped,s.preOldMapped,'the mapping was not cleared');});
    test(`T34 [${arm.faultAt}] P4 the queue and map stay recoverable — resuming with the pen completes it`,()=>{
      eq(s.held.queueReadable,'ok','queue still typed-readable, never quarantined');
      eq(s.after.ops,0,'the obligation drained once the pen returned');
      eq(s.after.serverDeletes,1,'exactly one server delete across the whole episode (idempotent replay)');
      ok(!s.after.oldBlob,'the earlier photo is retired only under authority');
      eq(s.after.oldMapped,null,'its mapping is cleared as part of the same completion');
      ok(s.after.newBlob,'the staged photo survives the whole episode');});
    test(`T34 [${arm.faultAt}] P5 the UI does not claim a completed replacement`,()=>{
      ok(s.held.toasts.some(x=>/earlier photo is still on this device/.test(x)),
        'honest report: '+JSON.stringify(s.held.toasts));
      ok(!s.held.toasts.some(x=>/^Photo saved$/.test(x)),
        'never the bare completion claim: '+JSON.stringify(s.held.toasts));});
    test(`T34 [${arm.faultAt}] no page errors`,()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }
  /* T34c — the CONTRAST arm. Without the fault the identical flow completes and
     reports the plain "Photo saved". Without this, T34's P5 assertions would be
     satisfied by a message that is simply always pessimistic. */
  {
    const st=mkSt();
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(args)=>{
      const [addProgSrc,retakeSrc]=args;
      const wk=toISO(weekStartFor(0));
      const oldId='prog-'+wk+'-front-000000000001';
      await eval('('+addProgSrc+')')(oldId,wk,'front',7);
      await new Promise(r=>setTimeout(r,900));
      const toasts=[];const t0=window.toast;window.toast=function(m){toasts.push(m);return t0(m);};
      await eval('('+retakeSrc+')')('front');
      await new Promise(r=>setTimeout(r,3200));
      window.toast=t0;
      const all=await idbAll();
      return {toasts,holder:M10.holder,ops:m10pOps().length,
        oldBlob:!!all.find(p=>p.id===oldId),
        oldMapped:pbPhotoMap()[oldId]||null,
        newCount:all.filter(p=>p.kind==='progress'&&p.week===wk&&p.pose==='front').length};
    },[ADDPROG,RETAKE]);
    test('T34c uninterrupted retake: retirement completes and the report is the plain "Photo saved"',()=>{
      ok(s.holder,'still the writer throughout');
      eq(s.ops,0,'queue drained');ok(!s.oldBlob,'earlier photo retired');
      eq(s.oldMapped,null,'its mapping cleared');eq(s.newCount,1,'exactly one photo in the slot');
      ok(s.toasts.some(x=>/^Photo saved$/.test(x)),'plain completion: '+JSON.stringify(s.toasts));
      ok(!s.toasts.some(x=>/earlier photo is still on this device/.test(x)),
        'the honest-failure wording is NOT unconditional: '+JSON.stringify(s.toasts));});
    await ctx.close();
  }

  /* ================= round-33 item 3 =================
     T35: m10p:discard as a NON-HOLDER, from a real displaced queue entry.

     Discard is deliberately reachable without the pen (INCR5-README: "take
     over, review a displaced change, discard a pending photo op and conflict
     resolution are the flows that repair the situation, and gating them would
     deadlock the device"). Its safety therefore rests on WHAT it does, not on
     who may call it: it removes the pending obligation and NOTHING else. */
  {
    const st=mkSt({fenceRequired:true,fence:1});
    const {ctx,page,errs}=await boot(browser,server,st);
    const s=await page.evaluate(async(addSrc)=>{
      await eval('('+addSrc+')')('l-35');
      await new Promise(r=>setTimeout(r,800));
      const sid=pbPhotoMap()['l-35'];
      await window.__set('fence',5);                 /* another device took over */
      idbDelete('l-35');
      await new Promise(r=>setTimeout(r,900));
      const d=m10pDisplaced();
      /* now genuinely a non-holder */
      M10.holder=false;
      const keySnap=()=>{const o={};Object.keys(localStorage).forEach(k=>{
        if(/^wl_core_|^wl_photomap|^wl_v1$|^wl_training_v1$|^wl_workout/.test(k))o[k]=localStorage.getItem(k);});
        return JSON.stringify(o);};
      const before={keys:keySnap(),blob:!!(await idbGetLocal('l-35')),
        map:pbPhotoMap()['l-35']||null,serverRec:!!(await window.__get('photos'))[sid],
        deletes:(await window.__get('deletes'))||0};
      /* drive the REAL banner control, not the function directly */
      const host=document.createElement('div');
      host.innerHTML=m10pBannerHTML();document.body.appendChild(host);
      const btn=host.querySelector('[data-act="m10p:discard"][data-id="'+d[0].id+'"]');
      let reached=false;
      if(btn)btn.click();
      await new Promise(r=>setTimeout(r,150));
      const asked=state.pendingConfirm?state.pendingConfirm.message:'';
      if(state.pendingConfirm){reached=true;const fn=state.pendingConfirm.fn;state.pendingConfirm=null;fn();}
      await new Promise(r=>setTimeout(r,400));
      return {holder:M10.holder,displacedBefore:d.length,btnFound:!!btn,asked,reached,before,
        after:{keys:keySnap(),blob:!!(await idbGetLocal('l-35')),map:pbPhotoMap()['l-35']||null,
          serverRec:!!(await window.__get('photos'))[sid],
          deletes:(await window.__get('deletes'))||0,
          ops:m10pOps().length,displaced:m10pDisplaced().length,
          queue:m10pRead(m8Uid()).st}};
    },ADD);
    test('T35 setup: a real displaced delete exists and the banner offers Discard to a non-holder',()=>{
      eq(s.displacedBefore,1);ok(s.btnFound,'the production Discard control rendered');
      ok(!s.holder,'device does NOT hold the pen');
      ok(/Discard this pending photo change/.test(s.asked),'explicit confirmation: '+s.asked);
      ok(s.reached,'the click reached the handler — discard is ungated by design');});
    test('T35 discard removes ONLY the pending obligation',()=>{
      eq(s.after.ops,0,'queue entry gone');eq(s.after.displaced,0);
      eq(s.after.queue,'ok','queue still typed-readable');});
    test('T35 discard leaves photo bytes, the mapping and every store untouched',()=>{
      ok(s.before.blob&&s.after.blob,'the local photo stays');
      ok(s.before.map);eq(s.after.map,s.before.map,'the id mapping is unchanged');
      ok(s.before.serverRec&&s.after.serverRec,'the server record is untouched');
      eq(s.after.deletes,s.before.deletes,'no server delete issued');});
    test('T35 discard performs no other durable write (core/training/workout/map bytes identical)',()=>{
      eq(s.after.keys,s.before.keys,'every non-queue store byte-identical');});
    test('T35 no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  await browser.close();server.close();
  console.log(`\nC18-M10 increment 4: ${passed} passed, ${failures.length} failed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});

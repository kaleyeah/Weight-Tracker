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
const SRC=process.env.CF_SRC||'/home/griffin/projects/Weight-Tracker/index.html';
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

  await browser.close();server.close();
  console.log(`\nC18-M10 increment 4: ${passed} passed, ${failures.length} failed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});

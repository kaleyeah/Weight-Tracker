/* D1 Stage 1 — REAL enforce-mode server proof.
   Disposable instance only (127.0.0.1:8099, fresh pb_data, deleted after).
   Proves the server accepts exactly what the Stage-1 client now sends, and
   rejects exactly what it used to send. */
const B='http://127.0.0.1:8099';
const j=async(p,o)=>{const r=await fetch(B+p,o);let b=null;try{b=await r.json();}catch(e){}return{s:r.status,b};};
const results=[];
const rec=(n,pass,detail)=>{results.push({n,pass,detail});console.log((pass?'  ✓ ':'  ✗ ')+n+(detail?'  ['+detail+']':''));};

/* disposable superuser -> disposable athlete */
const su=await j('/api/collections/_superusers/auth-with-password',{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({identity:'probe@local.test',password:'probe-password-1'})});
if(su.s!==200){console.error('superuser auth failed',su.s,JSON.stringify(su.b));process.exit(2);}
const SU=su.b.token;
const email='d1probe-'+Date.now()+'@local.test', pw='d1-probe-password-1';
const mk=await j('/api/collections/users/records',{method:'POST',
  headers:{'Content-Type':'application/json',Authorization:SU},
  body:JSON.stringify({email,password:pw,passwordConfirm:pw,verified:true})});
if(mk.s!==200){console.error('user create failed',mk.s,JSON.stringify(mk.b));process.exit(2);}
const UID=mk.b.id;
const au=await j('/api/collections/users/auth-with-password',{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({identity:email,password:pw})});
const TOK=au.b.token;
const H={'Content-Type':'application/json',Authorization:TOK};
const DEV='dev-'+'abcdefghijklmnopqrstuvwx';
const commit=(body)=>j('/api/cf/appdata/commit',{method:'POST',headers:H,body:JSON.stringify(body)});
const rid=()=>'m8-'+UID+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);
const TRAIN={cardioTypes:[],exercises:[{id:'e1',name:'Squat'}],liftSessions:{},routines:[],sessions:{}};

/* 1. take the pen */
const lease=await j('/api/cf/writer/lease',{method:'POST',headers:H,
  body:JSON.stringify({op:'acquire',deviceId:DEV,deviceName:'ProbeDevice'})});
rec('the disposable device acquires the writer lease',lease.s===200&&lease.b&&lease.b.ok===true,'status '+lease.s);
const FENCE=lease.b&&lease.b.fence;
rec('the grant carries a usable fence',typeof FENCE==='number'&&FENCE>=1,'fence '+FENCE);

/* 2. what the client used to send: NO fence, NO deviceId */
const un=await commit({subsystem:'training',expectedRev:0,idempotencyKey:rid(),payload:TRAIN});
rec('UNFENCED training commit is REJECTED under enforcement',un.s===409&&un.b&&un.b.fenceStale===true,
  'status '+un.s+' body '+JSON.stringify(un.b));

/* 3. a WRONG fence is rejected too */
const wrong=await commit({subsystem:'training',expectedRev:0,idempotencyKey:rid(),payload:TRAIN,
  fence:FENCE+7,deviceId:DEV});
rec('a WRONG fence is rejected',wrong.s===409&&wrong.b&&wrong.b.fenceStale===true,'status '+wrong.s);

/* 4. right fence, wrong device */
const otherDev=await commit({subsystem:'training',expectedRev:0,idempotencyKey:rid(),payload:TRAIN,
  fence:FENCE,deviceId:'dev-zzzzzzzzzzzzzzzzzzzzzzzz'});
rec('the right fence from the WRONG device is rejected',otherDev.s===409&&otherDev.b&&otherDev.b.fenceStale===true,
  'status '+otherDev.s);

/* 5. what the Stage-1 client now sends: fence + deviceId */
const good=await commit({subsystem:'training',expectedRev:0,idempotencyKey:rid(),payload:TRAIN,
  fence:FENCE,deviceId:DEV});
rec('the Stage-1 FENCED training commit is ACCEPTED',good.s===200&&good.b&&good.b.ok===true,
  'status '+good.s+' newRev '+(good.b&&good.b.newRev));

/* 6. a rejected commit mutated NOTHING — the accepted one is revision 1 */
rec('the rejected attempts left the revision untouched',good.b&&good.b.newRev===1,
  'newRev '+(good.b&&good.b.newRev)+' (3 rejected attempts preceded it)');

/* 7. the same holds for the CORE subsystem */
const coreUn=await commit({subsystem:'core',expectedRev:0,idempotencyKey:rid(),payload:{weights:[]}});
const coreOk=await commit({subsystem:'core',expectedRev:0,idempotencyKey:rid(),payload:{weights:[]},
  fence:FENCE,deviceId:DEV});
rec('core: unfenced rejected, fenced accepted',
  coreUn.s===409&&coreUn.b&&coreUn.b.fenceStale===true&&coreOk.s===200,
  'unfenced '+coreUn.s+' / fenced '+coreOk.s);

/* ---- cleanup: delete the disposable athlete and VERIFY absence ---- */
await j('/api/collections/users/records/'+UID,{method:'DELETE',headers:{Authorization:SU}});
const gone=await j('/api/collections/users/records/'+UID,{headers:{Authorization:SU}});
rec('the disposable athlete is deleted (verified absent)',gone.s===404,'status '+gone.s);

const failed=results.filter(r=>!r.pass).length;
console.log('\nD1 enforce-mode proof: '+(results.length-failed)+' passed, '+failed+' failed');
process.exit(failed?1:0);

const path=require('path'),fs=require('fs'),http=require('http');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const pb=require('/home/griffin/projects/Weight-Tracker/tests/browser/pbserver.js');
const ROOT='/home/griffin/projects/Weight-Tracker',PORT=8181,PB_PORT=8182;
const PRE=JSON.stringify({settings:{onboarded:true,name:'STRANGER'},weights:[{d:'2026-01-09',kg:101.5}]});
const SEED=(b)=>`<!doctype html><meta charset="utf-8"><body><script>
localStorage.clear();localStorage.setItem('wl_v1',${JSON.stringify(PRE)});
localStorage.setItem('wl_pb',JSON.stringify({base:${JSON.stringify(b)}}));location.replace('/index.html');</script>`;
(async()=>{
  const server=await pb.start(PB_PORT);
  const DATA={settings:{onboarded:true,name:'REAL ATHLETE'},weights:[{d:'2026-07-01',kg:81.5}],
    food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},statuses:[],presets:[],skips:{},nightlyLog:{}};
  /* create the row AS THE ATHLETE — createRule is user = @request.auth.id, and
     an admin-token create was failing relation validation */
  let r=await server.api('POST','/api/collections/appdata/records',server.user.token,
    {user:server.user.id,data:DATA,training:{plan:'REAL'}});
  console.log('create row:',r.status,JSON.stringify(r.body).slice(0,200));
  const rid=r.body&&r.body.id;
  if(rid){ /* simulate the legacy BRIDGE having bumped revs (direct PATCH path) */
    const up=await server.api('PATCH','/api/collections/appdata/records/'+rid,server.adminToken,{coreRev:85,trainingRev:10});
    console.log('bridge-bump revs:',up.status,'coreRev',up.body&&up.body.coreRev,'trainingRev',up.body&&up.body.trainingRev);
  }
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const web=http.createServer((rq,rs)=>{if((rq.url||'').split('?')[0]==='/seed'){rs.writeHead(200,{'content-type':'text/html; charset=utf-8'});rs.end(SEED(server.base));return;}
    rs.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});rs.end(html);});
  await new Promise(x=>web.listen(PORT,'127.0.0.1',x));
  const browser=await chromium.launch();
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await ctx.newPage();
  const reqs=[]; page.on('request',q=>{if(/appdata|commit/.test(q.url()))reqs.push(q.method()+' '+q.url().replace(server.base,''));});
  const resp=[]; page.on('response',async q=>{if(/appdata|commit/.test(q.url()))resp.push(q.status()+' '+q.url().replace(server.base,''));});
  await page.goto('http://127.0.0.1:'+PORT+'/seed',{waitUntil:'load'});
  await page.waitForFunction(()=>document.documentElement.style.visibility!=='hidden',null,{timeout:10000});
  await page.evaluate(()=>['wl-applied-banner','wl-update-banner'].forEach(i=>{const e=document.getElementById(i);if(e&&e.remove)e.remove();}));
  await page.evaluate(c=>{document.getElementById('wl-pb-email').value=c.e;document.getElementById('wl-pb-pass').value=c.p;pbDoLogin();},
    {e:server.user.email,p:pb.ATHLETE.pass});
  await page.waitForFunction(()=>typeof syncOn==='function'&&syncOn(),null,{timeout:15000});
  await page.waitForTimeout(800);
  await page.click('[data-act="cf:disown"]');
  await page.waitForSelector('.wl-confirm',{state:'visible',timeout:5000});
  await page.click('[data-act="confirm:yes"]');
  await page.waitForFunction(()=>document.documentElement.style.visibility!=='hidden',null,{timeout:15000});
  await page.waitForTimeout(6000);
  const st=await page.evaluate(()=>({
    weights:(window.state&&state.weights||[]).length,
    name:(window.state&&state.settings&&state.settings.name)||null,
    legacySyncState:(window.syncState||{}).s, legacyMsg:(window.syncState||{}).msg,
    dot:(typeof syncDotClass==='function')?syncDotClass():null,
    casCore:(typeof cfCasStatusFor==='function')?cfCasStatusFor('core'):null,
    casTraining:(typeof cfCasStatusFor==='function')?cfCasStatusFor('training'):null,
    dirty:(typeof isDirty==='function')?isDirty():null,
    localRev:(typeof revLocal==='function')?revLocal('core'):null,
    serverRevSeen:(typeof cfCasServerRev==='function')?cfCasServerRev('core'):null,
  }));
  console.log('AFTER SET-ASIDE + PULL:',JSON.stringify(st,null,1));
  console.log('requests:',reqs.slice(-8)); console.log('responses:',resp.slice(-8));
  await browser.close();web.close();await server.stop();
})().catch(e=>{console.error(e);process.exit(1);});

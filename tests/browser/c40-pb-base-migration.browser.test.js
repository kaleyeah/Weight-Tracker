/* C40 (browser) — the PocketBase base survives a tailnet move.

   The tailnet's MagicDNS suffix changed on 2026-08-10, so
   `rack.tail6fa16c.ts.net` stopped resolving everywhere at once. Bumping
   PB_DEFAULT_BASE alone fixes nobody: pbBase() prefers the value STORED in the
   wl_pb record, and every account that has ever logged in has the old host
   sitting there. The migration therefore has to happen on READ.

   What matters here:
     - a device carrying the retired host in its stored config reaches the new
       one without anyone editing anything;
     - a fresh device gets the new host from the default;
     - a DELIBERATE custom base (someone running their own server) is left
       completely alone — this must not become a rule that rewrites strangers'
       hostnames;
     - the stored record is not modified, because rewriting it would need write
       authority the M10 lease refuses on a non-writer device.

       CF_SRC=<file> node tests/browser/c40-pb-base-migration.browser.test.js */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
const OLD='rack.tail6fa16c.ts.net', NEW='rack.tail8b20e0.ts.net';
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const eq=(a,b,m)=>{if(a!==b)throw new Error((m||'eq')+': '+JSON.stringify(a)+' !== '+JSON.stringify(b));};

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();
  const errs=[];

  /* each case boots its own context so localStorage starts clean */
  const withStoredBase=async(base)=>{
    const ctx=await browser.newContext({viewport:{width:390,height:844}});
    await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})}));
    await ctx.addInitScript(b=>{
      const cfg={uid:'userA',token:'tok',email:'a@x.com'};
      if(b!==null)cfg.base=b;                     /* null = never configured */
      localStorage.setItem('wl_pb',JSON.stringify(cfg));
      localStorage.setItem('wl_last_owner','userA');
      localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},
        weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},
        leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
    },base);
    const page=await ctx.newPage();
    page.on('pageerror',e=>errs.push(String(e)));
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
    await page.waitForTimeout(700);
    const out=await page.evaluate(()=>({
      base:pbBase(),
      stored:(JSON.parse(localStorage.getItem('wl_pb')||'{}')).base||null,
      dflt:PB_DEFAULT_BASE,
    }));
    await ctx.close();
    return out;
  };

  console.log('C40 — PocketBase base survives the tailnet move');

  const migrated=await withStoredBase('https://'+OLD);
  test('a stored RETIRED host is remapped to the live one',()=>{
    eq(migrated.base,'https://'+NEW,'pbBase()');
    ok(migrated.base.indexOf(OLD)<0,'the dead host must not survive anywhere in the URL');
  });
  test('the stored record is left untouched (no write authority needed)',()=>{
    eq(migrated.stored,'https://'+OLD,'stored value should be unchanged');
  });

  const fresh=await withStoredBase(null);
  test('a device that never configured a base gets the live default',()=>{
    eq(fresh.dflt,'https://'+NEW,'PB_DEFAULT_BASE');
    eq(fresh.base,'https://'+NEW,'pbBase()');
  });

  const custom=await withStoredBase('https://pb.example.com');
  test('a deliberate custom base is NOT rewritten',()=>{
    eq(custom.base,'https://pb.example.com');
  });

  /* a retired host with a path/trailing slash still has to come out clean */
  const trailing=await withStoredBase('https://'+OLD+'/');
  test('trailing slashes are still stripped after migration',()=>{
    eq(trailing.base,'https://'+NEW);
  });

  test('no page errors',()=>eq(errs.length,0,errs.join(' | ')));

  console.log('\n'+passed+' passed, '+failures.length+' failed');
  await browser.close();server.close();
  process.exit(failures.length?1:0);
})();

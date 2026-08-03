#!/usr/bin/env python3
"""Anti-tautology harness (round-34).

Builds a DELIBERATELY BROKEN copy of index.html by removing or inverting one
named guard, runs a suite against it, and prints the assertions that failed.
A new assertion that cannot be made to fail is worse than no assertion, so
every guard added this round is checked here.

    tests/browser/mutate.py list
    tests/browser/mutate.py run <mutant> <suite> <outdir>
"""
import os, re, subprocess, sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPO = "/home/griffin/projects/Weight-Tracker"
SRC = os.path.join(REPO, "index.html")

# name -> (find, replace)
MUTANTS = {
 # ---- round-34 ruling 1: m8SoftRecoveryAuth's narrowing conditions ----
 "hard":    ('  if(m8HardBlocked)return {ok:false,why:"hard-blocked"};\n', ''),
 "core":    ('  if(m10cHardBlocked||m10cUnprovenBlocked)return {ok:false,why:"core-blocked"};\n', ''),
 "corrupt": ('  if(M10.corrupt)return {ok:false,why:"corrupt"};\n  var uid=null;try{uid=pbUid();}catch(e){}\n  if(!uid)return {ok:false,why:"no-account"};\n  if(!M10.holder||M10.uid!==uid)return {ok:false,why:"not-holder"};\n  if(!(performance.now()<M10.deadline))return {ok:false,why:"expired"};\n  if(!m10pNat(M10.fence)||M10.fence<1)return {ok:false,why:"no-fence"};\n  if(localWritesFrozen())return {ok:false,why:"frozen"};\n',
             '  var uid=null;try{uid=pbUid();}catch(e){}\n  if(!uid)return {ok:false,why:"no-account"};\n  if(!M10.holder||M10.uid!==uid)return {ok:false,why:"not-holder"};\n  if(!(performance.now()<M10.deadline))return {ok:false,why:"expired"};\n  if(!m10pNat(M10.fence)||M10.fence<1)return {ok:false,why:"no-fence"};\n  if(localWritesFrozen())return {ok:false,why:"frozen"};\n'),
 "holder":  ('  if(!M10.holder||M10.uid!==uid)return {ok:false,why:"not-holder"};\n  if(!(performance.now()<M10.deadline))return {ok:false,why:"expired"};\n  if(!m10pNat(M10.fence)||M10.fence<1)return {ok:false,why:"no-fence"};\n  if(localWritesFrozen())',
             '  if(!(performance.now()<M10.deadline))return {ok:false,why:"expired"};\n  if(!m10pNat(M10.fence)||M10.fence<1)return {ok:false,why:"no-fence"};\n  if(localWritesFrozen())'),
 "expiry":  ('  if(!(performance.now()<M10.deadline))return {ok:false,why:"expired"};\n  if(!m10pNat(M10.fence)||M10.fence<1)return {ok:false,why:"no-fence"};\n  if(localWritesFrozen())',
             '  if(!m10pNat(M10.fence)||M10.fence<1)return {ok:false,why:"no-fence"};\n  if(localWritesFrozen())'),
 "fence":   ('  if(!m10pNat(M10.fence)||M10.fence<1)return {ok:false,why:"no-fence"};\n  if(localWritesFrozen())return {ok:false,why:"frozen"};\n',
             '  if(localWritesFrozen())return {ok:false,why:"frozen"};\n'),
 "frozen":  ('  if(localWritesFrozen())return {ok:false,why:"frozen"};\n', ''),

 # ---- round-34 ruling 2: the exemption's contract ----
 # every persistence/verification guard removed and the soft block cleared by
 # assignment instead of M8's own re-read-and-validate release
 "nocheck": ('''  if(!saveTrainingLocal()){m8Block("could not save training to storage");return false;}
  /* (3) the proof that THIS generation's bytes are on disk */
  var d=m8Read("dirty",pre.uid);
  if(!(d.st==="ok"&&d.val.gen===gen)){m8Block("could not record the proof");return false;}
  if(!m8Write("dirty",{gen:gen,persistedGen:gen,ts:d.val.ts},pre.uid)){
    m8Block("saved, but could not record the proof");return false;}
  /* (4) READ BOTH BACK and verify before anything is cleared */
  var v=m8Read("dirty",pre.uid);
  if(!(v.st==="ok"&&v.val.gen===gen&&v.val.persistedGen===gen)){
    m8Block("could not verify the proof");return false;}
  var onDisk=null,want=null;
  try{onDisk=localStorage.getItem(TKEY);}catch(e){onDisk=null;}
  try{want=JSON.stringify(state.training);}catch(e){want=null;}
  if(want==null||onDisk!==want){m8Block("could not verify the saved training");return false;}
  /* (5) only now may the soft block be released */
  m8ReleaseUnprovenIfProven();
  if(m8UnprovenBlocked)return false;             /* release refused: the block stands */''',
             '''  saveTrainingLocal();
  var d=m8Read("dirty",pre.uid);
  m8Write("dirty",{gen:gen,persistedGen:gen,ts:(d.st==="ok"?d.val.ts:1)},pre.uid);
  m8UnprovenBlocked=false;'''),

 # the exemption removed entirely (the round-33 behaviour)
 "noexempt":('''        if(name==="saveTraining"&&a.why==="blocked"&&m8SoftRecoveryAuth().ok)
          return m8SoftBlockRecoverySave();\n''', ''),
 # the exemption made generic — it stops being narrow
 "generic": ('function m8SoftRecoveryAuth(){\n  if(!syncOn())return {ok:false,why:"local"};',
             'function m8SoftRecoveryAuth(){\n  return {ok:true,uid:pbUid(),fence:M10.fence,gen:M10.gen};\n  if(!syncOn())return {ok:false,why:"local"};'),

 # ---- round-34 ruling 4: the two ungated exports ----
 "cxctx":   ('  var markDelivered=function(){\n    if(!m10cCtxOk(ctx)){cb&&cb(false);return;}\n',
             '  var markDelivered=function(){\n'),
 "cxcancel":('      function(){toast("Share cancelled — the copies have not left the device");cb&&cb(false);});return;}',
             '      markDelivered);return;}'),
 "m8cancel":('      function(){toast("Share cancelled \\u2014 the copies have not left the device");cb&&cb(false);});return;}',
             '      markDelivered);return;}'),
 "m8uid":   ('    var r2=m8Read("conflict");if(r2.st!=="ok"){cb&&cb(false);return;}\n    r2.val.exports={localGen:gen,localCanon:fileLocalCanon,serverDone:true,localDone:true};\n    if(!m8Write("conflict",r2.val)){',
             '    var r2=m8Read("conflict",cx.owner);if(r2.st!=="ok"){cb&&cb(false);return;}\n    r2.val.exports={localGen:gen,localCanon:fileLocalCanon,serverDone:true,localDone:true};\n    if(!m8Write("conflict",r2.val,cx.owner)){'),

 # a stray extra durable write inside each export — proves the
 # "everything else is byte-identical" assertions are load-bearing
 "cxextra": ('    toast("Both copies exported");try{render();}catch(e){}cb&&cb(true);};',
             '    m10cWrite("dirty",{gen:m10cGen,ts:1},ctx.uid);\n    toast("Both copies exported");try{render();}catch(e){}cb&&cb(true);};'),
 "m8extra": ('    toast("Both copies exported");m8Rerender();cb&&cb(true);};',
             '    m8Write("dirty",{gen:m8Gen,ts:1});\n    toast("Both copies exported");m8Rerender();cb&&cb(true);};'),

 # ---- round-34 ruling 5: the harness-driven T34 interruption ----
 "pen":     ('  return (M10.holder&&M10.uid===m8Uid()&&performance.now()<M10.deadline)?{fence:M10.fence,uid:M10.uid}:null;',
             '  return (M10.uid===m8Uid()&&performance.now()<M10.deadline)?{fence:M10.fence,uid:M10.uid}:null;'),
}

def build(name, outdir):
    find, repl = MUTANTS[name]
    src = open(SRC, encoding='utf-8').read()
    n = src.count(find)
    if n != 1:
        raise SystemExit("mutant %s: anchor found %d times (need exactly 1)" % (name, n))
    os.makedirs(outdir, exist_ok=True)
    p = os.path.join(outdir, "index.html")
    open(p, "w", encoding='utf-8').write(src.replace(find, repl, 1))
    return p

def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "list":
        for k in MUTANTS: print(k)
        return
    _, _, name, suite, outdir = sys.argv[:5]
    p = build(name, outdir)
    env = dict(os.environ, CF_SRC=p)
    log = os.path.join(outdir, "run.txt")
    with open(log, "w") as fh:
        rc = subprocess.call(["timeout", "-k", "20", "1500", "node",
                              os.path.join(REPO, "tests/browser/%s.browser.test.js" % suite)],
                             cwd=REPO, env=env, stdout=fh, stderr=subprocess.STDOUT)
    out = open(log, encoding='utf-8', errors='replace').read()
    fails = [l.strip() for l in out.splitlines() if l.strip().startswith("✗")]
    print("MUTANT %s vs %s: exit=%d, %d failed assertion(s)" % (name, suite, rc, len(fails)))
    for f in fails: print("   " + f)

main()

/* M8 five-kind rollback eligibility scan (design §7 / D5 / round-21 item 7).
   Paste into the browser console on the device, or run via the harness.
   Rolling back to the M8-free base .414 is LEGAL only when this prints
   eligible:true — i.e. NO M8 sync key of ANY kind has ever been written for
   ANY account. Any match forces recovery roll-forward instead. */
(function(){
  var kinds=["wl_training_dirty__","wl_training_base__","wl_training_conflict__","wl_training_journal__","wl_training_corrupt__"];
  var hits=[];
  for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);
    for(var j=0;j<kinds.length;j++)if(k&&k.indexOf(kinds[j])===0)hits.push(k);}
  var out={eligible:hits.length===0,matches:hits};
  console.log(JSON.stringify(out));return out;})();

/* M10 design probe — PB v0.39.8 hook/transaction semantics.
   Q1: can a routerAdd handler run $app.runInTransaction covering a read
       of one record + write of another, and does a concurrent write to
       the same row serialize?
   Q2: does onRecordUpdateRequest allow reading ANOTHER collection's
       record (the lease) and rejecting BEFORE the write?
   Q3: does saving a record from inside onRecordUpdateRequest re-fire
       hooks / deadlock (recursive-hook ambiguity)?
   Q4: does onRecordCreateRequest fire for CREATE (fencing record
       creation)? */
routerAdd("POST","/api/probe/tx",(e)=>{
  const info=e.requestInfo();
  const out={};
  $app.runInTransaction((txApp)=>{
    const lease=txApp.findFirstRecordByFilter("probe_lease","name='L1'");
    out.readFence=lease.getInt("fence");
    const doc=txApp.findFirstRecordByFilter("probe_doc","name='D1'");
    doc.set("val",doc.getInt("val")+1);
    doc.set("writerFence",out.readFence);
    txApp.save(doc);
    if(info.body.slowMs){const t0=Date.now();while(Date.now()-t0<info.body.slowMs){}}
    if(info.body.failAfterWrite)throw new Error("forced-rollback");
  });
  return e.json(200,{ok:true,readFence:out.readFence});
});
routerAdd("POST","/api/probe/steal",(e)=>{
  $app.runInTransaction((txApp)=>{
    const lease=txApp.findFirstRecordByFilter("probe_lease","name='L1'");
    lease.set("fence",lease.getInt("fence")+1);
    txApp.save(lease);
  });
  const lease2=$app.findFirstRecordByFilter("probe_lease","name='L1'");
  return e.json(200,{ok:true,fence:lease2.getInt("fence")});
});
onRecordUpdateRequest((e)=>{
  // Q2: read another collection + conditional reject pre-write
  const lease=e.app.findFirstRecordByFilter("probe_lease","name='L1'");
  const hdr=e.requestInfo().headers["x_probe_fence"]||"";
  if(hdr!==""&&parseInt(hdr)!==lease.getInt("fence"))
    throw new BadRequestError("fenceStale:"+lease.getInt("fence"));
  e.record.set("hookSaw",lease.getInt("fence"));
  e.next();
},"probe_doc");
onRecordCreateRequest((e)=>{
  e.record.set("hookSaw",-1);
  e.next();
},"probe_doc");
onRecordAfterUpdateSuccess((e)=>{
  // Q3: programmatic save from inside a hook — recursion check
  if(e.record.getInt("val")===777){
    e.record.set("val",778);
    e.app.save(e.record);/* would loop forever if this re-fired the same chain naively */
  }
  e.next();
},"probe_doc");

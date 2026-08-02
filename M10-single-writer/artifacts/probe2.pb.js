/* M10 round-6 item 2 — file-backed records inside runInTransaction. */
routerAdd("POST","/api/probe/fileup",(e)=>{
  const info=e.requestInfo();
  const fail=info.query["fail"]==="1";
  const slow=parseInt(info.query["slow"]||"0");
  let recId=null;
  try{
    $app.runInTransaction((txApp)=>{
      const col=txApp.findCollectionByNameOrId("probe_files");
      const rec=new Record(col);
      rec.set("label",info.query["label"]||"x");
      const f=e.findUploadedFiles("doc");
      if(f&&f.length)rec.set("doc",f[0]);
      txApp.save(rec);
      recId=rec.id;
      if(slow){const t0=Date.now();while(Date.now()-t0<slow){}}
      if(fail)throw new Error("forced-rollback");
    });
  }catch(err){return e.json(200,{ok:false,rolledBack:true,recId:recId,err:String(err).slice(0,80)});}
  return e.json(200,{ok:true,recId:recId});
});
routerAdd("POST","/api/probe/filedel",(e)=>{
  const info=e.requestInfo();
  const fail=info.query["fail"]==="1";
  try{
    $app.runInTransaction((txApp)=>{
      const rec=txApp.findRecordById("probe_files",info.query["id"]);
      txApp.delete(rec);
      if(fail)throw new Error("forced-rollback");
    });
  }catch(err){return e.json(200,{ok:false,rolledBack:true});}
  return e.json(200,{ok:true});
});

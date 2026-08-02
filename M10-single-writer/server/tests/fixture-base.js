/// Disposable-test fixture ONLY: fresh instances need the production-shaped
/// `appdata` collection that the CAS migration extends.
migrate((app) => {
  let col; try { col = app.findCollectionByNameOrId("appdata"); } catch (_) { col = null; }
  if (col) return;
  col = new Collection({
    type: "base", name: "appdata",
    listRule: "user = @request.auth.id", viewRule: "user = @request.auth.id",
    createRule: "user = @request.auth.id", updateRule: "user = @request.auth.id",
    deleteRule: null,
    fields: [
      { type: "relation", name: "user", required: true, cascadeDelete: true,
        collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1 },
      { type: "json", name: "data", maxSize: 2000000 },
      { type: "json", name: "training", maxSize: 2000000 },
      { type: "json", name: "health", maxSize: 2000000 },
      { type: "json", name: "coachreq", maxSize: 100000 },
    ],
  });
  app.save(col);
}, (app) => {
  try { const col = app.findCollectionByNameOrId("appdata"); app.delete(col); } catch (_) {}
});

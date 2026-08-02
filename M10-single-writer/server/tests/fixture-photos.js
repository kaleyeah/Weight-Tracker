/// Disposable-test fixture ONLY (not part of the deployable package):
/// creates the `photos` collection mirroring production's shape.
migrate((app) => {
  let col; try { col = app.findCollectionByNameOrId("photos"); } catch (_) { col = null; }
  if (col) return;
  col = new Collection({
    type: "base", name: "photos",
    listRule: "user = @request.auth.id", viewRule: "user = @request.auth.id",
    createRule: "user = @request.auth.id", updateRule: "user = @request.auth.id",
    deleteRule: "user = @request.auth.id",
    fields: [
      { type: "relation", name: "user", required: true, cascadeDelete: true,
        collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1 },
      { type: "text", name: "kind", max: 16 },
      { type: "text", name: "date", max: 10 },
      { type: "text", name: "week", max: 10 },
      { type: "text", name: "pose", max: 20 },
      { type: "text", name: "meal", max: 20 },
      { type: "text", name: "localId", max: 96 },
      { type: "text", name: "ts", max: 32 },
      { type: "file", name: "file", maxSelect: 1, maxSize: 16777216 },
    ],
  });
  app.save(col);
}, (app) => {
  try { const col = app.findCollectionByNameOrId("photos"); app.delete(col); } catch (_) {}
});

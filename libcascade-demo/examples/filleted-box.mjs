// Round every edge of a box with a 4 mm fillet.
using box = new oc.BRepPrimAPI_MakeBox(60, 40, 24);
using fillet = new oc.BRepFilletAPI_MakeFillet(box.Shape());
using explorer = new oc.TopExp_Explorer(
  box.Shape(),
  oc.TopAbs_ShapeEnum.TopAbs_EDGE,
);

while (explorer.More()) {
  using edge = oc.TopoDS.Edge(explorer.Current());
  fillet.Add(4, edge);
  explorer.Next();
}

// Shape() executes the fillet operation in libcascade. Check completion only
// after asking the builder for its result.
const filletedShape = fillet.Shape();
if (!fillet.IsDone() || filletedShape.IsNull()) {
  throw new Error("Box fillet failed.");
}

result = filletedShape;

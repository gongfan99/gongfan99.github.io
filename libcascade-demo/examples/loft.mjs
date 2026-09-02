// Build a solid through three progressively smaller polygonal profiles.
function makeProfile(points, z) {
  using polygon = new oc.BRepBuilderAPI_MakePolygon();
  for (const [x, y] of points) {
    using point = new oc.gp_Pnt(x, y, z);
    polygon.Add(point);
  }
  polygon.Close();
  return polygon.Wire();
}

using bottom = makeProfile([
  [-34, -24],
  [34, -24],
  [34, 24],
  [-34, 24],
], 0);
using middle = makeProfile([
  [-24, -18],
  [24, -18],
  [24, 18],
  [-24, 18],
], 20);
using top = makeProfile([
  [-14, -12],
  [14, -12],
  [14, 12],
  [-14, 12],
], 40);

using loft = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6);
loft.AddWire(bottom);
loft.AddWire(middle);
loft.AddWire(top);
loft.Build();
if (!loft.IsDone()) {
  throw new Error("Solid loft failed.");
}

result = loft.Shape();

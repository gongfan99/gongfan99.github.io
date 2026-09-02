// Build a Gordon surface from two profile curves and two guide curves.
// Keep it above the viewer origin (OCCT Z becomes viewer Y).
// Each profile intersects each guide at one corner of the network.
function makeBezier(points) {
  using poles = new oc.NCollection_Array1_gp_Pnt(points.length);
  for (const [index, [x, y, z]] of points.entries()) {
    using point = new oc.gp_Pnt(x, y, z);
    poles.SetValue(index, point);
  }
  return new oc.Geom_BezierCurve(poles);
}

using profileLeft = makeBezier([
  [-40, -25, 24],
  [-40, 0, 42],
  [-40, 25, 24],
]);
using profileRight = makeBezier([
  [40, -25, 24],
  [40, 0, 6],
  [40, 25, 24],
]);
using guideBottom = makeBezier([
  [-40, -25, 24],
  [0, -25, 10],
  [40, -25, 24],
]);
using guideTop = makeBezier([
  [-40, 25, 24],
  [0, 25, 38],
  [40, 25, 24],
]);

using profiles = new oc.NCollection_Array1_handle_Geom_Curve(2);
profiles.SetValue(0, profileLeft);
profiles.SetValue(1, profileRight);

using guides = new oc.NCollection_Array1_handle_Geom_Curve(2);
guides.SetValue(0, guideBottom);
guides.SetValue(1, guideTop);

using gordon = new oc.GeomFill_Gordon();
gordon.Init(profiles, guides, 1e-6);
gordon.Perform();
if (!gordon.IsDone()) {
  throw new Error(`Gordon surface construction failed: ${gordon.Status()}`);
}

using surface = gordon.Surface();
using faceMaker = new oc.BRepBuilderAPI_MakeFace(surface, 1e-6);
if (!faceMaker.IsDone()) {
  throw new Error("Could not trim the Gordon surface into a face.");
}
result = faceMaker.Face();

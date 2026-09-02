// Subtract a cylindrical tool from a box to make a through-hole.
using box = new oc.BRepPrimAPI_MakeBox(60, 40, 24);
using cutter = new oc.BRepPrimAPI_MakeCylinder(10, 34);

using translation = new oc.gp_Vec(30, 20, -5);
using transform = new oc.gp_Trsf();
transform.SetTranslation(translation);
using location = new oc.TopLoc_Location(transform);
using movedCutter = cutter.Shape().Moved(location, false);

using cut = new oc.BRepAlgoAPI_Cut(box.Shape(), movedCutter);
cut.Build();
if (!cut.IsDone()) {
  throw new Error("Boolean cut failed.");
}

result = cut.Shape();

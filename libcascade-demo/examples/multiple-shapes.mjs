// Return independent shapes as an array. They remain separate parts in XCAF.
using box = new oc.BRepPrimAPI_MakeBox(38, 32, 20);
using cylinder = new oc.BRepPrimAPI_MakeCylinder(14, 34);

using translation = new oc.gp_Vec(62, 0, 0);
using transform = new oc.gp_Trsf();
transform.SetTranslation(translation);
using location = new oc.TopLoc_Location(transform);

const movedCylinder = cylinder.Shape().Moved(location, false);
result = [box.Shape(), movedCylinder];

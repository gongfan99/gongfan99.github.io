// A compound keeps multiple pieces together without fusing them.
using box = new oc.BRepPrimAPI_MakeBox(38, 32, 20);
using sphere = new oc.BRepPrimAPI_MakeSphere(16);

using translation = new oc.gp_Vec(52, 16, 16);
using transform = new oc.gp_Trsf();
transform.SetTranslation(translation);
using location = new oc.TopLoc_Location(transform);
const movedSphere = sphere.Shape().Moved(location, false);

const compound = new oc.TopoDS_Compound();
using builder = new oc.TopoDS_Builder();
builder.MakeCompound(compound);
builder.Add(compound, box.Shape());
builder.Add(compound, movedSphere);
result = compound;

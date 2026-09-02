// Create a simple extruded spur gear with a central bore.
const toothCount = 12;
const rootRadius = 28;
const tipRadius = 40;
const thickness = 10;
const toothStep = (2 * Math.PI) / toothCount;

using profile = new oc.BRepBuilderAPI_MakePolygon();
for (let tooth = 0; tooth < toothCount; tooth += 1) {
  const angle = tooth * toothStep;
  const points = [
    [rootRadius, angle],
    [tipRadius, angle + toothStep * 0.22],
    [tipRadius, angle + toothStep * 0.78],
    [rootRadius, angle + toothStep * 0.92],
  ];
  for (const [radius, pointAngle] of points) {
    using point = new oc.gp_Pnt(
      radius * Math.cos(pointAngle),
      radius * Math.sin(pointAngle),
      0,
    );
    profile.Add(point);
  }
}
profile.Close();

using face = new oc.BRepBuilderAPI_MakeFace(profile.Wire(), false);
if (!face.IsDone()) {
  throw new Error("Gear profile creation failed.");
}
using extrusion = new oc.gp_Vec(0, 0, thickness);
using prism = new oc.BRepPrimAPI_MakePrism(face.Face(), extrusion, false, true);

using boreOrigin = new oc.gp_Pnt(0, 0, -1);
using boreDirection = new oc.gp_Dir(0, 0, 1);
using boreAxis = new oc.gp_Ax2(boreOrigin, boreDirection);
using bore = new oc.BRepPrimAPI_MakeCylinder(boreAxis, 8, thickness + 2);
using cut = new oc.BRepAlgoAPI_Cut(prism.Shape(), bore.Shape());
cut.Build();
if (!cut.IsDone()) {
  throw new Error("Gear bore cut failed.");
}

result = cut.Shape();

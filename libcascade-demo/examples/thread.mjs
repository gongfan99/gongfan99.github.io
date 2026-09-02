// OCCT 8's TKHelix toolkit builds the helical spine. Sweep a triangular
// profile along it to make a simple external thread around a shaft.
const shaftRadius = 23;
const threadRadius = 22.5;
const pitch = 8;
const turns = 5;
const height = pitch * turns;
const endClearance = 10;

using axis = new oc.gp_Ax3();
using pitches = new oc.NCollection_Array1_double(1, 1);
pitches.SetValue(1, pitch);
using turnCounts = new oc.NCollection_Array1_double(1, 1);
turnCounts.SetValue(1, turns);

using helixBuilder = new oc.HelixBRep_BuilderHelix();
helixBuilder.SetParameters(axis, threadRadius * 2, pitches, turnCounts);
helixBuilder.SetApproxParameters(
  1e-4,
  8,
  oc.GeomAbs_Shape.GeomAbs_C1,
);
helixBuilder.Perform();
if (helixBuilder.ErrorStatus() !== 0) {
  throw new Error(
    `Helix construction failed with status ${helixBuilder.ErrorStatus()}.`,
  );
}

using spine = oc.TopoDS.Wire(helixBuilder.Shape());

// At the start of the helix, the tangent is in the YZ plane. Build the
// triangular section in the plane normal to that tangent. The section's
// positive face normal is the helix tangent, so the sweep starts cleanly.
const risePerRadian = pitch / (2 * Math.PI);
const halfSectionWidth = 2.7;
const tangentLength = Math.hypot(threadRadius, risePerRadian);
const tangentY = threadRadius / tangentLength;
const tangentZ = risePerRadian / tangentLength;
const sectionY = tangentZ * halfSectionWidth;
const sectionZ = -tangentY * halfSectionWidth;

using first = new oc.gp_Pnt(threadRadius, sectionY, sectionZ);
using second = new oc.gp_Pnt(threadRadius, -sectionY, -sectionZ);
using tip = new oc.gp_Pnt(threadRadius + 4.5, 0, 0);
using profile = new oc.BRepBuilderAPI_MakePolygon();
profile.Add(first);
profile.Add(second);
profile.Add(tip);
profile.Close();

using profileFace = new oc.BRepBuilderAPI_MakeFace(profile.Wire(), false);
if (!profileFace.IsDone()) {
  throw new Error("Could not create the triangular thread profile.");
}

using thread = new oc.BRepOffsetAPI_MakePipe(
  spine,
  profileFace.Face(),
  oc.GeomFill_Trihedron.GeomFill_IsFrenet,
);
thread.Build();
if (!thread.IsDone()) {
  throw new Error("The helical thread sweep failed.");
}

using shaftOrigin = new oc.gp_Pnt(0, 0, -endClearance);
using shaftDirection = new oc.gp_Dir(0, 0, 1);
using shaftAxis = new oc.gp_Ax2(shaftOrigin, shaftDirection);
using shaft = new oc.BRepPrimAPI_MakeCylinder(
  shaftAxis,
  shaftRadius,
  height + 2 * endClearance,
);
result = [shaft.Shape(), thread.Shape()];

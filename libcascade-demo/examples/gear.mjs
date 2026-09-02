// Create a standard metric spur gear with smooth involute-style flanks.
// This follows the compact construction used by bd_warehouse's SpurGear:
// module-based pitch/base/root/addendum radii, mirrored involute flanks,
// and circular root and tip lands.
const module = 3;
const toothCount = 16;
const pressureAngle = (20 * Math.PI) / 180;
const thickness = 8;
const boreRadius = 7;
const flankSamples = 10;

const toothStep = (2 * Math.PI) / toothCount;
const pitchRadius = (module * toothCount) / 2;
const baseRadius = pitchRadius * Math.cos(pressureAngle);
const rootRadius = pitchRadius - 1.25 * module;
const tipRadius = pitchRadius + module;

// The involute starts at the base circle. This angular correction centers the
// tooth thickness correctly at the pitch circle.
const halfToothAngle = toothStep / 4;
const involuteCorrection = Math.tan(pressureAngle) - pressureAngle;
const halfPitchAngle = halfToothAngle + involuteCorrection;
const tipAlpha = Math.acos(baseRadius / tipRadius);
const tipInvoluteAngle = Math.tan(tipAlpha) - tipAlpha;

function pointAt(radius, angle) {
  return new oc.gp_Pnt(
    radius * Math.cos(angle),
    radius * Math.sin(angle),
    0,
  );
}

function involutePoint(radius, angle, direction = 1) {
  const alpha = Math.acos(baseRadius / radius);
  const involuteAngle = Math.tan(alpha) - alpha;
  const pointAngle = angle + direction * involuteAngle;
  return [
    radius * Math.cos(pointAngle),
    radius * Math.sin(pointAngle),
    0,
  ];
}

using wire = new oc.BRepBuilderAPI_MakeWire();

function addLine(start, end) {
  using edge = new oc.BRepBuilderAPI_MakeEdge(start, end);
  if (!edge.IsDone()) {
    throw new Error("Gear line construction failed.");
  }
  wire.Add(edge.Edge());
}

function addArc(start, middle, end) {
  using arc = new oc.GC_MakeArcOfCircle(start, middle, end);
  using curve = arc.Value();
  using edge = new oc.BRepBuilderAPI_MakeEdge(curve);
  if (!edge.IsDone()) {
    throw new Error("Gear arc construction failed.");
  }
  wire.Add(edge.Edge());
}

function addSpline(points) {
  using pointValues = new oc.NCollection_Array1_gp_Pnt(1, points.length);
  for (let index = 0; index < points.length; index += 1) {
    const [x, y, z] = points[index];
    using point = new oc.gp_Pnt(x, y, z);
    pointValues.SetValue(index + 1, point);
  }
  using pointArray = new oc.NCollection_HArray1_gp_Pnt(pointValues);

  using interpolator = new oc.GeomAPI_Interpolate(
    pointArray,
    false,
    1e-7,
  );
  interpolator.Perform();
  if (!interpolator.IsDone()) {
    throw new Error("Gear involute interpolation failed.");
  }

  using curve = interpolator.Curve();
  using edge = new oc.BRepBuilderAPI_MakeEdge(curve);
  if (!edge.IsDone()) {
    throw new Error("Gear involute edge construction failed.");
  }
  wire.Add(edge.Edge());
}

for (let tooth = 0; tooth < toothCount; tooth += 1) {
  const centerAngle = tooth * toothStep;
  const leftRootBoundaryAngle = centerAngle - toothStep / 2;
  const leftFlankAngle = centerAngle - halfPitchAngle;
  const rightFlankAngle = centerAngle + halfPitchAngle;
  const rightRootBoundaryAngle = centerAngle + toothStep / 2;

  using leftRootBoundary = pointAt(rootRadius, leftRootBoundaryAngle);
  using leftRoot = pointAt(rootRadius, leftFlankAngle);
  using leftBase = pointAt(baseRadius, leftFlankAngle);
  using leftTip = pointAt(
    tipRadius,
    leftFlankAngle + tipInvoluteAngle,
  );
  using top = pointAt(tipRadius, centerAngle);
  using rightTip = pointAt(
    tipRadius,
    rightFlankAngle - tipInvoluteAngle,
  );
  using rightBase = pointAt(baseRadius, rightFlankAngle);
  using rightRoot = pointAt(rootRadius, rightFlankAngle);
  using rightRootBoundary = pointAt(rootRadius, rightRootBoundaryAngle);
  using leftRootMiddle = pointAt(
    rootRadius,
    (leftRootBoundaryAngle + leftFlankAngle) / 2,
  );
  using rightRootMiddle = pointAt(
    rootRadius,
    (rightFlankAngle + rightRootBoundaryAngle) / 2,
  );

  // Circular root land, radial flank, and smooth left involute flank.
  addArc(leftRootBoundary, leftRootMiddle, leftRoot);
  addLine(leftRoot, leftBase);
  const leftPoints = [];
  for (let sample = 0; sample <= flankSamples; sample += 1) {
    const radius =
      baseRadius + ((tipRadius - baseRadius) * sample) / flankSamples;
    leftPoints.push(involutePoint(radius, leftFlankAngle));
  }
  addSpline(leftPoints);

  // Circular addendum land between the two mirrored flanks.
  addArc(leftTip, top, rightTip);

  // Smooth right involute flank, radial flank, and circular root land.
  const rightPoints = [];
  for (let sample = flankSamples; sample >= 0; sample -= 1) {
    const radius =
      baseRadius + ((tipRadius - baseRadius) * sample) / flankSamples;
    rightPoints.push(involutePoint(radius, rightFlankAngle, -1));
  }
  addSpline(rightPoints);
  addLine(rightBase, rightRoot);
  addArc(rightRoot, rightRootMiddle, rightRootBoundary);
}

if (!wire.IsDone()) {
  throw new Error("Gear profile wire construction failed.");
}

using face = new oc.BRepBuilderAPI_MakeFace(wire.Wire(), false);
if (!face.IsDone()) {
  throw new Error("Gear profile creation failed.");
}

using extrusion = new oc.gp_Vec(0, 0, thickness);
using prism = new oc.BRepPrimAPI_MakePrism(face.Face(), extrusion, false, true);

// Cut a through-bore after extrusion so the result remains one solid gear.
using boreOrigin = new oc.gp_Pnt(0, 0, -1);
using boreDirection = new oc.gp_Dir(0, 0, 1);
using boreAxis = new oc.gp_Ax2(boreOrigin, boreDirection);
using bore = new oc.BRepPrimAPI_MakeCylinder(boreAxis, boreRadius, thickness + 2);
using cut = new oc.BRepAlgoAPI_Cut(prism.Shape(), bore.Shape());
cut.Build();
if (!cut.IsDone()) {
  throw new Error("Gear bore cut failed.");
}

result = cut.Shape();

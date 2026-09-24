/**
 * One path: full RANGAM on the opening frame's bottom. On scroll the
 * camera slips left through the letters (Kage's sanmon beat), then the
 * original pond → doorway → inner yard. The word stays planted; only
 * scroll moves the camera. Opening look stays on the temple so the
 * moon sits behind the gopuram.
 *
 * Interpolation is a monotone cubic through the keyframes: smooth, but it never
 * overshoots a key, so the camera can't drift backwards between two close ones
 * (a Catmull-Rom here made the doorway ease back and forth near the threshold).
 */

function clamp01(t) {
  return Math.min(1, Math.max(0, t));
}

function smoothstep(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Fritsch–Butland tangent at an interior key: zero at a turning point, otherwise a
 * weighted harmonic mean of the two neighbouring slopes — which keeps each span monotone. */
function tangent(prev, cur, next) {
  const h0 = cur.t - prev.t;
  const h1 = next.t - cur.t;
  return (key) => {
    const d0 = (cur[key] - prev[key]) / h0;
    const d1 = (next[key] - cur[key]) / h1;
    if (d0 * d1 <= 0) return 0;
    return (3 * (h0 + h1)) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
  };
}

function hermite(v0, v1, m0, m1, h, s) {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * h * m1;
}

const KEYS = ["x", "y", "z", "lookX", "lookY", "lookZ", "fov"];

/** How far past the door (as a share of the door → yard distance) the epilogue ends:
 * just over the threshold, so the gopuram frame drops away. */
const INSIDE = 0.05;
/** Lens once inside: about 70% of the troupe in frame — the dancers large, the outer
 * ring of musicians and audience running off the edges. */
function fovInside(aspect) {
  return aspect >= 1 ? 38 : 46;
}

function path(door, yard, aspect) {
  const FOV_INSIDE = fovInside(aspect);
  // landscape frames tip down a touch so the front row of the audience is in view;
  // portrait frames don't need it and would run past the courtyard floor
  const TILT = aspect >= 1 ? 1 : 0;
  const d = door;
  const y = yard ?? { x: d.x, y: d.y, z: d.z - 20 };
  const x = d.x;
  return [
    { t: 0, x, y: 0.85, z: d.z + 44, lookX: x, lookY: 0.25, lookZ: d.z + 12, fov: 34 },
    { t: 0.16, x: x - 2.8, y: 0.85, z: d.z + 38, lookX: x, lookY: 0.24, lookZ: d.z + 8, fov: 34 },
    { t: 0.3, x, y: 0.85, z: d.z + 32, lookX: x, lookY: 0.22, lookZ: d.z + 4, fov: 34 },
    { t: 0.42, x, y: lerp(0.85, d.y + 0.28, 0.45), z: d.z + 26, lookX: x, lookY: lerp(0.25, d.y + 0.06, 0.45), lookZ: d.z + 2, fov: 34 },
    { t: 0.62, x, y: d.y + 0.2, z: d.z + 18, lookX: x, lookY: d.y + 0.08, lookZ: d.z, fov: 33.5 },
    { t: 0.78, x, y: d.y + 0.08, z: d.z + 10, lookX: x, lookY: d.y + 0.02, lookZ: d.z - 3, fov: 33.5 },
    { t: 0.9, x, y: d.y + 0.03, z: d.z + 3.6, lookX: x, lookY: lerp(d.y, y.y, 0.25), lookZ: y.z, fov: 34 },
    { t: 1, x, y: lerp(d.y, y.y, 0.45), z: d.z + 3.4, lookX: x, lookY: y.y, lookZ: y.z, fov: 36 },
    // epilogue: step through the doorway (the gopuram plate drops away as it's passed)
    // and settle on the performance
    { t: 1.2, x, y: lerp(d.y, y.y, 0.55), z: lerp(d.z, y.z, INSIDE * 0.6), lookX: x, lookY: y.y, lookZ: y.z, fov: lerp(36, FOV_INSIDE, 0.5) },
    { t: 1.4, x, y: lerp(d.y, y.y, 0.6) - 0.2 * TILT, z: lerp(d.z, y.z, INSIDE), lookX: x, lookY: y.y - 0.55 * TILT, lookZ: y.z, fov: FOV_INSIDE },
  ];
}

export function walkValue(walk, progress, key, fallback) {
  if (!walk?.[key]) return fallback;
  const start = walk.in ?? 0;
  const end = walk.out ?? 1;
  const span = end - start;
  const t = span <= 0 ? (progress >= start ? 1 : 0) : clamp01((progress - start) / span);
  const e = walk.linear ? t : smoothstep(t);
  return lerp(walk[key][0], walk[key][1], e);
}

export function getCameraState(progress, targets = {}, aspect = 1.6) {
  const door = targets.door ?? { x: 0, y: -8, z: -34 };
  const frames = path(door, targets.yard, aspect);
  const p = Math.min(frames[frames.length - 1].t, Math.max(0, progress));

  let i = 0;
  while (i < frames.length - 2 && p > frames[i + 1].t) i += 1;

  const a = frames[i];
  const b = frames[i + 1];
  const h = b.t - a.t || 1;
  const local = clamp01((p - a.t) / h);
  const last = frames.length - 1;
  // end keys hold still (zero slope) so the walk eases in and out
  const ma = i > 0 ? tangent(frames[i - 1], a, b) : () => 0;
  const mb = i + 1 < last ? tangent(a, b, frames[i + 2]) : () => 0;

  const shot = {};
  for (const key of KEYS) {
    shot[key] = hermite(a[key], b[key], ma(key), mb(key), h, local);
  }
  return shot;
}

export function depthToZ(depth) {
  const t = clamp01(depth / 1000);
  return -3.1 + t * (-76 - -3.1);
}

export function phaseOpacity(appear, progress) {
  if (!appear) return 1;
  const fade = 0.1;
  const start = appear.in ?? 0;
  const end = appear.out ?? 1;
  if (progress < start) return Math.max(0, 1 - (start - progress) / fade);
  if (progress > end) return Math.max(0, 1 - (progress - end) / fade);
  if (start > 0 && progress < start + fade) return (progress - start) / fade;
  return 1;
}

export const ARENA_RADIUS = 56;

export interface RampDef {
  cx: number;
  cz: number;
  yaw: number;
  halfW: number;
  halfL: number;
  height: number;
}

export interface PillarObstacle {
  x: number;
  z: number;
  radius: number;
  height: number;
}

export const ARENA_RAMPS: RampDef[] = [
  // Two opposing central jump ramps facing each other for mid-air collisions!
  { cx: -15, cz: 0, yaw: Math.PI / 2, halfW: 3.4, halfL: 5.5, height: 2.35 },
  { cx: 15, cz: 0, yaw: -Math.PI / 2, halfW: 3.4, halfL: 5.5, height: 2.35 },
  // Two north/south launch ramps
  { cx: 0, cz: -28, yaw: 0, halfW: 3.8, halfL: 5.8, height: 2.5 },
  { cx: 0, cz: 28, yaw: Math.PI, halfW: 3.8, halfL: 5.8, height: 2.5 },
];

export const ARENA_PILLARS: PillarObstacle[] = [
  { x: -24, z: -24, radius: 1.85, height: 4.5 },
  { x: 24, z: -24, radius: 1.85, height: 4.5 },
  { x: -24, z: 24, radius: 1.85, height: 4.5 },
  { x: 24, z: 24, radius: 1.85, height: 4.5 },
];

export const NITRO_PAD_COORDS = [
  { x: -30, z: 0 },
  { x: 30, z: 0 },
  { x: 0, z: -13 },
  { x: 0, z: 13 },
] as const;

export function groundHeightAt(x: number, z: number): number {
  let h = 0;

  // Gentle bowl banking near perimeter wall
  const dist = Math.hypot(x, z);
  if (dist > 40) {
    const t = Math.min(1, (dist - 40) / (ARENA_RADIUS - 40));
    h += t * t * 1.35;
  }

  // Subtle natural dirt undulations
  h += Math.sin(x * 0.08) * Math.cos(z * 0.08) * 0.14;

  // Evaluate launch ramps (local +Z is high launch lip, -Z is entry)
  for (let i = 0; i < ARENA_RAMPS.length; i++) {
    const r = ARENA_RAMPS[i];
    const dx = x - r.cx;
    const dz = z - r.cz;
    const cos = Math.cos(-r.yaw);
    const sin = Math.sin(-r.yaw);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;

    if (Math.abs(lx) <= r.halfW + 0.9 && Math.abs(lz) <= r.halfL + 0.9) {
      // Smooth side taper
      const edgeX =
        Math.abs(lx) <= r.halfW
          ? 1
          : Math.max(0, 1 - (Math.abs(lx) - r.halfW) / 0.9);
      // Ramp rises from lz = -halfL (0) to lz = +halfL (height), sharp drop after +halfL
      let profile = 0;
      if (lz >= -r.halfL && lz <= r.halfL) {
        const u = (lz + r.halfL) / (2 * r.halfL);
        profile = u * u * (3 - 2 * u) * 0.25 + u * 0.75;
      } else if (lz > r.halfL && lz <= r.halfL + 0.9) {
        profile = Math.max(0, 1 - (lz - r.halfL) / 0.9);
      }
      const rampH = r.height * profile * edgeX;
      if (rampH > h) h = rampH;
    }
  }

  return h;
}

import {
  ARENA_PILLARS,
  ARENA_RADIUS,
  groundHeightAt,
  NITRO_PAD_COORDS,
} from './arenaMath';
import {
  NetCarState,
  NetImpactEvent,
  NetInputPayload,
} from './multiplayerTypes';
import {
  CAR_COLORS,
  CarColorId,
  CarDamageZones,
  DebrisPartType,
  MatchSummary,
} from './types';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function damp(x: number, y: number, lambda: number, dt: number): number {
  return x + (y - x) * (1 - Math.exp(-lambda * dt));
}

export interface ServerCar {
  id: string;
  slotIndex: number;
  name: string;
  numberLabel: string;
  colorId: CarColorId;
  colorHex: string;
  isHuman: boolean;
  ownerPlayerId: string | null;

  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  angVel: number;
  pitch: number;
  roll: number;
  grounded: boolean;
  airTime: number;

  hp: number;
  nitro: number;
  isBoosting: boolean;
  isDrifting: boolean;
  braking: boolean;
  visualSteer: number;
  wrecked: boolean;
  wreckTime: number;
  kills: number;
  damageDealt: number;
  lastHitBy: string | null;
  lastHitTimer: number;
  damageCooldown: number;
  zones: CarDamageZones;
  attachedParts: Set<DebrisPartType>;

  aiTargetId: string | null;
  aiRetargetTimer: number;
  aiReverseTimer: number;
  aiStuckTimer: number;
  aiNitroBurstTimer: number;
}

export interface ServerNitroPad {
  x: number;
  z: number;
  radius: number;
  cooldown: number;
}

export interface ServerStepFeedback {
  impacts: NetImpactEvent[];
  nitroPickups: string[];
  peakImpactKmh: number;
  partsDetachedCount: number;
  calloutText?: string;
  calloutSubtext?: string;
  calloutTone?: 'impact' | 'wreck' | 'nitro' | 'air';
}

const CAR_HALF_W = 1.06;
const CAR_HALF_L = 2.24;
const CAR_MASS = 1.0;

const ALL_PARTS: DebrisPartType[] = [
  'hood',
  'trunk',
  'bumperF',
  'bumperR',
  'doorL',
  'doorR',
  'spoiler',
];

export function createInitialServerNitroPads(): ServerNitroPad[] {
  return NITRO_PAD_COORDS.map((c) => ({
    x: c.x,
    z: c.z,
    radius: 2.5,
    cooldown: 0,
  }));
}

export function createServerCar(params: {
  id: string;
  slotIndex: number;
  name: string;
  numberLabel: string;
  colorId: CarColorId;
  isHuman: boolean;
  ownerPlayerId: string | null;
  totalCars: number;
}): ServerCar {
  const angle = (params.slotIndex / Math.max(1, params.totalCars)) * Math.PI * 2;
  const spawnRad = ARENA_RADIUS - 12;
  const sx = Math.cos(angle) * spawnRad;
  const sz = Math.sin(angle) * spawnRad;
  const yaw = Math.atan2(-sx, -sz);
  const y = groundHeightAt(sx, sz);
  const colorOpt =
    CAR_COLORS.find((c) => c.id === params.colorId) ?? CAR_COLORS[0];

  return {
    id: params.id,
    slotIndex: params.slotIndex,
    name: params.name,
    numberLabel: params.numberLabel,
    colorId: colorOpt.id,
    colorHex: colorOpt.primaryHex,
    isHuman: params.isHuman,
    ownerPlayerId: params.ownerPlayerId,
    x: sx,
    y,
    z: sz,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw,
    angVel: 0,
    pitch: 0,
    roll: 0,
    grounded: true,
    airTime: 0,
    hp: 100,
    nitro: 100,
    isBoosting: false,
    isDrifting: false,
    braking: false,
    visualSteer: 0,
    wrecked: false,
    wreckTime: 0,
    kills: 0,
    damageDealt: 0,
    lastHitBy: null,
    lastHitTimer: 0,
    damageCooldown: 0,
    zones: { front: 0, rear: 0, left: 0, right: 0 },
    attachedParts: new Set(ALL_PARTS),
    aiTargetId: null,
    aiRetargetTimer: 0,
    aiReverseTimer: 0,
    aiStuckTimer: 0,
    aiNitroBurstTimer: 0,
  };
}

export function serializeServerCar(car: ServerCar): NetCarState {
  return {
    id: car.id,
    slotIndex: car.slotIndex,
    name: car.name,
    numberLabel: car.numberLabel,
    colorId: car.colorId,
    isHuman: car.isHuman,
    ownerPlayerId: car.ownerPlayerId,
    x: Number(car.x.toFixed(3)),
    y: Number(car.y.toFixed(3)),
    z: Number(car.z.toFixed(3)),
    vx: Number(car.vx.toFixed(2)),
    vy: Number(car.vy.toFixed(2)),
    vz: Number(car.vz.toFixed(2)),
    yaw: Number(car.yaw.toFixed(4)),
    angVel: Number(car.angVel.toFixed(3)),
    pitch: Number(car.pitch.toFixed(3)),
    roll: Number(car.roll.toFixed(3)),
    grounded: car.grounded,
    hp: Number(car.hp.toFixed(1)),
    nitro: Math.round(car.nitro),
    isBoosting: car.isBoosting,
    isDrifting: car.isDrifting,
    braking: car.braking,
    visualSteer: Number(car.visualSteer.toFixed(3)),
    wrecked: car.wrecked,
    kills: car.kills,
    damageDealt: car.damageDealt,
    zones: {
      front: Number(car.zones.front.toFixed(2)),
      rear: Number(car.zones.rear.toFixed(2)),
      left: Number(car.zones.left.toFixed(2)),
      right: Number(car.zones.right.toFixed(2)),
    },
    attachedParts: Array.from(car.attachedParts),
  };
}

export function computeBotInput(
  car: ServerCar,
  allCars: ServerCar[],
  dt: number,
): NetInputPayload {
  if (car.wrecked) {
    return { throttle: 0, steer: 0, handbrake: false, nitro: false };
  }

  const speed = Math.hypot(car.vx, car.vz);
  const fwdX = Math.sin(car.yaw);
  const fwdZ = Math.cos(car.yaw);
  const forwardSpeed = car.vx * fwdX + car.vz * fwdZ;

  if (speed < 2.1 && car.aiReverseTimer <= 0) {
    car.aiStuckTimer += dt;
    if (car.aiStuckTimer > 0.85) {
      car.aiReverseTimer = 0.95;
      car.aiStuckTimer = 0;
    }
  } else {
    car.aiStuckTimer = Math.max(0, car.aiStuckTimer - dt * 2);
  }

  if (car.aiReverseTimer > 0) {
    car.aiReverseTimer -= dt;
    return {
      throttle: -1,
      steer: car.id.charCodeAt(0) % 2 === 0 ? 1 : -1,
      handbrake: false,
      nitro: false,
    };
  }

  car.aiRetargetTimer -= dt;
  let target: ServerCar | null = null;
  if (car.aiTargetId) {
    target =
      allCars.find((c) => c.id === car.aiTargetId && !c.wrecked) ?? null;
  }

  if (!target || car.aiRetargetTimer <= 0) {
    car.aiRetargetTimer = 1.6 + Math.random() * 1.4;
    let bestScore = Infinity;
    for (const other of allCars) {
      if (other.id === car.id || other.wrecked) continue;
      const dist = Math.hypot(other.x - car.x, other.z - car.z);
      const bias = other.isHuman ? 0.88 : 1.0;
      const score = dist * bias;
      if (score < bestScore) {
        bestScore = score;
        target = other;
      }
    }
    car.aiTargetId = target ? target.id : null;
  }

  let goalX = 0;
  let goalZ = 0;
  let distToGoal = 20;

  if (target) {
    const leadT = Math.min(
      0.75,
      Math.hypot(target.x - car.x, target.z - car.z) / 36,
    );
    goalX = target.x + target.vx * leadT;
    goalZ = target.z + target.vz * leadT;
    distToGoal = Math.hypot(goalX - car.x, goalZ - car.z);
  }

  const distFromCenter = Math.hypot(car.x, car.z);
  if (distFromCenter > ARENA_RADIUS - 8.5) {
    goalX = -car.x * 0.4;
    goalZ = -car.z * 0.4;
  } else {
    for (const p of ARENA_PILLARS) {
      const pdx = car.x - p.x;
      const pdz = car.z - p.z;
      const pDist = Math.hypot(pdx, pdz);
      if (pDist < 7.5 && pDist > 0.01) {
        goalX += (pdx / pDist) * 14;
        goalZ += (pdz / pDist) * 14;
      }
    }
  }

  const toGoalX = goalX - car.x;
  const toGoalZ = goalZ - car.z;
  const desiredYaw = Math.atan2(toGoalX, toGoalZ);
  let angleDiff = desiredYaw - car.yaw;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  const steer = clamp(angleDiff * 2.1, -1, 1);
  const sharpTurn = Math.abs(angleDiff) > 1.05 && forwardSpeed > 11;

  if (car.aiNitroBurstTimer > 0) {
    car.aiNitroBurstTimer -= dt;
  } else if (
    target &&
    Math.abs(angleDiff) < 0.28 &&
    distToGoal < 26 &&
    distToGoal > 7 &&
    car.nitro > 32
  ) {
    car.aiNitroBurstTimer = 0.9;
  }

  return {
    throttle: Math.abs(angleDiff) > 2.35 && forwardSpeed < 6 ? -0.6 : 1,
    steer,
    handbrake: sharpTurn,
    nitro: car.aiNitroBurstTimer > 0 && car.nitro > 8,
  };
}

interface ObbOverlap {
  normalX: number;
  normalZ: number;
  depth: number;
  contactX: number;
  contactZ: number;
}

function testObbOverlap(a: ServerCar, b: ServerCar): ObbOverlap | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (dx * dx + dz * dz > 26) return null;

  const axX = Math.cos(a.yaw);
  const axZ = -Math.sin(a.yaw);
  const azX = Math.sin(a.yaw);
  const azZ = Math.cos(a.yaw);

  const bxX = Math.cos(b.yaw);
  const bxZ = -Math.sin(b.yaw);
  const bzX = Math.sin(b.yaw);
  const bzZ = Math.cos(b.yaw);

  let minOverlap = Infinity;
  let bestAxisX = 0;
  let bestAxisZ = 0;

  const axes = [
    [axX, axZ],
    [azX, azZ],
    [bxX, bxZ],
    [bzX, bzZ],
  ];

  for (let i = 0; i < 4; i++) {
    const ux = axes[i][0];
    const uz = axes[i][1];

    const projA =
      Math.abs(axX * ux + axZ * uz) * CAR_HALF_W +
      Math.abs(azX * ux + azZ * uz) * CAR_HALF_L;
    const projB =
      Math.abs(bxX * ux + bxZ * uz) * CAR_HALF_W +
      Math.abs(bzX * ux + bzZ * uz) * CAR_HALF_L;
    const dist = Math.abs(dx * ux + dz * uz);

    const overlap = projA + projB - dist;
    if (overlap <= 0) return null;

    if (overlap < minOverlap) {
      minOverlap = overlap;
      const sign = dx * ux + dz * uz >= 0 ? 1 : -1;
      bestAxisX = ux * sign;
      bestAxisZ = uz * sign;
    }
  }

  return {
    normalX: bestAxisX,
    normalZ: bestAxisZ,
    depth: minOverlap,
    contactX: (a.x + b.x) * 0.5,
    contactZ: (a.z + b.z) * 0.5,
  };
}

function collectDetachedParts(car: ServerCar): DebrisPartType[] {
  const detached: DebrisPartType[] = [];
  const candidates: { type: DebrisPartType; trigger: boolean }[] = [
    { type: 'bumperF', trigger: car.zones.front >= 0.2 || car.hp <= 84 },
    { type: 'bumperR', trigger: car.zones.rear >= 0.2 || car.hp <= 76 },
    { type: 'spoiler', trigger: car.zones.rear >= 0.16 || car.hp <= 68 },
    { type: 'doorL', trigger: car.zones.left >= 0.26 || car.hp <= 56 },
    { type: 'doorR', trigger: car.zones.right >= 0.26 || car.hp <= 46 },
    { type: 'hood', trigger: car.zones.front >= 0.42 || car.hp <= 34 },
    { type: 'trunk', trigger: car.zones.rear >= 0.46 || car.hp <= 22 },
  ];

  for (const c of candidates) {
    if (detached.length >= 2) break;
    if (c.trigger && car.attachedParts.has(c.type)) {
      car.attachedParts.delete(c.type);
      detached.push(c.type);
    }
  }
  return detached;
}

function applyDamageToServerCar(
  victim: ServerCar,
  attacker: ServerCar | null,
  damage: number,
  worldHitX: number,
  worldHitZ: number,
  inwardNormX: number,
  inwardNormZ: number,
  closingKmh: number,
  strength: number,
  sparkCount: number,
): NetImpactEvent | null {
  if (victim.wrecked || damage <= 0.5 || victim.damageCooldown > 0) {
    return null;
  }

  const appliedDmg = Math.min(42, damage);
  const prevHp = victim.hp;
  victim.hp = Math.max(0, victim.hp - appliedDmg);
  victim.damageCooldown = 0.22;

  if (attacker) {
    attacker.damageDealt += Math.round(appliedDmg);
    victim.lastHitBy = attacker.id;
    victim.lastHitTimer = 5.0;
  }

  const fwdX = Math.sin(victim.yaw);
  const fwdZ = Math.cos(victim.yaw);
  const localXVecX = Math.cos(victim.yaw);
  const localXVecZ = -Math.sin(victim.yaw);

  const relX = worldHitX - victim.x;
  const relZ = worldHitZ - victim.z;
  const localZ = relX * fwdX + relZ * fwdZ;
  const localX = relX * localXVecX + relZ * localXVecZ;

  const zoneAmt = clamp(appliedDmg / 32, 0.14, 0.45);
  if (Math.abs(localZ) >= Math.abs(localX) * 1.15) {
    if (localZ >= 0) {
      victim.zones.front = Math.min(1, victim.zones.front + zoneAmt);
    } else {
      victim.zones.rear = Math.min(1, victim.zones.rear + zoneAmt);
    }
  } else {
    if (localX >= 0) {
      victim.zones.left = Math.min(1, victim.zones.left + zoneAmt);
    } else {
      victim.zones.right = Math.min(1, victim.zones.right + zoneAmt);
    }
  }

  const detachedParts = collectDetachedParts(victim);

  let wreckedNow = false;
  if (victim.hp <= 0 && prevHp > 0) {
    victim.wrecked = true;
    victim.wreckTime = 0;
    wreckedNow = true;

    const killerId = attacker ? attacker.id : victim.lastHitBy;
    if (killerId && killerId !== victim.id && attacker && attacker.id === killerId) {
      attacker.kills += 1;
    }

    const remaining = Array.from(victim.attachedParts);
    for (const part of remaining) {
      victim.attachedParts.delete(part);
      detachedParts.push(part);
    }
  }

  return {
    hitX: Number(worldHitX.toFixed(2)),
    hitY: Number((victim.y + 0.72).toFixed(2)),
    hitZ: Number(worldHitZ.toFixed(2)),
    normX: Number(inwardNormX.toFixed(3)),
    normZ: Number(inwardNormZ.toFixed(3)),
    strength: Number(strength.toFixed(2)),
    closingKmh,
    victimId: victim.id,
    attackerId: attacker ? attacker.id : null,
    damage: Math.round(appliedDmg),
    detachedParts,
    wreckedNow,
    sparkCount,
  };
}

export function stepServerDerbySimulation(
  cars: ServerCar[],
  inputsByCarId: Map<string, NetInputPayload>,
  nitroPads: ServerNitroPad[],
  dt: number,
  allowDriving: boolean,
): ServerStepFeedback {
  const feedback: ServerStepFeedback = {
    impacts: [],
    nitroPickups: [],
    peakImpactKmh: 0,
    partsDetachedCount: 0,
  };

  for (const pad of nitroPads) {
    if (pad.cooldown > 0) {
      pad.cooldown = Math.max(0, pad.cooldown - dt);
    }
  }

  // 1. Vehicle dynamics & ramps
  for (const car of cars) {
    if (car.damageCooldown > 0) {
      car.damageCooldown = Math.max(0, car.damageCooldown - dt);
    }
    if (car.lastHitTimer > 0) {
      car.lastHitTimer = Math.max(0, car.lastHitTimer - dt);
      if (car.lastHitTimer <= 0) car.lastHitBy = null;
    }
    if (car.wrecked) {
      car.wreckTime += dt;
    }

    const input: NetInputPayload =
      allowDriving && !car.wrecked
        ? inputsByCarId.get(car.id) ?? {
            throttle: 0,
            steer: 0,
            handbrake: false,
            nitro: false,
          }
        : { throttle: 0, steer: 0, handbrake: false, nitro: false };

    const fwdX = Math.sin(car.yaw);
    const fwdZ = Math.cos(car.yaw);
    const sideX = Math.cos(car.yaw);
    const sideZ = -Math.sin(car.yaw);

    let vForward = car.vx * fwdX + car.vz * fwdZ;
    let vSide = car.vx * sideX + car.vz * sideZ;

    car.isBoosting = !car.wrecked && input.nitro && car.nitro > 1.5;
    if (car.isBoosting) {
      car.nitro = Math.max(0, car.nitro - 29 * dt);
    } else if (!car.wrecked) {
      car.nitro = Math.min(100, car.nitro + 6.5 * dt);
    }

    const damageSpeedMult = car.wrecked ? 0 : 0.72 + 0.28 * (car.hp / 100);
    const accelForce = (car.isBoosting ? 49 : 30) * damageSpeedMult;
    const reverseForce = 20 * damageSpeedMult;

    if (car.grounded && !car.wrecked) {
      if (input.throttle > 0) {
        vForward += input.throttle * accelForce * dt;
      } else if (input.throttle < 0) {
        if (vForward > 2.5) {
          vForward -= 42 * dt;
        } else {
          vForward += input.throttle * reverseForce * dt;
        }
      } else {
        vForward *= Math.exp(-1.55 * dt);
      }

      const maxSpeed = car.isBoosting ? 45 : 32.5;
      vForward = clamp(vForward, -16, maxSpeed);

      const lateralGrip = input.handbrake ? 2.1 : 6.4;
      vSide *= Math.exp(-lateralGrip * dt);

      car.isDrifting =
        Math.abs(vSide) > 4.2 || (input.handbrake && Math.abs(vForward) > 8);

      const speedAbs = Math.abs(vForward);
      const steerFactor = clamp(speedAbs / 5.5, 0.22, 1.0);
      const reverseSign = vForward >= -0.5 ? 1 : -1;
      const turnRate = input.handbrake ? 3.25 : 2.55;
      const targetAngVel = input.steer * turnRate * steerFactor * reverseSign;
      car.angVel = damp(car.angVel, targetAngVel, 10, dt);
    } else if (car.wrecked) {
      vForward *= Math.exp(-3.4 * dt);
      vSide *= Math.exp(-5.0 * dt);
      car.angVel *= Math.exp(-4.0 * dt);
      car.isDrifting = false;
    } else {
      car.angVel *= Math.exp(-0.9 * dt);
      car.isDrifting = false;
    }

    car.braking = !car.wrecked && (input.throttle < 0 || input.handbrake);
    car.visualSteer = damp(car.visualSteer, input.steer * 0.44, 14, dt);

    car.vx = fwdX * vForward + sideX * vSide;
    car.vz = fwdZ * vForward + sideZ * vSide;

    const prevGroundY = groundHeightAt(car.x, car.z);
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    car.yaw += car.angVel * dt;

    const newGroundY = groundHeightAt(car.x, car.z);
    if (car.grounded) {
      const slopeVy = (newGroundY - prevGroundY) / Math.max(0.001, dt);
      if (car.y - newGroundY > 0.34 && slopeVy < -2.5) {
        car.grounded = false;
        car.vy = Math.max(2.5, (newGroundY - prevGroundY) * 0.45);
      } else {
        const wasOnRamp = prevGroundY > 0.85 && newGroundY < prevGroundY - 0.12;
        if (wasOnRamp && Math.hypot(car.vx, car.vz) > 10) {
          car.grounded = false;
          const launchSpeed = Math.hypot(car.vx, car.vz);
          car.vy = clamp(launchSpeed * 0.36, 4.5, 11.5);
          car.y = prevGroundY + 0.08;
        } else {
          car.y = newGroundY;
          car.vy = slopeVy;
          car.airTime = 0;
        }
      }
    } else {
      car.airTime += dt;
      car.vy -= 23.5 * dt;
      car.y += car.vy * dt;

      if (car.y <= newGroundY) {
        car.y = newGroundY;
        car.vy = 0;
        car.grounded = true;
        car.airTime = 0;
      }
    }

    // Nitro pads
    if (!car.wrecked && car.grounded) {
      for (const pad of nitroPads) {
        if (pad.cooldown <= 0) {
          const pd = Math.hypot(car.x - pad.x, car.z - pad.z);
          if (pd < pad.radius + 1.1) {
            pad.cooldown = 7.0;
            car.nitro = Math.min(100, car.nitro + 50);
            if (car.isHuman) {
              feedback.nitroPickups.push(car.id);
            }
          }
        }
      }
    }

    // Terrain pitch & roll
    const fProbeH = groundHeightAt(car.x + fwdX * 1.5, car.z + fwdZ * 1.5);
    const rProbeH = groundHeightAt(car.x - fwdX * 1.5, car.z - fwdZ * 1.5);
    const lProbeH = groundHeightAt(car.x + sideX * 1.0, car.z + sideZ * 1.0);
    const rightProbeH = groundHeightAt(car.x - sideX * 1.0, car.z - sideZ * 1.0);

    let targetPitch = 0;
    let targetRoll = 0;
    if (car.grounded) {
      const slopePitch = -Math.atan2(fProbeH - rProbeH, 3.0);
      const slopeRoll = Math.atan2(lProbeH - rightProbeH, 2.0);
      const accelSquat = -input.throttle * (car.isBoosting ? 0.08 : 0.042);
      const turnLean =
        input.steer * clamp(vForward / 28, -1, 1) * 0.095;
      targetPitch = slopePitch + accelSquat;
      targetRoll = slopeRoll + turnLean;
    } else {
      targetPitch = clamp(-car.vy * 0.032, -0.42, 0.38);
      targetRoll = damp(car.roll, 0, 3, dt);
    }

    car.pitch = damp(car.pitch, targetPitch, 11, dt);
    car.roll = damp(car.roll, targetRoll, 11, dt);
  }

  // 2. Perimeter wall & pillars
  const wallLimit = ARENA_RADIUS - 1.9;
  for (const car of cars) {
    const dist = Math.hypot(car.x, car.z);
    if (dist > wallLimit) {
      const nx = car.x / dist;
      const nz = car.z / dist;
      car.x = nx * wallLimit;
      car.z = nz * wallLimit;

      const vn = car.vx * nx + car.vz * nz;
      if (vn > 0) {
        const impactSpeed = vn;
        car.vx -= 1.48 * vn * nx;
        car.vz -= 1.48 * vn * nz;
        car.angVel += (Math.random() - 0.5) * impactSpeed * 0.18;

        if (impactSpeed > 17 && !car.wrecked) {
          const wallDmg = Math.min(10, (impactSpeed - 17) * 0.5);
          const normStrength = clamp(impactSpeed / 28, 0.15, 0.85);
          const ev = applyDamageToServerCar(
            car,
            null,
            wallDmg,
            car.x + nx * 1.2,
            car.z + nz * 1.2,
            -nx,
            -nz,
            Math.round(impactSpeed * 3.8),
            normStrength,
            Math.min(14, Math.floor(impactSpeed * 0.7)),
          );
          if (ev) {
            feedback.impacts.push(ev);
            feedback.partsDetachedCount += ev.detachedParts.length;
            if (ev.wreckedNow && car.lastHitBy) {
              const killer = cars.find((c) => c.id === car.lastHitBy);
              if (killer) killer.kills += 1;
            }
          }
        }
      }
    }

    for (const pil of ARENA_PILLARS) {
      const dx = car.x - pil.x;
      const dz = car.z - pil.z;
      const minDist = pil.radius + 1.55;
      const d = Math.hypot(dx, dz);
      if (d < minDist && d > 0.001) {
        const nx = dx / d;
        const nz = dz / d;
        car.x = pil.x + nx * minDist;
        car.z = pil.z + nz * minDist;

        const vn = car.vx * nx + car.vz * nz;
        if (vn < 0) {
          const impactSpeed = -vn;
          car.vx -= 1.55 * vn * nx;
          car.vz -= 1.55 * vn * nz;
          car.angVel += (Math.random() - 0.5) * impactSpeed * 0.25;

          if (impactSpeed > 14 && !car.wrecked) {
            const pDmg = Math.min(12, (impactSpeed - 14) * 0.6);
            const s = clamp(impactSpeed / 26, 0.2, 0.9);
            const ev = applyDamageToServerCar(
              car,
              null,
              pDmg,
              car.x - nx * 1.1,
              car.z - nz * 1.1,
              nx,
              nz,
              Math.round(impactSpeed * 3.8),
              s,
              12,
            );
            if (ev) {
              feedback.impacts.push(ev);
              feedback.partsDetachedCount += ev.detachedParts.length;
              if (ev.wreckedNow && car.lastHitBy) {
                const killer = cars.find((c) => c.id === car.lastHitBy);
                if (killer) killer.kills += 1;
              }
            }
          }
        }
      }
    }
  }

  // 3. Car-vs-Car OBB Collisions
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (Math.abs(a.y - b.y) > 1.85) continue;

      const hit = testObbOverlap(a, b);
      if (!hit) continue;

      const aWeight = b.wrecked ? 0.75 : a.wrecked ? 0.25 : 0.5;
      const bWeight = 1 - aWeight;
      a.x -= hit.normalX * hit.depth * aWeight;
      a.z -= hit.normalZ * hit.depth * aWeight;
      b.x += hit.normalX * hit.depth * bWeight;
      b.z += hit.normalZ * hit.depth * bWeight;

      const aVxBefore = a.vx;
      const aVzBefore = a.vz;
      const bVxBefore = b.vx;
      const bVzBefore = b.vz;

      const rvx = bVxBefore - aVxBefore;
      const rvz = bVzBefore - aVzBefore;
      const relNormalVel = rvx * hit.normalX + rvz * hit.normalZ;

      if (relNormalVel < 0) {
        const closingSpeed = -relNormalVel;
        const restitution = 0.44;
        const massA = a.wrecked ? CAR_MASS * 1.7 : CAR_MASS;
        const massB = b.wrecked ? CAR_MASS * 1.7 : CAR_MASS;
        const jImpulse =
          (-(1 + restitution) * relNormalVel) / (1 / massA + 1 / massB);

        a.vx -= (jImpulse / massA) * hit.normalX;
        a.vz -= (jImpulse / massA) * hit.normalZ;
        b.vx += (jImpulse / massB) * hit.normalX;
        b.vz += (jImpulse / massB) * hit.normalZ;

        const aFwdX = Math.sin(a.yaw);
        const aFwdZ = Math.cos(a.yaw);
        const bFwdX = Math.sin(b.yaw);
        const bFwdZ = Math.cos(b.yaw);

        const aFrontAlign = aFwdX * hit.normalX + aFwdZ * hit.normalZ;
        const bFrontAlign = -(bFwdX * hit.normalX + bFwdZ * hit.normalZ);

        a.angVel +=
          (hit.normalX * aFwdZ - hit.normalZ * aFwdX) * closingSpeed * 0.08;
        b.angVel -=
          (hit.normalX * bFwdZ - hit.normalZ * bFwdX) * closingSpeed * 0.08;

        if (closingSpeed > 4.2) {
          const closingKmh = Math.round(closingSpeed * 3.8);
          feedback.peakImpactKmh = Math.max(feedback.peakImpactKmh, closingKmh);

          const aApproach = aVxBefore * hit.normalX + aVzBefore * hit.normalZ;
          const bApproach = -(
            bVxBefore * hit.normalX +
            bVzBefore * hit.normalZ
          );

          const aIsRamming = aFrontAlign > 0.35 && aApproach > 1.5;
          const bIsRamming = bFrontAlign > 0.35 && bApproach > 1.5;

          const baseDmg = clamp((closingSpeed - 3.5) * 0.52, 2.5, 22);
          let dmgToA = 0;
          let dmgToB = 0;

          if (!a.wrecked && !b.wrecked) {
            if (aIsRamming && !bIsRamming) {
              const tBoneMult = bFrontAlign < 0.25 ? 1.24 : 1.0;
              const nitroMult = a.isBoosting ? 1.6 : 1.0;
              dmgToB = baseDmg * tBoneMult * nitroMult;
            } else if (bIsRamming && !aIsRamming) {
              const tBoneMult = aFrontAlign < 0.25 ? 1.24 : 1.0;
              const nitroMult = b.isBoosting ? 1.6 : 1.0;
              dmgToA = baseDmg * tBoneMult * nitroMult;
            } else if (aIsRamming && bIsRamming) {
              const aPower =
                aApproach *
                Math.max(0.45, aFrontAlign) *
                (a.isBoosting ? 1.6 : 1.0);
              const bPower =
                bApproach *
                Math.max(0.45, bFrontAlign) *
                (b.isBoosting ? 1.6 : 1.0);

              if (aPower > bPower * 1.12) {
                dmgToB = baseDmg * (a.isBoosting ? 1.5 : 1.0);
              } else if (bPower > aPower * 1.12) {
                dmgToA = baseDmg * (b.isBoosting ? 1.5 : 1.0);
              } else {
                // Even head-on clash in multiplayer: both take reduced impact
                dmgToA = baseDmg * 0.55;
                dmgToB = baseDmg * 0.55;
              }
            } else {
              if (aApproach > bApproach + 2.0) {
                dmgToB = baseDmg * 0.55;
              } else if (bApproach > aApproach + 2.0) {
                dmgToA = baseDmg * 0.55;
              }
            }
          }

          const sparkCount = Math.min(24, Math.floor(closingSpeed * 0.9));
          const strength = clamp(closingSpeed / 34, 0.2, 1.0);

          const evB = applyDamageToServerCar(
            b,
            a,
            dmgToB,
            hit.contactX,
            hit.contactZ,
            hit.normalX,
            hit.normalZ,
            closingKmh,
            strength,
            sparkCount,
          );
          const evA = applyDamageToServerCar(
            a,
            b,
            dmgToA,
            hit.contactX,
            hit.contactZ,
            -hit.normalX,
            -hit.normalZ,
            closingKmh,
            strength,
            evB ? 0 : sparkCount,
          );

          // If neither took damage (e.g. hitting a wreck), still emit spark visual
          if (!evA && !evB && closingSpeed > 7) {
            feedback.impacts.push({
              hitX: Number(hit.contactX.toFixed(2)),
              hitY: Number((Math.max(a.y, b.y) + 0.72).toFixed(2)),
              hitZ: Number(hit.contactZ.toFixed(2)),
              normX: Number(hit.normalX.toFixed(3)),
              normZ: Number(hit.normalZ.toFixed(3)),
              strength: Number(strength.toFixed(2)),
              closingKmh,
              victimId: b.id,
              attackerId: a.id,
              damage: 0,
              detachedParts: [],
              wreckedNow: false,
              sparkCount,
            });
          }

          if (evB) {
            feedback.impacts.push(evB);
            feedback.partsDetachedCount += evB.detachedParts.length;
          }
          if (evA) {
            feedback.impacts.push(evA);
            feedback.partsDetachedCount += evA.detachedParts.length;
          }

          if (evA?.wreckedNow || evB?.wreckedNow) {
            feedback.calloutText = '¡DESTRUIDO!';
            feedback.calloutSubtext = evB?.wreckedNow
              ? `${a.name} pulverizó a ${b.name}`
              : `${b.name} pulverizó a ${a.name}`;
            feedback.calloutTone = 'wreck';
          } else if (closingSpeed > 22 && (a.isHuman || b.isHuman)) {
            feedback.calloutText = '¡IMPACTO BRUTAL!';
            feedback.calloutSubtext = `${closingKmh} KM/H DE CHOQUE`;
            feedback.calloutTone = 'impact';
          }
        }
      }
    }
  }

  return feedback;
}

export function buildServerMatchSummary(
  cars: ServerCar[],
  elapsedSeconds: number,
  peakImpactKmh: number,
  totalPartsDetached: number,
): MatchSummary {
  const alive = cars.filter((c) => !c.wrecked);
  const sorted = [...cars].sort((a, b) => {
    if (a.wrecked !== b.wrecked) return a.wrecked ? 1 : -1;
    if (b.hp !== a.hp) return b.hp - a.hp;
    return b.kills - a.kills || b.damageDealt - a.damageDealt;
  });

  const winner = alive.length === 1 ? alive[0] : sorted[0];

  return {
    winnerName: winner ? winner.name : 'Empate',
    winnerId: winner ? winner.id : null,
    winnerColorHex: winner ? winner.colorHex : '#F59E0B',
    isPlayerWin: Boolean(winner?.isHuman),
    durationSeconds: Math.round(elapsedSeconds),
    peakImpactKmh,
    totalPartsDetached,
    standings: sorted.map((c) => ({
      id: c.id,
      name: c.name,
      numberLabel: c.numberLabel,
      colorHex: c.colorHex,
      isPlayer: c.isHuman,
      kills: c.kills,
      damageDealt: c.damageDealt,
      hp: Math.round(c.hp),
      wrecked: c.wrecked,
    })),
  };
}
